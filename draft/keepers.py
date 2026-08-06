"""Module 3 — keeper adjustment, true pick order, and the keeper optimizer.

Public ADP is *invalid* in a keeper league and using it directly is the single
biggest error a draft tool can make. Thirty of the best players are already
gone, and the picks that would have taken them are gone too, so both the player
pool and the pick sequence shift. Everything here exists to rebuild both.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from statistics import NormalDist


# --- draft order construction -------------------------------------------------

def draft_order(teams: int, rounds: int, draft_type: str = "snake") -> list[dict]:
    """Full pick sequence before keepers, as [{overall, round, slot, team_slot}]."""
    picks = []
    overall = 0
    for rnd in range(1, rounds + 1):
        if draft_type == "linear":
            order = list(range(1, teams + 1))
        elif draft_type == "third_round_reversal":
            # R1 forward, R2 back, R3 back again (the reversal), then normal snake.
            if rnd == 1:
                order = list(range(1, teams + 1))
            elif rnd in (2, 3):
                order = list(range(teams, 0, -1))
            else:
                order = list(range(1, teams + 1)) if rnd % 2 == 0 else list(range(teams, 0, -1))
        else:  # snake
            order = list(range(1, teams + 1)) if rnd % 2 == 1 else list(range(teams, 0, -1))
        for slot in order:
            overall += 1
            picks.append({"overall": overall, "round": rnd, "slot": slot, "team_slot": slot})
    return picks


def keeper_cost_round(keeper: dict, cfg: dict) -> int | None:
    """Which round this keeper costs its team. None means it costs nothing."""
    rules = cfg["keepers"]
    model = rules["cost_model"]
    if model == "no_cost":
        return None
    if model == "fixed_round":
        return int(rules["fixed_round"])

    original = keeper.get("original_round")
    if original is None:
        original = (cfg.get("original_rounds") or {}).get(str(keeper.get("player_id")))
    if original is None:
        # Undrafted / waiver pickup.
        if rules.get("undrafted_rule") == "ineligible":
            raise ValueError(f"{keeper.get('name', keeper.get('player_id'))} was undrafted and is not keeper-eligible")
        original = int(rules.get("undrafted_round", 10))

    if model == "escalator":
        # Each year kept moves the cost up N rounds (a cheaper, earlier pick).
        years = int(keeper.get("years_kept", 1))
        step = int(rules.get("escalator_rounds", 1))
        return max(1, int(original) - step * years)
    return int(original)  # original_round


@dataclass
class TruePickOrder:
    """The draft as it will actually run, once keepers eat their picks."""
    picks: list[dict]                       # surviving picks, renumbered
    forfeited: list[dict] = field(default_factory=list)
    my_picks: list[int] = field(default_factory=list)   # true overall numbers
    my_original_picks: list[int] = field(default_factory=list)

    def next_pick_after(self, overall: int) -> int | None:
        for p in self.my_picks:
            if p > overall:
                return p
        return None


def build_true_pick_order(cfg: dict, keepers_by_team: dict[int, list[dict]]) -> TruePickOrder:
    """Remove every forfeited pick and renumber what is left.

    keepers_by_team: {team_slot: [keeper, ...]} where keeper has player_id and
    optionally original_round / years_kept.
    """
    teams = cfg["teams"]
    rounds = cfg.get("rounds") or (cfg["roster_size"] - cfg["keepers"]["count"])
    full = draft_order(teams, rounds, cfg.get("draft_type", "snake"))
    my_slot = cfg.get("my_draft_slot")

    # Each keeper consumes its team's pick in the cost round. If that round is
    # already spent (two keepers costing the same round), roll to the next
    # unspent round — the pick still has to come from somewhere.
    forfeited: set[tuple[int, int]] = set()
    forfeit_detail: list[dict] = []
    for team_slot, keepers in keepers_by_team.items():
        for k in sorted(keepers, key=lambda k: keeper_cost_round(k, cfg) or 99):
            rnd = keeper_cost_round(k, cfg)
            if rnd is None:
                continue
            rnd = min(max(1, rnd), rounds)
            while (team_slot, rnd) in forfeited and rnd < rounds:
                rnd += 1
            if (team_slot, rnd) in forfeited:
                continue  # team is out of picks to give; ignore rather than crash
            forfeited.add((team_slot, rnd))
            forfeit_detail.append({**k, "team_slot": team_slot, "cost_round": rnd})

    survivors = [p for p in full if (p["team_slot"], p["round"]) not in forfeited]
    my_original = [p["overall"] for p in full if p["team_slot"] == my_slot]
    for i, p in enumerate(survivors, start=1):
        p["original_overall"] = p["overall"]
        p["overall"] = i
    my_picks = [p["overall"] for p in survivors if p["team_slot"] == my_slot]

    return TruePickOrder(picks=survivors, forfeited=forfeit_detail,
                         my_picks=my_picks, my_original_picks=my_original)


# --- ADP re-fit ---------------------------------------------------------------

def adjusted_adp(players: list[dict], order: TruePickOrder, cfg: dict,
                 kept_ids: set[str]) -> list[dict]:
    """Re-map ADP onto the true remaining pick sequence.

    Ranks the surviving pool by consensus value, lays that ranking onto the real
    pick numbers, then blends toward raw ADP because human drafters partially
    anchor on public boards even when those boards are wrong for this league.
    """
    weight = float(cfg.get("adp_blend_weight", 0.7))
    pool = [p for p in players if str(p["player_id"]) not in kept_ids]
    pool.sort(key=lambda p: (p.get("consensus_rank") or p.get("raw_adp") or 9999))

    n_picks = len(order.picks)
    # How far each raw ADP slot shifts once kept players are removed: a player
    # with 20 keepers ahead of them moves up ~20 slots.
    kept_ranks = sorted(p.get("raw_adp") or 9999
                        for p in players if str(p["player_id"]) in kept_ids)

    out = []
    for i, p in enumerate(pool):
        seq_adp = order.picks[i]["overall"] if i < n_picks else n_picks + (i - n_picks) + 1
        raw = p.get("raw_adp")
        if raw is None:
            blended = seq_adp
        else:
            ahead = sum(1 for r in kept_ranks if r < raw)
            shifted = max(1.0, raw - ahead)
            blended = weight * seq_adp + (1 - weight) * shifted
        out.append({**p, "adjusted_adp": round(blended, 2), "pool_rank": i + 1})
    return out


def adp_sd_for(adp_mean: float, provided: float | None = None) -> float:
    """Uncertainty grows with ADP: nobody is unsure about pick 1."""
    if provided:
        return float(provided)
    return max(3.0, 0.22 * float(adp_mean))


def survival_probability(adp_mean: float, pick: int, adp_sd: float | None = None) -> float:
    """P(player is still on the board at `pick`)."""
    sd = adp_sd_for(adp_mean, adp_sd)
    taken = NormalDist(mu=adp_mean, sigma=sd).cdf(pick)
    return max(0.0, min(1.0, 1.0 - taken))


# --- keeper optimizer ---------------------------------------------------------

def optimize_keepers(eligible: list[dict], cfg: dict, *, replacement_by_pos: dict,
                     pool_by_pos: dict, top_n: int = 10) -> list[dict]:
    """Rank every legal keeper combination by total surplus value.

    surplus = VORP(kept player) − E[VORP of best available at the forfeited pick]
    i.e. "what this keeper is worth beyond what the pick it costs would return".
    """
    from itertools import combinations
    count = int(cfg["keepers"]["count"])
    results = []

    for combo in combinations(eligible, min(count, len(eligible))):
        total, detail, ok = 0.0, [], True
        for k in combo:
            try:
                rnd = keeper_cost_round(k, cfg)
            except ValueError:
                ok = False
                break
            pick = _pick_for_round(rnd, cfg)
            alt = expected_best_available(pool_by_pos, pick, k["position"], replacement_by_pos)
            surplus = (k.get("vorp") or 0.0) - alt
            total += surplus
            detail.append({
                "name": k.get("name"), "position": k.get("position"),
                "cost_round": rnd, "cost_pick": pick,
                "vorp": round(k.get("vorp") or 0.0, 1),
                "alternative_vorp": round(alt, 1),
                "surplus": round(surplus, 1),
            })
        if not ok:
            continue

        positions = [k["position"] for k in combo]
        flags = []
        for pos in set(positions):
            if positions.count(pos) == len(positions) and len(positions) > 1:
                flags.append(f"All {len(positions)} keepers are {pos} — leaves the rest of the roster thin")
        if "RB" not in positions and "WR" not in positions:
            flags.append("No RB or WR kept — you'll be chasing both early")

        results.append({
            "players": [k.get("name") for k in combo],
            "total_surplus": round(total, 1),
            "detail": detail,
            "flags": flags,
        })

    results.sort(key=lambda r: r["total_surplus"], reverse=True)
    return results[:top_n]


def _pick_for_round(rnd: int | None, cfg: dict) -> int:
    """Approximate overall pick number for a round from my slot."""
    if rnd is None:
        return cfg["teams"] * cfg.get("rounds", 15)
    slot = cfg.get("my_draft_slot") or 1
    teams = cfg["teams"]
    if cfg.get("draft_type") == "linear" or rnd % 2 == 1:
        return (rnd - 1) * teams + slot
    return (rnd - 1) * teams + (teams - slot + 1)


def expected_best_available(pool_by_pos: dict, pick: int, position: str,
                            replacement_by_pos: dict) -> float:
    """E[VORP of the best player likely available at `pick`] for that position."""
    candidates = pool_by_pos.get(position, [])
    if not candidates:
        return 0.0
    exp, gone = 0.0, 1.0
    for p in candidates:
        surv = survival_probability(p.get("adjusted_adp") or p.get("raw_adp") or 9999, pick)
        exp += (p.get("vorp") or 0.0) * surv * gone
        gone *= (1 - surv)
        if gone < 0.01:
            break
    return exp

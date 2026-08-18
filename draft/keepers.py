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
    if model == "top_picks_flat":
        # POSITIONAL: keeping N keepers forfeits rounds 1..N. Per-player this
        # cannot be resolved (the cost depends on rank within the team's kept
        # set), so every keeper 'wants' round 1 and build_true_pick_order's
        # collision-roll assigns 1,2,3... — which IS rounds 1..N. The optimizer
        # (optimize_keeper_count) computes the positional cost directly.
        return 1

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
    # LIVE picks — the ones where somebody actively selects. Each keeps its TRUE
    # Sleeper `overall` and carries `live_index` (1..N) for anything that wants
    # sequence position rather than board position. These used to be RENUMBERED
    # in place, which is the whole bug this dataclass now documents.
    picks: list[dict]
    forfeited: list[dict] = field(default_factory=list)
    # TRUE SLEEPER OVERALL NUMBERS. The comment here already said exactly this
    # while the field carried renumbered ones — a label agreeing with the
    # intention and disagreeing with the value, which is why nobody looked.
    my_picks: list[int] = field(default_factory=list)
    my_original_picks: list[int] = field(default_factory=list)
    # THE BOARD AS SLEEPER NUMBERS IT: every round x team slot, keeper-occupied
    # picks FLAGGED rather than deleted. 150 rows in this league, always.
    board: list[dict] = field(default_factory=list)

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
    # Draft LENGTH from the ONE source (config_schema.draft_rounds): keepers
    # forfeit specific rounds (handled below), they never shorten the draft.
    import config_schema
    rounds = config_schema.draft_rounds(cfg)
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

    # ⚠️ SLEEPER DOES NOT RENUMBER, AND THIS FUNCTION USED TO PRETEND IT DOES.
    #
    # It deleted forfeited picks and renumbered the survivors 1..N. Checked
    # against this league's own draft log on 2026-08-13, all three completed
    # seasons:
    #
    #     season   keepers on the board   total picks   round 4 begins at
    #      2023            0                  150             31
    #      2024           23                  150             31
    #      2025           20                  150             31
    #
    # A keeper occupies his pick slot with `is_keeper: true`. The pick is not
    # removed and NOTHING AFTER IT SHIFTS UP. 150 picks every year whatever the
    # keeper count — so a team's own pick numbers do not depend on how many
    # players OTHER teams keep, which is the invariant the old model denied.
    #
    # The renumbering moved Cory's first pick from 33 to 30 and told him so on
    # every surface. He caught it from the seat arithmetic alone: slot 8, round 4
    # is EVEN so the snake reverses, slot 10 picks first, and he is the THIRD
    # pick of the round — 31, 32, 33.
    #
    # THE SNAPSHOT IS TAKEN BEFORE ANY MUTATION AND THAT IS NOT A STYLE CHOICE:
    # `survivors` holds REFERENCES into `full`, so renumbering in place mutated
    # the very rows a board would be built from. Reading it afterwards returned
    # the compressed numbers wearing the uncompressed name.
    board = [{"overall": p["overall"], "round": p["round"], "slot": p["team_slot"],
              "keeper_slot": (p["team_slot"], p["round"]) in forfeited}
             for p in full]

    # THE TWO COUNTS ARE DIFFERENT QUANTITIES AND BOTH ARE REAL:
    #   len(board)  = 150 — how many players leave the pool, keeper slots
    #                 included. This is draft DEPTH and it is what a waiver
    #                 replacement level must be taken at.
    #   len(picks)  = 150 - n — how many SELECTIONS happen. This is what an ADP
    #                 sequence is laid onto.
    # Conflating them is how `ROSTERED` became 147 for a morning.
    for i, p in enumerate(survivors, start=1):
        p["live_index"] = i
    my_picks = [p["overall"] for p in survivors if p["team_slot"] == my_slot]

    return TruePickOrder(picks=survivors, forfeited=forfeit_detail,
                         my_picks=my_picks, my_original_picks=my_original,
                         board=board)


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
        # SEQUENCE POSITION, NOT BOARD POSITION, AND THE CHOICE IS DELIBERATE.
        # `overall` is now the TRUE Sleeper number, so reading it here would
        # change every adjusted ADP on the board — a real question (the j-th live
        # pick sits at a true overall past j once keeper slots are counted) but a
        # DIFFERENT question, with its own blast radius and its own measurement.
        # Before the numbering fix `overall` WAS `live_index`, so taking the
        # index preserves this function's behaviour exactly. Bundling the two
        # changes is how the first error happened.
        seq_adp = order.picks[i]["live_index"] if i < n_picks else n_picks + (i - n_picks) + 1
        raw = p.get("raw_adp")
        if raw is None:
            blended = seq_adp
        else:
            ahead = sum(1 for r in kept_ranks if r < raw)
            shifted = max(1.0, raw - ahead)
            blended = weight * seq_adp + (1 - weight) * shifted
        out.append({**p, "adjusted_adp": round(blended, 2), "pool_rank": i + 1})
    return out


# ── ADP DISPERSION — ONE SET OF CONSTANTS, TWO LANGUAGES ────────────────────
#
# These MUST equal survival.js CFG.ADP_SD_{FLOOR,RATE,CAP}. They did not, and
# routed by C on 2026-08-13 that cost the keeper decision directly.
#
# The rate was moved to 0.15 and capped at 15.0 ON THE JS SIDE ONLY, with the
# reasoning written into survival.js: 0.22 at adp 100 gives sd 22, implying real
# probability of that player going at pick 56 or pick 144, and mid-round
# dispersion is roughly half that. This file kept 0.22 and no cap — ONE HALF OF A
# TWO-PLACE CHANGE.
#
# Measured cost at a 20-pick gap, python vs the engine Cory actually drafts with:
#     Ladd McConkey   adp  44.3    2.0%  vs  0.1%    15.3x
#     Brian Thomas    adp  73.0   10.7%  vs  3.4%     3.1x
#     Patrick Mahomes adp 101.0   18.4%  vs  9.1%     2.0x
#     Brian Robinson  adp 141.7   26.1%  vs  9.1%     2.9x
#
# WHY IT WAS URGENT RATHER THAN UNTIDY: optimize_keepers prices a keeper as
# surplus over what the forfeited pick returns, and survival decides whether you
# would have got that player back anyway. OVERESTIMATING SURVIVAL MAKES A KEEPER
# LOOK LESS VALUABLE -- "he would have lasted regardless" -- so the optimizer
# systematically UNDERVALUED keepers, and that decision locks 2026-08-20.
#
# ⚠️ "UNTIL MFL'S PUBLISHED DISPERSION ACCUMULATES" — IT ALREADY HAS.
#
# This block used to end: "NOT CLAIMED: that 0.15 is right. C is explicit that
# 142 of 145 draftable players carry a COMPUTED sd either way, so both formulas
# are guesses until MFL's published dispersion accumulates."
#
# Measured on the shipped board 2026-08-14, that premise is false. 219 rows
# carry a PUBLISHED dispersion (`adp_sd_source` starting "ffc"), and inside pick
# 150 it is 142 of 146 — the near-inverse of the sentence above. The measurement
# the comment was waiting for is on the board, so the rule is no longer
# ungradeable, and "both formulas are guesses" stopped being true before anyone
# went back to check.
#
# GRADED AGAINST IT, fitted / measured by ADP band:
#
#     adp   1- 25   n= 22   measured  2.40   fitted  3.00   1.29
#     adp  25- 50   n= 22   measured  4.25   fitted  5.70   1.27
#     adp  50-100   n= 49   measured  7.80   fitted 11.10   1.24
#     adp 100-150   n= 51   measured 12.50   fitted 15.00   1.20
#     adp 150-400   n= 75   measured 16.10   fitted 15.00   0.93
#
# Systematically ~25% WIDE across every band the draft actually happens in, and
# monotone across four independent bands rather than noisy. An over-wide sd
# flattens survival, which is the same direction of error the 0.22 rate had.
#
# ── THE RATE WAS HELD AT 0.15 UNTIL 2026-08-17; IT NOW SHIPS THE MEASURED
#    0.11, ON CORY'S RULING (details in the SHIPPED block below). ────────────
#
# Rate, two independent estimators over adp 20-200 (n=173):
#     least-squares slope through origin   0.1083
#     median of per-player sd/adp          0.1099
# They agree to 1.5%, so 0.11 is measured rather than chosen. 0.15 was 36%
# steep. The hold ("source selection under review", 2026-08-14) ended when
# the ratchet fired on three of four bands in one day against a tightening
# market and Cory ruled: ship, order the backtest, reserve reversion.
#
# THE FLOOR MOVED WITH IT, WHICH THE HOLD ALWAYS REQUIRED. At 0.11
# the bare linear rule already tracks the market at the top of the board — 1.10
# against a measured 1.30 at adp 10, 2.20 against 1.95 at adp 20 — so the floor
# of 3.0, which binds below adp 27, is what makes the 1-25 band read 1.25. Move
# the rate without it and that band stays mispriced. Measured floor candidates:
# adp<10 median 1.30, adp<15 median 1.85, min 0.60 across 219 rows.
#
# THE CAP IS SEPARATE AND UNDETERMINED: n=30 above adp 200 with a max of 42.3.
# A first candidate that moved all three made the aggregate WORSE, 1.121 against
# 1.103, because a median of ratios mixes the capped region with the linear one.
# That is the "fitted a threshold to a metric I had not justified" error this
# session already made once and retracted, and it is not being made twice.
#
# BLAST RADIUS, MEASURED BEFORE THE CHANGE. The fitted rule only fires where no
# published sd exists: 119 rows, of which exactly ONE is inside pick 150. This
# is a deep-pool correction, and it moves nothing about my own twelve picks.
#
# test_survival_parity.py pins these against survival.js by PARSING IT, so the
# next one-sided edit fails a test instead of shipping. `test_adp_sd_measured.py`
# grades them against the published dispersion, which parity structurally cannot.
# SHIPPED 2026-08-17 ON CORY'S RULING, verbatim: "SHIP, ORDER BACKTEST AND
# RESERVE RIGHT TO CHANGE IF BACKTEST SHOWS DIFFERENT DATA." Rate and floor
# move TOGETHER, as the note above requires. The pair was chosen from the
# published market, not hand-picked: at rate 0.11, floor 2.0 reads every
# band at 0.95-1.02x the FFC-published dispersion on the 2026-08-17 board
# (floor 3.0 left band 1-25 at 1.36x; floor 1.5 overshot it to 0.79x). The
# rate itself is the 2026-08-14 two-estimator derivation (LSQ 0.1083,
# median 0.1099, n=173, agreeing to 1.5%). The cap stays untouched — still
# undetermined, still not being fitted in passing (see the retraction
# above). The ordered backtest grades 0.15-vs-0.11 survival against the
# league's own 2023-25 drafts; if it disagrees, this reverts.
ADP_SD_FLOOR = 2.0
ADP_SD_RATE = 0.11
ADP_SD_CAP = 15.0


def adp_sd_for(adp_mean: float, provided: float | None = None) -> float:
    """Uncertainty grows with ADP: nobody is unsure about pick 1.

    A SOURCE-PROVIDED sd always wins; the formula is the fallback for players
    the market has no read on. Callers that omit `provided` never consult the
    board's own `adp_sd` field at all — see the note above; all four did.
    """
    if provided:
        return float(provided)
    return min(ADP_SD_CAP, max(ADP_SD_FLOOR, ADP_SD_RATE * float(adp_mean)))


def live_index_of(board_pick: int, board: list[dict]) -> int:
    """Board pick number -> LIVE-SELECTION index. The two scales, reconciled.

    ⚠️ `adjusted_adp` IS ON THE LIVE-SELECTION SCALE AND PICK NUMBERS ARE NOT.
    Both halves of the blend in `adjusted_adp` are live-scale: `seq_adp` is the
    live pick index, and the raw ADP is SHIFTED DOWN by the keepers ahead of the
    player, which removes those men from the numbering too. So the output counts
    SELECTIONS. `pick_order.my_picks` counts BOARD SLOTS, keeper slots included.

    THIS AGREED BY ACCIDENT UNTIL 2026-08-13 and I broke the accident by fixing
    the numbering. `build_true_pick_order` used to renumber survivors 1..N, so
    `my_picks` was [30, 45, ...] — wrong as board numbers and RIGHT as live
    indices. Correcting them to [33, 48, ...] left every survival calculation
    comparing a live-scale ADP against a board-scale pick.

    The bias has a direction and it is the bad one: a board pick is LARGER than
    its live index, so the CDF is evaluated too far right, "taken" is
    overstated, and survival is UNDERSTATED. The model believes players vanish
    sooner than they will and reaches for them. Measured on the shipped board at
    pick 33: Breece Hall 29% against 52%, +20 POINTS at the ADP range the first
    pick actually lives in.

    It is three slots today because only Cory's keepers are on the live board. It
    is ~17 once the confirmed slate lands before 20 August, and the error grows
    with it.
    """
    if not board:
        raise ValueError(
            "live_index_of: no board rows. REFUSING to fall back to the pick "
            "number — that is exactly the scale confusion this exists to fix.")
    return sum(1 for row in board if not row.get("keeper_slot")
               and int(row.get("overall") or 0) <= int(board_pick))


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


def optimize_keeper_count(eligible: list[dict], cfg: dict, *, replacement_by_pos: dict,
                          pool_by_pos: dict) -> dict:
    """Answer the actual keeper question: keep 0, 1, 2, or 3 — and which?

    optimize_keepers ranks the best combination of exactly `count` keepers. But
    the real decision includes the NUMBER, because each keeper costs a pick and
    a marginal keeper can be worth LESS than the pick it forfeits — in which
    case keeping fewer is correct. Keeping 0 is the baseline (surplus 0: draft
    normally). For each size k in 0..count this returns the best k-combo by total
    surplus, and the overall recommendation is the size that maximises it.

    A keeper only 'earns its slot' if its surplus is positive; a negative-surplus
    keeper means the pick it costs would return more than the player is worth.
    """
    from itertools import combinations
    count = int(cfg["keepers"]["count"])
    model = cfg["keepers"]["cost_model"]

    def surplus_of(combo):
        total, detail, ok = 0.0, [], True
        # top_picks_flat: keeping N keepers forfeits rounds 1..N (the k-th keeper
        # costs round k), independent of where the player was drafted. The cost
        # is POSITIONAL, so assign the most expensive round (1) to the highest
        # -VORP keeper — the assignment does not change the total (rounds 1..N
        # are forfeited either way) but makes the per-keeper surplus legible.
        ranked = sorted(combo, key=lambda x: -(x.get("vorp") or 0.0))
        for idx, k in enumerate(ranked):
            if model == "top_picks_flat":
                rnd = idx + 1
            else:
                try:
                    rnd = keeper_cost_round(k, cfg)
                except ValueError:
                    ok = False
                    break
            pick = _pick_for_round(rnd, cfg)
            alt = expected_best_available(pool_by_pos, pick, k["position"], replacement_by_pos)
            surp = (k.get("vorp") or 0.0) - alt
            total += surp
            detail.append({"name": k.get("name"), "position": k.get("position"),
                           "cost_round": rnd, "cost_pick": pick,
                           "vorp": round(k.get("vorp") or 0.0, 1),
                           "alternative_vorp": round(alt, 1),
                           "surplus": round(surp, 1)})
        return (total, detail) if ok else (None, None)

    by_size = {}
    for k in range(0, min(count, len(eligible)) + 1):
        if k == 0:
            by_size[0] = {"keep": 0, "players": [], "total_surplus": 0.0,
                          "detail": [], "note": "draft normally, keep nobody"}
            continue
        best = None
        for combo in combinations(eligible, k):
            total, detail = surplus_of(combo)
            if total is None:
                continue
            if best is None or total > best["total_surplus"]:
                best = {"keep": k, "players": [x.get("name") for x in combo],
                        "total_surplus": round(total, 1), "detail": detail}
        if best is not None:
            by_size[k] = best

    sizes = sorted(by_size.values(), key=lambda r: r["total_surplus"], reverse=True)
    recommended = sizes[0] if sizes else by_size.get(0)
    return {
        "recommended_keep": recommended["keep"],
        "recommended_players": recommended["players"],
        "recommended_surplus": recommended["total_surplus"],
        # Every size, so the decision is legible: keeping fewer can win.
        "by_size": [by_size[k] for k in sorted(by_size)],
        "count_allowed": count,
        "eligible_n": len(eligible),
    }


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
        # PASS THE BOARD'S OWN adp_sd. Omitting it silently fell back to the
        # formula for every player, so the market's published dispersion — the
        # only real measurement in this field — was never consulted here.
        surv = survival_probability(p.get("adjusted_adp") or p.get("raw_adp") or 9999,
                                    pick, p.get("adp_sd"))
        exp += (p.get("vorp") or 0.0) * surv * gone
        gone *= (1 - surv)
        if gone < 0.01:
            break
    return exp

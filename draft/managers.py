"""A1 — league-mate behavioural models.

Builds a per-manager profile from every prior draft in league history. These
feed the Layer-2 survival model (A2) and the Monte Carlo opponents (A4): knowing
that one guy always takes a QB two rounds early changes what survives to my next
pick far more than a better projection does.

ON ADP HONESTY
--------------
Sleeper does not publish historical ADP, and no free source does either. Two of
the six metrics need a value ordering to measure "reached above market":
`reach_delta` and `bpa_vs_need`. We proxy it with the player's *current*
consensus rank, which is biased — a player who busted ranks low today, so the
manager who drafted him looks like a reacher in hindsight.

That bias is handled three ways, never hidden:
  1. Both affected metrics are marked `proxy: true` in the output.
  2. They are shrunk harder than the ADP-free metrics.
  3. The ADP-free metrics (positional timing, homer, rookie affinity) carry the
     profile when sample size is thin, because they need no market baseline.
"""
from __future__ import annotations
import json
import statistics
from pathlib import Path

# Shrinkage: with n prior drafts, weight on the manager's own numbers is
# n / (n + PRIOR_STRENGTH). One draft therefore lands at 1/3 of the way from the
# league average to the observed value — a single draft never drives a strong read.
PRIOR_STRENGTH = 2.0
PROXY_PRIOR_STRENGTH = 4.0   # ADP-proxy metrics are shrunk twice as hard

SKILL = {"QB", "RB", "WR", "TE"}
LATE = {"K", "DEF"}


def _shrink(observed: float, league_avg: float, n: int, strength: float = PRIOR_STRENGTH) -> float:
    if n <= 0:
        return league_avg
    w = n / (n + strength)
    return w * observed + (1 - w) * league_avg


def _pick_owner(pick: dict) -> str | None:
    return str(pick.get("picked_by") or pick.get("roster_id") or "") or None


def build_profiles(drafts: list[dict], players_db: dict, *, season_now: int | None = None) -> dict:
    """drafts: output of sleeper_import.all_drafts(). Returns manager_profiles dict."""
    if not drafts:
        return {"managers": {}, "league_average": {}, "drafts_analysed": 0,
                "note": "no prior drafts found — every manager falls back to league average"}

    # --- per-pick enrichment -------------------------------------------------
    rows = []          # one row per pick, enriched
    names = {}         # manager id -> display name
    for d in drafts:
        by_user = {u["user_id"]: u for u in d.get("users", [])}
        roster_owner = {str(r["roster_id"]): str(r.get("owner_id") or "")
                        for r in d.get("rosters", [])}
        picks = sorted(d["picks"], key=lambda p: p.get("pick_no") or 0)
        n_teams = max((p.get("draft_slot") or 1) for p in picks) or 10

        # Value ordering *within this draft*: current consensus rank (the proxy).
        for p in picks:
            pid = str(p.get("player_id") or "")
            meta = p.get("metadata") or {}
            info = players_db.get(pid) or {}
            rank = info.get("search_rank")
            rank = None if rank is None or rank >= 9_999_999 else float(rank)
            owner = _pick_owner(p)
            if owner and owner in roster_owner:
                owner = roster_owner[owner] or owner
            if owner and owner in by_user:
                names[owner] = (by_user[owner].get("display_name")
                                or (by_user[owner].get("metadata") or {}).get("team_name")
                                or owner)
            rows.append({
                "season": d.get("season"),
                "manager": owner,
                "pick_no": p.get("pick_no") or 0,
                "round": p.get("round") or 1,
                "player_id": pid,
                "position": (meta.get("position") or info.get("position") or "?").upper(),
                "team": (meta.get("team") or info.get("team") or "").upper(),
                "market_rank": rank,
                "years_exp": info.get("years_exp"),
                "n_teams": n_teams,
            })

    managers = sorted({r["manager"] for r in rows if r["manager"]})
    if not managers:
        return {"managers": {}, "league_average": {}, "drafts_analysed": len(drafts),
                "note": "picks carried no manager attribution"}

    # --- league-average baselines -------------------------------------------
    league_first_round = _first_round_by_position(rows)
    league_reach = _reach_stats(rows)
    league_rookie = _rate(rows, lambda r: r.get("years_exp") == 0)
    league_bpa = _bpa_rate(rows)

    out_managers = {}
    for m in managers:
        mine = [r for r in rows if r["manager"] == m]
        seasons = sorted({r["season"] for r in mine})
        n = len(seasons)

        first_round = _first_round_by_position(mine)
        timing = {}
        for pos in ("QB", "TE", "K", "DEF"):
            obs, avg = first_round.get(pos), league_first_round.get(pos)
            if obs is None or avg is None:
                continue
            timing[pos] = {
                "mean_round": round(_shrink(obs, avg, n), 2),
                "vs_league": round(_shrink(obs, avg, n) - avg, 2),
                "raw_mean_round": round(obs, 2),
            }

        reach = _reach_stats(mine)
        homer_team, homer_rate = _homer(mine)
        rookie = _rate(mine, lambda r: r.get("years_exp") == 0)
        bpa = _bpa_rate(mine)

        profile = {
            "name": names.get(m, m),
            "manager_id": m,
            "sample_size": n,
            "picks_analysed": len(mine),
            "shrinkage_weight": round(n / (n + PRIOR_STRENGTH), 3),
            "reach_delta": {
                "mean": round(_shrink(reach["mean"], league_reach["mean"], n, PROXY_PRIOR_STRENGTH), 2),
                "sd": round(reach["sd"] if reach["sd"] else league_reach["sd"], 2),
                "raw_mean": round(reach["mean"], 2),
                "proxy": True,
            },
            "positional_timing": timing,
            "homer_index": {
                "team": homer_team,
                "rate": round(_shrink(homer_rate, 1.0 / 32, n), 3),
                "raw_rate": round(homer_rate, 3),
            },
            "rookie_affinity": {
                "rate": round(_shrink(rookie, league_rookie, n), 3),
                "league_rate": round(league_rookie, 3),
            },
            "bpa_vs_need": {
                "bpa_rate": round(_shrink(bpa, league_bpa, n, PROXY_PRIOR_STRENGTH), 3),
                "league_rate": round(league_bpa, 3),
                "proxy": True,
            },
            "positional_mix": _positional_mix(mine),
        }
        # α/β for the Layer-2 softmax (A2): a BPA drafter weights value, a needs
        # drafter weights empty slots. Centred so league-average lands at 1.0/1.0.
        bpa_rate = profile["bpa_vs_need"]["bpa_rate"]
        ref = max(0.05, league_bpa)
        profile["softmax"] = {
            "alpha_need": round(max(0.2, 2.0 - 1.5 * (bpa_rate / ref)), 3),
            "beta_value": round(max(0.2, 0.5 + 1.5 * (bpa_rate / ref)), 3),
        }
        profile["summary"] = _plain_language(profile)
        out_managers[m] = profile

    return {
        "managers": out_managers,
        "league_average": {
            "first_round_by_position": {k: round(v, 2) for k, v in league_first_round.items()},
            "reach_delta_mean": round(league_reach["mean"], 2),
            "rookie_rate": round(league_rookie, 3),
            "bpa_rate": round(league_bpa, 3),
        },
        "drafts_analysed": len(drafts),
        "seasons": sorted({d.get("season") for d in drafts if d.get("season")}),
        "editable": "Hand-edit any value here; the build never overwrites a file "
                    "whose `locked` flag is true.",
    }


# --- metric helpers ----------------------------------------------------------

def _first_round_by_position(rows: list[dict]) -> dict[str, float]:
    """Mean round of a manager's *first* pick at each position, per season."""
    firsts: dict[str, list[int]] = {}
    by_key: dict[tuple, dict[str, int]] = {}
    for r in rows:
        key = (r["manager"], r["season"])
        seen = by_key.setdefault(key, {})
        pos = r["position"]
        if pos not in seen:
            seen[pos] = r["round"]
    for seen in by_key.values():
        for pos, rnd in seen.items():
            firsts.setdefault(pos, []).append(rnd)
    return {pos: statistics.fmean(v) for pos, v in firsts.items() if v}


def _reach_stats(rows: list[dict]) -> dict:
    """(market rank − pick number): positive means they took him early."""
    deltas = [r["market_rank"] - r["pick_no"] for r in rows
              if r.get("market_rank") is not None and r.get("pick_no")]
    if not deltas:
        return {"mean": 0.0, "sd": 0.0, "n": 0}
    return {
        "mean": statistics.fmean(deltas),
        "sd": statistics.pstdev(deltas) if len(deltas) > 1 else 0.0,
        "n": len(deltas),
    }


def _rate(rows: list[dict], pred) -> float:
    if not rows:
        return 0.0
    return sum(1 for r in rows if pred(r)) / len(rows)


def _homer(rows: list[dict]) -> tuple[str | None, float]:
    """Most-drafted NFL team and the share of picks it accounts for."""
    counts: dict[str, int] = {}
    for r in rows:
        if r["team"]:
            counts[r["team"]] = counts.get(r["team"], 0) + 1
    if not counts:
        return None, 0.0
    team = max(counts, key=counts.get)
    return team, counts[team] / max(1, len(rows))


def _bpa_rate(rows: list[dict]) -> float:
    """How often the pick was (near) the best player available by market rank.

    Best-available is reconstructed per draft: a pick counts as BPA if no more
    than two better-ranked players were still on the board.
    """
    by_draft: dict[tuple, list[dict]] = {}
    for r in rows:
        by_draft.setdefault((r["season"],), []).append(r)
    hits = total = 0
    for group in by_draft.values():
        ordered = sorted(group, key=lambda r: r["pick_no"])
        ranked = sorted([r for r in ordered if r.get("market_rank") is not None],
                        key=lambda r: r["market_rank"])
        taken: set[str] = set()
        rank_pos = {r["player_id"]: i for i, r in enumerate(ranked)}
        for r in ordered:
            if r.get("market_rank") is None:
                continue
            better_available = sum(
                1 for q in ranked
                if q["player_id"] not in taken and rank_pos[q["player_id"]] < rank_pos[r["player_id"]]
            )
            total += 1
            if better_available <= 2:
                hits += 1
            taken.add(r["player_id"])
    return hits / total if total else 0.0


def _positional_mix(rows: list[dict]) -> dict:
    """Share of picks by position within the first 6 rounds — the shape of their build."""
    early = [r for r in rows if r["round"] <= 6]
    if not early:
        return {}
    counts: dict[str, int] = {}
    for r in early:
        counts[r["position"]] = counts.get(r["position"], 0) + 1
    return {k: round(v / len(early), 3) for k, v in sorted(counts.items())}


def _plain_language(p: dict) -> str:
    """The 'Know Your League' card text. Plain English, no jargon."""
    bits = []
    reach = p["reach_delta"]["mean"]
    if reach > 6:
        bits.append(f"Reaches ~{reach:.0f} picks early")
    elif reach < -6:
        bits.append(f"Waits — lets value fall ~{abs(reach):.0f} picks")
    else:
        bits.append("Drafts near market value")

    for pos in ("QB", "TE"):
        t = p["positional_timing"].get(pos)
        if not t:
            continue
        if t["vs_league"] <= -1.0:
            bits.append(f"takes {pos} early (round {t['mean_round']:.0f} on average, "
                        f"{abs(t['vs_league']):.1f} rounds before the league)")
        elif t["vs_league"] >= 1.0:
            bits.append(f"waits on {pos} (round {t['mean_round']:.0f})")

    h = p["homer_index"]
    if h["team"] and h["rate"] > 0.14:
        bits.append(f"loves {h['team']} ({h['rate'] * 100:.0f}% of picks)")

    r = p["rookie_affinity"]
    if r["rate"] > r["league_rate"] * 1.5 and r["rate"] > 0.08:
        bits.append("chases rookies")

    b = p["bpa_vs_need"]
    if b["bpa_rate"] > b["league_rate"] * 1.15:
        bits.append("takes best available")
    elif b["bpa_rate"] < b["league_rate"] * 0.85:
        bits.append("drafts for need")

    if p["sample_size"] < 2:
        bits.append(f"⚠ only {p['sample_size']} prior draft — read regressed to league average")
    return ". ".join(x[0].upper() + x[1:] for x in bits) + "."


# --- persistence -------------------------------------------------------------

def save(profiles: dict, path: str | Path) -> None:
    path = Path(path)
    # Never clobber hand edits.
    if path.exists():
        try:
            existing = json.loads(path.read_text())
            if existing.get("locked"):
                print(f"  {path.name} is locked — keeping hand-edited profiles")
                return
            for mid, prof in (existing.get("managers") or {}).items():
                if prof.get("locked") and mid in profiles.get("managers", {}):
                    profiles["managers"][mid] = prof
        except (json.JSONDecodeError, OSError):
            pass
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profiles, indent=2, sort_keys=True))


# --- evaluation (acceptance test support) ------------------------------------

def predict_position(profile: dict | None, league_avg: dict, round_no: int,
                     available_positions: set[str]) -> dict[str, float]:
    """P(position) for a manager's next pick — the thing profiles must predict better."""
    scores = {}
    for pos in available_positions:
        base = 1.0
        avg_round = (league_avg.get("first_round_by_position") or {}).get(pos)
        if avg_round:
            # Closer to a manager's typical round for that position -> likelier.
            target = avg_round
            if profile:
                t = (profile.get("positional_timing") or {}).get(pos)
                if t:
                    target = t["mean_round"]
            base = 1.0 / (1.0 + abs(round_no - target))
        if profile:
            mix = profile.get("positional_mix") or {}
            base *= (0.35 + mix.get(pos, 0.0) * 3.0)
        scores[pos] = max(1e-6, base)
    total = sum(scores.values())
    return {k: v / total for k, v in scores.items()}

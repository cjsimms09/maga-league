"""THE LAB — roster -> weekly scores (the bridge from a draft to dollars).

A Lab experiment produces a DRAFT ROSTER (a set of player_ids). To money-grade
it we need that roster's weekly score across the replayed season, which this
module computes: for each week it looks up every rostered player's ACTUAL points
that week (from the harvested `players_points`), starts the best legal lineup
under the league's starting slots, and sums the starters. The resulting
{week: score} series feeds money_grade.grade_substituted.

Two honest limits, both stated so they can't masquerade as precision:
  * A player only scores in a week the harvest recorded points for him. A rookie
    or free agent nobody rostered that week is invisible (points default 0) — the
    same blind spot the survival model has, and acceptable because a replayed
    roster is built from players who WERE rostered.
  * This starts the optimal lineup in hindsight (perfect bench decisions). That
    is the CEILING of a roster, not a manager's realized score; the in-season
    lineup-policy experiments (13/14) measure the gap. For draft-strategy grading
    the ceiling is the right denominator — it isolates draft quality from weekly
    lineup luck.
"""
from __future__ import annotations

FLEX_ELIGIBLE = {"RB", "WR", "TE"}
# The starting lineup (bench excluded). Mirrors league_config.starters.
DEFAULT_SLOTS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "K": 1, "DEF": 1}


def global_player_points(season: dict) -> dict[int, dict[str, float]]:
    """{week: {player_id: points}} aggregated across every roster's players_points."""
    out: dict[int, dict[str, float]] = {}
    for wk, entries in (season.get("weeks") or {}).items():
        w = int(wk)
        pts: dict[str, float] = {}
        for e in entries or []:
            for pid, v in (e.get("players_points") or {}).items():
                # A player sits on one roster per week, so no double-count.
                pts[str(pid)] = float(v or 0.0)
        out[w] = pts
    return out


def best_lineup_points(player_pts: dict[str, float], pos_by_id: dict[str, str],
                       roster_ids: list[str], slots: dict[str, int] | None = None) -> dict:
    """Best legal starting lineup for one week. Optimal for a single FLEX.

    Dedicated slots always want the top scorers of their position; the lone FLEX
    then takes the best remaining flex-eligible player. Moving anyone from a
    dedicated slot into FLEX can never raise the total, so greedy-by-position +
    best-remaining-flex is exact here.
    """
    slots = slots or DEFAULT_SLOTS
    by_pos: dict[str, list[tuple[str, float]]] = {}
    for pid in roster_ids:
        pid = str(pid)
        pos = pos_by_id.get(pid)
        if not pos:
            continue
        by_pos.setdefault(pos, []).append((pid, player_pts.get(pid, 0.0)))
    for pos in by_pos:
        by_pos[pos].sort(key=lambda x: -x[1])

    used: set[str] = set()
    starters: list[tuple[str, str, float]] = []   # (pid, slot, points)
    # Dedicated slots first.
    for pos, n in slots.items():
        if pos == "FLEX":
            continue
        taken = 0
        for pid, pt in by_pos.get(pos, []):
            if taken >= n:
                break
            if pid in used:
                continue
            used.add(pid)
            starters.append((pid, pos, pt))
            taken += 1
    # FLEX: best remaining flex-eligible.
    for _ in range(slots.get("FLEX", 0)):
        best = None
        for pos in FLEX_ELIGIBLE:
            for pid, pt in by_pos.get(pos, []):
                if pid in used:
                    continue
                if best is None or pt > best[1]:
                    best = (pid, pt)
                break   # each position's list is sorted; first unused is its best
        if best:
            used.add(best[0])
            starters.append((best[0], "FLEX", best[1]))

    return {"points": round(sum(s[2] for s in starters), 2), "starters": starters}


def roster_weekly_scores(season: dict, roster_ids: list[str], pos_by_id: dict[str, str],
                         slots: dict[str, int] | None = None) -> dict[int, float]:
    """{week: best-legal-lineup points} for a roster across the whole season."""
    gpp = global_player_points(season)
    out: dict[int, float] = {}
    for w, pts in gpp.items():
        out[w] = best_lineup_points(pts, pos_by_id, roster_ids, slots)["points"]
    return out


def positions_from_board(board_path) -> dict[str, str]:
    """player_id -> position from the draft board artifact (public/draft_data.json)."""
    import json
    from pathlib import Path
    data = json.loads(Path(board_path).read_text())
    out: dict[str, str] = {}
    for p in data.get("players", []) or []:
        pid = p.get("player_id")
        if pid is not None and p.get("position"):
            out[str(pid)] = p["position"]
    for k in data.get("kept_players", []) or []:
        pid = k.get("player_id")
        if pid is not None and k.get("position"):
            out[str(pid)] = k["position"]
    return out

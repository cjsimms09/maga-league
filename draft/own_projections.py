"""OUR OWN PROJECTIONS — shared core, reused by build.py and the standalone diagnostic.

Extracted from `draft/backtest/own_projections_2026.py` (built 2026-08-15) so build.py
can attach `proj_ownmodel` to the live board without a second copy of this logic —
the "two-places disease" this project has already found and fixed multiple times
(see proj_feed.js's own comment on the same class of mistake). One function, two
callers: the nightly board build (additive attach) and the standalone diagnostic
script (which still owns its own report/diff/file-write behavior).

WHAT THIS DOES AND DOES NOT DO. Computes `proj_ownmodel` (season-total points, our
own scoring, leak-free walk_forward() regressed to the positional mean with
age/depth-chart adjustment). Does NOT touch proj_mean, proj_baseline, VORP, or
ranking — DECISIONS-NEEDED.md #6 is explicit that swapping the authoritative
projection source needs a clean grade first, and this has none yet. This is a THIRD
source, attached the same additive way FantasyPros already is.
"""
from __future__ import annotations
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "backtest"))

# depth-chart dampening — see own_projections_2026.py's full reasoning; unchanged
# multipliers, carried here rather than re-derived.
DEPTH_DAMPEN = {2: 0.45, 3: 0.30, 4: 0.20}
DEPTH_DAMPEN_FLOOR = 0.15
ONESIE_QB_START = 2
SKILL_START = 3
QB_DAMPEN = {2: 0.08, 3: 0.05}
QB_DAMPEN_FLOOR = 0.04


def compute_own_projections(players: list[dict], cfg: dict, *, season: int,
                             prior_years: list[int] | None = None) -> tuple[dict, dict]:
    """Returns (proj_ownmodel: {sleeper_id: season_total_points}, diagnostics).

    `players` must carry player_id/position/age/depth_chart_order (the live board's
    own shape — no separate fetch). Network calls (nfl_data_py) are the only egress
    this needs; raises on failure rather than silently returning {} so the caller
    can decide whether that's fatal (build.py: it is not — see the attach block).
    """
    import nfl_data_py as nfl
    from lab_projections import walk_forward
    from scoring import score_stat_line
    from grade import crosswalk_gsis_to_sleeper, nflverse_weekly_to_scoring

    prior_years = prior_years or [season - 3, season - 2]
    scoring = cfg["scoring"]

    ids_df = nfl.import_ids()
    crosswalk = crosswalk_gsis_to_sleeper([], ids_df)

    prior_seasons_points: dict[int, dict[str, float]] = {}
    games: dict[int, dict[str, int]] = {}
    years_used = []
    for y in prior_years:
        df = nfl.import_weekly_data([y])
        if df is None or df.empty:
            continue
        pts, gm = {}, {}
        idc = "player_id" if "player_id" in df.columns else "gsis_id"
        for row in df.to_dict("records"):
            if row.get("season_type") != "REG":
                continue
            gsis = str(row.get(idc))
            sid = crosswalk.get(gsis)
            if not sid:
                continue
            stats = nflverse_weekly_to_scoring(row)
            p = score_stat_line(stats, scoring)
            pts[sid] = pts.get(sid, 0.0) + p
            gm[sid] = gm.get(sid, 0) + 1
        prior_seasons_points[y] = pts
        games[y] = gm
        years_used.append(y)

    positions = {str(p["player_id"]): p.get("position") for p in players}
    ages = {str(p["player_id"]): p.get("age") for p in players}
    depth_chart = {str(p["player_id"]): p.get("depth_chart_order") for p in players}

    proj = walk_forward(season, prior_seasons_points, games, positions, ages)

    dampened = 0
    for pid, val in list(proj.items()):
        order = depth_chart.get(pid)
        if order is None:
            continue
        is_qb = positions.get(pid) == "QB"
        start = ONESIE_QB_START if is_qb else SKILL_START
        if order < start:
            continue
        table = QB_DAMPEN if is_qb else DEPTH_DAMPEN
        floor = QB_DAMPEN_FLOOR if is_qb else DEPTH_DAMPEN_FLOOR
        mult = table.get(int(order), floor)
        proj[pid] = round(val * mult, 2)
        dampened += 1

    diag = {
        "season": season, "prior_years_wanted": prior_years, "prior_years_used": years_used,
        "crosswalk_size": len(crosswalk), "projected": len(proj), "dampened": dampened,
    }
    return proj, diag


def attach_own_model(board: list[dict], own_proj: dict) -> int:
    """Additively write proj_ownmodel onto each board player that has one.

    Pure and separately testable — extracted from build.py's attach block
    (2026-08-15) specifically so the "additive only, never touches proj_mean/
    proj_baseline/vorp/ranking" guarantee is a thing a test checks rather than
    only a thing a comment claims. Returns the number of players attached.
    A player with no computed projection is left completely untouched
    (no key, not None) — "absent, not zero", same discipline as proj_feed.js.
    """
    attached = 0
    for p in board:
        v = own_proj.get(str(p.get("player_id")))
        if v is not None:
            p["proj_ownmodel"] = round(float(v), 2)
            attached += 1
    return attached

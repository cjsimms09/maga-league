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


def _fetch_weekly_safe(nfl, year):
    """Best-effort weekly fetch for one year. nflverse's parquet mirror 404s
    for a not-yet-published season (verified 2026-08-15: 2025 does, 2022-2024
    don't) rather than returning an empty frame, so this must catch the
    exception too, not just check None/empty — the old code only did the
    latter, which is why the FIX below needed this helper: probing forward
    years without it would have crashed the whole build the first time it
    tried a year nflverse hasn't published yet, rather than dropping it."""
    try:
        df = nfl.import_weekly_data([year])
    except Exception:
        return None
    return df if df is not None and not df.empty else None


def _discover_prior_years(is_available, season, want, lookback=5):
    """Probe backward from season-1 for `want` real years, stopping after
    `lookback` years probed even if `want` isn't reached (so an outage or a
    genuinely thin data source doesn't loop forever).

    Extracted as its own pure function (dependency-injected `is_available`,
    no network, no nfl_data_py) specifically so the ALGORITHM — which years
    get tried, in what order, when it stops — is a thing a test can pin down
    without mocking the entire nfl_data_py surface. This is the piece that
    was actually wrong before 2026-08-15's fix (a hardcoded season-3 offset);
    testing only attach_own_model() would never have caught it, because that
    function has no opinion about which years fed the projection it attaches.
    """
    years, probed = [], 0
    y = season - 1
    while len(years) < want and probed < lookback:
        if is_available(y):
            years.append(y)
        y -= 1
        probed += 1
    return years


def compute_own_projections(players: list[dict], cfg: dict, *, season: int,
                             prior_years: list[int] | None = None) -> tuple[dict, dict]:
    """Returns (proj_ownmodel: {sleeper_id: season_total_points}, diagnostics).

    `players` must carry player_id/position/age/depth_chart_order (the live board's
    own shape — no separate fetch). Network calls (nfl_data_py) are the only egress
    this needs; raises on failure rather than silently returning {} so the caller
    can decide whether that's fatal (build.py: it is not — see the attach block).

    FIXED 2026-08-15, same day this was written: `prior_years` used to default
    to a HARDCODED [season-3, season-2] — for season=2026 that's [2023, 2024],
    one year staler than the [yr-2, yr-1] convention every backtest experiment
    in this repo actually uses (exp33.py, exp34.py, exp35_regression_sweep.py
    all use `for py in (yr-2, yr-1)`). It happened to "work" today only because
    season-1 (2025) genuinely isn't published on nflverse yet (confirmed via a
    live 404) — but the hardcoded offset would keep using [2023, 2024] forever,
    even once 2025 ships, because nothing about it depends on what's actually
    available. Found by comparing against the established pattern, not by the
    tests written earlier today, which only checked attach_own_model()'s
    additive guarantee — never the years the projection was actually built
    from. Now DISCOVERED rather than assumed: probe backward from season-1,
    keep whatever years are real, stop once SEASON_WEIGHTS-many are found (2
    today) or the lookback window (5 years) is exhausted. self-correcting the
    moment 2025 exists, with no code change required.
    """
    import nfl_data_py as nfl
    from lab_projections import walk_forward, CFG as LAB_CFG
    from scoring import score_stat_line
    from grade import crosswalk_gsis_to_sleeper, nflverse_weekly_to_scoring

    # Fetched at most once per year regardless of whether discovery or the
    # main loop below needs it — nflverse weekly data is 5000+ rows per year,
    # so probing and then re-fetching the same year would double real network
    # cost for no reason.
    fetched: dict[int, object] = {}

    def _check(y):
        df = _fetch_weekly_safe(nfl, y)
        fetched[y] = df
        return df is not None

    if prior_years is None:
        prior_years = _discover_prior_years(_check, season, len(LAB_CFG["SEASON_WEIGHTS"]))
    scoring = cfg["scoring"]

    ids_df = nfl.import_ids()
    crosswalk = crosswalk_gsis_to_sleeper([], ids_df)

    prior_seasons_points: dict[int, dict[str, float]] = {}
    games: dict[int, dict[str, int]] = {}
    years_used = []
    for y in prior_years:
        df = fetched[y] if y in fetched else _fetch_weekly_safe(nfl, y)
        if df is None:
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

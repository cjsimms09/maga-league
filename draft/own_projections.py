"""OUR OWN PROJECTIONS — shared core, reused by build.py and the standalone diagnostic.

PROMOTED TO own_v4, 2026-08-16, by Cory's written acceptance ("Yes on v4")
after the candidate cleared the REC-3 promotion bar he ratified — the FIRST to
do so: beat BOTH naive baselines at ALL four positions on BOTH metrics,
preregistered, leak-free, held-out 2025 (draft/audit/projector_v4_2026-08-16.md;
draft/backtest/model_accuracy_v4.json). `compute_own_projections()` now runs
the v4 construction, importing the graded modules rather than re-implementing
them (own_model_v2's fitted OLS, v3's ensemble + market layer, v4's QB
availability correction). The old walk_forward core survives, callable, as
`compute_own_projections_v1_walkforward` — the rollback path.

WHAT CHANGED OPERATIONALLY: the v4 path reads the COMMITTED nflverse weekly
stores (2023-2025) and the committed league history — ZERO network. The v1
path needed live nfl_data_py egress every build. Coverage is the graded
scope: QB/RB/WR/TE with prior-season NFL production; K/DEF and true rookies
carry no proj_ownmodel ("absent, not zero", as before).

WHAT THIS STILL DOES NOT DO. proj_ownmodel remains the labeled third opinion
beside Sleeper and FantasyPros — it does NOT enter proj_mean's composition.
That is a separate decision blocked on the January 2027 grade of the frozen
2026 proj_series (REC-2, unchanged); v4's bar measured it against the naive
baselines, not against Sleeper, and no evidence prices a mixing weight today.
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


def _store_year_available(year: int) -> bool:
    return (HERE / "backtest" / f"nflverse_weekly_points_{year}.json").exists()


def compute_own_projections(players: list[dict], cfg: dict, *, season: int,
                            prior_years: list[int] | None = None) -> tuple[dict, dict]:
    """THE PROMOTED own_v4 PATH (Cory's acceptance, 2026-08-16). Returns
    (proj_ownmodel: {sleeper_id: season_total_points}, diagnostics).

    Mirrors the GRADED construction advanced one season, importing the graded
    code rather than re-implementing it:
      · v2 OLS fit on the most recent completed single-prior transition
        (features_for(y1, (y2,)) vs season y1's totals — the exact fit shape
        model_accuracy_v4.json was graded under, shifted forward);
      · predict features_for(season, (y2, y1));
      · v3 ensemble per position with the 0.7/0.3 recency blend; the league-
        draft market layer prices only when the season's draft record EXISTS
        in league_history (pre-draft: zero picks -> the no-market arm for
        every player, which is the deployment shape §7 of the audit named);
      · v4's QB availability correction from y1's weekly actives.

    Zero network: committed stores only. `cfg` is accepted for caller
    compatibility (build.py) — the stores are already scored in league terms.
    `prior_years` overrides discovery for tests. Depth-chart dampening is the
    live-board attach layer (backups behind starters), unchanged from v1 —
    it was never part of the graded season-total core and remains outside it.
    """
    sys.path.insert(0, str(HERE / "backtest"))
    from own_model_v2 import (features_for, fit_transition, predict,   # noqa: E402
                              season_totals, RECENCY_WEIGHTS, POSITIONS)
    from own_model_v3 import (build_v3, league_draft_picks,            # noqa: E402
                              market_ranks, rank_curve)
    from own_model_v4 import (weekly_points, qb_active_games,          # noqa: E402
                              qb_availability_correction, build_v4)

    if prior_years is None:
        prior_years = _discover_prior_years(_store_year_available, season, 2)
    if len(prior_years) < 2:
        raise RuntimeError(
            f"own_v4 needs two committed prior-year stores before season {season}; "
            f"found {prior_years} — commit nflverse_weekly_points_<year>.json first")
    y1, y2 = prior_years[0], prior_years[1]          # y1 = most recent

    positions = {str(p["player_id"]): p.get("position") for p in players
                 if p.get("position") in POSITIONS}
    ages = {str(p["player_id"]): p.get("age") for p in players}
    depth_chart = {str(p["player_id"]): p.get("depth_chart_order") for p in players}

    # v2, through v2's own unchanged code path, one transition forward.
    feat_fit = features_for(y1, (y2,), positions, ages)
    fits = fit_transition(feat_fit, season_totals(y1)[0])
    feat_now = features_for(season, (y2, y1), positions, ages)
    v2_pred = predict(feat_now, fits)

    # The 0.7/0.3 recency blend — the baseline's own construction (_baselines).
    w1, w2 = RECENCY_WEIGHTS
    tot1, tot2 = season_totals(y1)[0], season_totals(y2)[0]
    blend = {pid: (w1 * v + w2 * tot2[pid]) if pid in tot2 else v
             for pid, v in tot1.items()}

    # v3's market layer: live only once the season's draft is a record. The
    # graded module RAISES for a season with no completed draft on disk —
    # which pre-draft is the expected state, not an error: it selects the
    # no-market arm (the deployment shape §7 of the v4 audit named).
    try:
        picks = league_draft_picks(season)
    except ValueError:
        picks = {}
    market_arm = bool(picks)
    curve = rank_curve(y1, positions) if market_arm else {}
    mrank = market_ranks(picks, positions) if market_arm else {}
    v3_pred = build_v3(v2_pred, blend, mrank, curve, positions)

    # v4's QB availability correction, from y1's weekly actives.
    wk = weekly_points(y1)
    acts = qb_active_games(wk, positions)
    corr, mu_g = qb_availability_correction(acts)
    proj = build_v4(v3_pred, blend, corr, positions)

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
        "algorithm": "own_v4", "season": season,
        "prior_years_used": [y1, y2],
        "fit_transition": f"{y2}->{y1}",
        "market_arm": market_arm,
        "qb_availability_mu_g": mu_g,
        "projected": len(proj), "dampened": dampened,
        "promotion": "REC-3 bar cleared by own_v4; Cory accepted 2026-08-16",
    }
    return proj, diag


def compute_own_projections_v1_walkforward(players: list[dict], cfg: dict, *, season: int,
                                           prior_years: list[int] | None = None) -> tuple[dict, dict]:
    """THE ROLLBACK PATH — v1's walk_forward core, exactly as shipped before
    the 2026-08-16 promotion. Needs live nfl_data_py egress. Returns
    (proj_ownmodel, diagnostics).

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

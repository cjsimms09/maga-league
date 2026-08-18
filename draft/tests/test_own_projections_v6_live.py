# TERRITORY: A
"""THE PROMOTED proj_ownmodel PATH — own_v6 live, under Cory's 2026-08-16
acceptance ("YES on V6", upgrading his same-day "Yes on v4"). What must
stay true:

  1. the live path is the GRADED construction advanced one season, imported
     from the graded modules — spot-checked by recomputing a non-QB player's
     v5 ensemble arithmetic BY HAND from V5_CONFIG and a QB's blend x
     correction (v6 keeps v4's QB arm byte for byte) from the same
     committed stores;
  2. zero network: the promoted path never imports nfl_data_py;
  3. pre-draft it runs the no-market arm (the deployment shape §7 named),
     the 2026 vegas arm prices from the extended lines store, and the
     diagnostics say both;
  4. the committed BOARD carries the promoted numbers (label own_v6 in
     provenance, values matching a fresh run) — the column can't silently be
     an older model's numbers under v6's label;
  5. the rollback path exists, signature-compatible.
"""
import json
import sys
from pathlib import Path

DRAFT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DRAFT))
sys.path.insert(0, str(DRAFT / "backtest"))
import own_projections as OP  # noqa: E402

BOARD = json.loads((DRAFT.parent / "public" / "draft_data.json").read_text())


def _run():
    if not hasattr(_run, "cache"):
        _run.cache = OP.compute_own_projections(BOARD["players"], {}, season=2026)
    return _run.cache


def test_promoted_path_is_v6_no_market_pre_draft():
    proj, diag = _run()
    assert diag["algorithm"] == "own_v6"
    assert diag["prior_years_used"] == [2025, 2024]
    assert diag["fit_transition"] == "2024->2025"
    # Pre-draft: the 2026 league draft is not a record yet, so the market arm
    # must be OFF — every player prices through the no-market ensemble.
    assert diag["market_arm"] is False
    # The vegas arm must be LIVE: the lines store was extended to 2026 as the
    # §7 deployment prerequisite, and week-1 lines cover all 32 teams.
    assert diag["vegas_arm"] is True
    assert diag["vegas_week1_teams"] == 32
    assert diag["component_priced"] > 300
    assert diag["projected"] > 300


def test_promoted_path_needs_no_network():
    """The v1 core needed live nfl_data_py; the promoted path reads committed
    stores only. Poison the import and run — it must not care."""
    poisoned = sys.modules.get("nfl_data_py")
    sys.modules["nfl_data_py"] = None  # import attempt -> TypeError/ImportError
    try:
        players = BOARD["players"][:50]
        proj, diag = OP.compute_own_projections(players, {}, season=2026)
        assert diag["algorithm"] == "own_v6"
    finally:
        if poisoned is not None:
            sys.modules["nfl_data_py"] = poisoned
        else:
            sys.modules.pop("nfl_data_py", None)


def test_non_qb_matches_the_graded_v5_ensemble_arithmetic():
    """A non-QB, undampened player's value must equal the no-market v5
    ensemble — (wc·comp + wb·anchor)/(wc+wb), anchor = blend (x v4corr where
    the position's config says so; corr is identity for non-QBs) — with the
    ENSEMBLE arithmetic recomputed BY HAND here from V5_CONFIG, feeding it
    the graded modules' own component opinion. If the live path drifts from
    the graded construction, this is the tripwire."""
    from own_model_v2 import season_totals, RECENCY_WEIGHTS
    from own_model_v5 import comp_opinion, V5_CONFIG
    import fetch_component_stats as FCS
    proj, _ = _run()
    positions = {str(p["player_id"]): p.get("position") for p in BOARD["players"]
                 if p.get("position") in ("QB", "RB", "WR", "TE")}
    ages = {str(p["player_id"]): p.get("age") for p in BOARD["players"]}
    depth = {str(p["player_id"]): p.get("depth_chart_order") for p in BOARD["players"]}
    implied = FCS.implied_team_totals(2026, 1, 1)
    comp = comp_opinion(2026, (2024, 2025), positions, ages, implied)
    w1, w2 = RECENCY_WEIGHTS
    tot1, tot2 = season_totals(2025)[0], season_totals(2024)[0]
    checked = 0
    for pid, val in proj.items():
        pos = positions.get(pid)
        if pos in (None, "QB") or depth.get(pid) not in (None, 1, 2):
            continue                       # undampened non-QBs only
        if pid not in comp or pid not in tot1:
            continue
        c = V5_CONFIG[pos]
        wc, wb, _ = c["weights"]
        blend = (w1 * tot1[pid] + w2 * tot2[pid]) if pid in tot2 else tot1[pid]
        # anchor blend_x_v4corr multiplies by corr, which is 1.0 off-QB
        expect = round(max(0.0, (wc * comp[pid] + wb * blend) / (wc + wb)), 2)
        assert abs(val - expect) < 0.02, (pid, pos, val, expect)
        checked += 1
        if checked >= 10:
            break
    assert checked >= 5, "too few undampened non-QBs to verify the arithmetic"


def test_qb_carries_the_availability_correction():
    """QBs price as blend x corr — and the correction provably does something:
    at least one QB's value differs from the raw blend (a full-season QB is
    regressed DOWN, the graded win's mechanism)."""
    from own_model_v2 import season_totals, RECENCY_WEIGHTS
    from own_model_v4 import weekly_points, qb_active_games, qb_availability_correction
    proj, _ = _run()
    positions = {str(p["player_id"]): p.get("position") for p in BOARD["players"]}
    depth = {str(p["player_id"]): p.get("depth_chart_order") for p in BOARD["players"]}
    w1, w2 = RECENCY_WEIGHTS
    tot1, tot2 = season_totals(2025)[0], season_totals(2024)[0]
    corr, mu = qb_availability_correction(
        qb_active_games(weekly_points(2025), positions))
    assert mu is not None
    moved = 0
    for pid, val in proj.items():
        if positions.get(pid) != "QB" or depth.get(pid) not in (None, 1):
            continue
        if pid not in tot1:
            continue
        blend = (w1 * tot1[pid] + w2 * tot2[pid]) if pid in tot2 else tot1[pid]
        expect = round(max(0.0, blend * corr.get(pid, 1.0)), 2)
        assert abs(val - expect) < 0.02, (pid, val, expect, corr.get(pid))
        if abs(corr.get(pid, 1.0) - 1.0) > 1e-9:
            moved += 1
    assert moved >= 3, "the availability correction moved no QB — inert term"


def test_committed_board_carries_the_promoted_numbers():
    """SOUNDNESS of whatever board is present, kept in the publication gate
    UNMARKED — every arm compares the board to a fresh own_v6 run from
    committed stores (zero network), so nothing here is fetch-date-sensitive.

    The label arm reads BOTH provenance homes, because the board has two
    writers that stamp different ones: build.py stamps the own-model diag at
    provenance.projections.own_model on every rebuild, while the 2026-08-16
    promotion hand-stamped provenance.own_model on the committed board (same
    dual-home fact ui_fidelity_own_model_label.test.js already encodes).
    Reading only the hand-stamped home made this test refuse EVERY fresh
    build — run 31926152660 failed here with `{} == 'own_v6'` while the
    candidate board genuinely carried v6 under the other key. The rule now:
    every home that declares an algorithm must declare own_v6, and at least
    one must. A fresh board whose attach failed declares nothing -> refused;
    a board labeled by an older model -> refused; both homes honest -> pass.

    THE SECOND PARITY TRAP THIS TEST CARRIED (runs 31928455030 and
    31948330004, 2026-08-16): the value arm recomputed from BOARD["players"]
    ONLY — the population the 2026-08-16 promotion hand-attached from — but
    build.py computes the column before the keeper split, so a fresh build's
    fit population also contains the 3 kept_players. The v2 OLS fit is
    population-sensitive: measured on the committed board, folding the 3
    keepers in moves 159 rows by up to ~1.2 points — so every fresh build
    mismatched the players-only recompute and was refused for being built
    the way build.py builds, not for being wrong. The rule since: the column
    must equal ONE honest population's fresh run WHOLLY — players-only (the
    promotion's hand-attach) or players+kept_players (build.py's population).
    A hand-edited value, a mixed column, or an older algorithm's numbers
    match neither run and still refuse.

    THE THIRD TRAP WAS IN BUILD.PY, NOT HERE (runs 31949909332 and
    31950441042, 2026-08-16): the dual-population fix above assumed the
    "soon-pruned" rows couldn't move the fit ("no prior-season production").
    Wrong — build.py attached the column BEFORE the activity prune, off the
    full 1,863-row draftable pool, and dormant() prunes on who-vouches
    (market/projection/rookie/keeper), NOT on production, so ~90 pruned rows
    WERE 2024/25 producers sitting in the v2 OLS fit and v5's league-
    efficiency/availability means. Every fresh candidate's column depended
    on rows the artifact doesn't publish: 352 rows mismatched BOTH honest
    populations (reproduced offline at 351 by simulating the pre-prune
    pool; values moved up to ~9.7 points). Fixed at the root in build.py —
    the own-model attach now runs AFTER the prune, on exactly
    players+kept_players, so this test's pop-B arm is the build's actual
    population and the column is auditable from the artifact alone. This
    test deliberately did NOT grow a third population: a pool the artifact
    cannot reconstruct is not an honest population, it is unauditability
    with a name.

    THE FOURTH POPULATION FACT IS A RULING, NOT A TRAP (2026-08-17): Cory's
    take-a-swing ruling (league_config.rookie_capital_prior, his words
    verbatim in that key) added a RULED live layer — the preregistered,
    graded rookie draft-capital prior — that fills proj_ownmodel on exactly
    the rookie rows own_v6's walk-forward fit cannot price, stamping each
    with proj_ownmodel_source == "rookie_capital_prior_2026". The old pin
    (every proj_ownmodel value equals a fresh v6 run) therefore split into
    two exact populations separated by the stamp: UNSTAMPED rows must still
    match a fresh own_v6 run (same 0.011 tolerance as before), and STAMPED
    rows must match a fresh fit of the ruled layer itself and be rookies —
    not a wildcard exemption, a second producer with its own recompute."""
    proj, diag = _run()
    prov_root = BOARD.get("provenance") or {}
    homes = {
        "provenance.own_model": prov_root.get("own_model") or {},
        "provenance.projections.own_model":
            (prov_root.get("projections") or {}).get("own_model") or {},
    }
    declared = {home: d.get("algorithm") for home, d in homes.items()
                if d.get("algorithm")}
    assert set(declared.values()) == {"own_v6"}, (
        "board provenance does not say own_v6 (declared: %r) — the column may "
        "still be an older model's numbers" % (declared,))

    STAMP = "rookie_capital_prior_2026"

    def _mismatches(run):
        return [str(p["player_id"]) for p in BOARD["players"]
                if p.get("proj_ownmodel") is not None
                and p.get("proj_ownmodel_source") != STAMP
                and abs(p["proj_ownmodel"] - run.get(str(p["player_id"]), -1)) > 0.011]

    chosen = proj
    mismatch_players_only = _mismatches(proj)
    if mismatch_players_only:
        pool = BOARD["players"] + (BOARD.get("kept_players") or [])
        proj_build_pop, diag_build_pop = OP.compute_own_projections(
            pool, {}, season=2026)
        assert diag_build_pop["algorithm"] == "own_v6"
        chosen = proj_build_pop
        mismatch_build_pop = _mismatches(proj_build_pop)
        assert not mismatch_build_pop, (
            "board rows disagree with a fresh own_v6 run from BOTH honest "
            "populations (players-only: %d rows; players+kept_players, "
            "build.py's pre-split population: %d rows) — the column is not "
            "any fresh run's output, e.g. %r"
            % (len(mismatch_players_only), len(mismatch_build_pop),
               mismatch_build_pop[:5]))
    stale = [str(p["player_id"]) for p in BOARD["players"]
             if p.get("proj_ownmodel") is not None
             and p.get("proj_ownmodel_source") != STAMP
             and str(p["player_id"]) not in chosen]
    assert not stale, f"{len(stale)} rows carry proj_ownmodel outside own_v6's scope (stale)"

    # ── the stamped population: the RULED layer, recomputed, not exempted ──
    stamped = [p for p in BOARD["players"]
               if p.get("proj_ownmodel_source") == STAMP]
    assert stamped, ("no row carries the rookie_capital_prior_2026 stamp — "
                     "the ruled layer vanished from the committed board")
    assert all(p.get("years_exp") == 0 for p in stamped), (
        "a non-rookie row carries the rookie-capital stamp")
    assert all(p.get("proj_ownmodel") is not None for p in stamped)
    # The ruling record must exist where the layer's gate reads it.
    cfg = json.loads((DRAFT / "config" / "league_config.json").read_text())
    ruling = cfg.get("rookie_capital_prior") or {}
    assert ruling.get("enabled") is True and ruling.get("cory_approval_verbatim"), (
        "stamped rows on the board but no enabled ruling in "
        "league_config.rookie_capital_prior — a layer without its ruling is drift")
    # Values match a fresh fit of the layer itself (pure read, committed
    # stores): null the stamped rows on a copy so targets() re-prices them.
    sys.path.insert(0, str(DRAFT / "tools"))
    import apply_rookie_prior_own_model_2026 as RP
    scrub = [dict(p, proj_ownmodel=None) if p.get("proj_ownmodel_source") == STAMP
             else p for p in BOARD["players"]]
    rows, _fit, _unmatched = RP.targets(scrub)
    fresh = {r["player_id"]: r["own_model_value"] for r in rows}
    by_pid = {str(p["player_id"]): p for p in stamped}
    assert set(fresh) == set(by_pid), (
        "the stamped rows are not exactly the rows the ruled layer would fill "
        f"(stamped-not-refit: {sorted(set(by_pid) - set(fresh))[:5]}, "
        f"refit-not-stamped: {sorted(set(fresh) - set(by_pid))[:5]})")
    bad = [pid for pid, v in fresh.items()
           if abs(by_pid[pid]["proj_ownmodel"] - v) > 0.011]
    assert not bad, (
        "stamped rookie values disagree with a fresh fit of the ruled "
        f"capital prior: {bad[:5]}")


def test_rollback_path_survives():
    assert callable(OP.compute_own_projections_v1_walkforward)
    import inspect
    sig = inspect.signature(OP.compute_own_projections_v1_walkforward)
    assert list(sig.parameters) == ["players", "cfg", "season", "prior_years"]

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

import pytest
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


def _market_ranks_for(season=2026):
    """WHETHER THE MARKET ARM IS LIVE, AND WHICH PLAYERS IT TOUCHES — read from
    the SAME source `own_projections` reads, never from a date.

    `own_projections` line 158: the market layer goes live "once the season's
    draft is a record", and `league_draft_picks` RAISES for a season with no
    completed draft. So this returns {} pre-draft and the real market ranks
    after, and every phase-aware assertion below keys off it rather than off a
    calendar — which is what stops these tests becoming stale the way the two
    below did.

    Returns (market_ranks, arm_is_live).
    """
    from own_model_v3 import league_draft_picks, market_ranks
    positions = {str(p["player_id"]): p.get("position") for p in BOARD["players"]}
    try:
        picks = league_draft_picks(season)
    except ValueError:
        return {}, False
    if not picks:
        return {}, False
    return market_ranks(picks, positions), True


def test_promoted_path_is_v6_and_the_market_arm_MATCHES_THE_PHASE():
    """⚠️ RENAMED AND MADE PHASE-AWARE (A, 2026-08-25, register 319).

    This asserted `market_arm is False` with the comment "Pre-draft: the 2026
    league draft is not a record yet". That was correct on 2026-08-16 and became
    wrong at 23:00Z on 08-22, and the assertion had no expiry — so it failed the
    acceptance gate on the first board built after the draft, with `assert True
    is False`, and helped block the publish.

    The BEHAVIOUR is right and deliberate: `own_projections` line 155 says the
    market layer is "live only once the season's draft is a record". Nothing
    about the model changed; a pin on a phase outlived the phase.

    That is this week's third instance of one pattern — a condition-bound rule
    with no expiry, still being applied after its condition ended (the keeper
    guard, register 319; the keeper-pool ruling, register 283; this). So the fix
    is not to flip the constant, which would just re-create it pointing the other
    way. It reads the SAME input the code reads and asserts BOTH phases."""
    proj, diag = _run()
    assert diag["algorithm"] == "own_v6"
    assert diag["prior_years_used"] == [2025, 2024]
    assert diag["fit_transition"] == "2024->2025"

    mranks, arm_live = _market_ranks_for(2026)
    assert diag["market_arm"] is arm_live, (
        f"diagnostics say market_arm={diag['market_arm']} but the 2026 draft "
        f"{'IS' if arm_live else 'is NOT'} a record on disk. These must agree: "
        "the arm is supposed to switch on exactly when the draft becomes a "
        "record, and a disagreement means one of the two is reading a different "
        "league_history than the other.")

    # The vegas arm must be LIVE: the lines store was extended to 2026 as the
    # §7 deployment prerequisite, and week-1 lines cover all 32 teams.
    assert diag["vegas_arm"] is True
    assert diag["vegas_week1_teams"] == 32
    assert diag["component_priced"] > 300
    assert diag["projected"] > 300


def test_the_market_arm_SWITCH_can_go_both_ways_KNOWN_POSITIVE():
    """RULE 3e. The assertion above compares two things that could both be stuck
    — if `league_draft_picks` raised for every season, `arm_live` would be False
    forever, the diagnostic would be False forever, and they would agree forever
    while testing nothing.

    2025 is a completed season and MUST yield picks. If it does not, the store
    is broken and the phase test above is vacuous rather than passing."""
    from own_model_v3 import league_draft_picks
    picks_2025 = league_draft_picks(2025)
    assert picks_2025, (
        "the 2025 draft is not a record on disk — league_draft_picks returns "
        "nothing for a completed season, so the market-arm switch cannot be "
        "shown to fire at all and the phase assertion above proves nothing")


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
    the graded construction, this is the tripwire.

    ⚠️ RESTRICTED TO PLAYERS THE MARKET LAYER DOES NOT RANK (A, 2026-08-25).
    This is a NO-MARKET identity — the docstring above says so — and once the
    2026 draft became a record the market arm went live and drafted players
    stopped satisfying it. It failed the acceptance gate on the first
    post-draft board at ('10219', 'RB', 83.19, 61.69): a 21.5-point gap that is
    the market layer working, not drift.

    THE TRIPWIRE IS NOT WEAKENED, WHICH IS WHY THIS FIX RATHER THAN A SKIP.
    `own_model_v3.build_v3` (lines 251-256) sends a player through the market
    branch ONLY when `mrank` carries him at his own position; everyone else
    takes `(wv·v2 + wb·b)/(wv+wb)` — the same no-market construction, unchanged.
    So the exact arithmetic still holds for every undrafted player, and on this
    board that is the large majority of 680. The check keeps its full strength
    year-round and simply stops asserting a no-market identity about players the
    market priced.

    The drafted side is not dropped either — the companion test below requires
    the market layer to actually MOVE them, so an inert market arm cannot hide
    in the gap this exclusion opens."""
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
    mranks, _arm_live = _market_ranks_for(2026)
    checked = 0
    for pid, val in proj.items():
        pos = positions.get(pid)
        if pos in (None, "QB") or depth.get(pid) not in (None, 1, 2):
            continue                       # undampened non-QBs only
        if pid not in comp or pid not in tot1:
            continue
        entry = mranks.get(pid)
        if entry is not None and entry[0] == pos:
            continue        # the market layer priced him; see the docstring
        c = V5_CONFIG[pos]
        wc, wb, _ = c["weights"]
        blend = (w1 * tot1[pid] + w2 * tot2[pid]) if pid in tot2 else tot1[pid]
        # anchor blend_x_v4corr multiplies by corr, which is 1.0 off-QB
        expect = round(max(0.0, (wc * comp[pid] + wb * blend) / (wc + wb)), 2)
        assert abs(val - expect) < 0.02, (pid, pos, val, expect)
        checked += 1
        if checked >= 10:
            break
    assert checked >= 5, (
        "too few undampened, market-unranked non-QBs to verify the arithmetic — "
        "if the market layer now ranks nearly everyone, this exclusion has eaten "
        "the test and it needs re-deriving rather than passing")


def test_the_market_layer_MOVES_the_players_it_ranks():
    """THE OTHER SIDE OF THE EXCLUSION ABOVE, so it cannot hide an inert arm.

    The arithmetic test skips players the market layer ranked. If the market
    layer did nothing, those players would still satisfy the no-market identity,
    the exclusion would be silently pointless, and a dead market arm would look
    exactly like a live one — which is the shape this repo keeps getting caught
    by (rule 3e).

    So: whenever the arm is live, at least some ranked players must DIFFER from
    the no-market expectation. Pre-draft there is nothing to check and it says so
    rather than passing quietly."""
    from own_model_v2 import season_totals, RECENCY_WEIGHTS
    from own_model_v5 import comp_opinion, V5_CONFIG
    import fetch_component_stats as FCS

    mranks, arm_live = _market_ranks_for(2026)
    if not arm_live:
        pytest.skip("the 2026 draft is not a record on disk yet, so the market "
                    "arm is off and there is nothing for it to move")

    proj, _ = _run()
    positions = {str(p["player_id"]): p.get("position") for p in BOARD["players"]
                 if p.get("position") in ("QB", "RB", "WR", "TE")}
    ages = {str(p["player_id"]): p.get("age") for p in BOARD["players"]}
    depth = {str(p["player_id"]): p.get("depth_chart_order") for p in BOARD["players"]}
    implied = FCS.implied_team_totals(2026, 1, 1)
    comp = comp_opinion(2026, (2024, 2025), positions, ages, implied)
    w1, w2 = RECENCY_WEIGHTS
    tot1, tot2 = season_totals(2025)[0], season_totals(2024)[0]

    ranked, moved = 0, 0
    for pid, val in proj.items():
        pos = positions.get(pid)
        if pos in (None, "QB") or depth.get(pid) not in (None, 1, 2):
            continue
        if pid not in comp or pid not in tot1:
            continue
        entry = mranks.get(pid)
        if entry is None or entry[0] != pos:
            continue
        ranked += 1
        c = V5_CONFIG[pos]
        wc, wb, _ = c["weights"]
        blend = (w1 * tot1[pid] + w2 * tot2[pid]) if pid in tot2 else tot1[pid]
        no_market = round(max(0.0, (wc * comp[pid] + wb * blend) / (wc + wb)), 2)
        if abs(val - no_market) >= 0.02:
            moved += 1

    assert ranked >= 5, (
        f"the market arm is live but only {ranked} undampened non-QBs are ranked "
        "by it — too few to tell a working layer from a broken one")
    assert moved > 0, (
        f"the market arm reports LIVE and ranks {ranked} of these players, but "
        "not one of them differs from the no-market ensemble. An inert market "
        "layer is indistinguishable from an absent one, and the arithmetic test "
        "above excludes exactly these players — so this would be a silent hole.")


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

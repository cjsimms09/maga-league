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
    proj, diag = _run()
    prov = (BOARD.get("provenance") or {}).get("own_model") or {}
    assert prov.get("algorithm") == "own_v6", (
        "board provenance does not say own_v6 — the column may still be an older model's numbers")
    mismatch = [str(p["player_id"]) for p in BOARD["players"]
                if p.get("proj_ownmodel") is not None
                and abs(p["proj_ownmodel"] - proj.get(str(p["player_id"]), -1)) > 0.011]
    assert not mismatch, f"{len(mismatch)} board rows disagree with a fresh own_v6 run"
    stale = [str(p["player_id"]) for p in BOARD["players"]
             if p.get("proj_ownmodel") is not None and str(p["player_id"]) not in proj]
    assert not stale, f"{len(stale)} rows carry proj_ownmodel outside own_v6's scope (stale)"


def test_rollback_path_survives():
    assert callable(OP.compute_own_projections_v1_walkforward)
    import inspect
    sig = inspect.signature(OP.compute_own_projections_v1_walkforward)
    assert list(sig.parameters) == ["players", "cfg", "season", "prior_years"]

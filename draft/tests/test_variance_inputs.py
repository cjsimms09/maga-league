# TERRITORY: A
"""VARIANCE PORTFOLIO measuring arm — tests: hand-computed cv cells,
absent-not-zero at every gate, committed-artifact internal consistency,
and determinism.

Preregistration: draft/audit/edge_hunt_2026-08-16.md §2 (commit eb367719).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))

import variance_portfolio as V  # noqa: E402

ARTIFACT = DRAFT / "data" / "variance_inputs_2026.json"


# ── weekly_cv: hand-computed cells ───────────────────────────────────────────

def test_weekly_cv_hand_computed():
    rows = {1: 10.0, 2: 20.0, 3: 10.0, 4: 20.0, 5: 10.0, 6: 20.0}
    out = V.weekly_cv(rows)
    # mean 15; sample var = 6*25/5 = 30; sd = sqrt(30) = 5.477; cv = 0.3651
    assert out["mean"] == 15.0
    assert abs(out["sd"] - math.sqrt(30)) < 1e-3
    assert abs(out["cv"] - math.sqrt(30) / 15) < 1e-3
    assert out["n_weeks"] == 6


def test_weekly_cv_below_min_games_is_absent_not_zero():
    rows = {w: 10.0 for w in range(1, V.MIN_GAMES)}      # one short
    assert V.weekly_cv(rows) is None


def test_weekly_cv_nonpositive_mean_is_absent_not_zero():
    rows = {w: 0.0 for w in range(1, 10)}
    assert V.weekly_cv(rows) is None
    rows = {w: -1.0 for w in range(1, 10)}
    assert V.weekly_cv(rows) is None


def test_weekly_cv_boundary_exactly_min_games_counts():
    rows = {w: float(w) for w in range(1, V.MIN_GAMES + 1)}
    assert V.weekly_cv(rows) is not None


# ── the committed artifact ───────────────────────────────────────────────────

@pytest.fixture(scope="module")
def artifact():
    return json.loads(ARTIFACT.read_text())


def test_artifact_territory_first_and_prereg(artifact):
    assert list(artifact.keys())[0] == "_territory"
    assert artifact["_territory"].startswith("TERRITORY: A")
    assert artifact["prereg"]["min_games"] == V.MIN_GAMES
    assert "edge_hunt_2026-08-16" in artifact["prereg"]["audit_doc"]


def test_artifact_player_rows_internally_consistent(artifact):
    assert artifact["players"], "empty measurement — vacuous artifact"
    for pid, row in artifact["players"].items():
        assert row["n_weeks"] >= V.MIN_GAMES, pid
        assert row["source_season"] in V.SEASONS, pid
        assert row["mean"] > 0, pid
        # cv is sd/mean within the artifact's own rounding (mean/sd are
        # rounded to 3dp, so the recompute tolerance is relative).
        assert abs(row["cv"] - row["sd"] / row["mean"]) \
            < max(2e-3, 0.01 * row["cv"]), pid
        assert row["position"] in V.POSITIONS, pid


def test_artifact_class_cv_present_for_every_skill_position(artifact):
    for pos in V.POSITIONS:
        cls = artifact["class_cv"][pos]
        assert cls is not None and cls["n"] > 0, pos
        assert 0.2 < cls["cv_mean"] < 1.5, pos     # a cv outside this is a bug


def test_artifact_coverage_matches_board(artifact):
    # COMMITTED-ARTIFACT DRIFT, NOT A CODE BUG (found 2026-08-16 verifying
    # this suite after the board correction — see
    # draft/audit/rebuild_refusal_diagnosis_2026-08-16.md's pattern).
    # `variance_inputs_2026.json` was committed (62551aea) against an earlier
    # snapshot of the board; the board has since grown by 2 RB / 2 WR / 1 TE
    # (ordinary roster churn, the same "new signings" shape as
    # test_playoff_sos's 677->682 finding), so `board_coverage.fallback`
    # (== n_board - n_measured, mechanically, in variance_portfolio.py:111-
    # 122) was stale by exactly that count while `measured` — the harder
    # quantity, derived from real historical weekly game logs — was
    # unchanged. Re-derived with `python3 draft/tools/variance_portfolio.py`
    # against the current board and re-committed; this test's job (coverage
    # buckets sum to the live board's count) is otherwise unchanged.
    board = json.loads((DRAFT.parent / "public"
                        / "draft_data.json").read_text())
    for pos in V.POSITIONS:
        n_board = sum(1 for p in board["players"] if p["position"] == pos)
        cov = artifact["board_coverage"][pos]
        assert cov["measured"] + cov["fallback"] == n_board, pos
        n_measured = sum(1 for pid, r in artifact["players"].items()
                         if r["position"] == pos)
        assert cov["measured"] == n_measured, pos


def test_artifact_absent_players_are_absent_not_zero(artifact):
    """No artifact row may carry cv 0 — a player nobody measured is missing
    from `players` entirely, never written as zero-variance."""
    for pid, row in artifact["players"].items():
        assert row["cv"] > 0, pid


def test_run_is_deterministic():
    a = V.run()
    b = V.run()
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_committed_artifact_matches_regeneration():
    committed = json.loads(ARTIFACT.read_text())
    assert json.dumps(committed, sort_keys=True) \
        == json.dumps(V.run(), sort_keys=True)

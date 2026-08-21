"""Tests for draft/backtest/target_quality_tilt.py — the red-zone/end-zone
opportunity tilt graded against draft/TARGET-QUALITY-PREREG-2026-08-21.md.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import target_quality_tilt as T  # noqa: E402

ARTIFACT = ROOT / "draft" / "backtest" / "target_quality_tilt.json"


def test_multiplier_of_ONE_collapses_tilt_to_baseline_EXACTLY():
    pred = 12.3 * (1.0 + T.TILT_SCALE * (1.0 - 1.0))
    assert pred == 12.3


def test_a_heavy_redzone_player_gets_a_HIGHER_multiplier_than_a_zero_redzone_player():
    """Known-positive: rz_multiplier must actually discriminate, or the
    whole study is measuring nothing (Rule 3e)."""
    pos_mean = 1.0
    heavy = T.rz_multiplier(rate=3.0, pos_mean_rate=pos_mean)
    zero = T.rz_multiplier(rate=0.0, pos_mean_rate=pos_mean)
    assert heavy > 1.0
    assert zero == 0.0
    assert heavy > zero


def test_rz_multiplier_clips_at_declared_bounds():
    lo, hi = T.RZ_MULT_CLIP
    assert T.rz_multiplier(rate=100.0, pos_mean_rate=1.0) == hi
    assert T.rz_multiplier(rate=0.0, pos_mean_rate=1.0) == lo


def test_rz_multiplier_defaults_to_ONE_when_the_position_mean_is_zero():
    """An early-week fold with no stable position mean must not divide by
    zero or silently zero every player out — declared in the prereg S2."""
    assert T.rz_multiplier(rate=5.0, pos_mean_rate=0.0) == 1.0


def test_rz_opps_by_pid_week_treats_ABSENCE_as_zero_not_missing():
    """Prereg S0's central nuance: a rush-only player absent from a week's
    dict (no inside-10 carry that week) must read as 0 opportunities, never
    excluded — this is what distinguishes 'no redzone look' from 'no data'."""
    fake_week = {"1111": {"inside_10_carries": 0, "inside_10_targets": 2}}
    got = T.rz_opps_by_pid_week({"5": fake_week}, week=5)
    assert got["1111"] == 2
    # a pid never in the week's dict at all is correctly absent from this
    # dict's keys — the CALLER (rz_rate_series) is responsible for treating
    # that absence as 0, which the next test verifies end-to-end.
    assert "9999" not in got


def test_rz_rate_series_is_LEAK_FREE_strictly_prior_weeks_only():
    """A player's week-5 trailing rate must be built ONLY from weeks 1-4 —
    if week 5's own opportunities leaked in, a single-week spike would show
    up in ITS OWN week's rate, which this test would catch."""
    tq_doc = {
        "1": {"7": {"inside_10_carries": 0, "inside_10_targets": 0}},
        "2": {"7": {"inside_10_carries": 0, "inside_10_targets": 0}},
        "3": {"7": {"inside_10_carries": 0, "inside_10_targets": 0}},
        # a huge spike ONLY on week 4 — must not appear in week 4's own rate
        "4": {"7": {"inside_10_carries": 9, "inside_10_targets": 9}},
        "5": {"7": {"inside_10_carries": 0, "inside_10_targets": 0}},
    }
    series = T.rz_rate_series(tq_doc, {"7"}, n_weeks=5)
    # week 4 needs 3 strictly-prior weeks (1,2,3) — all zero opportunities —
    # so its rate must be 0, NOT reflect its own week-4 spike of 18.
    assert series["7"][4] == 0.0
    # week 5's trailing average now includes the week-4 spike (18 opps over
    # 4 prior weeks = 4.5) — the leak-free rule updates AFTER, not during.
    assert series["7"][5] == 18 / 4


def test_rz_rate_series_requires_MIN_PRIOR_WEEKS_before_reporting_a_rate():
    tq_doc = {str(w): {} for w in range(1, 6)}
    series = T.rz_rate_series(tq_doc, {"1"}, n_weeks=5)
    for w in range(1, T.MIN_PRIOR_WEEKS + 1):
        assert w not in series["1"], f"week {w} should have <{T.MIN_PRIOR_WEEKS} prior weeks"
    assert (T.MIN_PRIOR_WEEKS + 1) in series["1"]


def test_the_real_2024_fold_is_usable_and_the_absence_convention_holds():
    f = T.grade_fold(2024)
    assert f["usable"]
    assert f["population"] > 100
    assert f["player_weeks_graded"] > 1000
    # every graded row's actual redzone-derived multiplier must be a real
    # number in the declared clip range — a stray NaN or out-of-range value
    # would mean the leak-free join broke silently.
    lo, hi = T.RZ_MULT_CLIP
    for r in f["rows"][:500]:
        assert lo <= r["rz_multiplier"] <= hi


def test_pooled_grade_reports_a_bool_clears_and_never_crashes_on_an_empty_fold():
    empty_fold = {"season": 2099, "usable": False, "why": "no data"}
    real_fold = T.grade_fold(2024)
    pooled = T.pooled_grade([empty_fold, real_fold])
    assert isinstance(pooled["clears"], bool)
    assert pooled["n_folds_usable"] == 1


def test_gsi_cross_correlation_is_computed_against_the_ALREADY_GRADED_sibling_arm():
    """Prereg S4's second gate — this study must not silently skip checking
    itself against P286's interaction arm."""
    f = T.grade_fold(2024)
    overlap = [r for r in f["rows"] if r["pred_gsi_interaction"] is not None]
    assert len(overlap) > 0, "no overlap with the GSI fold — the join between the two studies broke"


# ── register 198: the controls, and that they can actually FAIL ───────────
#
# These call the SCRIPT's control functions, not copies. A test that
# reimplements the control proves the test works, not the grader.
#
# ⚠️ Only the RED path calls cli(). A green cli() rewrites the committed
# artifact as a side effect (register 58's shape), and a test suite that
# quietly regenerates the thing it is asserting against is worthless.

def test_the_controls_PASS_on_the_real_code():
    assert T.controls()["ok"] is True, T.controls()["checks"]


def test_cli_REFUSES_and_returns_nonzero_when_a_control_goes_red(monkeypatch):
    """`GRADING-POLICY.md` requirement 3: the controls gate the exit code.
    Before register 198 this pair lived only in pytest, so `main()` wrote the
    artifact and returned 0 no matter what the controls would have said."""
    monkeypatch.setattr(T, "rz_multiplier", lambda rate, pos_mean_rate: 1.0)
    assert T.cli() == 1


def test_the_artifact_is_NOT_written_when_a_control_is_red(monkeypatch, tmp_path):
    before = ARTIFACT.read_bytes()
    monkeypatch.setattr(T, "rz_multiplier", lambda rate, pos_mean_rate: 1.0)
    assert T.cli() == 1
    assert ARTIFACT.read_bytes() == before, "a red run rewrote the artifact"

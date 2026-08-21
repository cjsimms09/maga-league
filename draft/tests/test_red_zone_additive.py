"""Tests for draft/backtest/red_zone_additive.py — the additive red-zone arm
preregistered in draft/RED-ZONE-ADDITIVE-PREREG-2026-08-21.md.

The prereg promised a specific Rule 3e known-positive: a planted red-zone
surplus must produce a correction of exactly alpha * surplus, and a player at
his position mean must receive exactly zero. Without that pair, an arm whose
correction silently computed to ~0 everywhere would look identical to this
one's real result — which matters here, because the real result IS a tiny
correction, and "tiny" and "broken" are the same picture from outside.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import red_zone_additive as R  # noqa: E402

ARTIFACT = ROOT / "draft" / "backtest" / "red_zone_additive.json"


def _doc() -> dict:
    return json.loads(ARTIFACT.read_text())


# ── the transform ─────────────────────────────────────────────────────────

def test_KNOWN_POSITIVE_a_planted_surplus_gets_exactly_alpha_times_surplus():
    row = {"baseline": 10.0, "dev": 2.0, "actual": 0.0}
    assert R.predict(row, 0.5) == 11.0
    assert R.predict(row, 3.0) == 16.0


def test_KNOWN_NEGATIVE_a_player_at_his_position_mean_gets_exactly_zero():
    """The property the multiplicative arm lacked: at the mean, no correction."""
    row = {"baseline": 10.0, "dev": 0.0, "actual": 0.0}
    for a in R.ALPHA_GRID:
        assert R.predict(row, a) == 10.0, a


def test_a_DEFICIT_moves_the_prediction_DOWN_not_just_up():
    """A one-sided correction would be a different model than the prereg's."""
    assert R.predict({"baseline": 10.0, "dev": -2.0}, 0.5) == 9.0


def test_alpha_zero_is_EXACTLY_the_baseline_so_do_nothing_is_reachable():
    """prereg S1: 0.0 is in the grid on purpose. If alpha=0 were not exactly
    the baseline, 'do nothing' would be unreachable and the LOSO fit could
    never honestly select it."""
    assert 0.0 in R.ALPHA_GRID
    rows = [{"baseline": 7.0, "dev": 5.0, "actual": 6.0}]
    assert R.mae(rows, 0.0) == R.baseline_mae(rows)


# ── the LOSO discipline ───────────────────────────────────────────────────

def test_alpha_is_fitted_on_OTHER_seasons_never_the_held_out_one():
    doc = _doc()
    for s, v in doc["folds"].items():
        if not v.get("usable"):
            continue
        assert int(s) not in v["fitted_on"], (s, v["fitted_on"])
        assert len(v["fitted_on"]) == 3, (s, v["fitted_on"])


def test_the_selected_alphas_are_all_from_the_declared_grid():
    for a in _doc()["pooled"]["alphas_selected"]:
        assert a in R.ALPHA_GRID, a


# ── the graded result, pinned ─────────────────────────────────────────────

def test_the_arm_FAILS_and_fails_specifically_on_the_CORRELATION_gate():
    """The headline. It is pinned because it is counter-intuitive: the arm is
    the right SIGN on 3 of 4 folds and clears the blend break-even, and is
    still FALSE — because at rho 0.9986 it is the baseline wearing a hat."""
    p = _doc()["pooled"]
    assert p["clears"] is False
    assert p["gate_clears"] is False
    assert p["correlation_vs_baseline"] >= 0.98


def test_the_MAE_effect_is_real_in_sign_and_negligible_in_size():
    """Both halves matter: a positive delta that is 50x under the bar is the
    evidence that the axis has something and the transform cannot carry it."""
    p = _doc()["pooled"]
    assert p["delta_mae"] > 0, "sign flipped — re-read the audit before trusting it"
    assert p["delta_mae"] < R.MAE_BAR / 10, p["delta_mae"]


def test_LOSO_did_NOT_select_do_nothing_which_is_what_makes_this_informative():
    """If every fold had picked alpha=0 the result would be 'no signal'. They
    picked non-zero, so the fit wants the term and it still buys nothing —
    a stronger and different statement."""
    assert any(a > 0 for a in _doc()["pooled"]["alphas_selected"])


def test_the_population_is_P292s_so_the_comparison_is_paired():
    """If this drifts from P292's 11,747 player-weeks the two studies stop
    being a paired transform comparison and the whole finding weakens."""
    assert _doc()["pooled"]["n_player_weeks"] == 11747


# ── register 198: the controls, and that they can actually FAIL ───────────
#
# These call the SCRIPT's control functions, not copies. A test that
# reimplements the control proves the test works, not the grader.
#
# ⚠️ Only the RED path calls cli(). A green cli() rewrites the committed
# artifact as a side effect (register 58's shape), and a test suite that
# quietly regenerates the thing it is asserting against is worthless.

def test_the_controls_PASS_on_the_real_code():
    assert R.controls()["ok"] is True, R.controls()["checks"]


def test_cli_REFUSES_and_returns_nonzero_when_a_control_goes_red(monkeypatch):
    """`GRADING-POLICY.md` requirement 3: the controls gate the exit code.
    Before register 198 this pair lived only in pytest, so `main()` wrote the
    artifact and returned 0 no matter what the controls would have said."""
    monkeypatch.setattr(R, "predict", lambda row, alpha: row["baseline"])
    assert R.cli() == 1


def test_the_artifact_is_NOT_written_when_a_control_is_red(monkeypatch, tmp_path):
    before = ARTIFACT.read_bytes()
    monkeypatch.setattr(R, "predict", lambda row, alpha: row["baseline"])
    assert R.cli() == 1
    assert ARTIFACT.read_bytes() == before, "a red run rewrote the artifact"

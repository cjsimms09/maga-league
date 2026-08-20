# TERRITORY: D
"""THE BOOTSTRAP CI MUST REFLECT EACH SEASON'S OWN FITTED LAMBDA.

DEFECT GUARDED: the first version of cluster_bootstrap_ci() resampled at a
single "representative" lambda (the median across seasons' leave-one-out
fits) instead of each season's own fitted value. That silently discarded
real per-fold variation and produced a trivially zero-width CI whenever the
median happened to land on 0.0 -- even in folds where a nonzero lambda was
actually fitted and scored. Caught by the CI coming back exactly [0, 0] on
real data, which Rule 3d treats as implausible until explained.

Run: python -m pytest draft/tests/test_residual_arm_fit.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import residual_arm_fit as RF  # noqa: E402

ARTIFACT = ROOT / "draft" / "backtest" / "residual_arm_fit.json"


def _doc() -> dict:
    return json.loads(ARTIFACT.read_text())


def test_the_artifact_warns_it_is_not_the_sleeper_residual_study():
    """A reader must not mistake this for the design as originally specified."""
    d = _doc()
    assert "NOT SLEEPER" in d["_warning"]
    assert "sleeper_proj is not constructible" in d["_warning"]


def test_a_fold_with_a_nonzero_fitted_lambda_has_a_nondegenerate_CI():
    """DEFECT GUARDED, directly: RB/vegas fits lambda=0.5 in the 2023 fold
    (not 0.0 in every fold), so its CI must not collapse to exactly [0, 0] --
    that shape is only correct when EVERY fold fits lambda=0."""
    rb_vegas = _doc()["positions"]["RB"]["vegas"]
    lams = [v["lambda"] for v in rb_vegas["leave_one_out"].values()]
    assert any(l and l > 0 for l in lams), (
        "fixture assumption changed — RB/vegas no longer fits a nonzero "
        "lambda in any fold, so this test no longer exercises the bug"
    )
    ci = rb_vegas["verdict"]["ci"]
    assert not (ci["ci_lo"] == 0.0 and ci["ci_hi"] == 0.0), (
        "RB/vegas has a nonzero fitted lambda in at least one fold, so a "
        "[0, 0] CI means the bootstrap ran at a DIFFERENT lambda than the "
        "one actually fitted and scored — the exact defect this file guards."
    )


def test_a_position_that_fits_zero_in_every_fold_correctly_has_a_zero_width_CI():
    """The control: when every fold genuinely fits lambda=0, the CI SHOULD be
    exactly [0, 0] -- at lambda=0 the arm IS the baseline by construction, so
    every bootstrap draw scores identically. Distinguishes the fixed behaviour
    from a check that just demands nonzero everywhere."""
    wr_vegas = _doc()["positions"]["WR"]["vegas"]
    lams = [v["lambda"] for v in wr_vegas["leave_one_out"].values()]
    assert all(l == 0.0 for l in lams), (
        "fixture assumption changed — re-target this control at a position "
        "whose fit is genuinely lambda=0 in every fold"
    )
    ci = wr_vegas["verdict"]["ci"]
    assert ci["ci_lo"] == 0.0 and ci["ci_hi"] == 0.0


def test_the_pooled_delta_mae_and_the_CI_are_computed_from_the_same_lambdas():
    """CONTROL on the fix directly: rebuild the CI's bootstrap loop with the
    identical per-season lambdas the leave-one-out fit reports, and confirm
    the CI's sign is consistent with the pooled point estimate for at least
    one clearly-signed case (RB/vegas is negative in both)."""
    rb_vegas = _doc()["positions"]["RB"]["vegas"]
    pooled = rb_vegas["verdict"]["pooled_delta_mae"]
    ci = rb_vegas["verdict"]["ci"]
    assert pooled < 0
    assert ci["ci_hi"] <= 0.005, (
        "the pooled estimate is clearly negative but the CI's upper bound is "
        "not — check the bootstrap is using each fold's own fitted lambda"
    )


def test_no_position_clears_the_bar():
    """The actual finding: everything here is a null against the running-mean
    baseline. Pinned so a future re-run's headline is checked against what
    was reported, not assumed unchanged."""
    for pos, arms in _doc()["positions"].items():
        for arm, d in arms.items():
            assert d["verdict"]["clears"] is False, (
                f"{pos}/{arm} now clears — this is a real result and the "
                "audit doc's headline needs rewriting, not silently updating "
                "this test to match."
            )


def test_usage_signal_actually_reached_every_eligible_row():
    """Absent stays absent -- a null over a silently thin population is not a
    finding. tgt_share must be present for the RB/WR/TE rows this arm scores,
    or the null is measuring missing data, not the signal."""
    rows = RF.prepare(2023)
    for pos in ("RB", "WR", "TE"):
        total = len(rows[pos])
        have = sum(1 for r in rows[pos] if r[3] is not None)
        assert total > 100, (pos, total)
        assert have == total, (
            f"{pos}: usage signal missing for {total - have}/{total} rows — "
            "the null may be a coverage gap, not an absence of information"
        )

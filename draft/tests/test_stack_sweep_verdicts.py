# TERRITORY: A
"""THE THIRD INSTANCE OF "THE LABEL DOES NOT MATCH THE INTERVAL".

`frontier.py` and `cory_conditional.py` were both fixed for reporting
"parked: CI includes $0" about intervals that do not contain zero. `stack_sweep`
had the same defect from the OTHER side and both fixes missed it, because the
bug here was a MISSING branch rather than a wrong predicate — grepping for the
corrected `lo <= 0 <= hi` finds files that already think about the question, and
this file did not.

    WINNER if lo > 0 and mean > BAND
    else HARMFUL if hi < 0
    else "parked: CI includes $0"        <-- reached when lo > 0 and mean <= BAND

A dose with a confidence interval entirely ABOVE zero, whose mean is merely
small, was labelled as though zero were inside it.

LATENT, NOT MANIFEST. All five rows of the shipped stack-sweep.json are decisive
winners (CIs +266 to +540), so the branch has never fired on real output. This is
a correctness fix, not a correction to a published number, and the tests below
say which is which.

Run: python -m pytest draft/tests/test_stack_sweep_verdicts.py
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "draft", "backtest"))

import cory_conditional as CC          # noqa: E402
import stack_sweep as SS               # noqa: E402

BAND = CC.EVEN_MONEY_BAND
ARTIFACT = os.path.join(ROOT, "draft", "backtest", "stack-sweep.json")


def test_THE_BUG_a_positive_interval_is_never_called_zero_containing():
    """KNOWN-POSITIVE. The exact case the missing branch mislabelled: interval
    entirely above zero, mean inside the even-money band."""
    v = SS.verdict_for(lo=0.5, hi=3.0, mean=BAND - 1.0)
    assert "includes $0" not in v, v
    assert "even-money band" in v, v


def test_a_negative_interval_is_harmful_not_parked():
    v = SS.verdict_for(lo=-99.5, hi=-29.33, mean=-60.0)
    assert v.startswith("HARMFUL"), v
    assert "includes $0" not in v, v


def test_only_a_straddling_interval_claims_to_include_zero():
    assert SS.verdict_for(lo=-10.0, hi=10.0, mean=0.5) == "parked: CI includes $0"
    assert SS.verdict_for(lo=0.0, hi=10.0, mean=0.5) == "parked: CI includes $0"
    assert SS.verdict_for(lo=-10.0, hi=0.0, mean=-0.5) == "parked: CI includes $0"


def test_a_real_winner_still_wins():
    """CONTROL. A fix that made everything 'parked' would pass every assertion
    above and destroy the file's purpose."""
    v = SS.verdict_for(lo=266.46, hi=422.29, mean=343.54)
    assert v.startswith("WINNER"), v


def test_every_label_is_true_of_its_own_interval():
    """The invariant, stated once and checked over a grid rather than by cases —
    no verdict may claim zero is inside an interval that excludes it, or outside
    one that contains it."""
    for lo, hi, mean in [(-50, -1, -25), (-50, 50, 0), (1, 50, 25), (1, 3, 2),
                         (0, 5, 2), (-5, 0, -2), (0.1, 0.2, 0.15)]:
        v = SS.verdict_for(lo, hi, mean)
        contains_zero = lo <= 0 <= hi
        assert ("includes $0" in v) == contains_zero, (lo, hi, mean, v)


def test_the_shipped_artifact_carries_no_mislabelled_interval():
    """And the published numbers, in case the branch ever does fire."""
    rows = json.load(open(ARTIFACT, encoding="utf8")).get("leaderboard") or []
    assert rows, "empty stack sweep — the artifact regenerated to nothing"
    for r in rows:
        lo, hi = r["ci95"]
        assert ("includes $0" in r["verdict"]) == (lo <= 0 <= hi), r


def test_the_verdicts_match_what_the_current_code_would_write():
    """Catches an artifact left behind by an older labeller — which is exactly
    how main's frontier.json came to carry a mislabelled verdict while its own
    suite stayed green (draft/audit/board_publish_stall_2026-08-17.md)."""
    rows = json.load(open(ARTIFACT, encoding="utf8")).get("leaderboard") or []
    for r in rows:
        lo, hi = r["ci95"]
        assert r["verdict"] == SS.verdict_for(lo, hi, r["edge"]), r

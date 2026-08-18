# TERRITORY: A
"""frontier.py's verdict labels must MATCH THE INTERVAL — the smaller sibling of
cory_conditional.py's fix, found live in the shipped artifact.

THE DEFECT, reproduced as a fail arm below: the label read
`"parked: CI includes $0" if lo <= 0`, which is true of ANY negative lower
bound. So a candidate whose CI sat ENTIRELY below zero — a confident LOSS —
was filed as inconclusive, which is the one reading that keeps it on the
table. The shipped frontier.json carried flat_l2.0 at [-109.33, -25.5] and
flat_l3.0 at [-134.83, -44.5] under that label. cory_conditional.py:517 fixed
the identical expression on 2026-08-13 and the fix never travelled here.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import frontier  # noqa: E402
import cory_conditional as CC  # noqa: E402

BAND = CC.EVEN_MONEY_BAND


def old_label(lo, mean):
    """The retired expression, verbatim — kept here as the fail arm's subject."""
    wins = lo > 0 and mean > BAND
    return ("WINNER — install via the gates (slider change, cited)" if wins
            else ("parked: CI includes $0" if lo <= 0
                  else f"parked: inside the ${BAND} band"))


def test_FAIL_ARM_the_old_expression_files_a_confident_loss_as_inconclusive():
    """The defect, demonstrated: an interval entirely below zero got the
    inconclusive label under the old code. If this arm ever stops producing
    the wrong label, the reproduction is broken and the pin below is
    guarding against a defect that no longer exists in this form."""
    assert old_label(-109.33, -67.42) == "parked: CI includes $0"


def test_an_entirely_negative_interval_is_a_LOSS_not_a_shrug():
    v = frontier.verdict_for(-109.33, -25.5, -67.42)
    assert v == "LOSER — significantly worse than the control", v


def test_zero_is_inside_the_interval_only_when_it_actually_is():
    # genuine straddle keeps the inconclusive label
    assert frontier.verdict_for(-13.83, 72.17, 29.17) == "parked: CI includes $0"
    # a confident win above the even-money band is a winner
    assert "WINNER" in frontier.verdict_for(394.17, 520.5, 457.83)
    # lo > 0 but the mean sits inside the even-money band: parked on the band,
    # not on the CI (mean must be <= BAND=4.0 for this arm)
    assert frontier.verdict_for(1.0, 5.0, 3.0) == f"parked: inside the ${BAND} band"


def test_the_SHIPPED_artifact_carries_no_mislabelled_interval():
    """Every leaderboard row's label must be exactly what verdict_for derives
    from its own interval — so the artifact cannot drift back to the old
    labeller, and a hand-edit cannot reintroduce the shrug."""
    art = json.loads((BT / "frontier.json").read_text())
    rows = art["leaderboard"]
    assert rows, "empty leaderboard — the artifact regenerated to nothing"
    for r in rows:
        lo, hi = r["ci95"]
        want = frontier.verdict_for(lo, hi, r["mean_edge"])
        assert r["verdict"] == want, (
            f"{r['candidate']}: CI [{lo}, {hi}] labelled {r['verdict']!r}, "
            f"the interval says {want!r}")
        if hi < 0:
            assert "includes $0" not in r["verdict"], (
                f"{r['candidate']}: an entirely-negative CI carries the "
                "inconclusive label — the exact defect this file pins")

"""The frozen metric must score what the freeze says and REFUSE what it
excludes — every arm through the real functions (rule 3f: hand-computed
known answers, not the module agreeing with itself)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import start_sit_metric as M  # noqa: E402


def _row(pos, actual, **proj):
    return {"pos": pos, "actual": actual, "proj": proj}


def week_basic():
    # WR: a beats b by 10 real points; "good" orders them right, "bad" wrong,
    # "tied" prices them identical.
    return {
        "a": _row("WR", 20.0, good=15.0, bad=5.0, tied=10.0),
        "b": _row("WR", 10.0, good=9.0, bad=9.0, tied=10.0),
    }


def test_hand_computed_pair_scores():
    acc = M.pairwise_accuracy([week_basic()], ["good", "bad", "tied"])
    wr = {s: acc["sources"][s]["WR"] for s in ("good", "bad", "tied")}
    assert all(c["n_pairs"] == 1 for c in wr.values())
    # under MIN_PAIRS the cell is unmeasurable but the tally is exact;
    # verify through the raw fraction by re-running with floor lowered
    saved = M.MIN_PAIRS
    try:
        M.MIN_PAIRS = 1
        acc = M.pairwise_accuracy([week_basic()], ["good", "bad", "tied"])
        assert acc["sources"]["good"]["WR"]["accuracy"] == 1.0
        assert acc["sources"]["bad"]["WR"]["accuracy"] == 0.0
        assert acc["sources"]["tied"]["WR"]["accuracy"] == 0.5
    finally:
        M.MIN_PAIRS = saved


def test_FAIL_ARM_noise_pair_below_floor_is_excluded_and_counted():
    week = {"a": _row("WR", 10.0, s=12.0), "b": _row("WR", 8.5, s=1.0)}
    acc = M.pairwise_accuracy([week], ["s"])
    assert acc["sources"]["s"]["WR"]["n_pairs"] == 0
    assert acc["_excluded_below_floor"] == 1


def test_FAIL_ARM_inactive_player_never_forms_a_pair():
    """Absent-not-zero: actual None is not a graded decision."""
    week = {"a": _row("WR", 20.0, s=15.0), "b": _row("WR", None, s=9.0)}
    acc = M.pairwise_accuracy([week], ["s"])
    assert acc["sources"]["s"]["WR"]["n_pairs"] == 0


def test_FAIL_ARM_player_missing_one_source_drops_from_all():
    """Shared population: a pid one source skipped never enters ANY
    source's pairs — else the metric grades different games."""
    week = {"a": _row("WR", 20.0, s1=15.0, s2=14.0),
            "b": _row("WR", 10.0, s1=9.0)}          # s2 never priced b
    acc = M.pairwise_accuracy([week], ["s1", "s2"])
    assert acc["sources"]["s1"]["WR"]["n_pairs"] == 0
    assert acc["sources"]["s2"]["WR"]["n_pairs"] == 0


def test_pooling_not_per_week_average():
    """One 1-pair week (wrong) + weeks totaling 3 right pairs must grade
    3/4, not mean(0, 1) = 0.5."""
    saved = M.MIN_PAIRS
    try:
        M.MIN_PAIRS = 1
        wrong = {"a": _row("WR", 20.0, s=1.0), "b": _row("WR", 10.0, s=9.0)}
        right = {f"p{i}": _row("WR", 10.0 * i, s=float(i))
                 for i in range(1, 4)}   # 3 pairs, all ordered correctly
        acc = M.pairwise_accuracy([wrong, right], ["s"])
        assert acc["sources"]["s"]["WR"]["accuracy"] == 0.75
    finally:
        M.MIN_PAIRS = saved


def test_cory_bar_needs_three_of_four_and_identical_pair_sets():
    saved = M.MIN_PAIRS
    try:
        M.MIN_PAIRS = 1
        weeks = []
        # QB/RB/WR: ours right, both providers wrong. TE: ours wrong.
        for q in ("QB", "RB", "WR"):
            weeks.append({f"{q}a": _row(q, 20.0, ours=15.0, sl=5.0, fp=4.0),
                          f"{q}b": _row(q, 10.0, ours=9.0, sl=9.0, fp=9.0)})
        weeks.append({"TEa": _row("TE", 20.0, ours=5.0, sl=15.0, fp=15.0),
                      "TEb": _row("TE", 10.0, ours=9.0, sl=9.0, fp=9.0)})
        acc = M.pairwise_accuracy(weeks, ["ours", "sl", "fp"])
        bar = M.meets_cory_bar(acc, "ours", ["sl", "fp"])
        assert bar["positions_beating_both"] == 3 and bar["bar_met"]
        # flip one position's providers to right -> 2 of 4 -> bar fails
        weeks[0] = {"QBa": _row("QB", 20.0, ours=5.0, sl=15.0, fp=15.0),
                    "QBb": _row("QB", 10.0, ours=9.0, sl=9.0, fp=9.0)}
        acc = M.pairwise_accuracy(weeks, ["ours", "sl", "fp"])
        bar = M.meets_cory_bar(acc, "ours", ["sl", "fp"])
        assert bar["positions_beating_both"] == 2 and not bar["bar_met"]
    finally:
        M.MIN_PAIRS = saved


def test_under_min_pairs_is_unmeasurable_not_a_verdict():
    acc = M.pairwise_accuracy([week_basic()], ["good"])
    cell = acc["sources"]["good"]["WR"]
    assert cell["status"] == "unmeasurable" and cell["accuracy"] is None
    bar = M.meets_cory_bar(acc, "good", [])
    assert bar["per_position"]["WR"]["status"] == "unmeasurable"

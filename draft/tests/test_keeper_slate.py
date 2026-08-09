"""Keeper-slate rails — pure core.
Run: python -m pytest draft/tests/test_keeper_slate.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import keeper_slate as KS  # noqa: E402


def test_empty_is_not_none_and_no_placements_is_predicted():
    # Only Cory designated; 9 teams absent. Absent = UNKNOWN, not zero. No placements yet.
    s = KS.assess_slate(expected_teams=10, designations={"1": ["a", "b", "c"]}, placements=None)
    assert s["status"] == "predicted" and s["confirmed"] is False
    assert s["undesignated_teams"] == 9          # NOT treated as 9 teams keeping zero
    assert s["safe_to_treat_as_truth"] is False


def test_partial_placements_not_confirmed():
    s = KS.assess_slate(expected_teams=10,
                        designations={"1": ["a"], "2": ["b"]},
                        placements={"1": ["a"]})              # only 1 of 10 placed
    assert s["status"] == "partial" and not s["confirmed"]


def test_full_consistent_placement_is_confirmed():
    des = {str(i): [f"p{i}"] for i in range(1, 11)}
    s = KS.assess_slate(expected_teams=10, designations=des, placements=des)
    assert s["status"] == "confirmed" and s["confirmed"] and s["safe_to_treat_as_truth"]


def test_placement_mismatch_alarms_and_blocks_confirmed():
    des = {str(i): [f"p{i}"] for i in range(1, 11)}
    placed = dict(des); placed["3"] = ["DIFFERENT"]          # team 3 placed a different keeper
    s = KS.assess_slate(expected_teams=10, designations=des, placements=placed)
    assert s["status"] == "mismatch" and not s["confirmed"]
    assert s["mismatches"] and s["mismatches"][0]["team"] == "3"


def test_draft_week_alarm_escalates():
    pred = KS.assess_slate(10, {"1": ["a"]}, placements=None)
    assert KS.draft_week_alarm(pred, days_to_draft=2)[0] == "alarm"     # 2 days, still predicted
    assert KS.draft_week_alarm(pred, days_to_draft=6)[0] == "warn"
    conf = KS.assess_slate(10, {str(i): ["x"] for i in range(1, 11)},
                           placements={str(i): ["x"] for i in range(1, 11)})
    assert KS.draft_week_alarm(conf, days_to_draft=1)[0] == "ok"        # confirmed = safe even at T-1

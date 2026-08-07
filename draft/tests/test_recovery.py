"""The rebuilt weekly path, and the gate that decides whether to trust it.

A rebuilt stat line that quietly disagrees with the real one would corrupt every
grade downstream while looking entirely normal. So the rebuild is not trusted
until it has reproduced a season we CAN check it against.
"""
import sys, os
import pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from backtest import grade as GR
from backtest import projections as WF

pd = pytest.importorskip("pandas")

SCORING = {"rec": 0.5, "rec_yd": 0.1, "rec_td": 6, "rush_yd": 0.1, "rush_td": 6,
           "pass_yd": 0.04, "pass_td": 4, "pass_int": -2, "fum_lost": -2}
CW = {"g1": "s1", "g2": "s2"}


def pbp_rows():
    return pd.DataFrame([
        # A 20-yard completed TD catch by g1 from g2.
        {"season": 2024, "week": 1, "receiver_player_id": "g1", "complete_pass": 1,
         "receiving_yards": 20.0, "pass_touchdown": 1, "td_player_id": "g1",
         "passer_player_id": "g2", "passing_yards": 20.0, "rusher_player_id": None,
         "rushing_yards": None, "rush_touchdown": 0, "interception": 0, "fumble_lost": 0},
        # An incompletion to g1 — must NOT count as a reception.
        {"season": 2024, "week": 1, "receiver_player_id": "g1", "complete_pass": 0,
         "receiving_yards": None, "pass_touchdown": 0, "td_player_id": None,
         "passer_player_id": "g2", "passing_yards": None, "rusher_player_id": None,
         "rushing_yards": None, "rush_touchdown": 0, "interception": 0, "fumble_lost": 0},
        # A 9-yard rush by g1 in week 2.
        {"season": 2024, "week": 2, "receiver_player_id": None, "complete_pass": 0,
         "receiving_yards": None, "pass_touchdown": 0, "td_player_id": None,
         "passer_player_id": None, "passing_yards": None, "rusher_player_id": "g1",
         "rushing_yards": 9.0, "rush_touchdown": 0, "interception": 0, "fumble_lost": 0},
    ])


def test_an_incompletion_is_not_a_reception():
    rows = GR.weekly_from_pbp(pbp_rows(), [2024])
    wk1 = [r for r in rows if r["player_id"] == "g1" and r["week"] == 1][0]
    assert wk1["rec"] == 1, "two targets, one catch"
    assert wk1["rec_yd"] == 20.0
    assert wk1.get("rec_td") == 1


def test_player_weeks_are_separate_rows():
    rows = GR.weekly_from_pbp(pbp_rows(), [2024])
    g1 = sorted([r for r in rows if r["player_id"] == "g1"], key=lambda r: r["week"])
    assert [r["week"] for r in g1] == [1, 2]
    assert g1[1]["rush_yd"] == 9.0


def test_the_gate_refuses_a_rebuild_that_disagrees():
    """The whole point: disagreement must block recovery, not be averaged away."""
    official = pd.DataFrame([{"player_id": "g1", "season": 2024, "week": 1,
                              "rec": 9, "rec_yd": 900.0}])   # deliberately wrong
    v = GR.cross_validate(pbp_rows(), official, 2024, SCORING, CW)
    assert v["agrees"] is False
    assert v["worst_diff_top200"] > v["tolerance"]


def test_the_gate_accepts_a_faithful_rebuild():
    rebuilt = pd.DataFrame(GR.weekly_from_pbp(pbp_rows(), [2024]))
    v = GR.cross_validate(pbp_rows(), rebuilt, 2024, SCORING, CW)
    assert v["agrees"] is True
    assert v["worst_diff_top200"] == 0.0


def test_missing_players_are_reported_not_hidden():
    official = pd.DataFrame([{"player_id": "g1", "season": 2024, "week": 1, "rec": 1,
                              "rec_yd": 20.0, "rec_td": 1},
                             {"player_id": "gX", "season": 2024, "week": 1, "rec": 5,
                              "rec_yd": 60.0}])
    v = GR.cross_validate(pbp_rows(), official, 2024, {**SCORING}, {**CW, "gX": "sX"})
    assert v["official_only"] >= 1, "a player the rebuild missed must be counted"


# --- the overlap gate, asserted permanently --------------------------------
def test_the_overlap_gate_that_saved_run_2_is_still_armed():
    """SPEC: run 2 of the backtest joined 7 of ~200 players and the gate refused.

    That headline would have been undetectably meaningless downstream. The gate
    is asserted here so it cannot be loosened silently — and the Step 3 strategy
    table runs these same joins eight times over, once per variant, each needing
    the same protection rather than trusting the first run's success.
    """
    adp = {"p%d" % i: i + 1 for i in range(200)}
    barely_joined = {"p%d" % i: 100.0 - i for i in range(7)}
    v = WF.sanity_check(barely_joined, adp)
    assert v["passes"] is False, "7 of 200 joined must never pass"
    assert v["enough_players"] is False
    good = {"p%d" % i: 300.0 - i for i in range(200)}
    assert WF.sanity_check(good, adp)["passes"] is True

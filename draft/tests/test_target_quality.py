# TERRITORY: C
"""Target-quality / red-zone weekly store -- register: relay's 08-20
dispatch ASK 2. Real fixtures (James Conner, CeeDee Lamb, 2024) copied
verbatim from the live nflverse pbp release, checked by hand before writing
this file (rule 3f) -- including the NaN air_yards row that was a real bug
until this file pinned it.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import target_quality as TQ  # noqa: E402


CROSSWALK = {"00-0033553": "4137", "00-0036358": "6786"}  # Conner, Lamb


def test_is_inside_10_true_at_the_boundary():
    assert TQ.is_inside_10({"yardline_100": 10.0}) is True
    assert TQ.is_inside_10({"yardline_100": 11.0}) is False
    assert TQ.is_inside_10({"yardline_100": None}) is False


def test_is_end_zone_target_requires_air_yards_reaching_the_goal_line():
    row = {"play_type": "pass", "receiver_player_id": "x",
          "air_yards": 15.0, "yardline_100": 15.0}
    assert TQ.is_end_zone_target(row) is True  # exactly reaches the goal
    row["air_yards"] = 14.0
    assert TQ.is_end_zone_target(row) is False  # falls short


def test_is_end_zone_target_false_for_a_rush():
    assert TQ.is_end_zone_target({"play_type": "run", "rusher_player_id": "x",
                                  "air_yards": 5.0, "yardline_100": 3.0}) is False


# ── the real bug, pinned: a real NaN air_yards row must not poison the sum ──

def test_real_bug_a_nan_air_yards_row_does_not_poison_target_depth():
    # THE REAL ROW: CeeDee Lamb, 2024 week 3, yardline_100=2.0,
    # air_yards=nan (an incomplete/uncredited target). `x is not None` alone
    # passes NaN through -- caught before shipping, pinned here so it
    # cannot silently come back.
    rows = [
        {"play_type": "pass", "week": 3, "receiver_player_id": "00-0036358",
         "yardline_100": 2.0, "air_yards": float("nan")},
        {"play_type": "pass", "week": 3, "receiver_player_id": "00-0036358",
         "yardline_100": 27.0, "air_yards": 8.0},
    ]
    player_week, unmatched = TQ.build_player_week(rows, CROSSWALK)
    finalized = TQ.finalize_week(player_week)
    rec = finalized["6786"]
    assert not math.isnan(rec["target_depth"])
    assert rec["target_depth"] == 8.0          # only the real row counts
    assert rec["targets_seen"] == 1             # the NaN row is excluded
    assert rec["inside_10_targets"] == 1        # yardline_100=2.0 still counts
    assert rec["end_zone_targets"] == 0         # NaN air_yards can't qualify


def test_build_player_week_matches_the_real_conner_week1_fixture():
    # THE REAL ROW SET: James Conner, 2024 week 1, 17 real rush attempts,
    # exactly 3 with yardline_100 <= 10 (9.0, 3.0, 2.0).
    rows = [{"play_type": "run", "week": 1, "rusher_player_id": "00-0033553",
            "yardline_100": yl} for yl in
           (70.0, 36.0, 34.0, 32.0, 22.0, 9.0, 71.0, 14.0, 3.0, 70.0, 68.0,
            70.0, 38.0, 14.0, 12.0, 2.0, 32.0)]
    player_week, unmatched = TQ.build_player_week(rows, CROSSWALK)
    finalized = TQ.finalize_week(player_week)
    assert finalized["4137"]["inside_10_carries"] == 3
    assert unmatched == set()


def test_build_player_week_lists_an_unresolved_gsis_rather_than_dropping():
    rows = [{"play_type": "run", "week": 1, "rusher_player_id": "00-9999999",
            "yardline_100": 5.0}]
    player_week, unmatched = TQ.build_player_week(rows, CROSSWALK)
    assert player_week == {}
    assert unmatched == {"00-9999999"}


def test_a_receiver_with_no_red_zone_looks_still_gets_a_target_depth_row():
    rows = [{"play_type": "pass", "week": 1, "receiver_player_id": "00-0036358",
            "yardline_100": 60.0, "air_yards": 12.0}]
    player_week, _ = TQ.build_player_week(rows, CROSSWALK)
    finalized = TQ.finalize_week(player_week)
    assert finalized["6786"]["inside_10_targets"] == 0
    assert finalized["6786"]["target_depth"] == 12.0


def test_a_rusher_with_no_inside_10_carry_gets_no_row_at_all():
    # absent, not a fabricated zero -- the store only carries a rusher when
    # he has a real tracked event.
    rows = [{"play_type": "run", "week": 1, "rusher_player_id": "00-0033553",
            "yardline_100": 45.0}]
    player_week, _ = TQ.build_player_week(rows, CROSSWALK)
    assert player_week == {}


def test_build_season_groups_rows_by_week():
    rows = [
        {"play_type": "run", "week": 1, "rusher_player_id": "00-0033553", "yardline_100": 5.0},
        {"play_type": "run", "week": 2, "rusher_player_id": "00-0033553", "yardline_100": 8.0},
    ]
    doc = TQ.build_season(2024, rows, CROSSWALK)
    assert set(doc["weeks"]) == {"1", "2"}
    assert doc["weeks"]["1"]["4137"]["inside_10_carries"] == 1
    assert doc["weeks"]["2"]["4137"]["inside_10_carries"] == 1


def test_build_store_reports_total_player_weeks():
    per_season = {2024: TQ.build_season(2024, [
        {"play_type": "run", "week": 1, "rusher_player_id": "00-0033553", "yardline_100": 5.0},
    ], CROSSWALK)}
    doc = TQ.build_store(per_season)
    assert doc["population"]["total_player_weeks"] == 1
    assert doc["by_season"]["2024"]["1"]["4137"]["inside_10_carries"] == 1


# ── rule 3e control: real fixture, real fail arm ─────────────────────────

def test_verify_known_positive_matches_the_real_2024_lamb_and_conner_totals():
    conner_rows = [{"play_type": "run", "week": 1, "rusher_player_id": "00-0033553",
                   "yardline_100": yl} for yl in (9.0, 3.0, 2.0)]
    lamb_weeks = (3, 6, 8, 9, 10)
    lamb_rows = []
    for wk in lamb_weeks:
        # inside the 10 but a short target that does NOT reach the goal
        # line -- inside_10_targets only, not also an end-zone target
        lamb_rows.append({"play_type": "pass", "week": wk,
                          "receiver_player_id": "00-0036358",
                          "yardline_100": 8.0, "air_yards": 3.0})
    # 13 real end-zone targets across the season, independent of the 5
    # inside-10 ones above
    for wk in range(1, 14):
        lamb_rows.append({"play_type": "pass", "week": wk,
                          "receiver_player_id": "00-0036358",
                          "yardline_100": 30.0, "air_yards": 30.0})
    per_season = {2024: TQ.build_season(2024, conner_rows + lamb_rows, CROSSWALK)}
    doc = TQ.build_store(per_season)
    control = TQ.verify_known_positive(doc)
    assert control["ok"] is True
    assert control["conner_week1_inside_10_carries"] == 3
    assert control["lamb_season_inside_10_targets"] == 5
    assert control["lamb_season_end_zone_targets"] == 13


def test_verify_known_positive_is_a_real_fail_arm():
    doc = {"by_season": {"2024": {}}}  # nobody matched at all
    control = TQ.verify_known_positive(doc)
    assert control["ok"] is False
    assert control["conner_ok"] is False
    assert control["lamb_ok"] is False

# TERRITORY: C
"""Opponent-tendency store — pull-list №3 item 4, feeds E's P144. Pure logic
first on fixtures, then the real committed history + injury store, per this
session's own discipline (rule 3f: a control run once on real data before
trusting the pipeline's shape on fixtures alone)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import opponent_tendency as OT  # noqa: E402


def test_bench_points_left_sums_only_the_bench_list_given():
    row = {"players_points": {"a": 10.0, "b": 5.0, "c": 3.0}}
    assert OT.bench_points_left(row, ["b", "c"]) == 8.0
    assert OT.bench_points_left(row, []) == 0.0


def test_bench_points_left_treats_a_missing_points_entry_as_zero_not_a_crash():
    row = {"players_points": {"a": 10.0}}
    assert OT.bench_points_left(row, ["a", "ghost"]) == 10.0


def test_injury_reaction_counts_flagged_and_started_correctly():
    row = {"players": ["a", "b", "c"], "starters": ["a", "c"]}
    inj_week = {"a": "Q", "b": "O"}
    r = OT.injury_reaction(row, inj_week)
    assert r["flagged"] == 2 and r["started"] == 1
    assert r["rate"] == 0.5
    assert set(r["flagged_ids"]) == {"a", "b"}
    assert r["started_ids"] == ["a"]


def test_injury_reaction_rate_is_none_not_zero_when_nothing_flagged():
    row = {"players": ["a", "b"], "starters": ["a"]}
    r = OT.injury_reaction(row, {})
    assert r["flagged"] == 0
    assert r["rate"] is None


def test_per_owner_summary_pools_across_seasons_and_weeks():
    by_season = {
        "2024": {"1": {"5": {"bench_points_left": 10.0,
                             "injury_reaction": {"flagged": 2, "started": 1}}}},
        "2025": {"1": {"5": {"bench_points_left": 20.0,
                             "injury_reaction": {"flagged": 0, "started": 0}}}},
    }
    summary = OT.per_owner_summary(by_season)
    o = summary["5"]
    assert o["weeks_seen"] == 2
    assert o["bench_points_left_per_week"] == 15.0
    assert o["flagged_player_weeks"] == 2
    assert o["injury_start_rate"] == 0.5  # 1 started / 2 flagged, pooled


def test_per_owner_summary_gives_none_start_rate_for_an_owner_never_flagged():
    by_season = {"2024": {"1": {"9": {"bench_points_left": 5.0,
                                      "injury_reaction": {"flagged": 0, "started": 0}}}}}
    summary = OT.per_owner_summary(by_season)
    assert summary["9"]["injury_start_rate"] is None


def test_verify_known_positive_fails_on_a_fixture_with_no_matching_rows():
    fake = {"2025": {"1": {"4": {"injury_reaction": {"flagged_ids": [], "started_ids": []}},
                           "7": {"injury_reaction": {"flagged_ids": [], "started_ids": []}}}}}
    control = OT.verify_known_positive(fake)
    assert control["ok"] is False


# ── real end-to-end, against the actual committed history + injury store ───

def test_build_store_against_the_real_committed_data():
    doc = OT.build_store()
    assert doc["rule_3e_control"]["ok"] is True
    assert len(doc["per_owner_summary"]) == 10  # this league's real owner count
    for rid, o in doc["per_owner_summary"].items():
        assert o["weeks_seen"] == 54  # 3 seasons x 18 weeks, every owner plays every week
        assert o["bench_points_left_per_week"] is not None
        assert o["bench_points_left_per_week"] >= 0
    assert "UNMEASURABLE" in doc["lineup_timing"]


def test_build_store_bench_points_are_never_negative_across_the_real_population():
    doc = OT.build_store()
    for season, weeks in doc["by_season"].items():
        for wk, rosters in weeks.items():
            for rid, cell in rosters.items():
                assert cell["bench_points_left"] >= 0, \
                    f"{season} wk{wk} roster{rid} negative bench points"

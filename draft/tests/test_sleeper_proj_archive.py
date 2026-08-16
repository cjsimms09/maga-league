# TERRITORY: A
"""Tests for the Sleeper preseason projection archive.

The archive exists because the source is DECAYING: hollow rate (rows present,
stat lines emptied) measured 0.0% for 2026, 7.1% 2025, 17.2% 2024, 25.4%
2023 — monotone in age. Sleeper does not delete old seasons, it empties them,
so a row count stays healthy while the content bleeds out. These tests pin the
two things that would make the archive worthless: mistaking a hollow row for a
zero projection, and losing the scoring context.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import sleeper_proj_archive as SPA  # noqa: E402

SCORING = {"pass_yd": 0.04, "pass_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
           "rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0}


def test_hollow_rows_are_dropped_not_scored_as_zero():
    # A player whose stat line has been emptied is UNKNOWN, not a projection
    # of zero points. Scoring him 0.0 would invent a confident bad forecast
    # and quietly poison any backtest built on the archive.
    proj = {"1": {"rush_yd": 1000, "rush_td": 8},
            "2": {},          # hollowed
            "3": None}        # hollowed differently
    doc = SPA.build_archive(2023, proj, SCORING)
    assert set(doc["projections"]) == {"1"}
    assert set(doc["scored_points"]) == {"1"}
    assert "2" not in doc["scored_points"] and "3" not in doc["scored_points"]


def test_decay_is_measured_at_capture_time():
    # The archive must record the source's state WHEN CAPTURED, so a later
    # run's worse rate quantifies exactly what was lost in between.
    proj = {str(i): ({"rush_yd": 10} if i < 3 else {}) for i in range(4)}
    d = SPA.build_archive(2024, proj, SCORING)["decay"]
    assert d["rows"] == 4
    assert d["rows_with_stat_line"] == 3
    assert d["hollow_rows"] == 1
    assert d["hollow_rate"] == 0.25


def test_scores_under_the_frozen_table():
    proj = {"1": {"rush_yd": 1000, "rush_td": 10, "rec": 40}}
    doc = SPA.build_archive(2023, proj, SCORING)
    # 1000*0.1 + 10*6 + 40*0.5 = 100 + 60 + 20
    assert doc["scored_points"]["1"] == pytest.approx(180.0)


def test_keeps_the_raw_line_as_well_as_the_score():
    # Storing only the score makes the archive unreadable if scoring changes;
    # storing only the raw line makes every future reader re-derive the
    # conversion and risk deriving it differently.
    proj = {"1": {"rush_yd": 500, "rush_td": 4}}
    doc = SPA.build_archive(2023, proj, SCORING)
    assert doc["projections"]["1"] == {"rush_yd": 500, "rush_td": 4}
    assert doc["scored_points"]["1"] > 0
    assert doc["scoring_table_fingerprint"]


def test_unknown_stats_do_not_crash_or_silently_score():
    proj = {"1": {"rush_yd": 100, "some_new_stat": 99, "bad": "x"}}
    doc = SPA.build_archive(2023, proj, SCORING)
    assert doc["scored_points"]["1"] == pytest.approx(10.0)


def test_a_refused_season_is_still_archivable():
    # 2023/2024 were REFUSED as ungradeable by the leak gates. Refusal was
    # about grading leak-free, not about the bytes being worthless — a later
    # pass with better provenance tooling can only use them if they exist.
    doc = SPA.build_archive(2023, {"1": {"rush_yd": 900}}, SCORING)
    assert doc["season"] == 2023
    assert doc["projections"]
    assert "refus" in doc["_note"].lower()

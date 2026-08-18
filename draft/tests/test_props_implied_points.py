# TERRITORY: C
"""props_implied_points — build_season_doc tested against SYNTHETIC fixtures
shaped exactly like the committed historical_props_{year}.json stores
(week -> players -> {name: {stat: line}}). The name-match/aggregation
functions it calls are props_season_projection.py's own (rule 11, imported
unmodified) and are already covered by that file's own test suite — this
file only tests the NEW glue: match-rate computation and the per-season
artifact shape.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))

import props_implied_points as PIP  # noqa: E402

SCORING = {"pass_yd": 0.04, "pass_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
          "rec_yd": 0.1, "rec": 0.5}

NAME_IDX = {"puka nacua": "sid1", "amonra st brown": "sid2"}

WEEKS = [
    {"week": 1, "players": {
        "Puka Nacua": {"rec": 6.5, "rec_yd": 78.5},
        "Amon-Ra St. Brown": {"rec": 7.0, "rec_yd": 82.5},
        "Some Unmatchable Name": {"rec": 3.0, "rec_yd": 30.0},
    }},
    {"week": 2, "players": {
        "Puka Nacua": {"rec": 6.0, "rec_yd": 70.0},
        "Some Unmatchable Name": {"rec": 4.0, "rec_yd": 35.0},
    }},
]


def test_build_season_doc_shape():
    doc = PIP.build_season_doc(2024, WEEKS, NAME_IDX, SCORING)
    assert doc["season"] == 2024
    assert doc["scope"] == "full_season"
    assert doc["source_store"] == "historical_props_2024.json"


def test_implied_points_only_matched_players():
    doc = PIP.build_season_doc(2024, WEEKS, NAME_IDX, SCORING)
    assert set(doc["implied_points"]) == {"sid1", "sid2"}


def test_implied_points_sum_across_weeks():
    doc = PIP.build_season_doc(2024, WEEKS, NAME_IDX, SCORING)
    want_sid1 = (6.5 * 0.5 + 78.5 * 0.1) + (6.0 * 0.5 + 70.0 * 0.1)
    assert doc["implied_points"]["sid1"] == pytest.approx(round(want_sid1, 2))


def test_games_with_props_row_counts_weeks_present():
    doc = PIP.build_season_doc(2024, WEEKS, NAME_IDX, SCORING)
    assert doc["games_with_props_row"]["sid1"] == 2  # both weeks
    assert doc["games_with_props_row"]["sid2"] == 1  # week 1 only


def test_unmatched_names_listed_not_dropped_silently():
    doc = PIP.build_season_doc(2024, WEEKS, NAME_IDX, SCORING)
    assert doc["unmatched_names"] == ["Some Unmatchable Name"]
    assert doc["unmatched_count"] == 1


def test_match_rate_unique_names():
    doc = PIP.build_season_doc(2024, WEEKS, NAME_IDX, SCORING)
    mr = doc["match_rate"]["unique_names"]
    # 3 unique names total (Puka, Amon-Ra, unmatchable); 2 matched
    assert mr["total"] == 3
    assert mr["matched"] == 2
    assert mr["rate"] == pytest.approx(2 / 3, abs=1e-4)


def test_match_rate_player_week_rows():
    doc = PIP.build_season_doc(2024, WEEKS, NAME_IDX, SCORING)
    mr = doc["match_rate"]["player_week_rows"]
    # week1: 3 rows, week2: 2 rows -> 5 total; matched: week1 has 2
    # matched (Puka+Amon-Ra), week2 has 1 matched (Puka) -> 3 matched
    assert mr["total"] == 5
    assert mr["matched"] == 3
    assert mr["rate"] == pytest.approx(3 / 5, abs=1e-4)


def test_empty_weeks_no_division_by_zero():
    doc = PIP.build_season_doc(2024, [], NAME_IDX, SCORING)
    assert doc["match_rate"]["unique_names"]["rate"] is None
    assert doc["match_rate"]["player_week_rows"]["rate"] is None
    assert doc["implied_points"] == {}


def test_all_names_matched_zero_unmatched():
    weeks = [{"week": 1, "players": {
        "Puka Nacua": {"rec": 6.0, "rec_yd": 70.0},
        "Amon-Ra St. Brown": {"rec": 7.0, "rec_yd": 80.0},
    }}]
    doc = PIP.build_season_doc(2024, weeks, NAME_IDX, SCORING)
    assert doc["unmatched_count"] == 0
    assert doc["match_rate"]["unique_names"]["rate"] == 1.0
    assert doc["match_rate"]["player_week_rows"]["rate"] == 1.0


def test_reuses_props_season_projection_functions_not_reimplemented():
    # rule 11 pin -- these must be the SAME function objects, not copies
    import props_season_projection as PSP
    assert PIP.crosswalk_props_to_pid is PSP.crosswalk_props_to_pid
    assert PIP.season_implied_totals is PSP.season_implied_totals
    assert PIP.build_name_index is PSP.build_name_index

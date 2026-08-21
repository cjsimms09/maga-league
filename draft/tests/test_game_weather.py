# TERRITORY: C
"""Game weather — source-hunt item 1. Reachability from this sandbox is
unconfirmed (both open-meteo and NWS proxy-403 here); these tests cover the
pure logic against realistic fixtures matching open-meteo's DOCUMENTED
response shape. The real fetch's actual shape is confirmed by the first CI
dispatch, not by this file — see the module docstring.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import game_weather as GW  # noqa: E402


def test_is_weather_relevant_true_for_a_real_outdoor_stadium():
    assert GW.is_weather_relevant("BUF") is True
    assert GW.is_weather_relevant("GB") is True


def test_is_weather_relevant_false_for_dome_and_retractable():
    assert GW.is_weather_relevant("NO") is False   # dome
    assert GW.is_weather_relevant("DAL") is False  # retractable


def test_is_weather_relevant_false_for_ambiguous_roof_not_guessed_either_way():
    assert GW.is_weather_relevant("SEA") is False
    assert GW.is_weather_relevant("JAX") is False


def test_is_weather_relevant_false_for_an_unknown_team_code():
    assert GW.is_weather_relevant("XYZ") is False


def test_kickoff_hour_iso_truncates_to_the_top_of_the_hour():
    assert GW.kickoff_hour_iso("2024-11-17T18:35:00.000Z") == "2024-11-17T18:00"


def test_parse_hourly_response_extracts_the_matching_hour():
    doc = {"hourly": {
        "time": ["2024-11-17T17:00", "2024-11-17T18:00", "2024-11-17T19:00"],
        "temperature_2m": [28.0, 27.0, 26.0],
        "wind_speed_10m": [12.0, 18.0, 20.0],
        "precipitation": [0.0, 0.4, 0.6],
    }}
    out = GW.parse_hourly_response(doc, "2024-11-17T18:00")
    assert out == {"temp_f": 27.0, "wind_mph": 18.0, "precip_in": 0.4}


def test_parse_hourly_response_returns_none_when_hour_not_present():
    doc = {"hourly": {"time": ["2024-11-17T17:00"], "temperature_2m": [28.0],
                      "wind_speed_10m": [12.0], "precipitation": [0.0]}}
    assert GW.parse_hourly_response(doc, "2024-11-17T18:00") is None


def test_parse_hourly_response_returns_none_on_a_malformed_shape():
    assert GW.parse_hourly_response({"unexpected": "shape"}, "2024-11-17T18:00") is None
    assert GW.parse_hourly_response({}, "2024-11-17T18:00") is None
    assert GW.parse_hourly_response(None, "2024-11-17T18:00") is None


def test_build_store_includes_only_outdoor_games_with_real_weather():
    rows = [
        {"game_id": 1, "season": 2024, "week": 11, "home": "BUF", "away": "KC",
         "date": "2024-11-17T18:00:00.000Z"},
        {"game_id": 2, "season": 2024, "week": 11, "home": "NO", "away": "WAS",
         "date": "2024-11-17T18:00:00.000Z"},   # dome, must be skipped
        {"game_id": 3, "season": 2024, "week": 11, "home": "SEA", "away": "SF",
         "date": "2024-11-17T18:00:00.000Z"},   # ambiguous, must be skipped
        {"game_id": 4, "season": 2024, "week": 11, "home": "GB", "away": "CHI",
         "date": "2024-11-17T18:00:00.000Z"},   # outdoor but no fetched data
    ]
    weather_by_game = {1: {"temp_f": 27.0, "wind_mph": 18.0, "precip_in": 0.4}, 4: None}
    doc = GW.build_store(rows, weather_by_game)
    assert set(doc["games"].keys()) == {"1"}
    assert doc["games"]["1"]["precip_in"] == 0.4
    assert doc["population"]["skipped_indoor"] == 1
    assert doc["population"]["skipped_ambiguous_roof"] == 1
    assert doc["population"]["skipped_no_data"] == 1


def test_verify_known_positive_passes_on_a_real_snow_game_fixture():
    rows = [{"game_id": 1, "home": "BUF", "date": "2024-11-17T18:00:00.000Z"}]
    doc = {"games": {"1": {"precip_in": 0.4}}}
    control = GW.verify_known_positive(doc, rows)
    assert control["ok"] is True


def test_verify_known_positive_fails_on_a_zero_precip_reading():
    rows = [{"game_id": 1, "home": "BUF", "date": "2024-11-17T18:00:00.000Z"}]
    doc = {"games": {"1": {"precip_in": 0.0}}}
    control = GW.verify_known_positive(doc, rows)
    assert control["ok"] is False


def test_verify_known_positive_fails_when_the_game_is_not_in_the_schedule():
    control = GW.verify_known_positive({"games": {}}, [])
    assert control["ok"] is False


def test_every_stadium_info_entry_has_a_recognized_roof_value():
    for team, info in GW.STADIUM_INFO.items():
        assert info["roof"] in ("outdoor", "dome", "retractable", "ambiguous"), team


def test_stadium_info_covers_all_32_teams():
    # LAR/LAC share SoFi, NYG/NYJ share MetLife -- still 32 distinct codes
    assert len(GW.STADIUM_INFO) == 32

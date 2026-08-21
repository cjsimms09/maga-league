# TERRITORY: C
"""Game weather — source-hunt item 1, REBUILT after Cory's direct catch:
"make sure we're getting weather for every game and from the right stadium
where game is being played (home team)." The old design keyed weather off
a home team's USUAL stadium, which is wrong for any neutral-site game —
verified against nflverse's real schedule that 8 of 272 games in 2026 alone
are neutral-site internationals. This module now reads the real per-game
`stadium`/`roof`/`location` nflverse reports, never a home-team guess.
Fixtures below match nflverse's real games.csv column shapes, verified by
hand before writing this file (rule 3f).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import game_weather as GW  # noqa: E402


def test_is_weather_relevant_true_for_outdoors_and_open():
    assert GW.is_weather_relevant("outdoors") is True
    assert GW.is_weather_relevant("open") is True


def test_is_weather_relevant_false_for_dome_closed_and_missing():
    assert GW.is_weather_relevant("dome") is False
    assert GW.is_weather_relevant("closed") is False
    assert GW.is_weather_relevant(None) is False
    import math
    assert GW.is_weather_relevant(float("nan")) is False


def test_stadium_coords_keyed_by_real_stadium_name_not_team():
    # BUF's real stadium name, not a team code lookup
    assert GW.stadium_coords("Highmark Stadium") is not None
    assert GW.stadium_coords("NotARealStadium") is None


def test_kickoff_hour_iso_combines_gameday_and_local_gametime():
    assert GW.kickoff_hour_iso("2024-11-17", "13:00") == "2024-11-17T13:00"


def test_kickoff_hour_iso_returns_none_on_missing_pieces():
    assert GW.kickoff_hour_iso("2024-11-17", None) is None
    assert GW.kickoff_hour_iso("", "13:00") is None
    import math
    assert GW.kickoff_hour_iso("2024-11-17", float("nan")) is None


def test_parse_precip_extracts_the_matching_hour():
    doc = {"hourly": {"time": ["2022-12-24T12:00", "2022-12-24T13:00"],
                      "precipitation": [0.0, 0.3]}}
    assert GW.parse_precip(doc, "2022-12-24T13:00") == 0.3


def test_parse_precip_returns_none_on_malformed_shape():
    assert GW.parse_precip({}, "2022-12-24T13:00") is None
    assert GW.parse_precip(None, "2022-12-24T13:00") is None
    assert GW.parse_precip({"hourly": "not a dict"}, "2022-12-24T13:00") is None


# ── the exact bug Cory caught: neutral-site games must use the REAL venue ──

def test_build_store_uses_the_real_neutral_site_stadium_not_the_home_teams():
    rows = [
        # a real 2026 neutral-site game: JAX is "home" but the game is in
        # London -- must resolve to Wembley, never JAX's usual venue.
        {"game_id": 1, "season": 2026, "week": 6, "home_team": "JAX",
         "away_team": "HOU", "location": "Neutral", "roof": "outdoors",
         "stadium": "Wembley Stadium", "gameday": "2026-10-18",
         "gametime": "13:30", "temp": None, "wind": None},
    ]
    doc = GW.build_store(rows, {1: 0.0})
    entry = doc["games"]["1"]
    assert entry["stadium"] == "Wembley Stadium"
    assert entry["home"] == "JAX"
    assert entry["location"] == "Neutral"


def test_build_store_excludes_dome_and_closed_games():
    rows = [
        {"game_id": 1, "season": 2024, "week": 1, "home_team": "NO",
         "away_team": "WAS", "location": "Home", "roof": "dome",
         "stadium": "Caesars Superdome", "gameday": "2024-09-08",
         "gametime": "13:00", "temp": 72.0, "wind": 0.0},
        {"game_id": 2, "season": 2024, "week": 2, "home_team": "HOU",
         "away_team": "CHI", "location": "Home", "roof": "closed",
         "stadium": "NRG Stadium", "gameday": "2024-09-15",
         "gametime": "13:00", "temp": 74.0, "wind": 0.0},
    ]
    doc = GW.build_store(rows, {})
    assert doc["games"] == {}
    assert doc["population"]["skipped_not_weather_relevant"] == 2


def test_build_store_includes_a_real_outdoor_game_with_nflverse_temp_wind():
    rows = [
        {"game_id": 1, "season": 2022, "week": 16, "home_team": "CLE",
         "away_team": "NO", "location": "Home", "roof": "outdoors",
         "stadium": "FirstEnergy Stadium", "gameday": "2022-12-24",
         "gametime": "13:00", "temp": 6.0, "wind": 27.0},
    ]
    doc = GW.build_store(rows, {1: 0.1})
    entry = doc["games"]["1"]
    assert entry["temp_f"] == 6.0
    assert entry["wind_mph"] == 27.0
    assert entry["precip_in"] == 0.1


def test_build_store_reports_missing_coords_rather_than_silently_dropping():
    rows = [
        {"game_id": 1, "season": 2024, "week": 1, "home_team": "XX",
         "away_team": "YY", "location": "Home", "roof": "outdoors",
         "stadium": "A Stadium Not In The Table", "gameday": "2024-09-08",
         "gametime": "13:00", "temp": 70.0, "wind": 5.0},
    ]
    doc = GW.build_store(rows, {})
    assert doc["games"] == {}
    assert doc["population"]["skipped_no_stadium_coords"] == 1


def test_verify_neutral_site_handling_passes_on_real_2026_schedule_shape():
    rows = [{"home_team": "JAX", "week": 6, "season": 2026,
            "location": "Neutral", "stadium": "Wembley Stadium"}]
    control = GW.verify_neutral_site_handling(rows)
    assert control["ok"] is True


def test_verify_neutral_site_handling_fails_if_it_resolved_to_the_home_venue():
    # the exact bug: if a broken pipeline read JAX's usual stadium instead
    rows = [{"home_team": "JAX", "week": 6, "season": 2026,
            "location": "Home", "stadium": "EverBank Stadium"}]
    control = GW.verify_neutral_site_handling(rows)
    assert control["ok"] is False


def test_verify_known_positive_passes_on_the_real_cle_fixture():
    rows = [{"game_id": 1, "home_team": "CLE", "gameday": "2022-12-24"}]
    doc = {"games": {"1": {"temp_f": 6.0, "wind_mph": 27.0}}}
    control = GW.verify_known_positive(doc, rows)
    assert control["ok"] is True


def test_verify_known_positive_fails_on_mild_weather():
    rows = [{"game_id": 1, "home_team": "CLE", "gameday": "2022-12-24"}]
    doc = {"games": {"1": {"temp_f": 65.0, "wind_mph": 5.0}}}
    control = GW.verify_known_positive(doc, rows)
    assert control["ok"] is False


def test_every_weather_relevant_stadium_in_recent_real_history_has_coords():
    # real end-to-end against live nflverse data -- this is the test that
    # would have caught the FC Bayern Munich Stadium naming gap.
    rows = GW._fetch_games()
    relevant = [r for r in rows if GW.is_weather_relevant(r["roof"])]
    missing = sorted(set(r["stadium"] for r in relevant
                         if GW.stadium_coords(r["stadium"]) is None))
    assert missing == [], f"stadiums with no coords entry: {missing}"


def test_run_aborts_after_max_consecutive_failures_instead_of_grinding_through_every_game(monkeypatch):
    # THE REAL INCIDENT this pins: a 2026-08-21 dispatch (run 32507488659)
    # ran past 30+ minutes with no sign of finishing and had to be
    # cancelled by hand -- nothing told the run "the host looks dead,
    # stop" before it ground through hundreds of 30s-timeout calls.
    outdoor_row = {"game_id": "OUT", "season": 2024, "game_type": "REG",
                   "week": 1, "gameday": "2024-09-08", "gametime": "13:00",
                   "away_team": "X", "home_team": "Y", "location": "Home",
                   "roof": "outdoors", "temp": None, "wind": None,
                   "stadium": "Lambeau Field", "stadium_id": "1"}
    fake_rows = [dict(outdoor_row, game_id=f"G{i}") for i in range(50)]

    monkeypatch.setattr(GW, "_fetch_games", lambda: fake_rows)

    calls = []
    def always_fails(*a, **kw):
        calls.append(1)
        raise TimeoutError("simulated: host unreachable from this runner")
    monkeypatch.setattr(GW, "_fetch_precip", always_fails)

    import pytest
    with pytest.raises(RuntimeError, match="consecutive precip fetches failed"):
        GW.run()

    # aborted at the floor, not after all 50 rows
    assert len(calls) == GW.MAX_CONSECUTIVE_FAILURES


def test_run_resets_the_failure_streak_on_any_success(monkeypatch):
    outdoor_row = {"game_id": "OUT", "season": 2024, "game_type": "REG",
                   "week": 1, "gameday": "2024-09-08", "gametime": "13:00",
                   "away_team": "X", "home_team": "Y", "location": "Home",
                   "roof": "outdoors", "temp": None, "wind": None,
                   "stadium": "Lambeau Field", "stadium_id": "1"}
    fake_rows = [dict(outdoor_row, game_id=f"G{i}") for i in range(30)]
    monkeypatch.setattr(GW, "_fetch_games", lambda: fake_rows)

    calls = []
    def mostly_fails_but_not_consecutively(lat, lon, date, base_url):
        calls.append(1)
        # every 5th call succeeds -- streak never reaches the floor
        if len(calls) % 5 == 0:
            return {"hourly": {"time": [], "precipitation": []}}
        raise TimeoutError("simulated intermittent failure")
    monkeypatch.setattr(GW, "_fetch_precip", mostly_fails_but_not_consecutively)

    doc = GW.run()  # must NOT raise -- the streak keeps resetting
    assert len(calls) == 30


def test_run_against_the_real_committed_schedule_finds_the_real_2026_neutral_games():
    rows = GW._fetch_games()
    neutral_2026 = [r for r in rows if r["season"] == 2026 and r["location"] == "Neutral"]
    assert len(neutral_2026) == 8  # verified against the real schedule by hand
    doc = GW.build_store(rows, {})
    neutral_control = GW.verify_neutral_site_handling(rows)
    assert neutral_control["ok"] is True
    weather_control = GW.verify_known_positive(doc, rows)
    assert weather_control["ok"] is True

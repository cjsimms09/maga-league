# TERRITORY: A
"""fetch_historical_props — pure parsing, matching, planning and budget
arithmetic, tested against fixtures shaped exactly like the CONFIRMED real
API response (key-probe.yml run 31967817943, quoted in the module
docstring and the audit doc). No network call is made by any test here —
every I/O function (_download, _get_json, fetch_season_schedule,
fetch_week_events, fetch_event_props, fetch_season) is glue exercised only
by the workflow, same discipline as fetch_component_stats.py's untested
_crosswalk/fetch_season.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import fetch_historical_props as FHP  # noqa: E402


# ── parse_historical_events — the confirmed events-list shape ─────────────

EVENTS_DOC = {
    "timestamp": "2024-09-08T17:00:00Z",
    "previous_timestamp": "2024-09-08T16:00:00Z",
    "next_timestamp": "2024-09-08T18:00:00Z",
    "data": [
        {"id": "7a5e353202d40a844491fa5753bc3097",
         "sport_key": "americanfootball_nfl", "sport_title": "NFL",
         "commence_time": "2024-09-08T17:00:00Z",
         "home_team": "Kansas City Chiefs", "away_team": "Baltimore Ravens"},
        {"id": "zzz999", "sport_key": "americanfootball_nfl",
         "commence_time": "2024-09-08T20:25:00Z",
         "home_team": "Dallas Cowboys", "away_team": "New York Giants"},
    ],
}


def test_parse_historical_events_shape_and_sort():
    got = FHP.parse_historical_events(EVENTS_DOC)
    assert [e["id"] for e in got] == ["7a5e353202d40a844491fa5753bc3097", "zzz999"]
    assert got[0]["home_team"] == "Kansas City Chiefs"
    assert got[0]["away_team"] == "Baltimore Ravens"


def test_parse_historical_events_tolerates_bare_list():
    assert FHP.parse_historical_events(EVENTS_DOC["data"]) == \
        FHP.parse_historical_events(EVENTS_DOC)


def test_parse_historical_events_empty_data():
    assert FHP.parse_historical_events({"data": []}) == []
    assert FHP.parse_historical_events({}) == []


def test_parse_historical_events_drops_rows_with_no_id():
    doc = {"data": [{"home_team": "X", "away_team": "Y"}]}
    assert FHP.parse_historical_events(doc) == []


# ── match_event_to_game — abbreviation -> full-name join ──────────────────

def test_match_event_to_game_exact_hit():
    events = FHP.parse_historical_events(EVENTS_DOC)
    eid = FHP.match_event_to_game(events, "KC", "BAL")
    assert eid == "7a5e353202d40a844491fa5753bc3097"


def test_match_event_to_game_no_hit_returns_none_not_a_guess():
    events = FHP.parse_historical_events(EVENTS_DOC)
    assert FHP.match_event_to_game(events, "SEA", "SF") is None


def test_match_event_to_game_unknown_abbreviation_returns_none():
    events = FHP.parse_historical_events(EVENTS_DOC)
    assert FHP.match_event_to_game(events, "ZZ", "BAL") is None


def test_match_event_to_game_ambiguous_returns_none():
    dupe = FHP.parse_historical_events(EVENTS_DOC) + \
        FHP.parse_historical_events(EVENTS_DOC)[:1]
    assert FHP.match_event_to_game(dupe, "KC", "BAL") is None


def test_team_full_name_covers_all_32_plus_relocation_aliases():
    # every abbreviation actually used by the nflverse schedule dataset must
    # resolve — including historical relocation aliases (OAK/SD/STL/LA).
    current = {"ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL",
               "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR",
               "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT",
               "SEA", "SF", "TB", "TEN", "WAS"}
    assert current <= set(FHP.TEAM_FULL_NAME)
    for alias in ("OAK", "SD", "STL", "LA"):
        assert alias in FHP.TEAM_FULL_NAME


# ── parse_event_props — the confirmed event-odds shape ────────────────────

def _event_odds_doc(bookmakers):
    return {"timestamp": "2024-09-08T17:00:00Z",
            "data": {"id": "7a5e...", "home_team": "Kansas City Chiefs",
                     "away_team": "Baltimore Ravens", "bookmakers": bookmakers}}


def test_parse_event_props_single_book_single_market():
    doc = _event_odds_doc([
        {"key": "draftkings", "title": "DraftKings", "markets": [
            {"key": "player_pass_yds", "outcomes": [
                {"name": "Over", "description": "Patrick Mahomes",
                 "price": -115, "point": 275.5},
                {"name": "Under", "description": "Patrick Mahomes",
                 "price": -105, "point": 275.5}]}]}])
    got = FHP.parse_event_props(doc)
    assert got == {"Patrick Mahomes": {"pass_yd": 275.5}}


def test_parse_event_props_median_across_books():
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [{"key": "player_pass_yds",
            "outcomes": [{"name": "Over", "description": "Lamar Jackson",
                          "price": -110, "point": 220.5}]}]},
        {"key": "fanduel", "markets": [{"key": "player_pass_yds",
            "outcomes": [{"name": "Over", "description": "Lamar Jackson",
                          "price": -110, "point": 230.5}]}]},
        {"key": "betmgm", "markets": [{"key": "player_pass_yds",
            "outcomes": [{"name": "Over", "description": "Lamar Jackson",
                          "price": -110, "point": 226.5}]}]},
    ])
    got = FHP.parse_event_props(doc)
    assert got == {"Lamar Jackson": {"pass_yd": 226.5}}  # median of 3


def test_parse_event_props_multiple_markets_and_players():
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [
            {"key": "player_pass_yds", "outcomes": [
                {"name": "Over", "description": "Patrick Mahomes", "point": 260.5}]},
            {"key": "player_rush_yds", "outcomes": [
                {"name": "Over", "description": "Isiah Pacheco", "point": 65.5}]},
        ]}])
    got = FHP.parse_event_props(doc)
    assert got == {"Patrick Mahomes": {"pass_yd": 260.5},
                   "Isiah Pacheco": {"rush_yd": 65.5}}


def test_parse_event_props_ignores_markets_outside_requested_set():
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [
            {"key": "player_anytime_td", "outcomes": [
                {"name": "Yes", "description": "Travis Kelce", "price": 150}]},
            {"key": "player_pass_yds", "outcomes": [
                {"name": "Over", "description": "Patrick Mahomes", "point": 260.5}]},
        ]}])
    got = FHP.parse_event_props(doc)
    assert "Travis Kelce" not in got
    assert got == {"Patrick Mahomes": {"pass_yd": 260.5}}


def test_parse_event_props_missing_point_or_name_is_skipped_not_zeroed():
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [{"key": "player_pass_yds", "outcomes": [
            {"name": "Over", "description": None, "point": 260.5},
            {"name": "Over", "description": "Patrick Mahomes", "point": None},
        ]}]}])
    assert FHP.parse_event_props(doc) == {}


def test_parse_event_props_empty_bookmakers():
    assert FHP.parse_event_props(_event_odds_doc([])) == {}
    assert FHP.parse_event_props({"data": {}}) == {}


# ── merge_event_props ──────────────────────────────────────────────────────

def test_merge_event_props_unions_and_counts_collisions():
    e1 = {"Patrick Mahomes": {"pass_yd": 260.5}}
    e2 = {"Isiah Pacheco": {"rush_yd": 65.5}}
    e3 = {"Patrick Mahomes": {"pass_yd": 999.0}}   # collision, first wins
    got = FHP.merge_event_props([e1, e2, e3])
    assert got["players"] == {"Patrick Mahomes": {"pass_yd": 260.5},
                              "Isiah Pacheco": {"rush_yd": 65.5}}
    assert got["collisions"] == 1


# ── build_snapshot_plan ────────────────────────────────────────────────────

GAMES_FIX = [
    {"week": 1, "home": "KC", "away": "BAL", "commence_time": "2024-09-05T00:20:00Z"},
    {"week": 1, "home": "DAL", "away": "CLE", "commence_time": "2024-09-08T17:00:00Z"},
    {"week": 2, "home": "SF", "away": "MIN", "commence_time": "2024-09-09T00:15:00Z"},
]


def test_snapshot_plan_sample_week1_filters_and_sorts():
    plan = FHP.build_snapshot_plan(GAMES_FIX, "sample_week1")
    assert [(g["home"], g["away"]) for g in plan] == [("DAL", "CLE"), ("KC", "BAL")]


def test_snapshot_plan_full_season_keeps_everything():
    plan = FHP.build_snapshot_plan(GAMES_FIX, "full_season")
    assert len(plan) == 3


def test_snapshot_plan_single_week_requires_week_arg():
    with pytest.raises(ValueError):
        FHP.build_snapshot_plan(GAMES_FIX, "single_week")
    plan = FHP.build_snapshot_plan(GAMES_FIX, "single_week", week=2)
    assert len(plan) == 1 and plan[0]["home"] == "SF"


def test_snapshot_plan_unknown_scope_raises():
    with pytest.raises(ValueError):
        FHP.build_snapshot_plan(GAMES_FIX, "everything_please")


# ── estimate_credits — the exact arithmetic the workflow comment quotes ───

def test_estimate_credits_matches_vendor_formula():
    est = FHP.estimate_credits(n_games=272, n_markets=6, n_regions=1,
                               n_snapshots_per_game=1, n_events_list_calls=18)
    assert est["odds_calls"] == 272
    assert est["odds_credits"] == 272 * 10 * 6 * 1
    assert est["events_list_credits_est"] == 18 * FHP.EVENTS_LIST_CREDIT_EST
    assert est["total_credits_est"] == est["odds_credits"] + est["events_list_credits_est"]


def test_estimate_credits_sample_week1_is_cheap():
    est = FHP.estimate_credits(n_games=16, n_events_list_calls=1)
    assert est["total_credits_est"] < 1000


def test_estimate_credits_full_three_seasons_fits_the_100k_plan():
    # the exact number the audit doc and the workflow comment quote —
    # 3 seasons x ~272 games x 1 snapshot x 6 markets x 10 credits, plus a
    # small events-list overhead.
    per_season = FHP.estimate_credits(n_games=272, n_events_list_calls=18)
    total = per_season["total_credits_est"] * 3
    assert total < 100_000
    assert per_season["odds_credits"] == 16_320


# ── MARKETS / MARKET_TO_STAT — the credit basis and the scoring join ──────

def test_markets_is_exactly_six_and_matches_market_to_stat():
    assert len(FHP.MARKETS) == 6
    assert set(FHP.MARKETS) == set(FHP.MARKET_TO_STAT)


def test_market_to_stat_targets_are_frozen_scoring_table_keys():
    # every stat key this file emits must be a real scoring-table key so
    # props_season_projection.line_to_points can price it without a KeyError
    # silently swallowing a typo.
    scoring_keys = {"pass_yd", "pass_td", "rush_yd", "rush_td", "rec_yd", "rec"}
    assert set(FHP.MARKET_TO_STAT.values()) == scoring_keys

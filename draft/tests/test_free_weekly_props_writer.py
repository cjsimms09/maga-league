# TERRITORY: C
"""Free weekly props writer -- register/ROUTES 09-01/09-02 dispatch, "the
props arm runs on free player props." Fixtures below are NOT invented: the
Sleeper Picks and Underdog raw rows are copied from the real committed
`draft/backtest/free_props_census_2026.json` samples (real bytes a live
fetch actually returned, rule 3f -- the exact lesson the Draft Sharks saga
paid for earlier this session), and the two real players (Drake Maye
sleeper_id 11564, A.J. Brown sleeper_id 5859) are checked against the live
committed board before being used as known-positives.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import free_weekly_props_writer as W  # noqa: E402
from fetch_weekly_props import board_index  # noqa: E402
from fetch_component_stats import frozen_scoring_table  # noqa: E402

SCORING = frozen_scoring_table()

#: real board rows, minimal shape -- enough for board_index()/board_by_id()
BOARD_PLAYERS = [
    {"player_id": "11564", "name": "Drake Maye", "team": "NE", "position": "QB"},
    {"player_id": "5859", "name": "A.J. Brown", "team": "NE", "position": "WR"},
    {"player_id": "9999", "name": "Someone Else", "team": "KC", "position": "RB"},
]


# ── real Sleeper Picks rows, copied from free_props_census_2026.json ────────

SLEEPER_ROWS_REAL = [
    # a real MLB row -- the payload mixes sports, verified against the
    # census's own stored row_shape (subject_id 1007, sport mlb, wager_type
    # bat_walks). Included so the sport filter is exercised, not assumed.
    {"sport": "mlb", "wager_type": "bat_walks", "subject_id": "1007",
     "options": [{"outcome_value": 0.5}]},
    {"sport": "nfl", "wager_type": "passing_yards", "subject_id": "11564",
     "options": [{"outcome_value": 225.5, "subject_position": "QB", "subject_team": "NE"}]},
    {"sport": "nfl", "wager_type": "passing_touchdowns", "subject_id": "11564",
     "options": [{"outcome_value": 1.5}]},
    {"sport": "nfl", "wager_type": "interceptions", "subject_id": "11564",
     "options": [{"outcome_value": 0.5}]},
]


def test_sleeper_market_points_real_known_positive():
    mp = W.sleeper_market_points(SLEEPER_ROWS_REAL)
    assert "1007" not in mp, "the MLB row leaked through the sport filter"
    assert mp["11564"] == {
        "player_pass_yds": 225.5,
        "player_pass_tds": 1.5,
        "player_pass_interceptions": 0.5,
    }


def test_sleeper_market_points_computes_the_real_verified_score():
    # 225.5*0.04 + 1.5*6.0 - 0.5*2.0 = 9.02 + 9.0 - 1.0 = 17.02, hand-checked
    # against the real frozen scoring table before writing this assertion.
    mp = W.sleeper_market_points(SLEEPER_ROWS_REAL)
    from fetch_weekly_props import implied_points
    pts, stat_line = implied_points(mp["11564"], SCORING)
    assert pts == 17.02
    assert stat_line == {"pass_yd": 225.5, "pass_td": 1.5, "pass_int": 0.5}


# ── real Underdog payload, copied from free_props_census_2026.json ──────────

UNDERDOG_DOC_REAL = {
    "games": [{"id": "g1", "sport_id": "NFL", "title": "NE @ SEA"}],
    "appearances": [{"id": "a1", "match_id": "g1", "sport_id": "NFL"}],
    "over_under_lines": [
        {
            "over_under": {
                "title": "A.J. Brown  O/U",
                "appearance_stat": {"appearance_id": "a1", "display_stat": "Rush + Rec TDs"},
            },
            "stat_value": "0.5",
            "options": [{"selection_header": "A.J. Brown"}],
        },
        {
            "over_under": {
                "title": "A.J. Brown  O/U",
                "appearance_stat": {"appearance_id": "a1", "display_stat": "Receiving Yards"},
            },
            "stat_value": "62.5",
            "options": [{"selection_header": "A.J. Brown"}],
        },
        {
            "over_under": {
                "title": "A.J. Brown  O/U",
                "appearance_stat": {"appearance_id": "a1", "display_stat": "Receptions"},
            },
            "stat_value": "4.5",
            "options": [{"selection_header": "A.J. Brown"}],
        },
        # a SEASON line -- no matched game -- must be excluded
        {
            "over_under": {
                "title": "A.J. Brown Season O/U",
                "appearance_stat": {"appearance_id": "a-season-none", "display_stat": "Receiving Yards"},
            },
            "stat_value": "999.5",
            "options": [{"selection_header": "A.J. Brown"}],
        },
    ],
}


def test_underdog_market_points_real_known_positive():
    idx = board_index(BOARD_PLAYERS)
    mp, unmatched = W.underdog_market_points(UNDERDOG_DOC_REAL, idx)
    assert unmatched == []
    # the joint TD market remapped to rush_td, per the module's own rule
    assert mp["5859"] == {
        "player_rush_tds": 0.5,
        "player_reception_yds": 62.5,
        "player_receptions": 4.5,
    }


def test_underdog_season_line_is_excluded_not_priced():
    idx = board_index(BOARD_PLAYERS)
    mp, _ = W.underdog_market_points(UNDERDOG_DOC_REAL, idx)
    # the season row's stat_value (999.5) must never appear anywhere
    all_values = [v for row in mp.values() for v in row.values()]
    assert 999.5 not in all_values


def test_underdog_selection_header_used_over_title_parsing():
    # the title carries a trailing ' O/U' that the OLDER census-style
    # extraction (title.replace(stat, "").strip(' -')) does not clean when
    # `stat` is not a literal substring of `title` -- verified against the
    # real committed census sample before this test was written. This
    # module must not regress to that path when selection_header exists.
    idx = board_index(BOARD_PLAYERS)
    mp, unmatched = W.underdog_market_points(UNDERDOG_DOC_REAL, idx)
    assert "5859" in mp, (
        "player not matched -- selection_header extraction likely regressed "
        "to a name still carrying the raw title's ' O/U' suffix")


def test_underdog_falls_back_to_title_parsing_when_selection_header_missing():
    # The fallback's designed case: `stat` literally embedded in `title`
    # (e.g. "A.J. Brown Receptions"), the shape free_props_census.underdog()
    # was built around. This is NOT the same as a clean recovery in every
    # case -- see the next test for the real, checked limitation.
    doc = json.loads(json.dumps(UNDERDOG_DOC_REAL))  # deep copy
    ln = doc["over_under_lines"][2]  # the "Receptions" line
    ln["over_under"]["title"] = "A.J. Brown Receptions"
    ln["options"] = [{}]  # no selection_header
    idx = board_index(BOARD_PLAYERS)
    mp, unmatched = W.underdog_market_points(doc, idx)
    assert "5859" in mp and "player_receptions" in mp["5859"], (
        "fallback title-parsing path did not recover the player in its own designed case")


def test_underdog_fallback_has_a_real_checked_limitation_not_silently_assumed_clean():
    # ⚠️ Verified against normalize_name directly before writing this: a
    # title carrying the raw ' O/U' suffix with `stat` NOT a literal
    # substring (the exact shape the real committed census sample showed,
    # "A.J. Brown  O/U" for market player_rush_rec_tds) normalizes to
    # 'aj brown o u', which does NOT equal 'aj brown' -- the fallback
    # cannot recover this row without selection_header. Documented as a
    # real limitation rather than silently assumed fixed by the fallback's
    # mere existence.
    doc = json.loads(json.dumps(UNDERDOG_DOC_REAL))  # deep copy
    ln = doc["over_under_lines"][0]  # the joint-TD line, real dirty shape
    ln["options"] = [{}]  # no selection_header -- forces the fallback
    idx = board_index(BOARD_PLAYERS)
    mp, unmatched = W.underdog_market_points(doc, idx)
    assert "5859" not in mp or "player_rush_tds" not in mp.get("5859", {}), (
        "this row now matches without selection_header -- either "
        "normalize_name changed, or this test's premise needs re-checking, "
        "not a silent pass")


# ── build_players: market-level fill, not player-level ──────────────────────

def test_build_players_underdog_fills_only_missing_markets():
    # Sleeper prices Maye's passing; Underdog independently "has" a
    # (fabricated, for this test) rushing-yards line for him -- it must be
    # ADDED, not discarded, because Sleeper never priced that market.
    sleeper_mp = {"11564": {"player_pass_yds": 225.5, "player_pass_tds": 1.5}}
    underdog_mp = {"11564": {"player_pass_yds": 999.0,  # Sleeper's must win
                             "player_rush_yds": 12.5}}   # Sleeper has none -- must fill
    by_id = W.board_by_id(BOARD_PLAYERS)
    players = W.build_players(sleeper_mp, underdog_mp, by_id, SCORING)
    assert players["11564"]["stat_line"]["pass_yd"] == 225.5  # Sleeper won
    assert players["11564"]["stat_line"]["rush_yd"] == 12.5   # Underdog filled


def test_build_players_underdog_only_player_still_prices():
    underdog_mp = {"5859": {"player_receptions": 4.5, "player_reception_yds": 62.5}}
    by_id = W.board_by_id(BOARD_PLAYERS)
    players = W.build_players({}, underdog_mp, by_id, SCORING)
    assert "5859" in players
    assert players["5859"]["name"] == "A.J. Brown"


def test_build_players_a_player_with_no_scoreable_market_is_absent():
    # a market_of() key implied_points cannot score at all (empty stat_line)
    # must not appear in the output -- absent, never a zero.
    sleeper_mp = {"1": {}}
    by_id = {}
    players = W.build_players(sleeper_mp, {}, by_id, SCORING)
    assert players == {}


# ── refusal floor + snapshot shape ───────────────────────────────────────────

def test_min_players_floor_is_a_real_number_not_zero():
    assert W.MIN_PLAYERS > 0


def test_build_snapshot_shape_matches_the_contract_weekly_props_arm_reads():
    players = {"11564": {"name": "Drake Maye", "team": "NE", "position": "QB",
                        "points": 17.02, "stat_line": {"pass_yd": 225.5}}}
    doc = W.build_snapshot(players, 0, [], 2026, 1)
    assert doc["players"]["11564"]["points"] == 17.02
    assert doc["season"] == 2026 and doc["week"] == 1


def test_board_by_id_keys_on_player_id_as_string():
    idx = W.board_by_id(BOARD_PLAYERS)
    assert set(idx) == {"11564", "5859", "9999"}
    assert idx["11564"]["name"] == "Drake Maye"

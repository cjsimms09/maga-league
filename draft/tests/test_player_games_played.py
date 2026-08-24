# TERRITORY: C
"""Per-player games-played join -- register 112, unblocked by the draft
finishing. Fixtures match fetch_component_stats.season_components()'s
real return shape ({pid: {games, pos, team, ...stat sums}}), verified by
hand against the live store before writing this file (rule 3f).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import player_games_played as PGP  # noqa: E402


def test_games_ceiling_is_the_real_observed_max_not_a_constant():
    # THE REAL CATCH this module is built around: 16 in some seasons, 17
    # in others -- verified against the live store, not assumed.
    season_games = {"1": {"games": 16}, "2": {"games": 12}, "3": {"games": 17}}
    assert PGP.games_ceiling(season_games) == 17


def test_games_ceiling_handles_an_empty_season():
    assert PGP.games_ceiling({}) == 0


def test_build_season_join_divides_by_the_seasons_own_ceiling():
    season_games = {"A": {"games": 16, "pos": "QB", "team": "BUF"},
                    "B": {"games": 8, "pos": "QB", "team": "DET"}}
    join, ceiling = PGP.build_season_join(2024, season_games)
    assert ceiling == 16
    assert join["A"]["games_pct"] == 1.0
    assert join["B"]["games_pct"] == 0.5


def test_weighted_availability_pools_across_seasons_not_recency_weighted():
    per_season = {2023: {"games": 16, "games_pct": 1.0, "_ceiling": 16},
                 2024: {"games": 8, "games_pct": 0.5, "_ceiling": 16}}
    # pooled: (16+8)/(16+16) = 0.75 -- NOT a recency-weighted average
    # (which would weight 2024 more and land below 0.75)
    assert PGP.weighted_availability(per_season) == 0.75


def test_weighted_availability_skips_seasons_with_no_data():
    per_season = {2023: {"games": 16, "games_pct": 1.0, "_ceiling": 16},
                 2024: {"games": 0, "games_pct": None, "_ceiling": 0}}
    assert PGP.weighted_availability(per_season) == 1.0


def test_weighted_availability_none_when_no_season_has_data():
    assert PGP.weighted_availability({}) is None


def test_build_store_joins_a_real_shaped_fixture_across_seasons():
    fixtures = {
        2023: {"P1": {"games": 16, "pos": "QB", "team": "BUF"},
              "P2": {"games": 4, "pos": "RB", "team": "DET"}},
        2024: {"P1": {"games": 16, "pos": "QB", "team": "BUF"},
              "P2": {"games": 12, "pos": "RB", "team": "DET"}},
    }
    doc = PGP.build_store((2023, 2024), season_games_by_year=fixtures)
    assert doc["n_players"] == 2
    assert doc["season_ceilings"] == {2023: 16, 2024: 16}
    p1 = doc["players"]["P1"]
    assert p1["weighted_availability_rate"] == 1.0
    assert p1["pos"] == "QB"
    p2 = doc["players"]["P2"]
    assert p2["weighted_availability_rate"] == 0.5  # (4+12)/(16+16)


def test_build_store_handles_a_player_missing_from_one_season():
    fixtures = {
        2023: {"P1": {"games": 16, "pos": "QB", "team": "BUF"}},
        2024: {"P1": {"games": 16, "pos": "QB", "team": "BUF"},
              "P2": {"games": 8, "pos": "RB", "team": "DET"}},  # rookie, no 2023
    }
    doc = PGP.build_store((2023, 2024), season_games_by_year=fixtures)
    p2 = doc["players"]["P2"]
    assert "2023" not in p2["games_played_by_season"]
    assert p2["weighted_availability_rate"] == 0.5


def test_verify_known_positive_passes_on_the_real_committed_store():
    doc = PGP.build_store((2023, 2024, 2025))
    control = PGP.verify_known_positive(doc)
    assert control["ok"] is True


def test_verify_known_positive_is_a_real_fail_arm():
    # break it: Josh Allen's real 2025 games swapped for a thin count;
    # Kyle Allen's real thin fixture kept so the check reaches durable_ok
    # instead of bailing early on "player not found".
    thin_id = PGP.KNOWN_POSITIVE["thin_id"]
    thin_season = str(PGP.KNOWN_POSITIVE["thin_season"])
    fixtures = {
        2023: {PGP.KNOWN_POSITIVE["durable_id"]: {"games": 16, "pos": "QB", "team": "BUF"}},
        2024: {PGP.KNOWN_POSITIVE["durable_id"]: {"games": 16, "pos": "QB", "team": "BUF"},
              thin_id: {"games": 1, "pos": "QB", "team": "DET"}},
        2025: {PGP.KNOWN_POSITIVE["durable_id"]: {"games": 2, "pos": "QB", "team": "BUF"}},
    }
    doc = PGP.build_store((2023, 2024, 2025), season_games_by_year=fixtures)
    control = PGP.verify_known_positive(doc)
    assert control["ok"] is False
    assert control["durable_ok"] is False  # 2 games < the 15-game floor


def test_refusal_reason_none_on_the_real_committed_store():
    doc = PGP.build_store((2023, 2024, 2025))
    assert PGP.refusal_reason(doc) is None


def test_refusal_reason_fires_on_a_starved_join():
    fixtures = {2024: {"P1": {"games": 16, "pos": "QB", "team": "BUF"}}}
    doc = PGP.build_store((2024,), season_games_by_year=fixtures)
    reason = PGP.refusal_reason(doc)
    assert reason is not None
    assert "1 players" in reason


def test_build_store_never_touches_games_expected_or_any_board_field():
    # THE ASK'S OWN INSTRUCTION, pinned: the DATA this module emits (not
    # its own prose explaining what it deliberately avoids) has no key
    # named games_expected anywhere, at any nesting level.
    doc = PGP.build_store((2024,), season_games_by_year={
        2024: {"P1": {"games": 16, "pos": "QB", "team": "BUF"}}})
    assert "games_expected" not in str(doc["players"])
    assert "games_expected" not in str(doc["season_ceilings"])

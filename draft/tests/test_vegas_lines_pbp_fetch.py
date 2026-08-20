# TERRITORY: C
"""Register row 16's second Vegas-lines copy — pure assembly logic, pinned
against fixtures shaped like real pbp rows (not invented columns; verified by
hand against a real 2024 game before writing this file)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import vegas_lines_pbp_fetch as V  # noqa: E402


def _row(**kw):
    base = {"season": 2024, "week": 1, "game_id": "2024_01_ARI_BUF",
           "home_team": "BUF", "away_team": "ARI",
           "spread_line": 6.5, "total_line": 46.0, "season_type": "REG"}
    base.update(kw)
    return base


def test_one_game_many_play_rows_collapses_to_one_game():
    rows = [_row() for _ in range(50)]  # a real game has thousands of plays
    games = V.games_from_pbp_rows(rows)
    assert len(games) == 1
    assert games[0] == {"week": 1, "home": "BUF", "away": "ARI",
                        "spread_line": 6.5, "total_line": 46.0,
                        "season_type": "REG"}


def test_preseason_rows_are_excluded():
    rows = [_row(season_type="PRE")]
    assert V.games_from_pbp_rows(rows) == []


def test_postseason_rows_are_kept():
    rows = [_row(season_type="POST", game_id="2024_20_SB")]
    games = V.games_from_pbp_rows(rows)
    assert len(games) == 1 and games[0]["season_type"] == "POST"


def test_a_row_with_no_line_is_dropped_not_stored_as_zero():
    rows = [_row(spread_line=None, total_line=None)]
    assert V.games_from_pbp_rows(rows) == []


def test_two_different_games_both_survive():
    rows = [_row(), _row(game_id="2024_01_BAL_KC", home_team="KC", away_team="BAL",
                        spread_line=3.0, total_line=46.0)]
    games = V.games_from_pbp_rows(rows)
    assert len(games) == 2


def test_la_becomes_lar():
    rows = [_row(home_team="LA", away_team="SF")]
    games = V.games_from_pbp_rows(rows)
    assert games[0]["home"] == "LAR"


def test_build_store_shape_matches_the_reconciler_expectation():
    def fake_fetch(season):
        return [_row(season=season)]
    doc = V.build_store((2024,), fetch_fn=fake_fetch)
    assert doc["seasons"]["2024"] == [
        {"week": 1, "home": "BUF", "away": "ARI",
         "spread_line": 6.5, "total_line": 46.0, "season_type": "REG"}]
    assert doc["total_games"] == 1


def test_build_store_records_a_fetch_failure_rather_than_silently_skipping():
    def fake_fetch(season):
        raise RuntimeError("egress blocked")
    doc = V.build_store((2024,), fetch_fn=fake_fetch)
    assert doc["seasons"] == {}
    tried = doc["provenance"]["tried"][0]
    assert tried["ok"] is False and "egress blocked" in tried["error"]


def test_reconciler_reads_the_shape_this_module_writes():
    # rule 11 / integration pin: the reconciler's own flatten() must accept
    # this module's output shape without modification on either side.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import test_vegas_lines_reconcile as R

    def fake_fetch(season):
        return [_row(season=season)]
    doc = V.build_store((2024,), fetch_fn=fake_fetch)
    flat = R.flatten(doc["seasons"])
    assert ("2024", 1, "BUF", "ARI") in flat

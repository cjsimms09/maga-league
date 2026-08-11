"""nflverse_weekly_to_scoring: renamed columns, and aliases that must not double.

FOUND BY C, MEASURED NOT HYPOTHESISED (2026-08-11). `nfl_data_py.import_weekly_data`
404s for 2025; `nflreadpy.load_player_stats` serves it (19,421 rows) and RENAMES
`interceptions` to `passing_interceptions`. The translator mapped only the old
name, so `pass_int` was never emitted for any 2025 row and every QB in a league
scoring interceptions came out about two points per pick TOO HIGH.

WHY NOTHING WENT RED. `score_stat_line` skips a key the stat line does not carry.
That is correct for an optional bonus and exactly wrong for a term the league
actually scores — so the loss was silent, QB-only, and uniform enough to look
like a scoring-table difference rather than a missing column.

AND THE FIX HAD ITS OWN TRAP. The translator accumulates: `line[dst] += v`. Two
column names for ONE stat routed through that would DOUBLE it the moment a row
carried both — converting a silent undercount into a silent overcount, which is
worse, because the undercount was at least uniform across every QB. Aliases now
take first-writer-wins; only genuine COMPONENTS (fumbles lost, split across three
columns) still accumulate. Both directions are pinned below.
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft", "backtest"))

import grade as G  # noqa: E402

QB_WEEK = {"passing_yards": 300, "passing_tds": 2}


def test_the_renamed_2025_column_produces_pass_int():
    """The defect itself: under the only loader serving 2025, this was empty."""
    line = G.nflverse_weekly_to_scoring(dict(QB_WEEK, passing_interceptions=1))
    assert line.get("pass_int") == 1, (
        "nflreadpy's `passing_interceptions` did not reach pass_int — every 2025 QB "
        "week is scored without interceptions")


def test_the_old_column_still_works():
    """A fix that traded one loader's vocabulary for the other's would be no fix."""
    line = G.nflverse_weekly_to_scoring(dict(QB_WEEK, interceptions=1))
    assert line.get("pass_int") == 1


def test_two_names_for_one_stat_do_not_DOUBLE_it():
    """THE TRAP IN THE FIX. add() accumulates; aliases must not go through it."""
    line = G.nflverse_weekly_to_scoring(
        dict(QB_WEEK, interceptions=1, passing_interceptions=1))
    assert line.get("pass_int") == 1, (
        "a one-interception week scored as %s — the alias was accumulated rather "
        "than assigned" % line.get("pass_int"))


def test_our_own_vocabulary_wins_and_is_not_added_to():
    """A row already in our keys was translated deliberately; an alias must not top it up."""
    line = G.nflverse_weekly_to_scoring(
        {"pass_int": 1, "interceptions": 1, "passing_interceptions": 1})
    assert line["pass_int"] == 1


def test_fumbles_lost_STILL_accumulate_because_they_are_components():
    """The distinction the fix rests on: components sum, aliases do not.

    If first-writer-wins were applied to these three, a player who lost a rushing
    AND a receiving fumble would be charged for one.
    """
    line = G.nflverse_weekly_to_scoring(
        {"rushing_fumbles_lost": 1, "receiving_fumbles_lost": 1, "sack_fumbles_lost": 1})
    assert line["fum_lost"] == 3


def test_the_interception_is_worth_the_points_the_league_says():
    """END TO END on the number that moved: the delta IS the interception.

    Asserted as a difference rather than an absolute, so the test does not quietly
    encode one league's scoring table as though it were a fact about the mapper.
    """
    clean = G.nflverse_weekly_to_scoring(dict(QB_WEEK))
    picked = G.nflverse_weekly_to_scoring(dict(QB_WEEK, passing_interceptions=1))
    assert "pass_int" not in clean
    assert picked["pass_int"] - clean.get("pass_int", 0) == 1
    for k in ("pass_yd", "pass_td"):
        assert clean[k] == picked[k], "an interception changed a passing total"

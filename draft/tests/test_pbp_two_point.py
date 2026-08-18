# TERRITORY: A
"""Two-point conversions in the play-by-play rebuild, and the lateral gap left open.

`weekly_from_pbp` emitted NO two-point field of any kind while our scoring table
prices `pass_2pt` / `rec_2pt` / `rush_2pt` at 2.0 each. Measured against the 2024
library data, that accounted for SEVEN of the eight worst top-200 disagreements —
each exactly `2 x (that player's 2pt count)`: Winston 4, Daniels 4, and Mahomes,
Herbert, Love, Lawrence, Barkley 3 apiece.

Fixing it cut `mean_abs_diff` on 2024 from 0.489 to 0.149. It does NOT make the
rebuilt path usable — see the last test — and that distinction is the point.
"""
from __future__ import annotations

import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "draft"))
sys.path.insert(0, os.path.join(ROOT, "draft", "backtest"))
import grade as GR  # noqa: E402


def _rows(plays):
    import pandas as pd
    return GR.weekly_from_pbp(pd.DataFrame(plays), [2024])


BASE = {"season": 2024, "week": 1}


def test_a_successful_passing_two_point_credits_passer_and_receiver():
    rows = _rows([dict(BASE, two_point_conv_result="success",
                       passer_player_id="QB", receiver_player_id="WR",
                       complete_pass=0)])
    by = {r["player_id"]: r for r in rows}
    assert by["QB"]["pass_2pt"] == 1
    assert by["WR"]["rec_2pt"] == 1


def test_a_successful_rushing_two_point_credits_the_rusher():
    rows = _rows([dict(BASE, two_point_conv_result="success", rusher_player_id="RB")])
    assert {r["player_id"]: r for r in rows}["RB"]["rush_2pt"] == 1


def test_a_FAILED_two_point_credits_nobody():
    """`two_point_conv_result` also takes 'failure'. Crediting those would invent
    points, which is worse than the undercount being fixed."""
    rows = _rows([dict(BASE, two_point_conv_result="failure",
                       passer_player_id="QB", receiver_player_id="WR")])
    for r in rows:
        assert "pass_2pt" not in r and "rec_2pt" not in r


def test_a_two_point_play_yields_no_reception_and_no_yards():
    """VERIFIED IN THE REAL DATA BEFORE THIS WAS WRITTEN: `complete_pass` is 0 on
    every one of the 42 receiving conversions in 2024, and the yardage columns
    are null. So the receiving block above correctly credits nothing, and the
    conversion must not smuggle in a catch — a 2pt reception is worth 2.0, not
    2.5, and the official feed shows `receptions=0` on exactly such a week."""
    rows = _rows([dict(BASE, two_point_conv_result="success",
                       passer_player_id="QB", receiver_player_id="WR",
                       complete_pass=0, receiving_yards=None, passing_yards=None)])
    wr = {r["player_id"]: r for r in rows}["WR"]
    assert wr.get("rec") is None
    assert wr.get("rec_yd") is None
    assert wr["rec_2pt"] == 1


def test_scoring_actually_prices_the_new_keys():
    """A key the engine does not price would be a silent no-op — `score_stat_line`
    skips unknown keys rather than raising, which is right for an optional bonus
    and exactly wrong for a scored term."""
    import json
    import scoring
    cfg = json.load(open(os.path.join(ROOT, "draft", "config", "league_config.json")))
    sc = cfg["scoring"]
    for k in ("pass_2pt", "rec_2pt", "rush_2pt"):
        assert sc.get(k), f"{k} is not priced; emitting it would be a no-op"
    assert scoring.score_stat_line({"rec_2pt": 1}, sc) == pytest.approx(sc["rec_2pt"])


def test_the_lateral_gap_is_recorded_as_still_open():
    """THE HONEST HALF. The 2pt fix does NOT make the rebuilt path usable: the
    2024 gate still refuses at worst_diff_top200 11.0, because Jameson Williams'
    two lateral receptions are still missing.

    A lateral fix was attempted and REVERTED the same hour — crediting
    `lateral_receiver_player_id` fixed Williams exactly and broke Jahmyr Gibbs
    (+8.0) and Josh Allen (+6.7) the other way. Gibbs' official week-3 row reads
    `receptions=0, receiving_yards=0.0, targets=0` for a structurally identical
    lateral touchdown, so nflverse does not simply credit the lateral player and
    Williams' arithmetic match was a coincidence over-read as a rule.

    If someone deletes that explanation to try again from scratch, this fails
    first."""
    src = open(os.path.join(ROOT, "draft", "backtest", "grade.py")).read()
    assert "REVERTED THE SAME HOUR" in src
    assert "lateral" in src.lower()
    # And the parser must still NOT credit laterals — reverting means reverted.
    rows = _rows([dict(BASE, lateral_receiver_player_id="WR",
                       lateral_receiving_yards=41.0, touchdown=1,
                       td_player_id="WR")])
    assert not rows or all(r.get("rec_yd") is None for r in rows)

# TERRITORY: A
"""Routes run — the refusals, the proxy honesty, and the schema trap.

There is NO routes feed in nflverse. This is a PROXY from `pbp_participation`:
every skill player on the field for a pass play is counted as running a route.
The counting is arithmetic; what needs guarding is that the proxy keeps saying
it is one, and that the two ways it can silently produce a wrong denominator
stay closed.
"""
from __future__ import annotations

import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "draft", "backtest"))
import fetch_routes as FR  # noqa: E402


class _DF(list):
    """Minimal stand-in: build_season only ever zips columns off these."""
    def __init__(self, rows):
        super().__init__(rows)
        self.rows = rows

    def __getitem__(self, k):
        if isinstance(k, str):
            return [r.get(k) for r in self.rows]
        return self.rows[k]

    def get(self, k, default=None):
        return [r.get(k) for r in self.rows] if any(k in r for r in self.rows) else default


class _Col(list):
    def fillna(self, v):
        return [x if x is not None else v for x in self]


class _Part(_DF):
    def __getitem__(self, k):
        return _Col(super().__getitem__(k))


def _run(part_rows, pbp_rows, positions, cw):
    return FR.build_season(2024, cw, part=_Part(part_rows), pbp=_DF(pbp_rows),
                           positions=positions)


PBP = [{"game_id": "G", "play_id": 1, "play_type": "pass", "week": 1,
        "receiver_player_id": "wr1"},
       {"game_id": "G", "play_id": 2, "play_type": "run", "week": 1,
        "receiver_player_id": None}]
CW = {"wr1": "S1", "wr2": "S2", "qb1": "SQ", "ol1": "SO"}
POS = {"wr1": "WR", "wr2": "WR", "qb1": "QB", "ol1": "T"}


def test_only_pass_plays_count_as_routes():
    """A run play is not a route. Counting it would inflate the denominator of
    every efficiency number computed off this file."""
    part = [{"nflverse_game_id": "G", "play_id": 1, "offense_players": "wr1;wr2"},
            {"nflverse_game_id": "G", "play_id": 2, "offense_players": "wr1;wr2"}]
    out = _run(part, PBP, POS, CW)
    assert out["weeks"][1]["S1"]["routes"] == 1


def test_linemen_and_quarterbacks_do_not_run_routes():
    """The list is ALL ELEVEN offensive players. Without a position filter a
    left tackle out-routes every receiver in the league, and a QB tops the
    board on plays he is throwing."""
    part = [{"nflverse_game_id": "G", "play_id": 1,
             "offense_players": "wr1;qb1;ol1"}]
    out = _run(part, PBP, POS, CW)
    wk = out["weeks"][1]
    assert "S1" in wk
    assert "SQ" not in wk and "SO" not in wk


def test_a_player_with_no_known_position_is_skipped_and_counted():
    """ABSENT, NOT GUESSED. Counting an unknown as a route-runner invents a
    denominator; counting him as not one is equally unsupported. He is skipped
    AND recorded, so the size of the unknown is visible rather than implied."""
    part = [{"nflverse_game_id": "G", "play_id": 1, "offense_players": "wr1;ghost"}]
    out = _run(part, PBP, POS, CW)
    assert "ghost" not in str(out["weeks"])
    assert out["join"]["on_field_without_a_position"] == 1


def test_targets_attach_to_the_actual_receiver_only():
    part = [{"nflverse_game_id": "G", "play_id": 1, "offense_players": "wr1;wr2"}]
    wk = _run(part, PBP, POS, CW)["weeks"][1]
    assert wk["S1"]["targets"] == 1
    assert wk["S2"]["targets"] == 0


def test_tprr_is_withheld_below_the_route_floor():
    """A ratio of two small integers is not an efficiency. Below the floor the
    field is None — absent, not a noisy number a reader would rank on."""
    part = [{"nflverse_game_id": "G", "play_id": 1, "offense_players": "wr1"}]
    wk = _run(part, PBP, POS, CW)["weeks"][1]
    assert wk["S1"]["routes"] < FR.MIN_ROUTES_FOR_TPRR
    assert wk["S1"]["tprr"] is None


def test_an_unjoined_play_is_counted_not_silently_dropped():
    """participation carries no play_type, so pass plays come from the pbp join.
    A play that fails to join must show up in the accounting — an unjoined play
    is a route nobody was credited with."""
    part = [{"nflverse_game_id": "G", "play_id": 1, "offense_players": "wr1"},
            {"nflverse_game_id": "G", "play_id": 99, "offense_players": "wr1"}]
    j = _run(part, PBP, POS, CW)["join"]
    assert j["unjoined"] == 1 and j["joined_to_pbp"] == 1
    assert j["join_rate"] == 0.5


def test_the_module_says_it_is_a_proxy_and_an_upper_bound():
    """THE HONESTY PIN. A blocking tight end is on the field and is counted, so
    this over-states routes for exactly the players a route metric is used to
    dismiss. If someone deletes that caveat, downstream code will treat a proxy
    as a measurement."""
    src = open(os.path.join(ROOT, "draft", "backtest", "fetch_routes.py")).read()
    assert "UPPER BOUND" in src
    assert "no routes file" in src or "NO ROUTES FEED" in src


def test_the_join_floor_is_high_because_the_denominator_is_the_point():
    """Snap counts tolerate 0.70; routes must not. A missing snap loses one
    player's row, but a missing PASS PLAY silently shrinks the denominator for
    every receiver who was on the field for it."""
    assert FR.MIN_JOIN_RATE >= 0.95

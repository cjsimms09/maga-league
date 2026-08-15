"""attach_own_model() — the build.py integration point, tested directly.

Found 2026-08-15, later the same day it was written: the own-model wiring into
build.py was verified by hand (a standalone simulation script against the real
board) but never got a permanent, automated test, unlike everything else fixed
that day. Inconsistent with the standard held everywhere else. compute_own_projections()
itself needs network (nfl_data_py) and is a thin wrapper around already-tested
pieces (walk_forward, crosswalk_gsis_to_sleeper, nflverse_weekly_to_scoring); the
part that's actually new and untested is the attach logic that touches the live
board, which is pure and needs no network to test.

Run: python -m pytest draft/tests/test_own_projections_attach.py -q
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from own_projections import attach_own_model  # noqa: E402


def _board():
    return [
        {"player_id": "1", "name": "Has Proj", "proj_mean": 200.0, "proj_baseline": 190.0, "vorp": 50.0},
        {"player_id": "2", "name": "No Proj (rookie)", "proj_mean": 80.0},
        {"player_id": "3", "name": "Also Has Proj", "proj_mean": 150.0, "vorp": 10.0},
    ]


def test_attaches_only_players_with_a_computed_projection():
    board = _board()
    own_proj = {"1": 222.222, "3": 111.111}
    n = attach_own_model(board, own_proj)
    assert n == 2
    assert board[0]["proj_ownmodel"] == 222.22
    assert board[2]["proj_ownmodel"] == 111.11


def test_a_player_with_no_own_projection_is_absent_not_zero():
    board = _board()
    n = attach_own_model(board, {"1": 200.0})
    assert n == 1
    # "no proj_ownmodel key" — not None, not 0.0. Same discipline proj_feed.js
    # uses for a player the board has no projection for.
    assert "proj_ownmodel" not in board[1]
    assert "proj_ownmodel" not in board[2]


def test_THE_ADDITIVE_GUARANTEE_is_checked_not_just_claimed():
    """build.py's own comment says this attach block 'never touches proj_mean,
    proj_baseline, VORP, or ranking'. That was a claim in a comment until this
    test — now it's asserted directly: every field on every player except the
    new proj_ownmodel key is byte-identical before and after."""
    board = _board()
    before = [dict(p) for p in board]  # deep-enough copy, no nested structures here
    attach_own_model(board, {"1": 999.0, "2": 999.0, "3": 999.0})
    for orig, after in zip(before, board):
        for k, v in orig.items():
            assert after[k] == v, f"attach_own_model MUTATED an existing field: {k}"
        # the only new key allowed is proj_ownmodel
        new_keys = set(after.keys()) - set(orig.keys())
        assert new_keys <= {"proj_ownmodel"}, f"attach_own_model added unexpected keys: {new_keys}"


def test_rounds_to_two_decimal_places():
    board = _board()
    attach_own_model(board, {"1": 123.456789})
    assert board[0]["proj_ownmodel"] == 123.46


def test_a_player_id_not_on_the_board_at_all_is_silently_ignored():
    # own_proj can carry players from prior seasons who left the league —
    # walk_forward() projects off historical production, not the current
    # board's roster. Extra keys in own_proj that don't match any board
    # player must not error or leak onto some other row.
    board = _board()
    n = attach_own_model(board, {"1": 200.0, "999999": 500.0})
    assert n == 1
    assert all(str(p.get("player_id")) != "999999" for p in board)


def test_empty_own_proj_attaches_nothing_and_does_not_error():
    board = _board()
    n = attach_own_model(board, {})
    assert n == 0
    assert all("proj_ownmodel" not in p for p in board)


def test_player_id_type_mismatch_int_vs_string_still_matches():
    # Board player_ids can arrive as either int or str depending on the JSON
    # round-trip that produced them; attach_own_model stringifies before the
    # lookup specifically so this doesn't silently miss.
    board = [{"player_id": 42, "proj_mean": 100.0}]
    n = attach_own_model(board, {"42": 55.5})
    assert n == 1
    assert board[0]["proj_ownmodel"] == 55.5

"""attach_own_model() and _discover_prior_years() — the two pieces of the
own-model pipeline that don't need network, tested directly.

Found 2026-08-15, later the same day it was written: the own-model wiring into
build.py was verified by hand (a standalone simulation script against the real
board) but never got a permanent, automated test, unlike everything else fixed
that day. Inconsistent with the standard held everywhere else.

CORRECTION, same day: this file's own original header claimed
compute_own_projections() was "a thin wrapper around already-tested pieces" and
so needed no direct test. That was wrong — it hid a real bug. Its `prior_years`
default was a hardcoded [season-3, season-2] (for season=2026: [2023, 2024]),
one year staler than the [yr-2, yr-1] convention every backtest experiment in
this repo actually uses. It "worked" only by accident, because season-1 (2025)
genuinely isn't published on nflverse yet — confirmed with a live 404 — so the
wrong offset and the right one happened to produce an overlapping-enough answer
today. It would never have self-corrected once 2025 shipped. Found by comparing
against exp33.py/exp34.py/exp35_regression_sweep.py's own `(yr-2, yr-1)`
pattern, not by any test — this file's tests only ever checked attach_own_model,
which has no opinion about which years fed the projection it attaches.

Fixed by extracting the year-discovery ALGORITHM into `_discover_prior_years()`,
dependency-injected on an `is_available(year)` callable instead of nfl_data_py
directly — so it's pure and testable here, the same reason attach_own_model was
extracted in the first place.

Run: python -m pytest draft/tests/test_own_projections_attach.py -q
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from own_projections import attach_own_model, _discover_prior_years  # noqa: E402


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


# ── _discover_prior_years — the fix for the real bug found 2026-08-15 ────────

def test_discovers_the_two_most_recent_available_years_not_a_hardcoded_offset():
    # season=2026, all of 2025/2024/2023 available -> wants [2025, 2024], the
    # [yr-2, yr-1]-equivalent pattern this repo's backtests actually use, NOT
    # the old hardcoded [2023, 2024] (season-3, season-2).
    available = {2025, 2024, 2023, 2022}
    years = _discover_prior_years(lambda y: y in available, season=2026, want=2)
    assert years == [2025, 2024], years


def test_a_missing_most_recent_year_is_skipped_not_substituted_silently():
    # THE EXACT REAL SCENARIO found 2026-08-15: season-1 (2025) unpublished.
    # Old code never even tried 2025; this discovers that it's missing and
    # correctly falls back to the next two real years instead.
    available = {2024, 2023, 2022}  # 2025 absent
    years = _discover_prior_years(lambda y: y in available, season=2026, want=2)
    assert years == [2024, 2023], years


def test_self_corrects_the_moment_the_missing_year_ships_no_code_change_needed():
    # The whole point of discovering rather than hardcoding: flip one year from
    # unavailable to available and the answer updates on its own.
    without_2025 = _discover_prior_years(lambda y: y in {2024, 2023}, season=2026, want=2)
    with_2025 = _discover_prior_years(lambda y: y in {2025, 2024, 2023}, season=2026, want=2)
    assert without_2025 == [2024, 2023]
    assert with_2025 == [2025, 2024]
    assert without_2025 != with_2025


def test_gives_up_after_the_lookback_window_rather_than_looping_forever():
    # A genuine outage (nothing available) must terminate, not hang.
    years = _discover_prior_years(lambda y: False, season=2026, want=2, lookback=5)
    assert years == []


def test_lookback_is_bounded_even_when_partially_successful():
    # Only ONE of the 5 probed years (2025..2021) is real; discovery must still
    # stop at the lookback bound rather than searching indefinitely for a
    # second one that will never come.
    years = _discover_prior_years(lambda y: y == 2021, season=2026, want=2, lookback=5)
    assert years == [2021], years


def test_probes_backward_in_order_starting_at_season_minus_1():
    # Records every year actually asked about, in the order asked — pins the
    # search DIRECTION (backward from the most recent) and the STARTING POINT
    # (season - 1, not season or season - 2).
    probed = []
    def is_available(y):
        probed.append(y)
        return y in {2023, 2022}
    years = _discover_prior_years(is_available, season=2026, want=2)
    assert probed == [2025, 2024, 2023, 2022], probed
    assert years == [2023, 2022]


def test_each_year_is_checked_at_most_once():
    # Guards against the discovery loop itself double-probing a year — the
    # double-fetch this fix also had to avoid (nflverse weekly data is 5000+
    # rows/year; checking twice would double real network cost for nothing).
    calls = []
    def is_available(y):
        calls.append(y)
        return y in {2024, 2023}
    _discover_prior_years(is_available, season=2026, want=2)
    assert len(calls) == len(set(calls)), calls

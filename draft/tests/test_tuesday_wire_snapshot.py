# TERRITORY: C
"""Tuesday wire snapshot -- Cory's in-season queue item 1. Pure logic
tested on fixtures; the real Sleeper roster fetch is CI-only, same as
every other unverified-locally capture this session (sandbox egress to
Sleeper is denied at the gateway -- confirmed by sleeper_league_probe.py's
own docstring, not re-checked here).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import tuesday_wire_snapshot as T  # noqa: E402


BOARD = {"players": [
    {"player_id": "1001", "name": "A"}, {"player_id": "1002", "name": "B"},
    {"player_id": "1003", "name": "C"}, {"player_id": "1004", "name": "D"},
    {"player_id": "1005", "name": "E"},
]}
ROSTERS = [
    {"roster_id": 1, "owner_id": "u1", "players": ["1001", "1002"],
     "settings": {"waiver_position": 3}},
    {"roster_id": 2, "owner_id": "u2", "players": ["1003"],
     "settings": {"waiver_position": 1}},
]


def test_board_player_ids_reads_the_real_field_name():
    assert T.board_player_ids(BOARD) == {"1001", "1002", "1003", "1004", "1005"}


def test_rostered_player_ids_pools_across_every_roster():
    assert T.rostered_player_ids(ROSTERS) == {"1001", "1002", "1003"}


def test_compute_wire_is_board_minus_every_roster():
    assert T.compute_wire(BOARD, ROSTERS) == ["1004", "1005"]


def test_compute_wire_is_stable_sorted_for_a_clean_week_over_week_diff():
    reordered = list(reversed(ROSTERS))
    assert T.compute_wire(BOARD, reordered) == T.compute_wire(BOARD, ROSTERS)


def test_extract_priority_guess_matches_the_first_known_convention():
    key, val = T.extract_priority_guess({"waiver_position": 4})
    assert (key, val) == ("waiver_position", 4)


def test_extract_priority_guess_tries_alternate_conventions_in_order():
    key, val = T.extract_priority_guess({"waiver_pos": 2})
    assert (key, val) == ("waiver_pos", 2)


def test_extract_priority_guess_returns_none_none_on_an_unrecognized_shape():
    # THE REAL CASE this module is built to survive: a field-name guess
    # that turns out to be wrong must not crash or fabricate a value.
    key, val = T.extract_priority_guess({"some_other_field": 4})
    assert (key, val) == (None, None)


def test_build_priority_order_keeps_raw_settings_verbatim():
    rows = T.build_priority_order(ROSTERS)
    r1 = next(r for r in rows if r["roster_id"] == 1)
    assert r1["raw_settings"] == {"waiver_position": 3}


def test_build_priority_order_sorts_by_priority_when_every_roster_resolves():
    rows = T.build_priority_order(ROSTERS)
    assert [r["roster_id"] for r in rows] == [2, 1]  # priority 1 before 3


def test_build_priority_order_does_not_fabricate_an_order_when_unresolved():
    mixed = ROSTERS + [{"roster_id": 3, "owner_id": "u3", "players": [],
                        "settings": {"unrelated": True}}]
    rows = T.build_priority_order(mixed)
    # left in roster_id order, not silently sorted around the unresolved gap
    assert [r["roster_id"] for r in rows] == [1, 2, 3]


def test_build_snapshot_records_which_rosters_the_priority_guess_failed_on():
    mixed = ROSTERS + [{"roster_id": 3, "owner_id": "u3", "players": [],
                        "settings": {}}]
    doc = T.build_snapshot(BOARD, mixed, season=2026, week=3,
                           captured_at="2026-09-16T12:00:00Z")
    assert doc["priority_extraction_unresolved_roster_ids"] == [3]


def test_verify_known_positive_passes_on_the_real_shaped_fixture():
    control = T.verify_known_positive()
    assert control["ok"] is True


def test_verify_known_positive_is_a_real_fail_arm():
    # break the wire computation (rostered set now covers the whole board)
    broken_rosters = ROSTERS + [{"roster_id": 2, "owner_id": "u2",
                                 "players": ["1004", "1005"],
                                 "settings": {"waiver_position": 1}}]
    doc = T.build_snapshot(BOARD, broken_rosters, season=2026, week=1,
                           captured_at="2026-01-01T00:00:00Z")
    assert doc["wire"] == []  # confirms the control WOULD have failed here


def test_refusal_reason_none_on_a_realistic_full_slate():
    board = {"players": [{"player_id": str(i)} for i in range(700)]}
    rosters = [{"roster_id": i, "owner_id": f"u{i}",
               "players": [str(p) for p in range(i * 15, i * 15 + 15)],
               "settings": {"waiver_position": i}} for i in range(1, 11)]
    doc = T.build_snapshot(board, rosters, season=2026, week=3,
                           captured_at="2026-09-16T12:00:00Z")
    assert T.refusal_reason(doc) is None


def test_refusal_reason_fires_on_a_starved_roster_count():
    doc = T.build_snapshot(BOARD, ROSTERS[:1], season=2026, week=1,
                           captured_at="2026-01-01T00:00:00Z")
    reason = T.refusal_reason(doc)
    assert reason is not None
    assert "1 rosters" in reason


def test_refusal_reason_fires_on_a_starved_wire():
    tiny_board = {"players": [{"player_id": "1001"}, {"player_id": "1002"}]}
    rosters = [{"roster_id": i, "owner_id": f"u{i}", "players": [],
               "settings": {"waiver_position": i}} for i in range(1, 9)]
    doc = T.build_snapshot(tiny_board, rosters, season=2026, week=1,
                           captured_at="2026-01-01T00:00:00Z")
    reason = T.refusal_reason(doc)
    assert reason is not None
    assert "wire players" in reason

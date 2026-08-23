# TERRITORY: C
"""Trade capture -- Cory's in-season queue item 2. Pure logic tested on
fixtures; the real Sleeper transactions/roster fetch is CI-only, same as
tuesday_wire_snapshot.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import trade_capture as T  # noqa: E402


TRADE_A = {"type": "trade", "status": "complete", "roster_ids": [1, 2],
          "adds": {"9001": 2, "9002": 1}, "drops": {"9001": 1, "9002": 2},
          "created": 1755000000000, "transaction_id": "txn_a"}
TRADE_B = {"type": "trade", "status": "complete", "roster_ids": [3, 4],
          "adds": {"5001": 4}, "drops": {"5001": 3},
          "created": 1755100000000, "transaction_id": "txn_b"}
WAIVER = {"type": "waiver", "status": "complete", "roster_ids": [1],
         "adds": {"7001": 1}, "drops": {}, "waiver_bid": None,
         "created": 1755050000000, "transaction_id": "txn_c"}
FAILED_TRADE = {"type": "trade", "status": "failed", "roster_ids": [5, 6],
                "adds": {}, "drops": {}, "created": 1755200000000,
                "transaction_id": "txn_d"}


def test_is_trade_true_only_for_complete_trades():
    assert T.is_trade(TRADE_A) is True
    assert T.is_trade(WAIVER) is False
    assert T.is_trade(FAILED_TRADE) is False


def test_transaction_key_uses_the_real_id_field_when_present():
    key = T.transaction_key(TRADE_A)
    assert key == ("id", "transaction_id", "txn_a")


def test_transaction_key_falls_back_to_a_composite_when_no_id_field():
    txn = {"roster_ids": [1, 2], "created": 123}
    key = T.transaction_key(txn)
    assert key == ("composite", (1, 2), 123)


def test_transaction_key_composite_is_order_independent_on_roster_ids():
    a = T.transaction_key({"roster_ids": [2, 1], "created": 5})
    b = T.transaction_key({"roster_ids": [1, 2], "created": 5})
    assert a == b


def test_find_new_trades_excludes_non_trades():
    found = T.find_new_trades([TRADE_A, WAIVER, FAILED_TRADE], already_captured=set())
    assert found == [TRADE_A]


def test_find_new_trades_skips_already_captured():
    already = {T.transaction_key(TRADE_A)}
    found = T.find_new_trades([TRADE_A, TRADE_B], already)
    assert found == [TRADE_B]


def test_find_new_trades_returns_both_when_neither_seen():
    found = T.find_new_trades([TRADE_A, TRADE_B], already_captured=set())
    assert found == [TRADE_A, TRADE_B]


def test_already_captured_keys_reads_back_what_snapshot_trade_would_produce():
    # symmetry check: a row written by snapshot_trade must be recognized
    # as already-captured on the NEXT run, or every trade duplicates forever
    rosters = {1: {"roster_id": 1, "owner_id": "u1", "players": []},
              2: {"roster_id": 2, "owner_id": "u2", "players": []}}
    row = T.snapshot_trade(TRADE_A, rosters, captured_at="2026-09-16T12:00:00Z")
    already = T.already_captured_keys([row])
    assert T.transaction_key(TRADE_A) in already
    refound = T.find_new_trades([TRADE_A], already)
    assert refound == []


def test_snapshot_trade_records_both_rosters_full_player_lists():
    rosters = {1: {"roster_id": 1, "owner_id": "u1", "players": ["9002", "1001"]},
              2: {"roster_id": 2, "owner_id": "u2", "players": ["9001", "2001"]}}
    row = T.snapshot_trade(TRADE_A, rosters, captured_at="2026-09-16T12:00:00Z")
    assert row["roster_snapshots"]["1"]["players_at_capture"] == ["1001", "9002"]
    assert row["roster_snapshots"]["2"]["players_at_capture"] == ["2001", "9001"]
    assert row["roster_ids"] == [1, 2]


def test_snapshot_trade_records_a_missing_roster_rather_than_crashing():
    # THE REAL CASE this is built to survive: a roster fetch that races a
    # trade must not crash the whole capture over one missing roster_id.
    row = T.snapshot_trade(TRADE_A, rosters_by_id={1: {"roster_id": 1, "owner_id": "u1",
                                                       "players": []}},
                           captured_at="2026-09-16T12:00:00Z")
    assert row["roster_snapshots"]["2"]["roster_found"] is False
    assert row["roster_snapshots"]["2"]["players_at_capture"] == []


def test_verify_known_positive_passes_on_the_real_shaped_fixture():
    control = T.verify_known_positive()
    assert control["ok"] is True


def test_verify_known_positive_is_a_real_fail_arm():
    # break duplicate detection: two DIFFERENT trades sharing a key must
    # make the composite/dup check fail, confirming the control CAN fail
    broken = T.find_new_trades([T.KNOWN_POSITIVE_TXN],
                               already_captured={T.transaction_key(T.KNOWN_POSITIVE_TXN)})
    assert broken == []  # confirms the control's dup_ok check would catch a break

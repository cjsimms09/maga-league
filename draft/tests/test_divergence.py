"""Edge map — pure core (room ADP, divergence join, edge summary). No egress.
Run: python -m pytest draft/tests/test_divergence.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_divergence as D  # noqa: E402


def test_room_adp_excludes_keepers_and_means_pick_no():
    picks = [{"player_id": "1", "pick_no": 10, "is_keeper": False},
             {"player_id": "1", "pick_no": 20, "is_keeper": False},
             {"player_id": "2", "pick_no": 5, "is_keeper": True},     # keeper — not a market decision
             {"player_id": "3", "pick_no": 30, "is_keeper": False}]
    r = D.room_adp(picks)
    assert r["1"] == 15.0            # mean of 10 and 20
    assert "2" not in r             # keeper excluded
    assert r["3"] == 30.0


def test_divergence_rows_only_players_in_all_three():
    room = {"1": 30.0, "2": 40.0, "9": 99.0}
    board = {"1": 20, "2": 55}
    realized = {"1": 200, "2": 150}
    rows = {r["player_id"]: r for r in D.divergence_rows(room, board, realized)}
    assert set(rows) == {"1", "2"}                 # 9 absent from board/realized -> dropped
    assert rows["1"]["div"] == 10.0                # room 30 - board 20 = faller (FP likes him more)
    assert rows["2"]["div"] == -15.0               # room 40 - board 55 = reach


def test_edge_summary_detects_board_beating_room_and_faller_edge():
    # Construct: board rank orders realized better than room slot, and fallers out-return reaches.
    # board_rank == realized order (perfect); room slot noisier. All in one slot band (<24? use band=200).
    rows = []
    # players 1..12: realized decreasing with board_rank; room_slot scrambled but fallers (low board
    # rank = good, drafted late by room) carry high realized.
    data = [
        # pid, room_slot, board_rank, realized
        ("a", 100, 1, 300), ("b", 110, 2, 290), ("c", 120, 3, 280),   # board loves, room fades -> fallers, high realized
        ("d", 5, 40, 60), ("e", 8, 42, 50), ("f", 10, 44, 40),        # room reaches early, board hates -> reaches, low realized
        ("g", 50, 20, 150), ("h", 55, 22, 140), ("i", 60, 24, 130),
        ("j", 52, 25, 120), ("k", 58, 27, 110), ("l", 62, 29, 100),
    ]
    rows = [{"player_id": p, "room_slot": rs, "board_rank": br, "div": rs - br, "realized": rz}
            for p, rs, br, rz in data]
    s = D.edge_summary(rows, div_gate=6.0, band=200.0)   # one band so faller/reach compared together
    assert s["board_orders_realized_rho"] > s["room_order_realized_rho"]   # board is the better guide
    assert s["board_beats_room_order"] is True
    assert s["faller_minus_reach_realized_matched"] > 0                    # fallers out-return reaches
    assert "EDGE" in s["reading"]


def test_edge_summary_underpowered_below_10():
    assert D.edge_summary([{"player_id": "1", "room_slot": 1, "board_rank": 1, "div": 0,
                            "realized": 1}])["underpowered"] is True

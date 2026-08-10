"""Keeper-conditional B0 — the need_filter logic (pure, no room sim / no egress).
Run: python -m pytest draft/tests/test_keeper_b0.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_keeper_b0 as KB  # noqa: E402


def P(pos, adp, pid=None):
    return {"player_id": pid or f"{pos}{adp}", "position": pos, "adp": adp}


def test_need_masks_filled_rb_slots_for_corys_keepers():
    # Cory's keepers: 2 RB (Henry, Walker) + 1 WR (Chase). RB starters (2) are FULL.
    roster = [P("RB", 1, "henry"), P("RB", 2, "walker"), P("WR", 3, "chase")]
    board = [P("RB", 10), P("WR", 12), P("QB", 40), P("TE", 50)]
    needed = KB.need_filter(board, roster)
    # RB is full (2/2) and WR has 1/2 -> RB must NOT be in the needed set; WR must be
    assert all(p["position"] != "RB" for p in needed)
    assert any(p["position"] == "WR" for p in needed)
    # b0_need therefore takes the best-ADP NON-RB (the WR at adp 12), not the RB at 10
    pick = KB.candidates()["b0_need"](board, 4, roster)[0]
    assert pick["position"] != "RB"
    # b0_pure would grab the RB at adp 10 (the 4th-RB problem)
    assert KB.candidates()["b0_pure"](board, 4, roster)[0]["position"] == "RB"


def test_need_opens_to_flex_then_bench_when_starters_full():
    # All dedicated starters filled (QB1 RB2 WR2 TE1 K1 DEF1); flex still open.
    roster = ([P("QB", 1)] + [P("RB", 2), P("RB", 3)] + [P("WR", 4), P("WR", 5)]
              + [P("TE", 6), P("K", 7), P("DEF", 8)])
    board = [P("RB", 20), P("WR", 21), P("QB", 9), P("DEF", 30)]
    needed = KB.need_filter(board, roster)
    # flex is RB/WR/TE only -> QB and DEF (dedicated, already full) excluded from flex set
    assert all(p["position"] in KB.CC.FLEX_POS for p in needed)
    # once flex is also full, revert to whole board (bench = best available)
    roster2 = roster + [P("RB", 20)]     # flex now used
    assert KB.need_filter(board, roster2) == board


def test_b0_arms_return_singletons_forcing_the_adp_pick():
    # draft_room selects max(vorp); a singleton forces the ADP choice regardless.
    board = [P("WR", 5), P("RB", 3), P("QB", 8)]
    for pid, p in [("x", P("RB", 3))]:
        pass
    assert len(KB.candidates()["b0_pure"](board, 1, [])) == 1
    assert KB.candidates()["b0_pure"](board, 1, [])[0]["adp"] == 3   # lowest ADP


def test_snake_picks_seat_positions():
    # 10-team snake: seat 1 -> 1,20,21,40,...; seat 10 -> 10,11,30,31,...
    s1 = KB.snake_picks(1, teams=10, rounds=3)
    assert s1 == [1, 20, 21]
    s10 = KB.snake_picks(10, teams=10, rounds=3)
    assert s10 == [10, 11, 30]

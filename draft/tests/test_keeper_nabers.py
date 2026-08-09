"""Keeper-with-Nabers — pure surplus/breakeven core (no board, no MC).
Run: python -m pytest draft/tests/test_keeper_nabers.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_keeper_nabers as KN  # noqa: E402


def test_flat_cost_surplus_matches_first_k_picks():
    # keep 3 costs the first 3 picks' VORP; keep 2 costs the first 2.
    s3, c3 = KN.slate_surplus([100.0, 80.0, 60.0])
    assert c3 == round(sum(KN.ROUND_COST_VORP), 2)
    assert s3 == round(240.0 - sum(KN.ROUND_COST_VORP), 2)
    s2, c2 = KN.slate_surplus([100.0, 80.0])
    assert c2 == round(sum(KN.ROUND_COST_VORP[:2]), 2)


def test_higher_vorp_slate_wins_under_flat_cost():
    # Because cost is player-independent, the higher total-VORP slate always wins at
    # equal k — swapping a high-VORP keeper for a low-VORP one can only lose surplus.
    cand = {
        "Chase": {"position": "WR", "vorp": 115.0},
        "Henry": {"position": "RB", "vorp": 85.0},
        "Walker": {"position": "RB", "vorp": 67.0},
        "Nabers": {"position": "WR", "vorp": 20.0},
    }
    rows = KN.all_slates(cand)
    top = rows[0]
    assert top["slate"] == ["Chase", "Henry", "Walker"]      # the three highest VORP
    # every Nabers keep-3 slate ranks below the current keep-3
    cur = next(r for r in rows if r["slate"] == ["Chase", "Henry", "Walker"])
    for r in rows:
        if r["k"] == 3 and r["has_nabers"]:
            assert r["surplus"] < cur["surplus"]


def test_breakeven_is_the_displaced_players_vorp():
    cand = {"Chase": {"position": "WR", "vorp": 115.0},
            "Henry": {"position": "RB", "vorp": 85.0},
            "Walker": {"position": "RB", "vorp": 67.0},
            "Nabers": {"position": "WR", "vorp": 20.0}}
    be = KN.nabers_breakevens(cand)
    # under flat cost, Nabers must simply out-VORP the man he replaces
    assert be["displace_Walker"] == 67.0
    assert be["displace_Henry"] == 85.0
    assert be["current_nabers_vorp"] == 20.0


def test_keep_none_is_zero_surplus_baseline():
    cand = {"A": {"position": "WR", "vorp": 10.0}}
    rows = KN.all_slates(cand)
    keep_none = next(r for r in rows if r["k"] == 0)
    assert keep_none["surplus"] == 0.0 and keep_none["cost_vorp"] == 0.0

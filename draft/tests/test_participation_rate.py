"""Participation rate — pure flip logic + reading classification. No egress.
Run: python -m pytest draft/tests/test_participation_rate.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_participation_rate as PR  # noqa: E402
import exp_participation as P  # noqa: E402


def _board():
    # two RBs close in VORP; #2 has the far bigger ceiling gap. A ceiling weight big enough
    # should flip the argmax from the higher-VORP one to the higher-ceiling one.
    return [
        {"player_id": "A", "position": "RB", "team": "KC", "vorp": 50, "proj_mean": 250,
         "proj_ceiling": 260, "weekly_sd": 6, "tier_drop": 5, "bye": 6},
        {"player_id": "B", "position": "RB", "team": "SF", "vorp": 48, "proj_mean": 240,
         "proj_ceiling": 360, "weekly_sd": 14, "tier_drop": 5, "bye": 9},
    ]


def test_no_flip_at_zero_weight():
    st = P.board_stats(_board())
    flipped, gap, vcost = PR.flip_at(_board(), [], "ceiling", 0.0, st)
    assert flipped is False and vcost == 0.0        # term off → core pick stands


def test_big_ceiling_weight_flips_and_costs_vorp():
    st = P.board_stats(_board())
    flipped, gap, vcost = PR.flip_at(_board(), [], "ceiling", 5.0, st)
    assert flipped is True                            # huge ceiling weight overrides the 2-VORP gap
    assert vcost == 2.0                               # A(50) - B(48) VORP given up


def test_flip_needs_two_candidates():
    st = P.board_stats(_board())
    flipped, gap, vcost = PR.flip_at(_board()[:1], [], "ceiling", 5.0, st)
    assert flipped is False                           # a single candidate cannot flip


def test_reading_calls_high_default_rate_a_real_null():
    rows = [{"term": "need", "weight": 0.5, "flip_rate": 0.30},
            {"term": "need", "weight": 3.0, "flip_rate": 0.55}]
    assert "REAL null" in PR._reading(rows)


def test_reading_calls_low_default_high_top_a_scale_finding():
    rows = [{"term": "ceiling", "weight": 0.65, "flip_rate": 0.03},
            {"term": "ceiling", "weight": 3.0, "flip_rate": 0.40}]
    assert "SCALE finding" in PR._reading(rows)


def test_reading_calls_inert_everywhere():
    rows = [{"term": "bye", "weight": 1.0, "flip_rate": 0.01},
            {"term": "bye", "weight": 3.0, "flip_rate": 0.04}]
    assert "near-inert" in PR._reading(rows)

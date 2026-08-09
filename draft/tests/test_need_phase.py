"""Need-by-phase factorial — pure need_signal + phase_weight.
Run: python -m pytest draft/tests/test_need_phase.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_need_phase as NP  # noqa: E402


def test_need_signal_starter_flex_bench():
    # empty roster: any starter position is full need
    assert NP.need_signal({"position": "RB"}, []) == 1.0
    # both RB starter slots filled, flex still open -> RB is flex depth (0.5)
    roster = [{"position": "RB"}, {"position": "RB"}]
    assert NP.need_signal({"position": "RB"}, roster) == 0.5
    # flex consumed too (3rd RB) -> a 4th RB is bench (0.0) — the 4th-RB trap gets no need
    roster3 = [{"position": "RB"}, {"position": "RB"}, {"position": "RB"}]
    assert NP.need_signal({"position": "RB"}, roster3) == 0.0
    # QB starter open -> full need
    assert NP.need_signal({"position": "QB"}, []) == 1.0


def test_phase_weight_matches_auto_ramp():
    assert NP.phase_weight(1) == 0.35 and NP.phase_weight(2) == 0.35   # Anchor
    assert NP.phase_weight(3) == 0.9 and NP.phase_weight(6) == 0.9     # Build
    assert NP.phase_weight(7) == 1.45 and NP.phase_weight(10) == 1.45  # Fill
    assert NP.phase_weight(11) == 1.3 and NP.phase_weight(15) == 1.3   # Endgame


def test_round_of_maps_pick_to_round():
    my_picks = [34, 41, 54]   # rounds 4, 5, 6 at 10 teams
    assert NP._round_of(1, my_picks) == 4
    assert NP._round_of(2, my_picks) == 5
    assert NP._round_of(3, my_picks) == 6

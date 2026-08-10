"""Inverse-adjuster mechanics. Run: python -m pytest draft/tests/test_inverse_adjuster.py -q

Pins the parts that make the recoverability claim honest: VORP is points-over-positional-
replacement (so the target is value, not raw points that always crown a QB), and K/DEF are
excluded from the scored targets (unforecastable noise, the injury-analog).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_inverse_adjuster as E  # noqa: E402


def test_vorp_is_over_positional_replacement():
    # 3 RBs, replacement rank for RB is 25 -> with <25 RBs, replacement = worst RB present.
    realized = {"rb1": 300.0, "rb2": 200.0, "rb3": 100.0, "qb1": 400.0}
    positions = {"rb1": "RB", "rb2": "RB", "rb3": "RB", "qb1": "QB"}
    v = E._realized_vorp(realized, positions)
    # RB replacement = worst present RB (100) -> rb1 vorp = 200; qb replacement = qb1 itself (only QB)
    assert v["rb1"] == 200.0
    assert v["rb3"] == 0.0
    # a lone QB is its own replacement -> vorp 0, so raw-point QB dominance is removed
    assert v["qb1"] == 0.0


def test_replacement_uses_the_configured_rank_when_enough_players():
    # 12 WRs; replacement rank 25 not reached -> worst present is replacement.
    realized = {f"w{i}": float(300 - i * 10) for i in range(12)}
    positions = {f"w{i}": "WR" for i in range(12)}
    v = E._realized_vorp(realized, positions)
    worst = min(realized.values())
    assert v["w0"] == round(realized["w0"] - worst, 1)


def test_skill_and_kdef_constants_present():
    # the injury-analog: K/DEF are not skill targets
    assert "K" not in E.SKILL and "DEF" not in E.SKILL
    assert set(E.SKILL) == {"QB", "RB", "WR", "TE"}


def test_rank_of_helper():
    order = ["a", "b", "c"]
    assert E._rank_of("a", order) == 1
    assert E._rank_of("c", order) == 3
    assert E._rank_of("z", order) is None

"""Participation regional disaggregation — pure verdict logic + band gating.
Run: python -m pytest draft/tests/test_participation_regional.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_participation_regional as R  # noqa: E402


def _cell(edge, lo, hi):
    return {"edge": edge, "ci95": [lo, hi], "separable": bool(lo > 0 or hi < 0)}


def test_verdict_flags_buried_lead():
    cells = {"early": _cell(-50, -80, -20), "mid": _cell(40, 10, 70), "late": _cell(0, -20, 20)}
    assert "STRUCTURE" in R._verdict(cells)               # +ve band + -ve band = pooled buried a lead


def test_verdict_uniform_harm_stands():
    cells = {"early": _cell(-50, -80, -20), "mid": _cell(-40, -70, -10), "late": _cell(-30, -55, -5)}
    assert "uniformly hurts" in R._verdict(cells)          # all bands -ve => pooled 'drop it' stands


def test_verdict_flat_is_no_structure():
    cells = {"early": _cell(5, -10, 20), "mid": _cell(-4, -20, 12), "late": _cell(2, -15, 19)}
    assert "no regional structure" in R._verdict(cells)


def test_verdict_earns_only_in_a_band():
    cells = {"early": _cell(30, 8, 55), "mid": _cell(4, -12, 20), "late": _cell(-2, -18, 14)}
    assert "earns only in" in R._verdict(cells)


def test_bands_cover_corys_pick_rounds():
    # Cory picks rounds 4-15 (no 1-3); the bands must partition that with no gap/overlap.
    covered = set()
    for lo, hi in R.BANDS.values():
        covered |= set(range(lo, hi + 1))
    assert covered == set(range(4, 16))                    # rounds 4..15 exactly

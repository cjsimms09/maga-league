# TERRITORY: A
"""THE VERDICT THAT COULD NOT FAIL — register 19b, guarded so it cannot come back.

`exp_fp_board_coverage.py` emitted, for ANY value of rho:

    f"rho={rho} vs FFC means the swap MOVES picks (not cosmetic)."

No branch, so every correlation produced the same sentence — and the reading was
BACKWARDS: rho = 1.0 is identical ordering, i.e. maximally cosmetic. The probe
that wrote it had measured rho = 1.0000 (register 19: it compared FantasyPros to
FantasyPros), so the single number it ever printed was the one its own sentence
described worst.

⚠️ THE TEST THAT MATTERS HERE IS NOT "the strings are nice". It is that the
function DISCRIMINATES — a four-branch replacement that happened to return the
same text for every input would be the original defect wearing a `def`. So the
arms are asserted DISTINCT, and the DIRECTION (higher rho = less movement) is
asserted as an ordering rather than as four separate string matches.

Run: python -m pytest draft/tests/test_rho_reading.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import exp_fp_board_coverage as X  # noqa: E402


def test_the_four_branches_are_actually_four_different_answers():
    """CONTROL — a branchless rewrite would pass every other test in this file."""
    said = [X.rho_reading(r) for r in (1.0, 0.97, 0.85, 0.4)]
    assert len(set(said)) == 4, said


def test_identical_ordering_reads_as_COSMETIC_which_is_the_reversal():
    """The original said rho = 1.0 "MOVES picks". It is the opposite."""
    s = X.rho_reading(1.0)
    assert "COSMETIC" in s
    assert "MOVES" not in s.replace("cannot move", "")
    #: and it must warn that 1.0 is what a self-comparison produces — the defect
    #: that generated this number in the first place.
    assert "register 19" in s


def test_a_real_disagreement_reads_as_MOVING_picks():
    assert "MOVES picks" in X.rho_reading(0.85)
    assert "DISAGREE" in X.rho_reading(0.4)


def test_a_missing_rho_is_a_missing_MEASUREMENT_not_a_null_result():
    """Rule 3e in one string: 'we could not compute it' must never read like an
    answer."""
    s = X.rho_reading(None)
    assert "NOTHING is known" in s
    assert "not a null result" in s


def test_the_direction_is_monotone_higher_rho_means_less_movement():
    """The claim under the branches, asserted as an ORDERING so it cannot drift
    into four independently-edited strings that stop agreeing with each other."""
    rank = {}
    for r in (1.0, 0.97, 0.85, 0.4):
        s = X.rho_reading(r)
        if "COSMETIC" in s:
            rank[r] = 0
        elif "only at the margins" in s:
            rank[r] = 1
        elif "MOVES picks" in s:
            rank[r] = 2
        elif "DISAGREE" in s:
            rank[r] = 3
        else:
            raise AssertionError(f"rho={r} landed in no known branch: {s}")
    ordered = [rank[r] for r in (1.0, 0.97, 0.85, 0.4)]
    assert ordered == sorted(ordered), rank
    assert len(set(ordered)) == 4, rank


def test_the_boundaries_are_where_the_constants_say_they_are():
    """FAIL ARM on the thresholds themselves: a constant edited without the
    branches being re-read would silently move the reading of a real number."""
    assert "COSMETIC" in X.rho_reading(X.RHO_IDENTICAL)
    assert "COSMETIC" not in X.rho_reading(X.RHO_IDENTICAL - 0.001)
    assert "margins" in X.rho_reading(X.RHO_NEAR)
    assert "margins" not in X.rho_reading(X.RHO_NEAR - 0.001)
    assert "MOVES picks" in X.rho_reading(X.RHO_MODERATE)
    assert "MOVES picks" not in X.rho_reading(X.RHO_MODERATE - 0.001)

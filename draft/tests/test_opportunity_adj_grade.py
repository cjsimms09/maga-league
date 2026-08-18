# TERRITORY: A
"""OPPORTUNITY-ADJ grading mechanics, tested offline.

The load-bearing claims of the study are mechanical, so they are pinned here
rather than trusted: the restated adjustment line IS the shipped one; the
leak guard actually raises; the rank-surrogate control is EXACTLY order-
preserving (so its Delta-rho is identically zero and the study must not read
that as evidence); and the rank statistics agree with hand-computed values.

Run: python3 -m pytest draft/tests/test_opportunity_adj_grade.py -q
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "backtest"))

import projections as P                      # noqa: E402  the SHIPPED module
import opportunity_adj_grade as G            # noqa: E402


# ── the restated line is the shipped line ────────────────────────────────────
@pytest.mark.parametrize("z", [-9.0, -2.5, -2.0, -1.0, -0.001, 0.0, 0.5, 1.0,
                               1.999, 2.0, 2.5, 40.0])
def test_restated_adjustment_equals_the_shipped_blend_line(z):
    """`_adj` restates draft/projections.py:blend's `adj = max(-cap, min(cap,
    (z/2)*cap))`. Proven against blend() itself, not against a copy of it."""
    cap = G.CAP
    players = [{"player_id": "p1", "position": "WR"}]
    metrics = {"p1": {"wopr": 1.0}}

    # blend() takes z through composite_z, so drive it with a stub that returns
    # exactly the z under test.
    real = P.composite_z
    P.composite_z = lambda m, pl: {"p1": z}
    try:
        out = P.blend(players, {"p1": 100.0}, metrics, {"opportunity_cap": cap})
    finally:
        P.composite_z = real
    assert out[0]["opportunity_adj"] == pytest.approx(round(G._adj(z, cap), 4))
    assert out[0]["proj_mean"] == pytest.approx(round(100.0 * (1 + G._adj(z, cap)), 2))


def test_the_cap_binds_both_ways():
    assert G._adj(100.0) == G.CAP
    assert G._adj(-100.0) == -G.CAP
    assert G._adj(2.0) == pytest.approx(G.CAP)
    assert G._adj(0.0) == 0.0


# ── the leak guard is a guard, not a comment ─────────────────────────────────
def test_leak_guard_refuses_a_prior_at_or_after_the_graded_season():
    G._assert_no_leak(2025, [2024, 2023], [2024, 2023])          # fine
    with pytest.raises(AssertionError):
        G._assert_no_leak(2025, [2025, 2024], [2024])
    with pytest.raises(AssertionError):
        G._assert_no_leak(2025, [2024], [2026])


# ── the surrogate control is order-preserving BY CONSTRUCTION ────────────────
def test_rank_surrogate_cannot_change_spearman_and_the_study_must_say_so():
    """Assigning the adjustment's magnitudes in descending baseline order makes
    base x (1+s) a strictly increasing function of base, so Spearman is
    unchanged to floating point. Its ~0.0000 cell is therefore a definition,
    never a measurement — pinned so nobody later reads it as evidence."""
    import random
    rng = random.Random(7)
    rows = []
    for i in range(60):
        b = 50.0 + 4.0 * i
        rows.append((str(i), b, rng.uniform(-0.07, 0.15), rng.uniform(0, 400), 0.0))
    cell = G.grade_cell(rows, rng)
    assert cell["rank_surrogate"]["spearman"] == pytest.approx(cell["base"]["spearman"], abs=1e-12)


def test_a_multiplicative_adjustment_can_never_move_a_zero_baseline():
    """The shipped form is multiplicative: a player the baseline scores at 0
    stays at 0 no matter how much opportunity he had. Structural, and it is why
    rookies are untouchable by this layer."""
    assert 0.0 * (1 + G._adj(2.0)) == 0.0


# ── rank statistics ─────────────────────────────────────────────────────────
def test_spearman_matches_hand_computed_values():
    assert G.spearman([1, 2, 3, 4], [1, 2, 3, 4]) == pytest.approx(1.0)
    assert G.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == pytest.approx(-1.0)
    # tied ranks are averaged
    assert G.spearman([1, 1, 2], [1, 2, 3]) == pytest.approx(0.8660254, abs=1e-6)


def test_partial_spearman_removes_the_control():
    xs = [1, 2, 3, 4, 5, 6, 7, 8]
    assert G.partial_spearman(xs, xs, xs) is None or abs(G.partial_spearman(xs, xs, xs)) < 1e-9


def test_precision_at_k_is_none_when_the_population_is_smaller_than_k():
    assert G.precision_at([3, 2, 1], [1, 2, 3], 12) is None
    assert G.precision_at([3, 2, 1], [3, 2, 1], 2) == 1.0
    assert G.precision_at([3, 2, 1], [1, 2, 3], 1) == 0.0


def test_mae_and_bias_are_signed_the_way_the_prereg_declares():
    assert G.mae([10, 20], [12, 18]) == pytest.approx(2.0)
    assert G.bias([10, 20], [12, 18]) == pytest.approx(0.0)
    assert G.bias([14, 24], [12, 18]) == pytest.approx(4.0)   # arm over realized


# ── the QB/K/DEF hole is structural, and that is a finding ───────────────────
def test_composite_z_gives_QB_K_and_DEF_no_adjustment_at_all():
    """`composite_z` computes a composite for WR/TE and RB only. Every other
    position falls through `continue` and gets z=0 -> adj=0. Pinned because the
    study's cross-position level finding rests on it."""
    players = [{"player_id": str(i), "position": pos}
               for i, pos in enumerate(["QB", "K", "DEF", "WR", "RB", "TE"])]
    metrics = {str(i): {"wopr": 0.5, "opportunity_share": 0.2, "rz_share": 0.3}
               for i in range(6)}
    z = P.composite_z(metrics, players)
    assert "0" not in z and "1" not in z and "2" not in z
    assert {"3", "4", "5"} <= set(z)

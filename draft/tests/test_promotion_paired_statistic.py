"""Tests for draft/audit/promotion_paired_statistic_2026-08-21.py — register
211's proposed promotion statistic.

The load-bearing tests here are the ones that could FAIL if the statistic were
broken in the way that matters. A test that only checks the script runs would
have passed on the first version of A's sibling probe, which had its
known-positive arm secretly WORSE than the champion.
"""
from __future__ import annotations

import importlib.util
import random
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "paired", ROOT / "draft" / "audit" / "promotion_paired_statistic_2026-08-21.py")
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)


# ── the pairing itself ────────────────────────────────────────────────────

def test_KNOWN_POSITIVE_a_uniformly_better_candidate_gives_positive_week_means():
    champ = [[5.0] * 10 for _ in range(4)]
    cand = [[3.0] * 10 for _ in range(4)]
    means = M.paired_week_means(champ, cand, 4)
    assert all(abs(m - 2.0) < 1e-9 for m in means), means


def test_KNOWN_NEGATIVE_two_identical_arms_give_exactly_zero():
    """If the pairing ever stopped subtracting the same player from himself,
    identical arms would drift off zero and every p below would be noise."""
    champ = [[1.0, 7.0, 3.0], [2.0, 9.0, 4.0]]
    means = M.paired_week_means(champ, [r[:] for r in champ], 2)
    assert means == [0.0, 0.0]


def test_the_pairing_CANCELS_a_shared_weekly_shock():
    """The whole argument for pairing. Add an arbitrary common shock to both
    arms and the paired difference must not move at all."""
    rng = random.Random(1)
    champ = [[rng.random() for _ in range(50)] for _ in range(5)]
    cand = [[v - 0.3 for v in wk] for wk in champ]
    base = M.paired_week_means(champ, cand, 5)
    shocked_c = [[v + 100.0 for v in wk] for wk in champ]
    shocked_x = [[v + 100.0 for v in wk] for wk in cand]
    got = M.paired_week_means(shocked_c, shocked_x, 5)
    # a TOLERANCE, not equality: (v+100)-(w+100) is not bit-identical to v-w in
    # floating point, and asserting == here failed on exactly that. The claim
    # is that the shock cancels, not that IEEE754 is associative.
    assert all(abs(g - b) < 1e-9 for g, b in zip(got, base)), (got, base)


# ── the sign-flip test ────────────────────────────────────────────────────

def test_sign_flip_returns_1_when_the_candidate_is_WORSE():
    rng = random.Random(2)
    assert M.sign_flip_p([-1.0, -2.0, -0.5], rng, 200) == 1.0


def test_sign_flip_is_SMALL_for_a_consistent_positive_effect():
    rng = random.Random(3)
    p = M.sign_flip_p([0.5] * 12, rng, 2000)
    assert p < 0.01, p


def test_sign_flip_is_LARGE_for_an_inconsistent_one_of_the_same_mean():
    """Same mean, opposite consistency. A test that could not tell these two
    apart would be measuring the mean and calling it evidence."""
    rng = random.Random(4)
    noisy = [6.5, -5.5, 6.5, -5.5, 6.5, -5.5, 6.5, -5.5, 6.5, -5.5, 6.5, -5.5]
    assert abs(st.mean(noisy) - 0.5) < 1e-9
    assert M.sign_flip_p(noisy, rng, 2000) > 0.05


def test_weeks_are_flipped_as_BLOCKS_not_players():
    """Players inside a week are NOT exchangeable — a weird slate moves them
    together. `sign_flip_p` must take one number per week, so there is no
    player-level permutation available to get wrong."""
    import inspect
    src = inspect.getsource(M.sign_flip_p)
    assert "week_means" in src
    assert "shuffle" not in src, "a player-level shuffle would inflate every p"


# ── the graded claim, pinned ──────────────────────────────────────────────

def test_the_shipped_baseline_is_quoted_not_remembered():
    """C4 compares against A's measured numbers. If these drift from the
    audit they came from, the comparison silently changes meaning."""
    assert M.SHIPPED_NULL_GATED == 0.179
    assert M.SHIPPED_POWER_15 == 0.227
    assert abs(M.SHIPPED_SEPARATION - 0.048) < 1e-9


def test_the_probe_REFUSES_when_the_known_positive_is_not_detected(monkeypatch, capsys):
    """C4 must be able to fail. Make every arm identical and the statistic
    detects nothing — the script must refuse rather than print a table."""
    monkeypatch.setattr(M, "rate", lambda *a, **k: 0.02)
    assert M.main(["--quick"]) == 1
    out = capsys.readouterr().out
    assert "REFUSING" in out
    assert "does not exceed" in out or "does not beat" in out


def test_the_edge_is_a_SCALE_reduction_not_a_mean_shift():
    """The bug A's own known-positive caught in her first version: drawing the
    better arm as abs(N(-d, 1)) makes it SECRETLY WORSE, because folding a
    shifted normal through abs() raises its mean. Here the edge must lower the
    mean absolute error, monotonically."""
    rng = random.Random(7)
    means = []
    for scale in (1.0, 0.8, 0.5):
        _c, x = M.season_errors(rng, scale)
        means.append(st.mean(v for wk in x for v in wk))
    assert means[0] > means[1] > means[2], means

"""The many-worlds simulator's controls must FIRE — identity equals the
certified money grade, conservation catches a leaking world, and a
substituted super-seat must dominate (the known-positive that proves the
substitute path can move a probability at all)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import money_grade as MG  # noqa: E402
import season_forward_sim as S  # noqa: E402

HISTORY = MG.load_history()
PAYOUTS = MG.load_payouts()
SEASONS = [str(s.get("season")) for s in HISTORY["seasons"]
           if len(MG.playoff_placements(s)) >= MG.PLAYOFF_TEAMS]


def test_identity_world_reproduces_grade_actual_every_season():
    for y in SEASONS:
        assert S.identity_check(HISTORY, PAYOUTS, y)["ok"]


def test_playoff_probability_sums_to_four_seats():
    doc = S.simulate(HISTORY, PAYOUTS, SEASONS[0], n_worlds=60)
    total = sum(c["p_playoffs"] for c in doc["per_roster"].values())
    # each p is rounded to 4 decimals in the artifact -> 10 seats can drift
    # the sum by at most 0.0005 from the exact invariant
    assert abs(total - MG.PLAYOFF_TEAMS) < 0.001


def test_worlds_actually_vary():
    """Movement positive control: resampled worlds must not all collapse to
    the realized outcome — a sim frozen on one world is the replay again."""
    y = SEASONS[0]
    actual = MG.grade_actual(HISTORY, PAYOUTS, y)
    doc = S.simulate(HISTORY, PAYOUTS, y, n_worlds=60)
    p = [c["p_playoffs"] for c in doc["per_roster"].values()]
    assert any(0.0 < x < 1.0 for x in p), (
        "every playoff probability is 0 or 1 — the worlds are not varying")
    moved = sum(1 for rid, c in doc["per_roster"].items()
                if abs(c["E_total"]["mean"]
                       - actual["per_roster"][rid]["total"]) > 1.0)
    assert moved >= 3


def test_FAIL_ARM_broken_bracket_is_refused(monkeypatch):
    real = S.MG.simulate_bracket
    monkeypatch.setattr(S.MG, "simulate_bracket",
                        lambda *a, **k: dict(list(real(*a, **k).items())[:3]))
    with pytest.raises(AssertionError, match="bracket had 3 seats"):
        S.simulate(HISTORY, PAYOUTS, SEASONS[0], n_worlds=3)


def test_FAIL_ARM_leaking_money_is_refused(monkeypatch):
    """Conservation: a payout path that leaks per-world must be caught, not
    averaged away. Leak only in worlds where roster seed 1 wins the pot."""
    real = S.MG.playoff_dollars

    def leaky(placements, pay, rid):
        v = real(placements, pay, rid)
        return v + 1.0 if placements.get(rid) == 1 and rid % 2 else v
    monkeypatch.setattr(S.MG, "playoff_dollars", leaky)
    with pytest.raises(AssertionError, match="money not conserved"):
        S.simulate(HISTORY, PAYOUTS, SEASONS[0], n_worlds=40)


def test_substituted_super_seat_dominates():
    """Known positive for the substitute path: a seat scoring 250 every week
    must make the playoffs in essentially every world."""
    y = SEASONS[0]
    s = MG.season_of(HISTORY, y)
    rid = sorted({r for wk in MG.field_weekly_scores(s).values()
                  for r in wk})[0]
    weekly = {w: 250.0 for w in range(1, 18)}
    doc = S.simulate(HISTORY, PAYOUTS, y, n_worlds=60,
                     substitute=(rid, weekly))
    cell = doc["per_roster"][rid]
    assert cell["p_playoffs"] > 0.99
    assert cell["E_total"]["mean"] > 500

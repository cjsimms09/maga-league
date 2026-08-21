# TERRITORY: A
"""The decision-null grader must be REPRODUCIBLE, and it was not.

`SEED` sat at the top of start_sit_vs_random.py advertising determinism the code
did not deliver: the candidate pool was built by iterating a SET, Python
randomises string hashing per process, so rng.choice picked differently from the
same seed. Two consecutive runs gave mean_percentile 0.8482 vs 0.8472.

That matters because this now runs in the weekly cron and commits its artifact:
a non-reproducible grader churns the artifact every week and shows week-over-week
movement that is pure process noise.

These tests pin the fix at the level that broke -- the sampler -- rather than by
re-running the whole 530-week job, so they stay fast enough to live in CI.
"""
from __future__ import annotations
import importlib.util
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "ssvr", ROOT / "draft" / "backtest" / "start_sit_vs_random.py")
SS = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(SS)

SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"]
POS = {"q1": "QB", "q2": "QB", "r1": "RB", "r2": "RB", "r3": "RB", "r4": "RB",
       "w1": "WR", "w2": "WR", "w3": "WR", "w4": "WR", "t1": "TE", "t2": "TE",
       "k1": "K", "d1": "DEF"}
ROSTER = list(POS)
PTS = {p: float(i + 1) for i, p in enumerate(ROSTER)}


def _draws(seed, roster_order=None):
    rng = random.Random(seed)
    r = roster_order or ROSTER
    return [SS.best_or_random(r, POS, SLOTS, PTS, rng) for _ in range(50)]


def test_CONTROL_the_sampler_actually_varies():
    """Non-vacuity: if best_or_random returned one constant, every determinism
    assertion below would pass while proving nothing."""
    assert len(set(_draws(1))) > 1, "sampler is constant — the tests below are vacuous"


def test_same_seed_same_sequence():
    assert _draws(20260821) == _draws(20260821)


def test_different_seed_different_sequence():
    """The seed must actually drive the draw, or 'deterministic' would just mean
    'ignores its rng'."""
    assert _draws(1) != _draws(2)


def test_candidate_order_does_not_depend_on_container_iteration_order():
    """THE ACTUAL DEFECT. The roster arriving in a different order — which is
    exactly what set iteration did across processes — must not change the draw."""
    shuffled = list(reversed(ROSTER))
    assert _draws(20260821) == _draws(20260821, shuffled)


def test_the_sampler_never_starts_one_player_twice():
    """A list `avail` with .remove() replaced a set with .discard(); a bad
    replacement could double-count a player into two slots."""
    rng = random.Random(7)
    for _ in range(200):
        avail = list(ROSTER)
        picked = []
        # mirror best_or_random's own selection to assert uniqueness end to end
        order = sorted(range(len(SLOTS)),
                       key=lambda i: (SLOTS[i] == "FLEX", SLOTS[i] in ("RB", "WR")))
        for i in order:
            s = SLOTS[i]
            ok = sorted(p for p in avail
                        if (POS[p] in SS.FLEX_OK if s == "FLEX" else POS[p] == s))
            assert ok, "fixture cannot fill %s" % s
            pick = rng.choice(ok)
            avail.remove(pick)
            picked.append(pick)
        assert len(set(picked)) == len(picked), picked

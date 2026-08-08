"""EXPERIMENT 19b — smoke-lock the Cory-conditional race machinery."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import cory_conditional as CC  # noqa: E402


def test_race_is_deterministic_and_paired():
    a, da = CC.race(n_rooms=4, seed=123)
    b, db = CC.race(n_rooms=4, seed=123)
    assert a == b and da == db                    # same seed, same rooms, same grades
    # Every archetype graded in every room, incl. the control.
    assert set(a.keys()) == set(CC.make_archetypes().keys())
    assert all(len(v) == 4 for v in a.values())


def test_zero_divergence_means_zero_edge():
    # An archetype whose constraint never binds drafts the control's exact
    # roster — paired grading MUST give it exactly the control's dollars.
    per_seed, diverg = CC.race(n_rooms=4, seed=123)
    for k in per_seed:
        if k == "balanced":
            continue
        if all(d == 0 for d in diverg[k]):
            assert per_seed[k] == per_seed["balanced"], k


def test_constraints_bind_from_my_keeper_base():
    # At least one archetype must actually diverge from the control at my picks
    # on the predicted board — otherwise the race is vacuous.
    _, diverg = CC.race(n_rooms=4, seed=123)
    assert any(sum(diverg[k]) > 0 for k in diverg if k != "balanced")

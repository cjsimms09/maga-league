# TERRITORY: D
"""THE ORACLE SWEEP'S CONTROL HELD, AND ITS VERDICT MATCHES ITS OWN GRID.

DEFECT GUARDED: register 18b -- exp_weekly_env.py's `DAMPENING = (1.0, 0.5)`
put the game-total oracle's optimum at the GRID MINIMUM, so the published
"+0.228 ceiling" was a floor on the ceiling and nobody had looked below 0.5.

Two shapes are pinned, and they fail for different reasons on purpose:

  1. INTERNAL (always in the gate) -- the committed artifact must be
     self-consistent: the verdict must follow from the grid it reports, the
     recorded best lambda must actually be the argmax, and the reproduction
     control must be recorded as passed. Pure logic over one committed file.

  2. REPRODUCTION (repo_parity) -- re-derives the two published lambdas from
     A's exp_weekly_env.json. If A regenerates that artifact this goes red,
     and correctly so: the conclusion would then rest on a superseded
     reproduction. Its failure says the REPO STATE is new, never that the
     candidate board is bad.

draft/audit/oracle_lambda_row18b_2026-08-18.md
Run: python -m pytest draft/tests/test_oracle_lambda_sweep.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SWEEP = ROOT / "draft" / "backtest" / "oracle_lambda_sweep.json"
PUBLISHED = ROOT / "draft" / "backtest" / "exp_weekly_env.json"

#: The prereg's verdict table, restated as code so "INTERIOR" cannot drift into
#: meaning something the prereg did not say.
def _verdict_for(lam: float) -> str:
    return ("MONOTONE-TO-ZERO" if lam <= 0.05
            else "AT-OR-ABOVE-1" if lam >= 1.0
            else "INTERIOR")


def _sweep() -> dict:
    return json.loads(SWEEP.read_text())


def test_the_recorded_control_passed():
    """A VOID run may not be reported as a finding."""
    control = _sweep()["reproduction_control"]
    assert control["passed"], [c for c in control["checks"] if not c["ok"]]
    assert len(control["checks"]) == 6, control["checks"]


def test_the_best_lambda_is_the_argmax_of_the_grid_it_reports():
    """The claim of an interior optimum, checked against the curve beside it."""
    sweep = _sweep()
    for season, arms in sweep["seasons"].items():
        curve = arms["reproduction"]["delta_mae"]
        argmax = max(curve, key=lambda k: curve[k])
        assert arms["reproduction"]["best_lambda"] == argmax, (season, argmax)
        assert float(argmax) == float(sweep["best_lambda_by_season"][int(season)
                                      if int(season) in sweep["best_lambda_by_season"]
                                      else season])


def test_the_verdict_follows_the_preregistered_table():
    sweep = _sweep()
    bests = {float(v) for v in sweep["best_lambda_by_season"].values()}
    expected = "DISAGREE" if len(bests) > 1 else _verdict_for(next(iter(bests)))
    assert sweep["verdict"] == expected, (sweep["verdict"], expected, bests)


def test_zero_lambda_is_exactly_zero():
    """CONTROL -- lambda=0 is the baseline by construction.

    If this is not 0.0000 the projection arithmetic is wrong and every other
    number in the file is meaningless, whatever the verdict says.
    """
    for arms in _sweep()["seasons"].values():
        for pop in ("reproduction", "strict"):
            assert arms[pop]["delta_mae"]["0.00"] == 0.0, pop


def test_the_corrected_ceiling_beats_the_published_one():
    """The whole point of register 18b: 0.50 was the grid MINIMUM.

    Also a known-positive control on the sweep -- if extending the grid could
    not improve on the old endpoint, the study found nothing and should not be
    reporting a correction.
    """
    sweep = _sweep()
    pooled = sweep["pooled_delta_mae"]
    assert pooled[sweep["pooled_best_lambda"]] > pooled["0.50"], pooled
    assert pooled["0.50"] == pytest.approx(sweep["published_pooled_at_0.5"], abs=1e-4)


def test_the_asymmetry_is_recorded_on_both_sides():
    """Section 3 of the audit doc rests on this; an absent side would make the
    5-10x claim a comparison against nothing."""
    for arms in _sweep()["seasons"].values():
        asym = arms["reproduction"]["asymmetry"]
        assert set(asym) == {"m_above_1", "m_below_1"}, asym
        assert all(side["n"] > 500 for side in asym.values()), asym


@pytest.mark.repo_parity  # re-derives against A's artifact, which A may regenerate
def test_the_published_lambdas_still_reproduce():
    published = json.loads(PUBLISHED.read_text())
    sweep = _sweep()
    checked = 0
    for season, arms in published["seasons"].items():
        for key, entry in arms["arms"].items():
            if not key.startswith("oracle_total@"):
                continue
            lam = float(key.split("@")[1])
            got = sweep["seasons"][season]["reproduction"]["delta_mae"][f"{lam:.2f}"]
            assert got == pytest.approx(entry["delta_mae"], abs=0.001), (season, key)
            checked += 1
    assert checked == 4, f"expected 4 published oracle cells, found {checked}"

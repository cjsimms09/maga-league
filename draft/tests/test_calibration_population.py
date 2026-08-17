# TERRITORY: C
"""THE CALIBRATION MUST BE FITTED ON PLAYERS THIS LEAGUE ACTUALLY ROSTERS.

⚠️ THREE OF THESE ARE `repo_parity` AND ARE RED RIGHT NOW, DELIBERATELY.
They fail on the COMMITTED ARTIFACT, which is contaminated — that is a fact
about repository STATE, not about the code, which is exactly what `repo_parity`
means here. The artifact cannot simply be reverted: `f774ff21` rebuilt
`public/draft_data.json` and rewrote two test files to match it, so the
calibration, the board and the tests are a matched trio. Un-matching one of
them (the relay tried) turns `main` red without improving a single number on
Cory's board.

The fix is to regenerate CLEANLY and rebuild the board — which needs egress and
therefore a dispatch. `test_the_driver_still_passes_the_filter` is NOT marked,
and blocks, because it guards the cause rather than the symptom.

Register 4r, 2026-08-17. `draft/backtest/cli.py` called `PE.calibrate()` without
`positions`, and `error_rows(..., positions=None)` means NO FILTER. The 22:11
regeneration (1c8bfb90) therefore produced the artifact behind every
`proj_ceiling`, `proj_floor` and `proj_sd` fitted on:

    P (punters) 9    DB 4    LB 1    T (tackle) 1    FB 20

while every skill position lost ~30% of its graded players — QB 186->134,
RB 335->215, WR 497->336, TE 286->190, graded 1,304->910 — and 15 of 32 cells
stopped being measurable at all.

IT WAS INVISIBLE BECAUSE NOTHING ASSERTED THE POPULATION. Every existing test
asked whether the numbers were self-consistent; none asked WHO they were about.
So a contaminated fit moved every ceiling and floor on Cory's board four days
before his draft, turned `main` red on 11 tests, and A's "NO SHIP" ruling on the
band-split question was measured on it before anyone noticed.

This file asks the question nobody was asking.

Run: python3 -m pytest draft/tests/test_calibration_population.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CAL = ROOT / "draft" / "backtest" / "projection_error_calibration.json"
ROSTERED = {"QB", "RB", "WR", "TE"}


def _cells():
    return json.loads(CAL.read_text())["cells"]


def _positions():
    return {k.split("|", 1)[0] for k in _cells()}


@pytest.mark.repo_parity
def test_NO_POSITION_THIS_LEAGUE_DOES_NOT_ROSTER_IS_IN_THE_CALIBRATION():
    """The assertion that would have caught 4r on the commit that caused it."""
    intruders = sorted(_positions() - ROSTERED)
    assert not intruders, (
        "the calibration is fitted on positions this league does not roster: "
        + ", ".join(intruders)
        + ".\nThis is not a rounding impurity — a punter's realized/projected "
          "ratio is a different question, and it sets ceilings for real players. "
          "Cause when this last happened: cli.py called PE.calibrate() without "
          "`positions`, whose default is NO FILTER (register 4r).")


def test_every_rostered_position_is_actually_present():
    """The other direction, and it is the half that hides. A filter typo that
    silently dropped WR would leave a clean-looking file with no intruders and
    no WR ceilings at all — a check that only looks for extras would pass."""
    missing = sorted(ROSTERED - _positions())
    assert not missing, f"no calibration cells for {missing} — every WR/RB/etc "\
                        "would fall back off any measured cell"


@pytest.mark.repo_parity
def test_the_graded_population_has_not_quietly_collapsed():
    """A guard on SIZE, because the contamination arrived together with a 30%
    loss of skill players and neither was noticed. Deliberately a floor and not
    a pin: the population legitimately grows when a season is added, and pinning
    it exactly would fail every honest refit."""
    doc = json.loads(CAL.read_text())
    graded = doc.get("graded") or 0
    assert graded >= 1200, (
        f"graded population is {graded}; it was 1,304 before the 4r regression "
        "and 910 after. A collapse of this size means the pipeline changed WHO "
        "it is fitting on, which is a different artifact wearing the same name.")


@pytest.mark.repo_parity
def test_most_cells_are_actually_measured():
    """15 of 32 cells went `unmeasurable` in the regression while the file still
    looked like a calibration. A file that reports mostly nothing is worse than
    an absent one, because consumers read its shape and trust it."""
    doc = json.loads(CAL.read_text())
    measured = doc.get("cells_measured") or 0
    total = measured + (doc.get("cells_unmeasurable") or 0)
    assert total and measured / total >= 0.75, (
        f"only {measured} of {total} cells are measured. Below three quarters, "
        "the artifact is mostly refusals and every player in an unmeasured band "
        "silently falls back to the Gaussian.")


def test_the_driver_still_passes_the_filter():
    """THE ROOT CAUSE, asserted at its source rather than only at its symptom.

    The three tests above check the committed artifact. This checks the code
    that regenerates it — otherwise the next dispatch re-contaminates and we
    find out from the artifact again, one board rebuild too late."""
    src = (ROOT / "draft" / "backtest" / "cli.py").read_text()
    assert "positions=SKILL_FOR_CALIBRATION" in src, (
        "cli.py no longer passes `positions` to PE.calibrate(). The default is "
        "NO FILTER, which is exactly how punters entered the calibration in 4r.")

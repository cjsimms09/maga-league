# TERRITORY: A
"""EVERY PAGE CORY READS MUST REBUILD BETWEEN THE WEEK'S DATA AND HIS FIRST GAME.

⚠️ THIS IS A CLASS GUARD, WRITTEN BECAUSE THE INSTANCE WAS FIXED AND ITS TWIN
WAS NOT. Registers 475/477 established that week 1 kicks off on a WEDNESDAY and
moved `own-weekly-proj.yml` to a Wednesday firing so the snapshot would clear
it. Nobody asked which OTHER weekly surfaces were still on a schedule that
assumes a Sunday opener. `week-brief.yml` was one, and it was found by accident
eleven hours before kickoff.

MEASURED 2026-09-09 (A), on `main`:

    THIS-WEEK.md last built          2026-09-08 17:18Z   (the Tue firing)
    the second opinion it quotes     2026-09-03 17:24Z   ← six days old
    the fresh second opinion on disk 2026-09-09 11:22Z   ← two hours old
    next scheduled brief rebuild     Friday 09-11        ← AFTER the first game

Cory's one page — the page CLAUDE.md's ROSTER RULE says every statement about
his roster must cite — would have carried six-day-old numbers straight through
the only week whose opener is a Wednesday.

SO THIS FILE TAKES A LIST, NOT A FILENAME. A new weekly surface is added as a
row; it is not a new file to write and therefore not a file nobody writes. That
is the whole difference between fixing this defect and fixing its class.

TWO PROPERTIES PER SURFACE, both derived, neither a typed constant:

  1. FRESH ENOUGH TO MATTER — some firing must land AFTER the week's own
     projection snapshot fires, or the page rebuilds from the previous week's
     numbers and its freshness is cosmetic.
  2. EARLY ENOUGH TO ARRIVE — that same firing must clear the week's first
     kickoff by more than the worst delay this scheduler has actually shown us
     (9h25, measured on this repo — see the sibling suite), plus its safety.

Run: python -m pytest draft/tests/test_cory_facing_weekly_surfaces_refresh_before_kickoff.py
"""
from __future__ import annotations

import datetime as dt
import pathlib

import pytest

import test_weekly_snapshot_beats_kickoff as S

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
WORKFLOWS = ROOT / ".github" / "workflows"

#: The workflow that produces the numbers every surface below reads. A surface
#: that rebuilds BEFORE this one has refreshed is rebuilding from last week.
SOURCE = "own-weekly-proj.yml"

#: (workflow, what Cory reads from it, why he reads it).
#: ⚠️ ADD A ROW WHEN A NEW WEEKLY SURFACE SHIPS. A surface that is not listed is
#: not guarded, and the reason this file exists is that exactly that happened.
SURFACES = [
    ("week-brief.yml", "THIS-WEEK.md",
     "the ROSTER RULE's own source — CLAUDE.md requires every statement about "
     "Cory's roster, opponent or matchup to cite it, so a stale one makes every "
     "citing session wrong at once"),
]


def _firings(workflow: str, week1_start: dt.date) -> list[dt.datetime]:
    return S._weekly_firings_utc(_crons_checked(workflow), week1_start)


def _crons_checked(workflow: str) -> list[str]:
    path = WORKFLOWS / workflow
    assert path.exists(), (
        f"{workflow} is listed as a Cory-facing weekly surface and does not "
        "exist. Either it was renamed and this list was not, or the surface is "
        "gone — say which, rather than deleting the row to clear the red.")
    return S._crons(path)


@pytest.mark.parametrize("workflow,page,why", SURFACES)
def test_the_surface_rebuilds_AFTER_the_weeks_numbers_land(workflow, page, why):
    """Property 1: freshness that is actually fresh.

    A page that rebuilds at 13:30 Tuesday when its inputs land 10:00 Wednesday
    is a page with a current timestamp and last week's contents — which is
    worse than an obviously old page, because it looks trustworthy.
    """
    kickoff = S._week1_kickoff()
    week1_start = (kickoff - dt.timedelta(days=1)).date()
    src = _firings(SOURCE, week1_start)
    own = _firings(workflow, week1_start)
    assert src, "the source snapshot has no resolvable firing — nothing to be fresh against"
    assert own, f"{workflow} has no resolvable scheduled firing at all"

    earliest_src = min(src)
    after = [f for f in own if f > earliest_src]
    assert after, (
        f"NO firing of {workflow} lands after {SOURCE} refreshes the week's "
        f"numbers ({earliest_src.isoformat()}), so {page} rebuilds from the "
        f"PREVIOUS week's data.\n"
        f"  {page}: {why}\n"
        f"  {workflow} fires: {[f.isoformat() for f in own]}\n"
        "  Add a firing after the snapshot — see week-brief.yml's Wednesday "
        "cron for the derivation."
    )


@pytest.mark.parametrize("workflow,page,why", SURFACES)
def test_that_same_firing_still_clears_the_first_kickoff(workflow, page, why):
    """Property 2: and it has to arrive.

    Deliberately asserted on the SAME firing as property 1 rather than on any
    firing. A surface could satisfy each property with a different cron and
    still never have a rebuild that is both fresh and in time, which is the
    hole a two-independent-checks version would leave open.
    """
    kickoff = S._week1_kickoff()
    week1_start = (kickoff - dt.timedelta(days=1)).date()
    earliest_src = min(_firings(SOURCE, week1_start))
    need = S.OBSERVED_MAX_DELAY_H + S.SAFETY_H

    good = [f for f in _firings(workflow, week1_start)
            if f > earliest_src and (kickoff - f).total_seconds() / 3600 >= need]
    detail = "\n".join(
        f"    {f.isoformat()}  after-snapshot={f > earliest_src}  "
        f"margin={(kickoff - f).total_seconds() / 3600:+.2f}h"
        for f in _firings(workflow, week1_start))
    assert good, (
        f"{workflow} has no firing that is BOTH after {SOURCE} and clears "
        f"kickoff ({kickoff.isoformat()}) by {need:.2f}h, and this scheduler "
        f"has been observed {S.OBSERVED_MAX_DELAY_H:.2f}h late.\n{detail}\n"
        f"  {page}: {why}"
    )


def test_FAIL_ARM_the_real_pre_fix_schedule_is_caught():
    """Rule 3e, on the state this file was written about — and the fixture is
    the REAL Tue/Fri/Sun schedule that shipped, not one I invented (rule 121).

    Without this the checks above are satisfiable by a resolver that cannot
    fail, and the six-day-stale page that prompted the whole thing sails
    through.
    """
    kickoff = S._week1_kickoff()
    week1_start = (kickoff - dt.timedelta(days=1)).date()
    earliest_src = min(_firings(SOURCE, week1_start))
    need = S.OBSERVED_MAX_DELAY_H + S.SAFETY_H

    pre_fix = ["30 13 * * 2", "30 13 * * 5", "30 11 * * 0"]
    firings = S._weekly_firings_utc(pre_fix, week1_start)
    good = [f for f in firings
            if f > earliest_src and (kickoff - f).total_seconds() / 3600 >= need]
    assert not good, (
        "the pre-fix Tue/Fri/Sun schedule PASSES this file, so it cannot detect "
        "the defect it exists for. firings: "
        f"{[f.isoformat() for f in firings]}")


def test_CONTROL_the_list_is_not_empty():
    """A parametrized suite over an empty list is green and tests nothing —
    the vacuous shape this repo has been bitten by before."""
    assert SURFACES, "no surfaces listed; this suite would pass by testing nothing"

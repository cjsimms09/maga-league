# TERRITORY: A
"""OWED WORK THAT CARRIES ITS OWN DEADLINE — a red rather than a memory.

WHY THIS FILE EXISTS. Four things were specified this week and never wired
because nothing triggered them: the grading cron that existed and never ran, the
enforcement table's empty cells, the projection archive nobody had scheduled, and
the Annual's January reconstruction. Every one had a plan and no date.

SO A DATED COMMITMENT GETS A TEST. Each entry names what is owed, the date it is
owed by, and a DETECTOR — a predicate that reads the repository and answers
"has this landed". Before the date the row is quiet. On the date, if the detector
still says no, THE SUITE GOES RED and stays red.

The onesie cap carries the same shape (its retirement check fires when the fix
that replaces it lands). This is that pattern applied to work that has not
started rather than to work that should stop.

NOT A TODO LIST. A todo list nobody reads is the failure this replaces. The only
entries here are ones with a date Cory set and a mechanical detector.
"""
from __future__ import annotations

import datetime
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent


def _today() -> datetime.date:
    return datetime.datetime.now(datetime.timezone.utc).date()


def _reads(path: str, needle: str) -> bool:
    f = ROOT / path
    return f.exists() and needle in f.read_text()


# ── THE COMMITMENTS ─────────────────────────────────────────────────────────
#
# owed_by is the DATE THE RED APPEARS, not a target. Cory set both.
OWED = [
    {
        "what": "component grades reach the graduation gate",
        # BEFORE THE FIRST SUNDAY OF THE SEASON, per Cory 2026-08-12. The 2026
        # regular season opens Thu Sep 10; the first Sunday is Sep 13. Dated a
        # week early so a red leaves time to act rather than arriving with it.
        "owed_by": datetime.date(2026, 9, 6),
        "detector": lambda: _reads(
            "draft/backtest/graduation_gate.py", "component_grades"),
        "why": "the gate's only evidence source is the Lab's retrospective money "
               "Monte Carlo. A season of live component grades has nowhere to "
               "arrive, so everything the season measures sits in a file until "
               "somebody reads it.",
        "and_do_not": "invent a units conversion. MATERIAL_DOLLARS is 50.0 and "
                      "component grades are points-per-player-week and Brier. If a "
                      "component has no defensible dollar conversion the map must "
                      "SAY SO and that component proposes nothing.",
    },
    {
        "what": "the January reconstruction is in the Annual's mandate",
        "owed_by": datetime.date(2026, 9, 6),
        "detector": lambda: _reads(".github/workflows/annual.yml", "reconstruct"),
        "why": "specified and never wired — the fourth instance of that shape. "
               "The mandate covers grading, corrections and B's generators; "
               "candidate-field-from-residuals is absent.",
        "and_do_not": "ship it without a dry run that reports 'no input'. A "
                      "mandate step that reports no input is observably wired; one "
                      "never invoked is indistinguishable from one that does not "
                      "exist.",
    },
]


def test_dated_commitments_have_landed_or_are_not_yet_due():
    """RED once the date passes and the detector still says no."""
    overdue = []
    for item in OWED:
        if _today() < item["owed_by"]:
            continue
        if not item["detector"]():
            overdue.append(item)
    assert not overdue, "\n\n".join(
        f"OVERDUE {o['owed_by']}: {o['what']}\n"
        f"  WHY IT MATTERS: {o['why']}\n"
        f"  AND DO NOT: {o['and_do_not']}"
        for o in overdue)


def test_every_commitment_has_a_working_detector():
    """A DETECTOR THAT CANNOT SAY YES IS A DEADLINE THAT CAN NEVER BE MET.

    Rule 13g applied to this file: each detector returns an absence today, and an
    absence is a claim. So assert the detector reads a file that EXISTS — a
    needle-miss on a real file is a real 'not yet', while a needle-miss on a path
    that moved is a broken check reporting a false 'not yet' forever.
    """
    for item in OWED:
        assert callable(item["detector"])
        assert item["detector"]() in (True, False)


def test_the_detectors_point_at_files_that_exist():
    for path in ("draft/backtest/graduation_gate.py", ".github/workflows/annual.yml"):
        assert (ROOT / path).exists(), f"{path} moved — its deadline check is now blind"

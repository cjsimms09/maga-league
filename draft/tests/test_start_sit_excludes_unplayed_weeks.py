# TERRITORY: A
"""THE START/SIT SKILL INSTRUMENT GRADED 180 OWNER-WEEKS OF FOOTBALL THAT HAD NOT
HAPPENED, AND ITS OWN CONTROL IS WHAT CAUGHT IT.

Register 340. `league_history.json` publishes the whole season the moment it
exists — nine starters, sixteen players, a full `players_points` map, every
value `0.0`. The loop's guard was `if not roster or not starters or not pts`,
and a dict of zeros is not empty, so all 180 of them were graded. Every
start/sit choice inside them scores ~0.5 by construction: all the alternatives
are tied at nothing.

MEASURED, before and after:

    owner-weeks used        712    ->  532
    known-negative random   0.488  ->  0.498
    known-positive ORACLE   0.873  ->  0.999      <- the control that failed
    mean percentile         0.7602 ->  0.8481
    exit code               1      ->  0

**The instrument refused itself.** `GRADING-POLICY` §3 makes the controls gate
the exit code, so `weekly-grade.yml` would have gone red in September rather
than publishing 0.7602 as a skill result — that is the control doing exactly
its job, and it is the only reason this was found rather than believed.

The guard is PER ENTRY, not per season, on purpose: in September 2026 becomes a
real season with seventeen unplayed weeks still in it, and a season-level gate
would wave every one of them back through.

Run: python -m pytest draft/tests/test_start_sit_excludes_unplayed_weeks.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

DRAFT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DRAFT))
sys.path.insert(0, str(DRAFT / "backtest"))

SRC = DRAFT / "backtest" / "start_sit_vs_random.py"
ART = DRAFT / "backtest" / "start_sit_vs_random.json"
HIST = DRAFT / "data" / "league_history.json"


@pytest.fixture(scope="module")
def artifact():
    if not ART.exists():
        pytest.skip("no committed start_sit artifact")
    return json.loads(ART.read_text())


@pytest.fixture(scope="module")
def history():
    return json.loads(HIST.read_text())


def _unplayed_owner_weeks(hist):
    """Owner-weeks with a full lineup and no football — the exact hazard shape."""
    n = 0
    for s in hist.get("seasons") or []:
        for entries in (s.get("weeks") or {}).values():
            for e in entries or []:
                pts = (e.get("players_points") or {})
                if e.get("starters") and pts and not any(float(v) for v in pts.values()):
                    n += 1
    return n


def test_THE_HAZARD_IS_STILL_IN_THE_STORE_or_the_rest_of_this_file_is_moot(history):
    """CONTROL (Rule 3f). Everything below is an exclusion, and an exclusion
    passes trivially once there is nothing to exclude. SKIPS rather than fails,
    because "the season started" is a legitimate state — just not one in which
    these assertions prove anything."""
    n = _unplayed_owner_weeks(history)
    if not n:
        pytest.skip("no zero-scoring owner-weeks in the store — hazard absent")
    assert n >= 10, ("only %d zero owner-weeks — too few to be the published "
                     "schedule; re-read before trusting the counts below" % n)


def test_THE_ZERO_WEEKS_LOOK_COMPLETE_which_is_why_the_old_guard_missed_them(history):
    """The point of the whole row: these rows are not empty and not malformed.
    A guard that tests for absence cannot see them."""
    sample = None
    for s in history.get("seasons") or []:
        for entries in (s.get("weeks") or {}).values():
            for e in entries or []:
                pts = e.get("players_points") or {}
                if pts and not any(float(v) for v in pts.values()):
                    sample = e
                    break
            if sample:
                break
        if sample:
            break
    if sample is None:
        pytest.skip("no zero-scoring owner-week in the store")
    assert sample.get("starters"), "no starters — a different, visible failure"
    assert len(sample["starters"]) >= 5, len(sample["starters"])
    assert sample.get("players"), "no players — a different, visible failure"
    assert sample["players_points"], "empty points map — the OLD guard would catch"
    assert set(float(v) for v in sample["players_points"].values()) == {0.0}


def test_the_SOURCE_still_carries_the_per_entry_guard():
    """Asserted on the source because the exclusion is one line inside a loop and
    there is nothing to import. If it is removed, the artifact below would still
    look fine on a store whose seasons have all been played — this is the arm
    that survives that."""
    src = SRC.read_text()
    assert "if not any(pts.values()):" in src, (
        "the per-entry zero-week guard is gone — 180 phantom owner-weeks came "
        "back in through exactly this line")
    assert "skipped_unplayed" in src


def test_the_ARTIFACT_reports_the_exclusion_instead_of_hiding_it(artifact):
    """A silent exclusion is how the phantom weeks got in; a silent one is how
    they could get back in from the other direction."""
    assert "skipped_unplayed_owner_weeks" in artifact, sorted(artifact)
    assert isinstance(artifact["skipped_unplayed_owner_weeks"], int)


def test_the_ARTIFACT_excluded_every_zero_week_the_store_contains(artifact, history):
    n = _unplayed_owner_weeks(history)
    if not n:
        pytest.skip("no zero-scoring owner-weeks in the store")
    assert artifact["skipped_unplayed_owner_weeks"] == n, (
        "store has %d zero-scoring owner-weeks, the run excluded %d — some were "
        "graded" % (n, artifact["skipped_unplayed_owner_weeks"]))
    assert artifact["n_owner_weeks"] > 0, "everything was excluded — guard too wide"


def test_BOTH_CONTROLS_PASS_which_is_the_only_reason_the_headline_is_evidence(artifact):
    """The oracle control is the one that fell to 0.873. GRADING-POLICY §3 makes
    these gate the exit code, so this is the assertion that would have stopped
    0.7602 being published as a skill result."""
    c = artifact["controls"]
    lo, hi = 0.42, 0.58
    assert lo <= c["random_lineup"] <= hi, c
    assert c["oracle_lineup"] > 0.90, (
        "the known-positive control is at %s — an oracle that cannot beat random "
        "means the weeks being graded have no information in them" % c["oracle_lineup"])


def test_the_HEADLINE_sits_clear_of_its_own_null_band(artifact):
    lo, hi = artifact["null_95"]
    assert artifact["mean_percentile"] > hi, (artifact["mean_percentile"], hi)

# TERRITORY: A
"""THE JS AND PYTHON CAPTURE WINDOWS MUST AGREE — register 438.

Two implementations of one predicate is a drift generator, and this repo has
paid for it (register 408: a duplicate-arm guard shipped four times by hand).
Both are needed — the reco crons are Netlify functions, `weekly_proj_snapshot`
is Python — so the copies are made safe by comparing them rather than by
trusting them.

This asserts agreement on the REAL schedule at real timestamps, not on a
fixture: a fixture would let both drift together.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import capture_window as PY  # noqa: E402

JS = ROOT / "src" / "capture_window.js"
SCHEDULE = ROOT / "draft" / "data" / "nfl_schedule_2026.json"


def _js(season, week, iso):
    out = subprocess.run(
        ["node", "-e",
         f"const W=require({json.dumps(str(JS))});"
         f"const v=W.weekIsLive({json.dumps(str(season))},{int(week)},Date.parse({json.dumps(iso)}));"
         "console.log(JSON.stringify(v));"],
        cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout.strip())


def _moments():
    """Every week's own boundaries plus the two dates that motivated the fix."""
    weeks = json.loads(SCHEDULE.read_text())["weeks"]
    for w in sorted(weeks, key=int):
        first = datetime.fromisoformat(weeks[w]["first"].replace("Z", "+00:00"))
        last = datetime.fromisoformat(weeks[w]["last"].replace("Z", "+00:00"))
        for label, t in (
            ("way before", first - timedelta(days=30)),
            ("just before opening", first - timedelta(days=PY.LEAD_DAYS, seconds=60)),
            ("just after opening", first - timedelta(days=PY.LEAD_DAYS) + timedelta(seconds=60)),
            ("kickoff", first),
            ("last game", last),
            ("just after closing", last + timedelta(days=PY.TRAIL_DAYS, seconds=60)),
        ):
            yield int(w), f"w{w} {label}", t.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def test_the_two_implementations_agree_at_every_week_boundary():
    disagreements = []
    checked = 0
    for week, label, iso in _moments():
        checked += 1
        p = PY.week_is_live("2026", week, iso)
        j = _js("2026", week, iso)
        if p != j:
            disagreements.append((label, iso, p, j))
    #: CONTROL — with zero comparisons this test would pass vacuously, which is
    #: the shape a broken generator produces (rule 3e).
    assert checked >= 6 * 17, checked
    assert not disagreements, disagreements


def test_KNOWN_POSITIVE_both_refuse_the_two_dates_that_motivated_the_fix():
    """08-30 is when the week-1 lineup marker was actually burned; 09-02 is the
    waiver probe that would have burned the next one. If either side stops
    refusing these, the agreement test above could pass on two broken copies."""
    for iso in ("2026-08-30T17:42:00Z", "2026-09-02T01:00:00Z"):
        assert PY.week_is_live("2026", 1, iso) is False, iso
        assert _js("2026", 1, iso) is False, iso


def test_KNOWN_POSITIVE_both_allow_week_1s_real_cron_firings():
    """And the other direction, or "they agree" would be satisfied by two
    implementations that refuse everything."""
    for iso in ("2026-09-09T00:10:00Z", "2026-09-13T12:50:00Z"):
        assert PY.week_is_live("2026", 1, iso) is True, iso
        assert _js("2026", 1, iso) is True, iso


def test_CANNOT_SAY_is_the_same_on_both_sides_and_is_not_False():
    """The most dangerous agreement to lose: a missing schedule must read as
    None (cannot say) on both sides, never as "not live" — that is what stops a
    broken file becoming a silent season-long refusal to capture."""
    assert PY.week_is_live("2026", 1, "2026-09-13T12:50:00Z", "/nonexistent.json") is None
    out = subprocess.run(
        ["node", "-e",
         f"const W=require({json.dumps(str(JS))});"
         "console.log(JSON.stringify(W.weekIsLive('2026',1,Date.parse('2026-09-13T12:50:00Z'),"
         "'/nonexistent.json')));"],
        cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    assert json.loads(out.stdout.strip()) is None
    #: and a season the schedule does not cover is also CANNOT SAY, not False
    assert PY.week_is_live("2099", 1, "2099-09-13T12:50:00Z") is None
    assert _js("2099", 1, "2099-09-13T12:50:00Z") is None


def test_the_constants_are_the_same_on_both_sides():
    out = subprocess.run(
        ["node", "-e",
         f"const W=require({json.dumps(str(JS))});"
         "console.log(JSON.stringify([W.LEAD_DAYS, W.TRAIL_DAYS]));"],
        cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    assert json.loads(out.stdout.strip()) == [PY.LEAD_DAYS, PY.TRAIL_DAYS]

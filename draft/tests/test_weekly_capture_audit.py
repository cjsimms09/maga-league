"""EVERY PLAYED WEEK MUST BE ON DISK — and the audit that says so must be able to fail.

Cory, 2026-10-07: *"Every week going forward needs to work!"*

The two 2027-gradeable captures failed loudly on EVERY run for seven weeks and
it still cost four weeks of the Sleeper comparator, because a red workflow
sitting among red workflows is invisible while a missed week is unrecoverable.
`weekly_capture_audit.py` watches artifacts instead of jobs, which is the only
thing that settles it: a job can go green and bank nothing, or go red having
already banked.

This file exists because an alarm nobody can trust is worse than no alarm, and
the audit proved that on its first run twice over — it reported the odds
capture as 24 days stale off a wrong glob (the live fetcher writes `sgo_*`, it
looked for `odds_*`), and then reported `newest: sgo_latest.json`, a pointer
file that says nothing about freshness. Both were caught before they reached
anyone. So: the detector is tested for its ability to FIRE, its patterns are
tested against reality, and its freshness line is tested for actually being a
date.

Run: python3 -m pytest draft/tests/test_weekly_capture_audit.py -q
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import weekly_capture_audit as A  # noqa: E402


# ── the patterns must describe reality (rule 3e) ────────────────────────────

def test_CONTROL_every_weekly_pattern_matches_something_real():
    """A glob that matches nothing produces the same output as a dead capture.

    This is the check that would have caught the odds row before it cried wolf:
    if a directory has files in it and the pattern matches none of them, the
    PATTERN is the defect, not the season.
    """
    problems = A._pattern_control("2026")
    assert not problems, "\n".join(problems)


def test_CONTROL_the_weekly_globs_find_the_weeks_we_know_are_there():
    """Anchored to artifacts committed on main, so a rename breaks this loudly
    rather than silently reporting every week missing."""
    own = A.present_weeks("draft/data/weekly_own/own_weekly_{season}_w{week}.json", "2026")
    assert {1, 2, 3, 4}.issubset(own), f"own weekly projections found: {sorted(own)}"


def test_a_SUNDAY_sibling_is_not_counted_as_the_week():
    """props writes weekly_props_2026_w4.json AND ..._w4_sun.json (a closing-line
    snapshot). Counting the sibling would make a missing week look present —
    and counting FILES instead of WEEKS is exactly how "props: 5 files" got
    reported as healthy when weeks 2 and 5 were missing."""
    weeks = A.present_weeks("draft/data/props/weekly_props_{season}_w{week}.json", "2026")
    assert 2 not in weeks, (
        "week 2 is absent from props on disk but the matcher counted it — it is "
        "probably matching a _sun sibling")
    assert 1 in weeks and 4 in weeks, sorted(weeks)


# ── it must be able to FIRE ─────────────────────────────────────────────────

def test_CONTROL_a_missing_week_IS_detected(tmp_path, monkeypatch):
    """Rule 3e: an alarm that has only ever been quiet has not been tested."""
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "data" / "x").mkdir(parents=True)
    for w in (1, 3):
        (tmp_path / "draft" / "data" / "x" / f"f_2026_w{w}.json").write_text("{}")
    have = A.present_weeks("draft/data/x/f_{season}_w{week}.json", "2026")
    assert have == {1, 3}
    owed = [1, 2, 3]
    missing = [w for w in owed if w not in have]
    assert missing == [2], missing


def test_the_audit_EXITS_NONZERO_while_a_played_week_is_missing():
    """The live state today: the Sleeper+FP archive is missing played weeks, so
    this must be a failure. If it ever passes, either every week is captured
    (good) or the audit stopped looking (bad) — and the controls above are what
    tell those apart."""
    res = A.audit("2026")
    assert res["played_weeks"], "no played weeks detected — the harvest gate is broken"
    any_missing = any(not r["ok"] for r in res["captures"])
    assert A.main(["--season", "2026", "--json"]) == (1 if any_missing else 0)


def test_a_week_is_OWED_only_once_somebody_has_SCORED_in_it():
    """The gate is the harvest, not a clock — a date is a second source that can
    disagree with the scores, and a capture demanded for a week that has not
    happened is a false alarm that trains people to ignore the real ones."""
    owed = A.played_weeks("2026")
    assert owed == sorted(owed)
    assert all(isinstance(w, int) and 1 <= w <= 18 for w in owed), owed
    assert 18 not in owed, "week 18 cannot have been played yet in October"


# ── the freshness line must be a date ───────────────────────────────────────

def test_the_market_rows_report_a_DATED_capture_not_a_pointer_file():
    """`sgo_latest.json` sorts after every date and answers nothing about
    freshness; the first version printed exactly that."""
    res = A.audit("2026")
    for d in res["daily"]:
        if d["newest"] is None:
            continue
        assert re.search(r"\d{4}-\d{2}-\d{2}", d["newest"]), \
            f"{d['key']} reports newest={d['newest']!r}, which carries no date"


def test_every_capture_states_WHAT_IT_SERVES():
    """Cory's framing: each row has to say whether it makes the DRAFT better,
    the in-season MANAGEMENT better, or both. A capture nobody can justify is a
    capture nobody will fix when it breaks."""
    for cap in A.CAPTURES + A.DAILY:
        assert cap.get("serves"), cap["key"]
        assert ("DRAFT" in cap["serves"]) or ("MANAGE" in cap["serves"]), cap["serves"]


def test_the_unbackfillable_rows_are_marked_as_such():
    """The difference between 'retry it' and 'that evidence no longer exists'."""
    keys = {c["key"]: c for c in A.CAPTURES}
    for k in ("sleeper_fp_archive", "own_weekly", "props"):
        assert keys[k].get("unbackfillable") is True, k

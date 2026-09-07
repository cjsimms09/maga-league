# TERRITORY: relay
"""THE WEEKLY ARCHIVE'S PRE-KICKOFF STAMP HAS TO BE TRUE ON A SHORT WEEK.

Every file `weekly_projection_archive.py` writes carries
`kickoff_boundary: "captured before this week's earliest kickoff"`, and until
2026-09-06 that was a STAMP rather than a guard — the workflow header said the
boundary was "enforced" by a Thursday 15:00Z cron, on the premise that "the
week's earliest game is Thursday night".

THAT PREMISE IS FALSE FOR WEEK 1. Register 477 measured the opener at
2026-09-10T00:20Z — Wednesday night in US time — so the Thursday run lands
~15 hours AFTER it. `own-weekly-proj.yml` and `free-props-writer.yml` were both
given Wednesday crons for exactly this; this emitter is the THIRD with the same
defect and never got one, because nothing in the week-1 path read it until the
analyzer and the lineup optimizer began pricing from it.

Two halves, both tested here: the Wednesday cron must exist and land before the
opener, and the tool must refuse to overwrite a snapshot once its week has
started — otherwise the Thursday run replaces good pre-kickoff data with
post-kickoff data still wearing the pre-kickoff label.
"""
import datetime as dt
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "weekly-projection-archive.yml"
sys.path.insert(0, str(ROOT / "draft"))
from weekly_own_projection import first_kickoff_utc  # noqa: E402

UTC = dt.timezone.utc


def _crons():
    return re.findall(r"cron:\s*'([^']+)'", WORKFLOW.read_text())


def _next_utc(dow: int, hh: int, mm: int, before: dt.datetime) -> dt.datetime:
    """The latest firing of a weekly cron at or before `before`. cron dow: 0=Sun."""
    py_dow = (dow - 1) % 7          # cron 3 (Wed) -> python weekday 2
    d = before.date()
    for back in range(0, 8):
        cand = d - dt.timedelta(days=back)
        if cand.weekday() == py_dow:
            t = dt.datetime(cand.year, cand.month, cand.day, hh, mm, tzinfo=UTC)
            if t <= before:
                return t
    raise AssertionError("no firing found")


def test_week_1_opener_is_a_wednesday_night_the_thursday_cron_misses():
    """The premise the old schedule rested on, stated as a test."""
    ko = first_kickoff_utc(1, 2026)
    assert ko == dt.datetime(2026, 9, 10, 0, 20, tzinfo=UTC), ko
    thursday_run = dt.datetime(2026, 9, 10, 15, 0, tzinfo=UTC)
    assert thursday_run > ko, "the Thursday 15:00Z slot is AFTER week 1's opener"


def test_a_wednesday_cron_exists_and_fires_before_the_opener():
    crons = _crons()
    wed = [c for c in crons if c.split()[-1] == "3"]
    assert wed, f"no Wednesday cron on the weekly archive; crons are {crons}"
    ko = first_kickoff_utc(1, 2026)
    fired = []
    for c in wed:
        mm, hh = int(c.split()[0]), int(c.split()[1])
        fired.append(_next_utc(3, hh, mm, ko))
    assert any(f < ko for f in fired), \
        f"a Wednesday cron exists but none fires before {ko.isoformat()}: {fired}"


def test_the_wednesday_capture_still_follows_own_weekly():
    """The file's own invariant: own_weekly must exist on disk first. own-weekly-proj
    runs Wednesdays 20:00Z, so this must be later on the same day."""
    wed = [c for c in _crons() if c.split()[-1] == "3"]
    mins = [int(c.split()[1]) * 60 + int(c.split()[0]) for c in wed]
    assert min(mins) >= 20 * 60, \
        "the Wednesday archive must run at or after own-weekly-proj's 20:00Z"


def test_normal_weeks_still_kick_off_after_the_thursday_slot():
    """The Thursday cron is not wrong in general — only on a short week. If this
    fails, the schedule changed and the Thursday slot needs re-examining too."""
    ko2 = first_kickoff_utc(2, 2026)
    assert ko2 > dt.datetime(2026, 9, 17, 15, 0, tzinfo=UTC), \
        f"week 2 kicks off {ko2}, before its own Thursday capture slot"


@pytest.mark.parametrize("now,expect_refuse", [
    ("2026-09-09T20:30:00Z", False),   # the Wednesday capture — must WRITE
    ("2026-09-10T15:00:00Z", True),    # the Thursday slot, post-opener — must REFUSE
])
def test_the_boundary_decision_both_ways(now, expect_refuse):
    """The predicate the tool applies before overwriting an existing snapshot.
    Both arms asserted: a guard only ever seen passing has not been tested."""
    ko = first_kickoff_utc(1, 2026)
    n = dt.datetime.fromisoformat(now.replace("Z", "+00:00"))
    assert (n >= ko) is expect_refuse, f"at {now}, kickoff {ko.isoformat()}"


def test_the_tool_carries_the_refusal_and_reuses_the_shared_kickoff():
    """Guard against the refusal being deleted, and against it growing a SECOND
    kickoff derivation — register 467: two implementations sharing a name is how
    a grade ends up measuring a cousin of the thing that ships."""
    src = (ROOT / "draft" / "tools" / "weekly_projection_archive.py").read_text()
    assert "REFUSING to rewrite" in src, "the post-kickoff overwrite refusal is gone"
    assert "first_kickoff_utc" in src, "the refusal must reuse the shared kickoff helper"
    assert "out_path.exists()" in src, "the refusal must only apply to an existing snapshot"

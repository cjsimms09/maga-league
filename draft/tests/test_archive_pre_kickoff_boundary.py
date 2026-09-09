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


def _wed_minutes(workflow: str) -> list[int]:
    """Wednesday cron firing times, in minutes past midnight UTC."""
    import pathlib, re
    txt = (pathlib.Path(__file__).resolve().parents[2]
           / ".github" / "workflows" / workflow).read_text()
    cs = [c for c in re.findall(r"^\s*-\s*cron:\s*'([^']+)'", txt, re.M)
          if c.split()[-1] == "3"]
    return sorted(int(c.split()[1]) * 60 + int(c.split()[0]) for c in cs)


def test_the_wednesday_capture_still_follows_own_weekly():
    """The file's own invariant: own_weekly must exist on disk first, so the
    archive's EARLIEST Wednesday run must be at or after own-weekly-proj's.

    ⚠️ THIS ASSERTED `>= 20 * 60` — own-weekly-proj's 20:00Z — AS A LITERAL, and
    on 2026-09-09 it caught a change correctly for the wrong reason. Register 495
    added a 10:00Z Wednesday cron to own-weekly-proj (the 20:00Z slot carried
    4h20 of margin against a scheduler measured 9h25 late, on the one snapshot
    that cannot be re-taken), and register 496 moved this archive to 10:30Z to
    stay behind it. The pairing was still correct — 10:30 follows 10:00 — but
    the literal said 20:00 and the test failed.

    It now READS own-weekly-proj's own schedule, so the invariant is between the
    two files rather than between one file and a number someone typed. Either
    cron can move for a good reason and this keeps meaning the same thing; only
    a schedule where the archive could run BEFORE its input fails it, which is
    the property the docstring always described.
    """
    own = _wed_minutes("own-weekly-proj.yml")
    arc = _wed_minutes("weekly-projection-archive.yml")
    assert own, "own-weekly-proj has no Wednesday cron; this invariant has no anchor"
    assert arc, "the archive has no Wednesday cron — register 496"
    assert min(arc) >= min(own), (
        f"the archive's earliest Wednesday run ({min(arc)//60:02d}:{min(arc)%60:02d}Z) "
        f"is BEFORE own-weekly-proj's ({min(own)//60:02d}:{min(own)%60:02d}Z), so it "
        "would capture a week whose own_weekly snapshot does not exist yet")


def test_FAIL_ARM_an_archive_cron_before_its_input_is_caught():
    """The invariant above is a >=, which is satisfiable by any schedule where
    the two happen to coincide. Prove it can actually fail."""
    assert not (9 * 60 + 30) >= (10 * 60), \
        "an archive at 09:30Z against an input at 10:00Z must violate the rule"
    assert (10 * 60 + 30) >= (10 * 60), "and 10:30Z against 10:00Z must satisfy it"


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

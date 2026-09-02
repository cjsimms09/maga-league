# TERRITORY: relay (draft/tools/go_status.py) — test added by A, 2026-09-01,
# register 460, under the same grant as register 447's edit to the same check.
"""THE STALENESS CHECK HAD NEVER REPORTED STALENESS.

`go_status.py`'s board-freshness block is the one thing in the repo whose whole
job is to say "the board has not published". It had NO TEST, and its red arm had
never fired — the board has published on every day anyone has run it. So the
only verdict it has ever been observed to produce is the green one, which is
exactly the shape registers 458 and 459 just closed on the three captures.

It was also UNTESTABLE as written: the rule lived inside `main()`, which shells
out to `git log origin/main`, so there was no seam to hand it a stale log
through. `board_freshness(log_text, now)` is that seam.

── THE KNOWN-NEGATIVE IS THE POINT ─────────────────────────────────────────

Register 447 found that `git log --grep` matched the whole commit MESSAGE, so a
PROSE commit whose body merely quotes "Player board: rebuild" was returned as
the publish — meaning a stale board could report fresh any time somebody wrote
*about* a rebuild. It was caught only because such a commit happened to exist
that same day, i.e. the check had been giving right answers by luck.

`test_a_prose_commit_that_QUOTES_the_subject_is_not_a_publish` is that defect,
pinned. It fails on the old instrument and passes on the new one.

Run: python3 -m pytest draft/tests/test_go_status_freshness.py -q
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import go_status as G  # noqa: E402

NOW = datetime(2026, 9, 10, 12, 0, 0, tzinfo=timezone.utc)


def _log(*rows: tuple[str, str]) -> str:
    """git log --format=%ci\\t%s, newest first — the real shape, tab included."""
    return "\n".join(f"{when}\t{subject}" for when, subject in rows)


def test_CONTROL_a_fresh_publish_is_fresh_and_reports_no_problem():
    """Without this the red arms below could pass on a function that calls
    everything stale."""
    line, days, problem = G.board_freshness(
        _log(("2026-09-10 01:45:55 +0000", "Player board: rebuild 2026-09-10")), NOW)
    assert problem is None, problem
    assert days is not None and days < 1, days
    assert "Player board: rebuild" in line


def test_THE_RED_ARM_a_stale_board_is_REPORTED_STALE():
    """The arm that had never fired in the tool's life."""
    line, days, problem = G.board_freshness(
        _log(("2026-09-01 01:45:55 +0000", "Player board: rebuild 2026-09-01")), NOW)
    assert problem is not None, (line, days)
    assert "stale" in problem
    assert days is not None and 9 < days < 10, days


def test_a_prose_commit_that_QUOTES_the_subject_is_not_a_publish():
    """⛔ REGISTER 447, PINNED. `git log --grep` matched the whole MESSAGE, so a
    commit whose BODY quotes the publish subject was returned as the publish —
    and a stale board would have reported fresh on the strength of somebody
    writing about a rebuild.

    Here the stale publish is nine days old and a PROSE commit lands today. The
    freshness answer must be the nine-day-old one, and it must be RED.
    """
    line, days, problem = G.board_freshness(_log(
        ("2026-09-10 09:00:00 +0000",
         "Register 433 closed: the board published — first green rebuild since 08-26"),
        ("2026-09-01 01:45:55 +0000", "Player board: rebuild 2026-09-01"),
    ), NOW)
    assert "Player board: rebuild" in line, (
        "a prose commit was mistaken for the publish — that is register 447 "
        f"returning, and it makes a stale board read fresh. Got: {line}")
    assert problem is not None and "stale" in problem, problem


def test_BOTH_subjects_are_recognised_or_a_pre_rename_repo_reports_no_publish():
    """Cory renamed the job on 2026-08-31 ("stop calling it the draft board").
    Every publish before that says "Draft board: rebuild". Dropping the old
    subject would report "no publish commit found" on a repo that has simply
    not rebuilt since the rename."""
    _, _, problem = G.board_freshness(
        _log(("2026-09-10 01:00:00 +0000", "Draft board: rebuild 2026-09-10")), NOW)
    assert problem is None, problem
    assert set(G.SUBJECTS) == {"Draft board: rebuild", "Player board: rebuild"}, G.SUBJECTS


def test_no_publish_at_all_is_a_PROBLEM_not_a_silent_pass():
    """An empty history and a fresh board must not print the same thing."""
    line, days, problem = G.board_freshness(
        _log(("2026-09-10 09:00:00 +0000", "some unrelated commit")), NOW)
    assert days is None
    assert problem and "no publish commit found" in problem, problem
    assert "no publish commit found" in line


def test_an_unparseable_date_REFUSES_rather_than_reading_as_fresh():
    """A malformed timestamp must never fall through to the green branch — that
    is how a broken parser reports a healthy board."""
    line, days, problem = G.board_freshness(
        "not-a-date\tPlayer board: rebuild 2026-09-10", NOW)
    assert days is None
    assert problem and "unparseable" in problem, problem


def test_THE_TRUNCATION_that_hid_a_day():
    """`timedelta.days` TRUNCATES, so a board 47 hours old reported "1 day" and
    sat an hour short of the 2-day alarm for a whole extra day. Measured in
    fractional days now, at the same bar.

    47h must be BELOW the bar and 49h ABOVE it — under truncation both read as
    1 and 2 respectively, so only the 47h case distinguishes the two versions.
    """
    def age_hours(h):
        pub = NOW - __import__("datetime").timedelta(hours=h)
        stamp = pub.strftime("%Y-%m-%d %H:%M:%S +0000")
        return G.board_freshness(_log((stamp, "Player board: rebuild x")), NOW)

    _, d47, p47 = age_hours(47)
    _, d49, p49 = age_hours(49)
    assert p47 is None, ("47 hours is under two days and must not alarm", d47, p47)
    assert p49 is not None, ("49 hours is over two days and must alarm", d49, p49)
    #: ⚠️ AND THE DISPLAYED NUMBER MUST NOT CONTRADICT THE VERDICT. `round()`
    #: made 47 hours print as "2.0 day(s) old" beside a green tick and a
    #: documented 2-day bar. Floored, so the number shown is never larger than
    #: the age the decision was made on.
    assert d47 is not None and 1.9 <= d47 < 2.0, (
        f"a not-stale board displayed {d47} days against a {G.STALE_AFTER_DAYS}-day "
        "bar — the number and the verdict contradict each other")


def test_the_bar_is_a_named_constant_not_a_literal_in_the_branch():
    """So a future change to the alarm is one edit with a name attached, and so
    this test file cannot silently disagree with the tool about what stale is."""
    assert G.STALE_AFTER_DAYS == 2

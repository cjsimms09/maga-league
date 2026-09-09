# TERRITORY: A
"""THE PRE-KICKOFF SNAPSHOT HAS ONE CHANCE, AND THE SCHEDULER IS LATE.

`own-weekly-proj.yml` commits our own weekly projection BEFORE the week's first
game. That committed timestamp IS the forward guarantee — it is what makes the
number free of hindsight, and it is the thing the whole 2027 projection program
is graded on from 09-15. `weekly_own_projection.py` enforces it from the other
side: past kickoff with no snapshot on disk it prints

    MISSED: no snapshot for week N and its first game kicked off ...
    Writing one now would be a backdated forecast; the week is unpriced and
    this is a failure.

and exits 1. THERE IS NO SECOND CHANCE AT A PRE-KICKOFF TIMESTAMP.

⚠️ MEASURED 2026-09-08 (A), from this workflow's own four scheduled runs —
GitHub fires it LATE, every time, and not by minutes:

    scheduled            fired                 delay
    2026-08-20 14:00Z    14:27:22Z             0h27
    2026-09-02 20:00Z    22:28:40Z             2h29
    2026-09-03 14:00Z    17:24:38Z             3h25
    2026-08-27 14:00Z    23:24:37Z             9h25

Week 1 kicks off 2026-09-10T00:20Z. The 20:00Z Wednesday cron carries 4h20 of
margin, and ONE OF THE FOUR OBSERVED DELAYS IS 9h25 — that firing would have
landed at 05:24Z, five hours after kickoff, on the one week whose snapshot
cannot be re-taken.

So this file asserts the invariant rather than the fix: SOME scheduled firing
must clear the week's first kickoff by more than the worst delay this
scheduler has actually shown us. It is deliberately not "the cron says 10:00" —
that pins today's answer instead of the property, and the next person to move a
cron for a good reason would learn nothing from it.

Run: python -m pytest draft/tests/test_weekly_snapshot_beats_kickoff.py
"""
from __future__ import annotations

import datetime as dt
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
WORKFLOW = ROOT / ".github" / "workflows" / "own-weekly-proj.yml"

# The worst delay this scheduler has actually shown us, in hours. NOT a guess
# and not a round number: it is the 2026-08-27 firing, 9h24m37s late. A margin
# smaller than a delay we have already observed is a margin we have already
# seen fail.
OBSERVED_MAX_DELAY_H = 9.41

# Enough headroom that the worst observed delay still lands with time to spare,
# rather than exactly on the line. Two hours is arbitrary and says so — what is
# measured is OBSERVED_MAX_DELAY_H; this is the safety on top of it.
SAFETY_H = 2.0


def _crons(workflow: pathlib.Path | None = None) -> list[str]:
    """Cron lines from a workflow's `schedule:` block.

    Read with a regex rather than a YAML parse on purpose: this must keep
    working if the file grows an anchor or a comment shape PyYAML dislikes, and
    the thing under test is one field.

    ⚠️ TAKES A PATH so the sibling suite for THIS-WEEK.md can use THIS resolver
    instead of writing a second one. Two definitions of one thing is how the
    two cadences drifted apart in the first place (register 501).
    """
    text = (workflow or WORKFLOW).read_text()
    return re.findall(r"^\s*-\s*cron:\s*'([^']+)'", text, re.M)


def _weekly_firings_utc(crons: list[str], week1_start: dt.date) -> list[dt.datetime]:
    """When each cron fires during week 1, in UTC.

    Week 1 runs Wed 09-09 through the following Tuesday, so a `day-of-week`
    cron fires once inside it. Only 5-field crons with a literal hour and a
    literal day-of-week are resolved; anything else is reported rather than
    silently skipped, because an unparsed cron would make this check pass by
    looking away.
    """
    out, unparsed = [], []
    for c in crons:
        parts = c.split()
        if len(parts) != 5:
            unparsed.append(c)
            continue
        minute, hour, _dom, _mon, dow = parts
        if not (minute.isdigit() and hour.isdigit() and dow.isdigit()):
            unparsed.append(c)
            continue
        # cron dow: 0=Sunday .. 6=Saturday; python weekday(): 0=Monday
        target = (int(dow) - 1) % 7
        for offset in range(7):
            d = week1_start + dt.timedelta(days=offset)
            if d.weekday() == target:
                out.append(dt.datetime(d.year, d.month, d.day,
                                       int(hour), int(minute),
                                       tzinfo=dt.timezone.utc))
                break
    assert not unparsed, (
        f"cron(s) this check cannot resolve: {unparsed}. It must not pass by "
        "looking away — teach it the shape or state why the cron is exempt."
    )
    return sorted(out)


def _week1_kickoff() -> dt.datetime:
    """Week 1's first kickoff, from the committed schedule the pricer reads."""
    import sys
    sys.path.insert(0, str(ROOT / "draft"))
    import weekly_own_projection as W  # noqa: E402
    return W.first_kickoff_utc(1)


def test_a_firing_clears_week1_kickoff_by_more_than_the_worst_observed_delay():
    kickoff = _week1_kickoff()
    week1_start = (kickoff - dt.timedelta(days=1)).date()   # the Wednesday
    firings = _weekly_firings_utc(_crons(), week1_start)
    assert firings, "no resolvable scheduled firing at all — the snapshot has no clock"

    need = OBSERVED_MAX_DELAY_H + SAFETY_H
    margins = [(f, (kickoff - f).total_seconds() / 3600) for f in firings]
    ok = [(f, m) for f, m in margins if m >= need]

    detail = "\n".join(
        f"    {f.isoformat()}  margin {m:+.2f}h" for f, m in margins)
    assert ok, (
        f"NO scheduled firing clears week 1's kickoff ({kickoff.isoformat()}) by "
        f"{need:.2f}h, and this scheduler has been observed "
        f"{OBSERVED_MAX_DELAY_H:.2f}h late.\n{detail}\n"
        "  The pre-kickoff timestamp IS the forward guarantee and it cannot be "
        "re-taken: past kickoff with no snapshot, weekly_own_projection.py "
        "prints MISSED and exits 1. Move a cron earlier."
    )


def test_FAIL_ARM_the_old_single_2000Z_schedule_would_NOT_have_passed():
    """The state this file was written about must actually fail it.

    Without this, "some firing clears the bar" is satisfiable by a check that
    cannot fail, and the 4h20 margin that prompted the whole thing would sail
    through. Uses the same resolver and the same bar as the live check.
    """
    kickoff = _week1_kickoff()
    week1_start = (kickoff - dt.timedelta(days=1)).date()
    firings = _weekly_firings_utc(["0 20 * * 3", "0 14 * * 4"], week1_start)
    need = OBSERVED_MAX_DELAY_H + SAFETY_H
    margins = [(kickoff - f).total_seconds() / 3600 for f in firings]
    assert not [m for m in margins if m >= need], (
        "the pre-fix schedule PASSES this check, so the check cannot detect the "
        f"defect it was written for. margins: {[round(m, 2) for m in margins]}"
    )


def test_CONTROL_the_margin_arithmetic_is_not_vacuously_large():
    """A margin computed against the wrong date would pass everything.

    Pins that week 1's kickoff is the one the pricer actually uses and that the
    Wednesday firings sit BEFORE it by less than a day — if this ever reads a
    margin of, say, 200 hours, the check above is measuring against the wrong
    week and its green means nothing.
    """
    kickoff = _week1_kickoff()
    assert kickoff.tzinfo is not None, "kickoff must be tz-aware or the delta is a guess"
    week1_start = (kickoff - dt.timedelta(days=1)).date()
    firings = _weekly_firings_utc(_crons(), week1_start)
    for f in firings:
        m = (kickoff - f).total_seconds() / 3600
        assert -48 < m < 48, (
            f"firing {f.isoformat()} is {m:.1f}h from kickoff — that is not the "
            "same week, so this suite is comparing against the wrong game"
        )


def test_the_pricer_still_refuses_a_post_kickoff_write():
    """The other half of the guarantee, and the reason the schedule matters.

    If this refusal were ever relaxed, a late firing would quietly write a
    hindsight number and the schedule would stop being load-bearing — so the
    two are pinned together rather than separately.
    """
    src = (ROOT / "draft" / "weekly_own_projection.py").read_text()
    assert "MISSED: no snapshot for week" in src, (
        "the post-kickoff refusal is gone from weekly_own_projection.py; the "
        "forward guarantee now rests on nothing but the cron"
    )
    #: quoted from the source, not from memory — my first version of this line
    #: asserted the word "hindsight" and the message actually says "backdated
    #: forecast". A guard pinned to remembered wording fails for the wrong
    #: reason the first time someone reads the real thing.
    assert "backdated forecast" in src, (
        "the MISSED message no longer says what it does; re-read it rather than "
        "loosening this assertion"
    )

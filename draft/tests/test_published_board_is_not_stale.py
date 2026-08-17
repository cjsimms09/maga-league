# TERRITORY: A
"""THE BOARD WENT STALE FOR TWO DAYS AND NOTHING IN THE REPO SAID SO.

WHAT HAPPENED. 2026-08-17: the nightly `draft-data.yml` on `main` had been
refusing to publish since 08-15T17:52. The board BUILT correctly every night; the
acceptance gate rejected it, so "Commit the artifact" was skipped and the
previously published board stayed live — by design, and the design is right. What
was missing is that NOTHING TOLD ANYONE. The workflow opened issue #8 and
commented on it nightly, which is real alerting and it worked; it just requires a
human to read GitHub issues, and for two days none did. Five days before a draft.

The cost is not hypothetical even at two days. Between the frozen board and the
next one, only two players moved 10+ ADP spots inside the top 200 — and both fell
off a cliff: John Metchie 120.6 -> 364.2, Miami DEF 187.8 -> 338.2. Those are
exactly the rows a stale board makes dangerous, because it offers them at a price
the market has withdrawn.

WHY A TEST AND NOT A DASHBOARD. Every session in this repo runs pytest. None of
them reads the issue tracker. A staleness fact that lives only in GitHub is a
fact nobody encounters while working; the same fact in the suite is unmissable.

WHY IT IS `repo_parity`, WHICH IS THE LOAD-BEARING DECISION HERE. The publication
gate deselects that marker, and this test MUST NOT be able to block a rebuild.
`draft-data.yml` learned that the hard way on 2026-08-14 and says so in its own
comment: failing the job because the CURRENT board is broken is backwards, since
a rebuild is precisely what repairs it. A staleness check that blocked publishing
would guarantee the thing it warns about — the board is stale, therefore we may
not replace it. So it runs in the nightly ADVISORY step (full suite,
`continue-on-error: true`) and in every ordinary local run, and never in the gate.

Run: python -m pytest draft/tests/test_published_board_is_not_stale.py
"""
from __future__ import annotations

import datetime as dt
import json
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BOARD = os.path.join(ROOT, "public", "draft_data.json")

#: Three missed nightlies. Not tuned to be comfortable: the rebuild runs daily,
#: so one stale day is ordinary timing and three is a pipeline that stopped.
MAX_AGE_DAYS = 3


def is_stale(built, now=None):
    """The whole judgement, as a function, so it can be exercised against a date
    that is not today's. A staleness check that has only ever been run on a fresh
    board has not been shown to fire."""
    now = now or dt.datetime.now(dt.timezone.utc)
    return (now - built) > dt.timedelta(days=MAX_AGE_DAYS)


def _built_at():
    doc = json.load(open(BOARD, encoding="utf8"))
    raw = doc.get("built_at")
    assert raw, "the board carries no built_at — it cannot be checked for staleness at all"
    return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")), doc


def test_the_board_declares_when_it_was_built():
    """CONTROL. Every assertion below is vacuous if the stamp is missing, and a
    board with no stamp is a worse problem than a stale one."""
    built, doc = _built_at()
    assert built.year >= 2026
    assert doc.get("players"), "a board with no players cannot be drafted from"


def test_CONTROL_the_check_actually_fires_on_a_stale_board():
    """KNOWN-POSITIVE. Run against the real dates of the stall this file exists
    for: a board built 2026-08-15T17:52Z, read on the morning of 08-19 — the
    third missed nightly — must be called stale. And the day before must not,
    or the threshold is really zero and every ordinary night goes red."""
    built = dt.datetime(2026, 8, 15, 17, 52, tzinfo=dt.timezone.utc)
    assert is_stale(built, dt.datetime(2026, 8, 19, 8, 0, tzinfo=dt.timezone.utc))
    assert not is_stale(built, dt.datetime(2026, 8, 18, 8, 0, tzinfo=dt.timezone.utc))


def test_CONTROL_a_board_built_moments_ago_is_never_stale():
    """The other direction. If this ever failed, the check would refuse fresh
    boards and become the pipeline-blocking guard its own docstring forbids."""
    assert not is_stale(dt.datetime.now(dt.timezone.utc))


@pytest.mark.repo_parity
def test_the_published_board_is_not_stale():
    """FAILS ON ITS OWN, ON PURPOSE. That is not flakiness — it is the entire
    mechanism. A board ages whether or not anyone is looking, so the only check
    worth having is one that changes state without being asked."""
    built, doc = _built_at()
    now = dt.datetime.now(dt.timezone.utc)
    age = now - built
    assert age <= dt.timedelta(days=MAX_AGE_DAYS), (
        f"THE PUBLISHED BOARD IS {age.days} DAYS OLD "
        f"(built {built.isoformat()}, {len(doc.get('players') or [])} players).\n\n"
        "The nightly rebuild is not landing. It almost certainly still BUILDS — "
        "the usual cause is the acceptance gate refusing to publish, which "
        "leaves the previous board live and skips the commit step. That is the "
        "gate working correctly; the problem is that the refusal went unread.\n\n"
        "CHECK, in this order:\n"
        "  1. the open 'Board rebuild refused to publish' issue — the workflow "
        "files one and comments on it every night it refuses;\n"
        "  2. the last draft-data.yml run's 'Acceptance gate on the FRESH "
        "board' step, which names the failing tests;\n"
        "  3. the 'refused-candidate-board' artifact on that run, which "
        "preserves the board that was rejected.\n\n"
        "DO NOT fix this by widening the gate or by hand-editing the board. On "
        "2026-08-17 the cause was two tests already fixed on a feature branch "
        "that had not been merged — the repair was a merge, not a change. See "
        "draft/audit/board_publish_stall_2026-08-17.md.")

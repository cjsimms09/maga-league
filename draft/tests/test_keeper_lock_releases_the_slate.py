# TERRITORY: A
"""CORY'S RULING, 2026-08-21, VERBATIM: "Locks once deadline passes."

WHAT IT SETTLED, AND WHY IT NEEDED SETTLING. On 08-20 the Friday sequence was
rehearsed with a synthetic clock instead of waited for, and it split in two:

  · `_keeper_lock_passed` was exactly right — False at Fri 17:59, True at
    18:00, and thirty placements on Thursday did NOT flip it early, which is
    Cory's earlier ruling that designations stay revocable until the deadline.
  · the SLATE did not move at all. Driven with the real shape (6 of 10 teams
    designated), `status` was 'partial' at 17:59 AND at 18:01. Only ten-of-ten
    produces 'confirmed'.

And `_keeper_map_for_board` switched on `status == "confirmed"` alone. So the
board would have gone into Saturday still withholding 13 real keepers from 5
opponents, and Cory would have read 13 gone players as available.

THE WITHHOLDING ITSELF IS GOOD AND IS PRESERVED. Its own reasoning: a board on
a partial slate is "authoritative-looking, wrong, and — the fatal part — IT
ALREADY MOVED ONCE", so the move that matters carries no signal. That is
correct BEFORE the deadline and inverts after it. Once the lock passes there is
no later move: by league rule a team that has not designated has designated
nobody. The gate's own principle — "Empty designations are UNKNOWN, never
zero" — is right until 18:00 and wrong at 18:01, because the deadline is
precisely what resolves UNKNOWN into zero.

This file exists so the ruling cannot be quietly undone, and so the half that
must NOT change — the pre-deadline withholding — is pinned just as hard.

Register 169.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import build as B  # noqa: E402

CFG = {"my_draft_slot": 3}

#: the live shape on 2026-08-20: Cory's slot plus five opponents holding 13
FULL = {
    "3": ["mine1", "mine2", "mine3"],
    "1": ["a", "b", "c"],
    "2": ["d", "e"],
    "4": ["f", "g", "h"],
    "5": ["i", "j"],
    "6": ["k", "l", "m"],
}
OPPONENT_KEEPERS = sum(len(v) for k, v in FULL.items() if k != "3")


def test_CONTROL_the_fixture_matches_the_situation_it_stands_for():
    """Non-vacuity first. If this fixture stopped holding opponent keepers, every
    assertion below would pass while measuring nothing."""
    assert OPPONENT_KEEPERS == 13, OPPONENT_KEEPERS
    assert len(FULL) == 6, "six teams designated, which is the state the ruling was made in"


def test_BEFORE_the_deadline_the_board_still_withholds():
    """THE HALF THAT MUST NOT REGRESS. The ruling changes what happens after the
    lock; it does not license applying a partial slate early, which is the
    original defect the gate was built for."""
    m, w = B._keeper_map_for_board(FULL, {"status": "partial",
                                          "keeper_lock_passed": False}, CFG)
    assert [str(k) for k in m] == ["3"], m
    assert w["withheld"] is True
    assert w["keepers"] == OPPONENT_KEEPERS


def test_AFTER_the_deadline_every_designation_is_applied():
    """The ruling itself."""
    m, w = B._keeper_map_for_board(FULL, {"status": "partial",
                                          "keeper_lock_passed": True}, CFG)
    assert len(m) == len(FULL), m
    assert w["withheld"] is False
    assert w["released_at_lock"] == OPPONENT_KEEPERS
    assert "Locks once deadline passes" in w["reason"], w["reason"]


@pytest.mark.parametrize("status", ["partial", "predicted", "unverified", "mismatch"])
def test_the_lock_releases_from_ANY_unconfirmed_status(status):
    """The deadline is the authority, not the verification state. A slate that
    could not be reconciled is still locked at 18:00 by league rule."""
    m, w = B._keeper_map_for_board(FULL, {"status": status,
                                          "keeper_lock_passed": True}, CFG)
    assert len(m) == len(FULL)
    assert w["withheld"] is False


@pytest.mark.parametrize("status,expected", [("partial", False), ("predicted", False),
                                             ("unverified", True), ("mismatch", True)])
def test_releasing_from_a_state_we_could_not_verify_is_STAMPED(status, expected):
    """RELEASING IS RIGHT AND MUST NOT BE SILENT. `unverified` means Sleeper was
    unreachable; `mismatch` means designations and placements disagree. Applying
    a possibly-stale map beats withholding — Cory reading a gone player as
    available at 8 seconds a pick is the worse error — but the artifact has to
    carry which state it released from, or a caveat that exists only in a log
    line is a caveat nobody reads."""
    _, w = B._keeper_map_for_board(FULL, {"status": status,
                                          "keeper_lock_passed": True}, CFG)
    assert w["released_from_status"] == status
    assert w["released_unverified"] is expected


def test_a_CONFIRMED_slate_still_takes_the_original_path():
    """The first switch is untouched: ten-of-ten applies everything whether or
    not the deadline has passed, and does not claim a lock-release it did not
    make."""
    _, w = B._keeper_map_for_board(FULL, {"status": "confirmed",
                                          "keeper_lock_passed": False}, CFG)
    assert w["withheld"] is False
    assert "released_at_lock" not in w
    assert "slate confirmed" in w["reason"]


def test_the_lock_function_and_the_gate_agree_about_the_boundary():
    """END TO END, ON THE REAL CONFIG. The two halves were verified separately
    on 08-20 and the defect lived exactly in the seam between them, so the seam
    is what is asserted: drive the real clock through the real deadline and
    require the BOARD's keeper map to change at 18:00 and not before."""
    import datetime as dt
    import json
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    cfg = dict(cfg, my_draft_slot=3)
    tz = dt.timezone(dt.timedelta(hours=-5))          # CDT

    def board_at(when):
        passed = B._keeper_lock_passed(cfg, placements=None, now=when)
        m, _ = B._keeper_map_for_board(FULL, {"status": "partial",
                                              "keeper_lock_passed": passed}, cfg)
        return len(m)

    before = board_at(dt.datetime(2026, 8, 21, 17, 59, tzinfo=tz))
    at = board_at(dt.datetime(2026, 8, 21, 18, 0, tzinfo=tz))
    after = board_at(dt.datetime(2026, 8, 22, 9, 0, tzinfo=tz))   # draft morning
    assert before == 1, f"the board should hold only Cory's keepers at 17:59, got {before}"
    assert at == len(FULL), f"every designation should apply at 18:00, got {at}"
    assert after == len(FULL), f"and still on draft morning, got {after}"

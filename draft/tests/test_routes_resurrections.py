"""Tests for the resurrected-item detector and its repair.

The whole risk of this tool is in ONE direction: deleting a copy that carried
something the survivor does not. So most of what follows is the FAIL ARM — proof
that the containment guard refuses, not proof that the happy path works.

Every fixture is synthetic. The one live-repo test is a CONTROL and it asserts
the file is CLEAN, because the repair ran on 2026-08-18; if resurrections come
back, that test says so at the commit that causes them.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import routes_resurrections as R  # noqa: E402

# LONGER THAN THE 110-CHARACTER KEY ON PURPOSE, and the first draft of this file
# was not — every synthetic pair silently failed to group, because an 85-char item
# plus an appended closure note produces two DIFFERENT truncated keys. Real items
# in `ROUTES.md` run 700-4000 characters, so the copies always share their prefix.
# A fixture shorter than the key tests a situation that does not occur.
LONG = ("2026-08-16 · artifact-freshness infra · the registry is wired, every declared "
        "input is checked at build, and the board refuses to publish against an input "
        "committed more recently than itself — measured on real history at 77 minutes")


def doc(*sections):
    """`(heading, [item, ...])` pairs -> a ROUTES.md-shaped string."""
    out = ["# ROUTES", ""]
    for head, items in sections:
        out += [head, ""]
        out += items
        out += [""]
    return "\n".join(out)


# --- the resurrection itself ----------------------------------------------------

def test_a_closed_item_that_came_back_open_is_found():
    text = doc(("## TO: A", [f"- [ ] {LONG}",
                             f"- [x] {LONG} — CLOSED 2026-08-17 by the relay"]))
    rep, human = R.scan(text)
    assert len(rep) == 1 and not human
    assert rep[0][0] == "## TO: A"


def test_the_same_item_in_TWO_INBOXES_is_design_not_a_duplicate():
    """Standing rules are BROADCAST on purpose — a global key calls that corruption."""
    text = doc(("## TO: A", [f"- [ ] {LONG}"]),
               ("## TO: B", [f"- [x] {LONG} — CLOSED"]))
    assert R.scan(text) == ([], [])


def test_two_copies_in_the_SAME_state_are_reported_not_repaired():
    """Both closed is a paste, not a resurrection, and nobody's inbox is affected."""
    text = doc(("## TO: A", [f"- [x] {LONG}", f"- [x] {LONG} — plus a note"]))
    rep, human = R.scan(text)
    assert rep == [] and len(human) == 1 and "both CLOSED" in human[0][2]

    text = doc(("## TO: A", [f"- [ ] {LONG}", f"- [ ] {LONG} — plus a note"]))
    rep, human = R.scan(text)
    assert rep == [] and len(human) == 1 and "both OPEN" in human[0][2]


def test_three_copies_are_never_repaired_automatically():
    text = doc(("## TO: A", [f"- [ ] {LONG}", f"- [x] {LONG} — a", f"- [x] {LONG} — b"]))
    rep, human = R.scan(text)
    assert rep == [] and "more than two" in human[0][2]


# --- THE FAIL ARM: the guard must refuse the direction that loses evidence -------

def test_an_OPEN_copy_carrying_ITS_OWN_text_is_NEVER_deleted():
    """THE 16-LINE LOSS, as a test.

    Repairing two of these by hand on 2026-08-18 destroyed 16 lines of evidence,
    because the copy still OPEN was the one that had been edited since. If the
    open copy says anything the closed one does not, no automatic repair exists.
    """
    text = doc(("## TO: A", [f"- [ ] {LONG} — AND A LATER MEASUREMENT ONLY HERE",
                             f"- [x] {LONG} — CLOSED"]))
    rep, human = R.scan(text)
    assert rep == [], "the open copy carries unique text and must not be deleted"
    assert "OPEN copy carries text" in human[0][2]


def test_containment_is_asymmetric_and_that_is_the_whole_point():
    assert R.contained("abc", "abc plus a closure note")
    assert not R.contained("abc plus a measurement", "abc")
    assert not R.contained("abc DEF", "abc XYZ")      # a replace, not an insert
    assert R.contained("abc", "abc")                  # identical is containment


def test_repair_deletes_the_OPEN_copy_and_keeps_the_LONGER_CLOSED_one():
    """Six of the seven real pairs have the LONGER text on the CLOSED side.

    So "delete the stale closed one", the intuitive repair, is backwards here.
    """
    text = doc(("## TO: A", [f"- [ ] {LONG}",
                             f"- [x] {LONG} — CLOSED 2026-08-17, with the evidence"]))
    new, done = R.repair(text)
    assert len(done) == 1
    assert new.count(LONG) == 1
    assert "with the evidence" in new, "the surviving copy kept its body"
    assert "- [ ] " + LONG not in new


def test_repair_is_idempotent():
    text = doc(("## TO: A", [f"- [ ] {LONG}", f"- [x] {LONG} — CLOSED"]))
    once, _ = R.repair(text)
    twice, done = R.repair(once)
    assert twice == once and done == []


def test_repair_touches_nothing_else():
    other = "- [ ] 2026-08-18 · relay · a completely unrelated item with plenty of words in it"
    text = doc(("## TO: A", [other, f"- [ ] {LONG}", f"- [x] {LONG} — CLOSED"]))
    new, _ = R.repair(text)
    assert other in new


# --- keying --------------------------------------------------------------------

def test_emoji_and_emphasis_do_not_hide_a_duplicate_but_they_DO_block_the_repair():
    """THE KEY IS NORMALISED AND THE REPAIR IS NOT, and that asymmetry is deliberate.

    Byte-equality sees none of the real pairs — the copies differ by a checkbox, a
    leading 🔴, a `~~strikethrough~~` — so the KEY has to strip all of that or the
    duplicates stay invisible. But the DELETION is authorised by comparing the raw
    bodies, so a pair that differs by so much as an emoji is found and then refused.
    Reformatting a copy is a real edit; a tool that shrugs at it is a tool that
    deletes somebody's edit.
    """
    a = "- [ ] 🔴 **" + LONG + "**"
    b = "- [x] ~~" + LONG + "~~ — CLOSED"
    rep, human = R.scan(doc(("## TO: A", [a, b])))
    assert rep == [], "formatting differences must not authorise a deletion"
    assert len(human) == 1 and "OPEN copy carries text" in human[0][2]


def test_a_short_item_is_too_short_to_join_on_safely():
    text = doc(("## TO: A", ["- [ ] ship it", "- [x] ship it"]))
    assert R.scan(text) == ([], [])


def test_two_items_sharing_a_long_PREFIX_still_collide_and_this_is_the_known_cost():
    """STATED, NOT HIDDEN. The key is a truncated prefix, so two items whose first
    110 characters match are treated as one. That is why `--repair` requires
    containment over the FULL body: the key finds candidates, the containment test
    is what authorises a deletion. A prefix collision between genuinely different
    items fails containment and lands in `needs_human`.
    """
    stem = "2026-08-16 · A · " + LONG + " and then the two items diverge only at the end "
    text = doc(("## TO: A", ["- [ ] " + stem + "ALPHA", "- [x] " + stem + "BETA"]))
    rep, human = R.scan(text)
    assert rep == [], "a prefix collision must never authorise a deletion"
    assert len(human) == 1


# --- CONTROL against the live repo ----------------------------------------------

def test_the_live_file_has_no_repairable_resurrections_left():
    """Repaired 2026-08-18. If this fails, a union merge resurrected something new.

    The two `needs_human` paires in `## TO: A` (both-CLOSED pastes) are expected
    and are NOT resurrections — they belong to A, and nothing automatic will touch
    them.
    """
    rep, human = R.scan(R.ROUTES.read_text())
    assert rep == [], f"resurrections are back: {rep}"
    assert all(h[2].startswith("both CLOSED") for h in human), human

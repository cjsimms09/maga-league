# TERRITORY: A
"""NOTHING IN THE DEFECT REGISTER MAY LOSE ITS OWNER OR ITS NEXT ACTION.

Cory, 2026-08-17: "it's also your job to make sure nothing gets left behind or
not chased down, especially potential data or logic errors or anything that
messes with our models draft or inseason tools."

`DEFECT-REGISTER.md` is the answer to that. The way a register fails is never
dramatic — a row loses its owner in an edit, or its next action becomes "TBD",
and from then on it is decoration. So the structure is checked rather than
trusted.

WHAT THIS DOES NOT DO: judge whether a row is being worked on. It cannot. It
only guarantees that every open defect names a person and a next step, which is
the minimum that makes chasing possible at all.

Run: python -m pytest draft/tests/test_defect_register.py
"""
from __future__ import annotations

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REGISTER = os.path.join(ROOT, "DEFECT-REGISTER.md")

STATUSES = {"OPEN", "IN HAND", "WAITING", "CLOSED"}
PLACEHOLDERS = re.compile(r"\bTBD\b|\bTODO\b|\bt\.b\.d\b|^\s*[-–—?]\s*$", re.I)


def rows():
    """Every table row that carries a status word, as a list of cells."""
    out = []
    for line in open(REGISTER, encoding="utf8").read().split("\n"):
        if not line.startswith("|") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if any(any(s in c.upper() for s in STATUSES) for c in cells):
            out.append(cells)
    return out


def test_the_register_exists_and_has_rows():
    """CONTROL. Every assertion below passes trivially on an empty file."""
    assert os.path.exists(REGISTER)
    assert len(rows()) >= 8, f"only {len(rows())} tracked rows — the register emptied out"


def test_every_tracked_row_names_an_owner():
    """A defect with no owner is a defect nobody is chasing, which is the exact
    failure this register was created to stop."""
    bad = []
    for cells in rows():
        # owner column is the one before status in every table here
        owner = next((c for c in cells if re.search(
            r"\b(A|B|C|D|Cory|relay)\b", c) and len(c) < 40), None)
        if not owner or PLACEHOLDERS.search(owner):
            bad.append(" | ".join(c[:40] for c in cells))
    assert not bad, "rows with no owner:\n" + "\n".join(bad)


def test_every_tracked_row_has_a_next_action():
    """'What do I do about it' is the part that rots first."""
    bad = []
    for cells in rows():
        action = cells[-1]
        if len(action) < 12 or PLACEHOLDERS.search(action):
            bad.append(" | ".join(c[:40] for c in cells))
    assert not bad, "rows with no usable next action:\n" + "\n".join(bad)


def test_status_words_are_from_the_declared_set():
    """Free-text status is how two people come to read the same row differently."""
    bad = []
    for cells in rows():
        joined = " ".join(cells).upper()
        if not any(s in joined for s in STATUSES):
            bad.append(" | ".join(c[:40] for c in cells))
    assert not bad, "rows with an unrecognised status:\n" + "\n".join(bad)


def test_the_blocking_section_still_names_the_board_and_a_red_main():
    """The two things that would sink 08-22. If either is removed from BLOCKING,
    it must be because it CLOSED — and a closed row says so."""
    src = open(REGISTER, encoding="utf8").read()
    block = src.split("## 🟠")[0]
    assert re.search(r"board.{0,40}publish", block, re.I | re.S), (
        "the board-publication blocker left the BLOCKING section")
    assert re.search(r"main.{0,20}CI red|CI red|red.{0,20}main", block, re.I), (
        "the red-main blocker left the BLOCKING section")


def test_the_ceiling_ruling_and_its_hold_are_both_recorded():
    """The single most expensive thing to forget: the weight is known wrong AND
    deliberately held. Recording only one half misleads in either direction."""
    src = open(REGISTER, encoding="utf8").read()
    assert re.search(r"ceiling.{0,80}contradicted|contradicted.{0,80}ceiling",
                     src, re.I | re.S)
    assert "08-22" in src, "the hold must carry the date it expires"

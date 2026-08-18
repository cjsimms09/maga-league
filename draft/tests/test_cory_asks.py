"""CORY-ASKS.md is the promise register, and it is enforced here.

Cory, 2026-08-17: "when I type things to you Im not necessarily expecting you to
do it but youre the project manager so you need to deligate effectively but also
make sure i get what I want."

ROUTES.md tracks what was ASSIGNED. DEFECT-REGISTER.md tracks what is BROKEN.
Neither tracks what Cory ASKED FOR and whether it arrived — so on 2026-08-17 an
ask (re-test every adjuster after the ceiling/floor change, and auto-tune them
in-draft by round/position/circumstance) went a full day with no owner, no
register row and no route. Nothing in the repo would have noticed.

Every check ships with a known-positive control proving it can fail.
"""

from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[2]
ASKS = ROOT / "CORY-ASKS.md"

OWNERS = re.compile(r"\b(A|B|C|D|E|Cory|relay)\b")
STATUSES = ("ASKED", "DELEGATED", "DELIVERED", "VERIFIED", "CORY")
PLACEHOLDERS = re.compile(r"\b(tbd|tbc|someone|anyone|nobody|\?\?\?)\b", re.I)


def table_rows(text):
    """Every data row of every markdown table in the file."""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|") or set(line) <= set("|-: "):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 3:
            continue
        if cells[0].lower() in ("#", "what", "what cory asked for"):
            continue
        out.append(cells)
    return out


def test_the_file_exists_and_carries_rows():
    assert ASKS.exists(), "CORY-ASKS.md is missing — the promise register is the point"
    assert len(table_rows(ASKS.read_text())) >= 8, "too few rows to be a real register"


def open_rows(text):
    """Rows of the OPEN table only.

    Delivered rows need no owner (the work exists) and the WAITING-ON-CORY table
    is Cory's by definition. Scoping matters: an earlier version of this check
    searched every cell for an owner-looking word and happily accepted the word
    "Cory" appearing inside a DESCRIPTION. That is the same defect
    test_defect_register.py carries, so this one reads the OWNER COLUMN.
    """
    start = text.index("## OPEN")
    end = text.index("## WAITING ON CORY")
    return table_rows(text[start:end])


OWNER_COL = 2   # | # | what | owner | status | done |


def test_every_ask_names_an_owner():
    """An ask with no owner is an ask nobody is delivering — the A6 failure."""
    bad = []
    for cells in open_rows(ASKS.read_text()):
        owner = cells[OWNER_COL] if len(cells) > OWNER_COL else ""
        if not OWNERS.search(owner) or PLACEHOLDERS.search(owner):
            bad.append(" | ".join(c[:45] for c in cells))
    assert not bad, "asks with no owner in the owner column:\n" + "\n".join(bad)


def test_every_open_ask_names_a_status():
    text = ASKS.read_text()
    bad = []
    for cells in open_rows(text):
        if not any(s in " ".join(cells) for s in STATUSES):
            bad.append(" | ".join(c[:45] for c in cells))
    assert not bad, (
        "open asks with no status word:\n" + "\n".join(bad)
        + f"\nstatus must be one of {STATUSES}"
    )


def test_owner_detector_can_fail():
    """Known-positive control: a placeholder owner must be rejected."""
    cells = ["A9", "**something Cory asked for**", "TBD", "DELEGATED", "figure it out"]
    owner = cells[OWNER_COL]
    assert not OWNERS.search(owner) or PLACEHOLDERS.search(owner), (
        "the owner detector accepts a placeholder — it cannot catch the failure it exists for"
    )


def test_owner_detector_does_not_read_the_description():
    """The bug this check shipped with: "Cory" inside a DESCRIPTION is not an owner."""
    cells = ["A9", "**something Cory asked for**", "TBD", "DELEGATED", "do it"]
    assert not OWNERS.search(cells[OWNER_COL]), (
        "an owner was found outside the owner column — the detector is reading prose"
    )


def test_status_detector_can_fail():
    """Known-positive control for the status check."""
    row = "| A9 | **an ask** | **A** | soon | someday |"
    cells = [c.strip() for c in row.strip("|").split("|")]
    assert not any(s in " ".join(cells) for s in STATUSES), (
        "the status detector accepts a non-status — it cannot catch a row drifting"
    )


def test_delegated_is_not_treated_as_finished():
    """The rule Cory's message is about: delegating is not delivering."""
    text = ASKS.read_text().lower()
    assert "delegated" in text and "is a status, not a finish line" in text, (
        "the file must state that DELEGATED is not done — that distinction is the "
        "entire reason this register exists"
    )


def test_the_lost_ask_is_recorded_so_it_cannot_quietly_close():
    """A6 is the worked example. If it vanishes, the lesson vanishes with it."""
    text = ASKS.read_text()
    assert "A6" in text, "the ask that was lost for a day must stay on the record"
    assert "adjuster" in text.lower(), "A6 must still name the adjuster re-test"


@pytest.mark.parametrize("doc", ["OPERATING-MODEL.md", "DEFECT-REGISTER.md"])
def test_the_register_is_discoverable_from_the_docs_a_session_reads(doc):
    """A register nobody is pointed at is a register nobody reads."""
    text = (ROOT / doc).read_text()
    assert "CORY-ASKS.md" in text, (
        f"{doc} does not point at CORY-ASKS.md — a new session would never find it"
    )

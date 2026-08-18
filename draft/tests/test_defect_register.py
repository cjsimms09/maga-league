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
            r"\b(A|B|C|D|E|Cory|relay)\b", c) and len(c) < 40), None)
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


# ── TWO ROWS, ONE ID ────────────────────────────────────────────────────────────
# Added 2026-08-18, on FIVE live collisions. Register rows are addressed by number
# in eight other files — `ROUTES.md`, `DRAFT-WEEK-BRIEF.md`, `CORY-ASKS.md`,
# `OPEN-QUESTIONS.md`, `SESSION-D.md`, `DATA-LIFECYCLE.md`, two audit artifacts and
# `projection_error.py` — so an id is a public address, not a label.
#
# `29`, `30`, `31`, `32` and `4x` each named TWO DIFFERENT DEFECTS. "Register 31"
# had already gone ambiguous in the wild: nine references meant the headline-edge
# misread, three meant the RB-flatness calibration finding. Nothing detected it,
# because every check in this file iterates rows and none of them compares ids.
#
# CAUSE: no shared allocator. Two sessions read the file, both saw the max id, both
# took the next one, and neither could see the other's uncommitted work. Care does
# not fix that; a check at the commit does.
#
# RESOLVED BY FEWEST-REFERENCES-BROKEN, NOT BY FIRST-ALLOCATION. First allocation
# is the tidier rule and it was the wrong one here — for row 30 the FIRST-filed row
# had zero external references and the second had two, so first-wins would have
# broken both. The copy with fewer live references moves, and its references move
# with it in the same commit.


def _numbered_rows():
    """`(id, first-80-chars)` for every row whose first cell is an id."""
    out = []
    for line in open(REGISTER, encoding="utf8").read().split("\n"):
        if not line.startswith("|") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rid = cells[0].replace("*", "").replace("`", "").strip()
        if not rid or not re.match(r"^\d+[a-z]?$", rid):
            continue
        out.append((rid, cells[1][:80] if len(cells) > 1 else ""))
    return out


def test_no_two_rows_share_an_id():
    """A row id is an ADDRESS — eight other files dereference it."""
    seen = {}
    clashes = []
    for rid, text in _numbered_rows():
        if rid in seen:
            clashes.append(f"{rid}: {seen[rid]!r}  vs  {text!r}")
        seen[rid] = text
    assert not clashes, (
        "two rows share an id, so every cross-file reference to it is ambiguous:\n  "
        + "\n  ".join(clashes))


def test_CONTROL_the_id_check_actually_parses_ids():
    """Guards the way this check would silently die: matching nothing and passing."""
    ids = [rid for rid, _ in _numbered_rows()]
    assert len(ids) >= 40, f"only {len(ids)} ids parsed — the row shape changed"
    assert "1" in ids and "34" in ids, ids[:10]


def test_FAIL_ARM_the_id_check_can_actually_fail(tmp_path, monkeypatch):
    """A check that has never been seen to fail is not known to work — rule 3e."""
    fake = tmp_path / "DEFECT-REGISTER.md"
    fake.write_text(
        "| id | what | owner | status |\n|---|---|---|---|\n"
        "| 7 | one defect | A | OPEN |\n"
        "| 7 | a completely different defect | B | CLOSED |\n",
        encoding="utf8")
    import sys as _sys
    monkeypatch.setattr(_sys.modules[__name__], "REGISTER", str(fake))
    seen, clashes = {}, []
    for rid, text in _numbered_rows():
        if rid in seen:
            clashes.append(rid)
        seen[rid] = text
    assert clashes == ["7"], clashes

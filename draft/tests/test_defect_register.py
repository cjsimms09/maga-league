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
        #: SPLIT ON UNESCAPED PIPES ONLY. A cell may legitimately contain
        #: `\\|` — this file's own hard gate below REQUIRES the escape, because
        #: a bare pipe is a column separator. Splitting on every pipe re-creates
        #: that bug inside the guard meant to catch it, and it did: on 08-18 the
        #: owner check below was passing on rows E6 and E15 only because the
        #: scrambled split produced a short fragment that satisfied its length
        #: heuristic. Un-scrambling the rows made a real gap visible.
        cells = [c.strip() for c in re.split(r"(?<!\\)\|", line.strip("|"))]
        if any(any(s in c.upper() for s in STATUSES) for c in cells):
            out.append(cells)
    return out


def _owner_cell(cells):
    """The owner is the cell immediately BEFORE the status cell.

    This used to be "the first cell under 40 characters that contains a lane
    letter", and that heuristic is wrong in both directions: it matches any
    short prose fragment, and it MISSES a legitimate owner cell that says more
    than a letter — `**B** (fixed by E on Cory's instruction — **B please
    review**)` is 58 characters and is the clearest owner cell in the register.

    Position is not a heuristic. The register's shape is fixed, and the
    column-count gate in this same file holds it at zero broken rows, so the
    cell before the status cell IS the owner cell.
    """
    #: Rows are `| # | what | owner | status | next action |`, so status is the
    #: second-from-last cell and owner the third-from-last. Do NOT search for a
    #: cell CONTAINING a status word — "OPEN" and "CLOSED" appear constantly in
    #: the prose cells, and searching finds the first one, which is usually the
    #: `what` column. Same narrowness, same reason, as register_recheck_check.
    return cells[-3] if len(cells) >= 3 else None


def test_the_register_exists_and_has_rows():
    """CONTROL. Every assertion below passes trivially on an empty file."""
    assert os.path.exists(REGISTER)
    assert len(rows()) >= 8, f"only {len(rows())} tracked rows — the register emptied out"


def test_every_tracked_row_names_an_owner():
    """A defect with no owner is a defect nobody is chasing, which is the exact
    failure this register was created to stop."""
    bad = []
    for cells in rows():
        owner = _owner_cell(cells)
        # CASE-INSENSITIVE on the names (2026-08-19): a row written "**CORY**"
        # reads as a perfectly good owner to a human and was rejected on
        # capitalisation alone. This only widens the match for names already
        # allowed — an unowned row still fails, which is the whole point.
        if not owner or not re.search(r"\b(A|B|C|D|E|Cory|relay)\b", owner, re.I) \
                or PLACEHOLDERS.search(owner):
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


def _normalized_headline(cells):
    """The first ~120 chars of a row's finding, stripped of markup, lowercased.
    Loose enough to survive an emoji or a bold-marker difference; tight enough
    that two genuinely different findings essentially never collide.

    Also strips a leading "(renumbered from X at merge...)" annotation. Found
    the hard way: id 43 carried exactly that prefix in front of a byte-for-byte
    copy of DS3's finding, and the first version of this check missed it
    because the parenthetical alone was enough to push the real text past the
    120-char comparison window.
    """
    text = cells[1] if len(cells) > 1 else ""
    text = re.sub(r"^\s*\*?\(renumbered from [^)]*\)\*?\s*", "", text, flags=re.I)
    text = re.sub(r"[*_`✅🔴🟠🟡🟢⚠️📐🔑]", "", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text[:120]


def test_no_two_DIFFERENT_ids_carry_the_same_finding():
    """DEFECT GUARDED: register 31 and DS1 were the SAME finding under two
    different ids, produced when an earlier merge failed to recognise a row
    duplicated across two branches as one row instead of two. `id` uniqueness
    (above) does not catch this shape — the ids were different on purpose, to
    dodge a collision, and the collision happened one column over instead.
    Found by D auditing for exactly this on 2026-08-18; consolidated into 31.
    """
    by_headline = {}
    for cells in rows():
        rid = cells[0].replace("*", "").replace("`", "").strip()
        if not rid:
            continue
        by_headline.setdefault(_normalized_headline(cells), set()).add(rid)
    dupes = {h: ids for h, ids in by_headline.items() if len(ids) > 1}
    assert not dupes, (
        "the same finding appears under more than one row id — merge them:\n  "
        + "\n  ".join(f"{ids}: {h!r}" for h, ids in dupes.items())
    )


def test_CONTROL_the_headline_duplicate_check_can_actually_fire(tmp_path, monkeypatch):
    """A check that has never been seen to fail is not known to work."""
    fake = tmp_path / "DEFECT-REGISTER.md"
    same_open = ("**THE BOARD MIS-PRICES K/DEF ENTIRELY AND HAS DONE SO SINCE "
                 "THE FETCH FILTER DROPPED THEM, WHICH NOBODY NOTICED FOR A WEEK"
                 " BECAUSE THE CALIBRATION COUNTS CELLS ATTEMPTED, NOT CELLS")
    fake.write_text(
        "| id | what | owner | status | next |\n|---|---|---|---|---|\n"
        f"| 7 | {same_open} PRICED.** branch A's later note here | A | OPEN | fix it |\n"
        f"| DS9 | {same_open} PRICED.** branch B's later note here | B | OPEN | fix it too |\n",
        encoding="utf8")
    import sys as _sys
    monkeypatch.setattr(_sys.modules[__name__], "REGISTER", str(fake))
    by_headline = {}
    for cells in rows():
        rid = cells[0].replace("*", "").replace("`", "").strip()
        by_headline.setdefault(_normalized_headline(cells), set()).add(rid)
    dupes = {h: ids for h, ids in by_headline.items() if len(ids) > 1}
    assert dupes and {"7", "DS9"} in [set(v) for v in dupes.values()], dupes


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


# ── COLUMN INTEGRITY, AND THE RELAY BROKE THIS ROW ITSELF ────────────────────
#
# 2026-08-18. Annotating row 4v I appended prose containing the calibration-cell
# notation `WR|33+`. A markdown table cell cannot hold a bare pipe: every one is
# a COLUMN SEPARATOR. So the append landed mid-sentence — the helper split the
# line on all pipes and treated the fragment ending at `WR|` as the claim cell —
# and the row rendered with `33+ n=91 → 7.79e-4 · TE` in its OWNER column.
#
# NOTHING CAUGHT IT, and the reason is worth stating because it is not a hole:
# the owner check above SEARCHES every cell for an owner pattern and the action
# check reads `cells[-1]`, both deliberately position-independent. That design
# is why this file kept passing on a scrambled row — robustness bought at the
# price of blindness to the scrambling itself.
#
# Six rows already carried this before today (4i, 4q, 4s, 4t, E15, 39) — all the
# same cause, calibration-cell notation like `RB|33+` plus one JS `||` inside a
# code span. It was going to ship as a ratchet at 6, and then the hazard argued
# itself out of that: **4i is a live blocking row with a recheck TOMORROW.** The
# next lane to annotate it would have appended into the wrong fragment exactly as
# I did on 4v, because the helper everyone uses splits on every pipe. A ratchet
# would have left six loaded guns lying around.
#
# So all six were repaired instead — every internal pipe escaped as `\|`, which
# GFM renders as a literal pipe even inside a code span. Verified contiguous
# before touching them: unlike 4v these were merely SPLIT, not reordered, so
# escaping is a pure repair and no prose moved. Owner and status cells now read
# `**B**` / `🔴 OPEN`, `**C** builds · **A** rules`, and so on, where they belong.
#
# Hence ZERO, and a hard gate. Do not raise this number.
KNOWN_BROKEN_COLUMNS = 0


def _unescaped_columns(line: str) -> list:
    """Cells, splitting only on pipes a cell did not escape.

    `\\|` renders as a literal pipe in GitHub markdown and is the correct way to
    write `WR\\|33+` inside a cell.
    """
    return re.split(r"(?<!\\)\|", line.rstrip("\n"))


def _malformed_rows() -> list:
    out = []
    for line in open(REGISTER, encoding="utf8").read().split("\n"):
        m = re.match(r"^\| ([0-9A-Za-z]+) \|", line)
        if not m or m.group(1) == "what":     # prose lines beginning "| what"
            continue
        cols = _unescaped_columns(line)
        if len(cols) != 7:
            out.append((m.group(1), len(cols)))
    return out


def test_no_NEW_row_smuggles_an_unescaped_pipe_into_a_cell():
    """RATCHET. If this fails you added a bare `|` inside a cell — escape it as
    `\\|`. Do not raise the number; the whole point is that it only falls."""
    bad = _malformed_rows()
    assert len(bad) <= KNOWN_BROKEN_COLUMNS, (
        f"{len(bad)} rows have a broken column count (was {KNOWN_BROKEN_COLUMNS}): "
        f"{bad}. A bare pipe inside a cell is a column separator — escape it.")


def test_CONTROL_the_column_check_sees_healthy_rows_too():
    """Without this, a parser that matched nothing would satisfy the ratchet
    forever — the vacuous-green shape (`vacuous_check_scan.py`)."""
    total = sum(1 for line in open(REGISTER, encoding="utf8").read().split("\n")
                if re.match(r"^\| [0-9A-Za-z]+ \|", line))
    assert total > 80, f"only {total} rows parsed — the row shape changed"
    assert len(_malformed_rows()) < total / 4, "most rows should be well formed"


def test_FAIL_ARM_an_unescaped_pipe_IS_detected(tmp_path, monkeypatch):
    """The exact 4v shape, on a fixture."""
    fake = tmp_path / "DEFECT-REGISTER.md"
    fake.write_text(
        "| 9a | a clean claim | A | OPEN | do the thing |\n"
        "| 9b | cells WR|33+ and RB|33+ | A | OPEN | do the thing |\n",
        encoding="utf8")
    import sys as _sys
    monkeypatch.setattr(_sys.modules[__name__], "REGISTER", str(fake))
    bad = _malformed_rows()
    assert [r for r, _ in bad] == ["9b"], bad
    #: and the escaped form is accepted, or the fix would have nowhere to go
    fake.write_text(
        "| 9a | a clean claim | A | OPEN | do the thing |\n"
        "| 9b | cells WR\\|33+ and RB\\|33+ | A | OPEN | do the thing |\n",
        encoding="utf8")
    assert _malformed_rows() == []


def test_CONTROL_the_owner_check_can_still_fail():
    """Rule 3e. The owner assertion returns a clean "no rows without an owner".
    A check that cannot say yes has not been tested, only run — and this one
    was, for weeks, passing on two rows by accident."""
    assert _owner_cell(["7", "a thing", "**A**", "OPEN", "do it"]) == "**A**"
    assert _owner_cell(["7", "a thing", "TBD", "OPEN", "do it"]) == "TBD"
    #: ⚠️ prose containing a status word must NOT be mistaken for the status
    #: cell — this is what broke the first attempt at this fix
    assert _owner_cell(["7", "row is still OPEN per A", "**C**", "OPEN", "go"]) == "**C**"
    #: the long descriptive owner cell the old length heuristic silently missed
    long_owner = "**B** (fixed by E on Cory's instruction — **B please review**)"
    assert len(long_owner) > 40
    assert _owner_cell(["E6", "a thing", long_owner, "OPEN", "do it"]) == long_owner
    #: a degenerate row yields None rather than a confidently wrong owner
    assert _owner_cell(["7", "a thing"]) is None

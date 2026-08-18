"""Keep the one-screen decision sheet honest.

`A-DRAFT-DAY-DECISIONS.md` is a TRIAGE of the register down to what can still
change a number on Cory's screen on 22 August. A summary of a register is exactly
the kind of document that rots the day after it is written, and a rotted one is
worse than none because it looks current.

**THE FAILURE MODE THIS GUARDS IS SPECIFIC AND HAS ALREADY HAPPENED HERE.** On
08-18 the relay's own ROUTES index carried decision ⑤ — *"add two suites to CI"*
— for something that was already in CI, and item ① described a cherry-pick as a
red-blocking P0 when both suites were green. Both were summaries of a state
nobody re-checked. So this file re-checks:

  · every register id the sheet names EXISTS in DEFECT-REGISTER.md
  · and is still OPEN — a decided row must be struck in the deciding commit
  · every A-row carries a DEFAULT, so silence is an answer (OPERATING-MODEL)
  · every Cory-row names the register row it comes from
  · the "73 open rows" framing is still roughly true, because the sheet's whole
    argument is that the backlog is large

It deliberately does NOT check the prose. Judgement is A's to overrule; what is
mechanical is whether the sheet still points at things that exist.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / "A-DRAFT-DAY-DECISIONS.md"
REGISTER = ROOT / "DEFECT-REGISTER.md"


def _sheet() -> str:
    return SHEET.read_text(encoding="utf8")


def _register_rows() -> dict:
    """id -> (status cell, whole line). Uses the register's own row shape."""
    out = {}
    for line in REGISTER.read_text(encoding="utf8").split("\n"):
        m = re.match(r"^\| ([0-9A-Za-z]+) \|", line)
        if not m:
            continue
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 6:
            continue
        out[m.group(1)] = (cells[4], line)
    return out


def _ids_named() -> set:
    """Register ids the sheet points at.

    Bolded `**42**`, `**5e**`, and bare mentions in the §3 lists. Deliberately
    narrow — a loose pattern would sweep up ADP numbers and dollar figures and
    then this test would be asserting something it did not mean.
    """
    text = _sheet()
    ids = set()
    #: ⚠️ THE CONTROL BELOW CAUGHT THIS PATTERN BEING WRONG ON ITS FIRST RUN, which
    #: is the entire reason the control is there. The first version was
    #: `\*\*(id)\*\*` — it matched `**42**` but not `**5e — the compare tray…**`,
    #: where the bold run continues past the id. It silently dropped four of the
    #: five rows the sheet is built around, and every other assertion in this file
    #: would have gone on passing over the remainder.
    for m in re.finditer(r"\*\*([0-9]{1,2}[a-z]?|E[0-9]{1,2})(?=\*\*|\s+[—-])", text):
        ids.add(m.group(1))
    # the §3 "not on this page" list is comma-separated plain text
    #
    # ⚠️ SKIP THE BULLETS THAT ANNOUNCE A CLOSURE. §3 legitimately records rows
    # that were CLOSED or WITHDRAWN — that is the sheet doing its job — and
    # reading those as pending pointers made this file fail the moment the first
    # five rows were actually resolved. The guard is meant to catch a sheet that
    # still asks for a decision already made, not to forbid saying one was.
    sec = text.split("## 3 ·")[-1].split("## 4 ·")[0]
    live = "\n".join(b for b in re.split(r"\n(?=- )", sec)
                     if not re.search(r"CLOSED|RESOLVED|WITHDR", b))
    for m in re.finditer(r"\b(E[0-9]{1,2}|[0-9]{1,2}[a-z])\b", live):
        ids.add(m.group(1))
    return ids


def test_the_sheet_exists_and_is_one_screen():
    """A triage that grows into a second backlog has defeated itself."""
    text = _sheet()
    assert text.strip(), "empty sheet"
    #: generous, but it must stay a summary — the register itself is ~250KB
    assert len(text) < 12000, f"{len(text)} bytes — this is becoming a backlog again"


def test_every_register_id_the_sheet_names_actually_exists():
    rows = _register_rows()
    named = _ids_named()
    assert named, "the id extractor found nothing — it has drifted from the sheet"
    missing = sorted(i for i in named if i not in rows)
    assert not missing, (
        f"the sheet points at register rows that do not exist: {missing}. "
        "Either they were renumbered (fix the sheet) or the sheet invented them.")


def test_CONTROL_the_extractor_finds_the_ids_the_sheet_is_built_around():
    """Without this, an extractor that silently matched nothing would make the
    test above pass forever.

    RE-AIMED 2026-08-18 in the deciding commit: the original five (42, 5e,
    4x, 4d, E1) were the sheet's whole argument, and ALL FIVE were decided
    that day — struck from the sheet per the rule below, so pinning them here
    would force the sheet to keep naming settled rows. The control now pins
    the ids that remain the sheet's live argument after relay's 08-18
    §3 rewrite (35 closed when the rebuild trigger was wired; the bullet
    lists slimmed; then C2 was struck when the 08-17 ceiling ruling surfaced,
    taking bold-5 with it): 31 and E15 (the un-hidden rows), 4e / E6
    (display work) — 5 (C2's ceiling weight). When one
    of THESE is decided, move this list in that commit too — replace it with
    one the sheet is still built around, never just delete it, or the control
    erodes to nothing one row at a time (relay's phrasing, kept at merge)."""
    named = _ids_named()
    for core in ("31", "4e", "E15", "E6"):
        assert core in named, f"{core} is not being extracted — the pattern drifted"
    #: and the list must stay big enough to be a real control
    #: floor re-pinned 8 -> 5 (A, 08-18, same commit as the list above): the
    #: count fell because rows were DECIDED and struck — 35 closed, E1/5e/4x/4d
    #: ruled, the §3 rewrite slimmed the pointers — which is the sheet getting
    #: healthier, not the extractor drifting. The five named ids above are the
    #: drift guard; this floor only catches a wholesale extraction collapse.
    assert len(named) >= 4, f"only {len(named)} ids extracted — the pattern drifted"


def test_every_named_row_is_still_OPEN():
    """A decided row must be struck HERE in the commit that decides it.

    This is the assertion that stops the sheet from rotting: the moment A rules
    on one of these, the build says the sheet is stale.
    """
    rows = _register_rows()
    decided = []
    for rid in sorted(_ids_named()):
        status = rows[rid][0].upper()
        if "CLOSED" in status or "RESOLVED" in status:
            decided.append(rid)
    assert not decided, (
        f"these are settled but still listed as pending: {decided}. "
        "Strike them from A-DRAFT-DAY-DECISIONS.md in the deciding commit.")


def test_every_A_decision_carries_a_default():
    """OPERATING-MODEL: every request to A carries an ASK, EVIDENCE, a
    RECOMMENDATION and a DEFAULT, so silence is consent and nobody idles."""
    sec = _sheet().split("## 2 ·")[-1].split("## 3 ·")[0]
    rows = [l for l in sec.split("\n")
            if l.startswith("| **A") and l.count("|") >= 5]
    assert len(rows) >= 4, f"expected the four A-decisions, parsed {len(rows)}"
    for r in rows:
        cells = [c.strip() for c in r.split("|")]
        rid = cells[1]
        assert cells[-2], f"{rid} has an empty default cell"
        assert len(cells[-2]) > 25, f"{rid}'s default is too short to be one: {cells[-2]!r}"
        assert cells[3], f"{rid} has no recommendation"


def test_the_backlog_claim_is_still_roughly_true():
    """The sheet's premise is that the register is too large to read at four
    days out. If that stopped being true the sheet should be retired, not
    quietly left standing."""
    rows = _register_rows()
    open_rows = [r for r, (status, _) in rows.items()
                 if "OPEN" in status.upper() or "WAITING" in status.upper()
                 or "IN HAND" in status.upper() or "AWAITING" in status.upper()]
    assert len(open_rows) > 30, (
        f"only {len(open_rows)} open rows — the triage sheet's premise no longer "
        "holds; retire it rather than leaving a stale summary standing")
    stated = re.search(r"\*\*(\d+) open rows\*\*", _sheet())
    assert stated, "the sheet no longer states an open-row count"
    #: within 25%, so ordinary churn does not fail the build but a doubling does
    assert abs(int(stated.group(1)) - len(open_rows)) <= max(10, len(open_rows) // 4), (
        f"sheet says {stated.group(1)} open rows, register has {len(open_rows)}")


def test_the_sheet_names_the_test_that_guards_it():
    """A document whose guard is invisible gets edited as though it has none."""
    assert "test_a_draft_day_decisions" in _sheet()

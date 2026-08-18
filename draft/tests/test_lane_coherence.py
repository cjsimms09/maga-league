# TERRITORY: A
"""THE THREE LANES MUST BOOT FROM THE SAME PAGE, AND THE INBOX MUST NOT LIE.

Three sessions work this repo in parallel — A (model & draft), B (site &
in-season), C (external ingest) — coordinating through `ROUTES.md` inboxes and a
role file each. On 2026-08-17 that machinery had three failures, none of which
any test could see:

  1. **C had an inbox and no role file.** `ROUTES.md` has carried `## TO: C`
     since 08-11 and `TERRITORY.md` §C declares C's territory, but there was no
     `SESSION-C.md` — so A and B booted from a file and C booted from nothing.
  2. **A and B both pointed at a superseded brief.** Both banners said "read
     MONDAY-BRIEF.md first" while `CLAUDE.md` had moved the entry point to
     `DRAFT-WEEK-BRIEF.md`. The first line each session reads routed it at the
     wrong file.
  3. **113 inbox items, ZERO ever ticked** — including 11 whose own text
     announced them complete. An inbox where done and open render identically
     is an inbox that has to be read end to end, which is how the same work gets
     done twice.

None of that is exotic. It is the ordinary rot of coordination files, and the
only thing that stops it is a check that runs with the suite.

Run: python -m pytest draft/tests/test_lane_coherence.py
"""
from __future__ import annotations

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

#: The one file CLAUDE.md sends every session to first. Changing the entry point
#: means changing it here and in all four pointers, together — which is the point.
ENTRY_BRIEF = "DRAFT-WEEK-BRIEF.md"


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf8") as fh:
        return fh.read()


def routes_lanes():
    return re.findall(r"^## TO: (\w+)\s*$", read("ROUTES.md"), flags=re.M)


def test_every_lane_with_an_inbox_has_a_role_file_to_boot_from():
    """C had an inbox for six days and nothing to read. A lane whose rules are
    reachable only by knowing where to look is a lane that gets improvised."""
    missing = [ln for ln in routes_lanes()
               if not os.path.exists(os.path.join(ROOT, f"SESSION-{ln}.md"))]
    assert not missing, f"lanes with an inbox but no SESSION-<lane>.md: {missing}"


def test_CONTROL_there_really_are_lanes_to_check():
    """Without this, a ROUTES.md that lost its headings would pass the test
    above by having nothing to check — the shape of vacuous-pass this repo keeps
    finding."""
    lanes = routes_lanes()
    assert set(lanes) >= {"A", "B", "C"}, lanes


def test_every_role_file_points_at_the_current_entry_brief():
    """A, B and C must be sent to the same place, and it must be the place
    CLAUDE.md sends them."""
    for lane in routes_lanes():
        src = read(f"SESSION-{lane}.md")
        assert ENTRY_BRIEF in src, (
            f"SESSION-{lane}.md does not name {ENTRY_BRIEF} — it will route that "
            f"session at a stale brief")


def test_claude_md_and_the_role_files_agree_on_the_entry_point():
    assert ENTRY_BRIEF in read("CLAUDE.md")
    assert os.path.exists(os.path.join(ROOT, ENTRY_BRIEF))


def test_a_superseded_brief_is_never_the_FIRST_thing_a_session_is_told_to_read():
    """MONDAY-BRIEF.md is still accurate and still referenced — that is fine.
    What is not fine is a banner ordering a session to read it BEFORE the current
    one, which is exactly what A's and B's said."""
    for lane in routes_lanes():
        src = read(f"SESSION-{lane}.md")
        head = src[:1200]
        bad = re.search(r"READ\s+`?MONDAY-BRIEF\.md`?\s+BEFORE", head, flags=re.I)
        assert not bad, (
            f"SESSION-{lane}.md's banner sends the session to MONDAY-BRIEF.md "
            f"before {ENTRY_BRIEF}")


def _items(section_body):
    """Split an inbox section into (checkbox_line, full_item_text) pairs."""
    out, cur, buf = [], None, []
    for line in section_body.split("\n"):
        if re.match(r"^- \[[ xX]\] ", line):
            if cur is not None:
                out.append((cur, "\n".join(buf)))
            cur, buf = line, [line]
        elif cur is not None:
            if line.startswith("## "):
                out.append((cur, "\n".join(buf)))
                cur, buf = None, []
            else:
                buf.append(line)
    if cur is not None:
        out.append((cur, "\n".join(buf)))
    return out


def test_an_item_that_ANNOUNCES_itself_complete_is_ticked():
    """NARROW ON PURPOSE. Only items whose own headline opens with the completion
    marker — i.e. the item IS a "this is done" notice — must be ticked.

    Deliberately NOT "any item mentioning RESOLVED": three open items say
    'RESOLVED IN STRUCTURE, the relay must still refire', 'CLOSED — NOT FIXED,
    NEEDS A+B AGREEMENT', and a mid-body 'CLOSED, because I reported this wrong
    once'. Those are live, and a broader rule would order them closed — turning a
    hygiene check into a way to lose work."""
    src = read("ROUTES.md")
    bad = []
    for section in re.split(r"^## TO: ", src, flags=re.M)[1:]:
        lane = section.split("\n", 1)[0].strip()
        for line, _body in _items(section.split("\n", 1)[1]):
            # headline = the checkbox line itself, after the date/author prefix
            if re.match(r"^- \[ \] .*·\s*✅", line):
                bad.append(f"TO:{lane} {line[:110]}")
    assert not bad, ("these items announce themselves complete but still render "
                     "as open:\n" + "\n".join(bad))


# ── AND NO COORDINATION FILE MAY CARRY A VOID INSTRUCTION UNSTRUCK ──────────
# Found 2026-08-17 on the first screen of STATUS.md, the file every session is
# told to read: "Both sessions now commit to `main` directly — no branches."
# TERRITORY.md had marked that protocol VOID on 2026-08-09, in its own heading.
# It survived eight days in the highest-traffic position in the repo.
#
# A stale FINDING is a nuisance. A stale INSTRUCTION is a session pushing to a
# protected branch because the docs told it to.

COORDINATION_FILES = ("STATUS.md", "SESSION-A.md", "SESSION-B.md", "SESSION-C.md",
                      "CLAUDE.md", "DRAFT-WEEK-BRIEF.md")


def test_no_coordination_file_tells_a_session_to_commit_straight_to_main():
    """The instruction may appear as HISTORY — struck, or with VOID beside it —
    but never as a live directive.

    SCOPED TO THE PARAGRAPH, NOT THE LINE, and that was not the first draft. Line
    scoping flagged this file's own correction in STATUS.md, where the quoted
    instruction wraps onto one line and the word VOID lands on the next. A guard
    whose first finding is the sentence explaining the thing it guards against is
    a guard that will be switched off. Markdown wraps; the exemption has to be
    read at the same granularity a human reads it."""
    offenders = []
    pattern = re.compile(r"commit(?:s|ting)?\s+to\s+`?main`?\s+directly"
                         r"|commit\s+directly\s+to\s+`?main`?", re.I)
    exempt = re.compile(r"~~|\bVOID\b|superseded|no longer|struck", re.I)
    for name in COORDINATION_FILES:
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        lines = read(name).split("\n")
        for i, line in enumerate(lines):
            if not pattern.search(line):
                continue
            window = "\n".join(lines[max(0, i - 2):i + 3])
            if exempt.search(window):
                continue
            offenders.append(f"{name}:{i + 1}: {line.strip()[:120]}")
    assert not offenders, (
        "a coordination file carries a LIVE instruction to commit straight to "
        "main; the harness forces feature branches (TERRITORY.md):\n"
        + "\n".join(offenders))


def test_CONTROL_that_check_can_actually_fire():
    """Known-positive: the exact sentence that sat in STATUS.md for eight days,
    and the struck form that must pass."""
    pattern = re.compile(r"commit(?:s|ting)?\s+to\s+`?main`?\s+directly"
                         r"|commit\s+directly\s+to\s+`?main`?", re.I)
    live = "**Both sessions now commit to `main` directly — no branches.**"
    struck = "~~Both sessions now commit to `main` directly~~ — VOID since 2026-08-09"
    assert pattern.search(live)
    assert "~~" not in live and not re.search(r"\bVOID\b", live)      # would be flagged
    assert pattern.search(struck) and "~~" in struck                   # would pass

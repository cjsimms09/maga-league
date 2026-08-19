"""The two habits Cory ordered fixed FOR GOOD, enforced rather than documented.

Cory, 2026-08-17: "WE NEED BE ASKING WHAT SHOULD WE STUDY NEXT, WE ALSO NEED TO
STOP TREATING REFUSAL AS ENDING. FIX BOTH THESE PROBLEMS FOR GOOD!"

Both failures are real and both are dated:

1. NOBODY OWNED "what next". Every material finding in the week of 08-17 came
   from Cory. A rules, B builds, C fetches, D stewards, E red-teams outputs, the
   relay chases — no lane generated hypotheses, so the org chart had the hole.

2. A REFUSAL WAS TREATED AS AN ENDING. proj_mean_blend refused on 08-16 for want
   of Sleeper history; sleeper_hist_proj proved that history exists the SAME DAY;
   nobody connected them for a day. Both artifacts were correct. The silence
   between them was the defect.

A rule in a document did not stop either. A failing test does.

Every check ships with a known-positive control proving it can fail.
"""

from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[2]
QUESTIONS = ROOT / "OPEN-QUESTIONS.md"
REGISTER = ROOT / "DEFECT-REGISTER.md"

LANES = ["A", "B", "C", "D", "E"]

# Words this project uses when it declines to answer. Each is correct behaviour;
# each is also where an investigation silently stops.
REFUSAL_WORDS = [
    "no_control", "failed-gate", "leaked_markers", "no_timestamp",
    "REFUSED", "INSUFFICIENT-N", "unmeasurable", "not constructible",
]

# The three things a refusal must carry to be an answer instead of a dead end.
UNBLOCK_MARKERS = ["unblocked by", "recheck", "next action", "owner"]


def rows(path, section=None):
    text = path.read_text()
    if section:
        start = text.index(section)
        text = text[start:]
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|") or set(line) <= set("|-: "):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) >= 3 and cells[0].lower() not in ("#", "question", "what"):
            out.append(cells)
    return out


def _is_closed(cells):
    """True only when the row's STATUS CELL says CLOSED.

    Deliberately narrow. The register's columns are `# | what | owner | status |
    next action`, so the status is the second-from-last cell — and reading ONLY
    that cell is what stops a row from exempting itself by mentioning the word
    "closed" somewhere in its prose. A status-word exemption that could be
    triggered from free text would be a hole, not a scope fix.

    Falls back to False on any row shaped unexpectedly: an unrecognised row is
    treated as OPEN, so a malformed row gets MORE scrutiny rather than less.
    """
    if len(cells) < 4:
        return False
    return "closed" in cells[-2].lower()


def open_questions():
    text = QUESTIONS.read_text()
    start = text.index("## OPEN")
    end = text.index("## RESOLVED")
    return rows(QUESTIONS, None) and [
        [c.strip() for c in l.strip("|").split("|")]
        for l in text[start:end].splitlines()
        if l.strip().startswith("|") and not set(l.strip()) <= set("|-: ")
        and not l.strip().lower().startswith("| #")
    ]


# ── 1. THE BACKLOG EXISTS AND EVERY LANE FEEDS IT ──────────────────────────

def test_the_open_questions_file_exists():
    assert QUESTIONS.exists(), (
        "OPEN-QUESTIONS.md is missing — without it, 'what should we study next' "
        "has no owner and Cory stays the only source of new questions"
    )


def test_there_are_real_open_questions():
    qs = open_questions()
    assert len(qs) >= 5, f"only {len(qs)} open questions — this is a backlog, not a gesture"


@pytest.mark.parametrize("lane", LANES)
def test_every_lane_owns_at_least_one_open_question(lane):
    """The rule that closes the org-chart hole: hypothesis generation is
    everyone's job, not nobody's."""
    owners = " ".join(cells[-1] for cells in open_questions())
    assert re.search(rf"\b{lane}\b", owners), (
        f"lane {lane} owns no open question. Every lane adds at least one per "
        "session — that is the whole mechanism for not needing Cory to notice."
    )


def test_every_open_question_carries_a_cost_band():
    bad = [c for c in open_questions() if not re.search(r"\b[SML]\b", " ".join(c[-2:]))]
    assert not bad, (
        "questions with no cost band (S/M/L):\n"
        + "\n".join(" | ".join(x[:2])[:90] for x in bad)
        + "\nA question with no cost estimate never gets picked up."
    )


def test_lane_ownership_check_can_fail():
    """Known-positive control: a lane absent from the owner column is detected."""
    owners = "D | A | E"
    assert not re.search(r"\bZ\b", owners), (
        "the lane detector matches a lane that is not there — it cannot fail"
    )


# ── 2. A REFUSAL IS NOT AN ENDING ──────────────────────────────────────────

def test_every_refusal_row_in_the_register_carries_an_unblock_condition():
    """The blend/Sleeper failure, made impossible.

    A register row that records a refusal must say what would unblock it, who
    owns that, and when it gets rechecked. Otherwise a correct refusal is
    indistinguishable from a finished answer — which is exactly how
    proj_mean_blend sat for a day beside the probe that unblocked it.
    """
    bad = []
    for cells in rows(REGISTER):
        if _is_closed(cells):
            continue
        joined = " ".join(cells)
        if not any(w.lower() in joined.lower() for w in REFUSAL_WORDS):
            continue
        if not any(m.lower() in joined.lower() for m in UNBLOCK_MARKERS):
            bad.append(joined[:130])
    assert not bad, (
        "refusal rows with no unblock condition, owner or recheck:\n"
        + "\n".join(bad)
        + "\n\nA refusal without those three is an open defect, not an answer."
    )


def test_the_closed_exemption_cannot_hide_an_OPEN_refusal():
    """THE CONTROL ON THE EXEMPTION ABOVE, and it is the whole reason the
    exemption is allowed to exist.

    2026-08-17: closing row 4h tripped this check. The row is CLOSED — `main` is
    green, verified on the runner — and it matched only because the PROSE
    describing the fix contains the word "refused" (the reviewer refusing an
    empty diff). Demanding an unblock condition there asks a question that no
    longer applies.

    THE CHEAP FIX WAS TO TYPE THE WORD "owner" INTO THE ROW UNTIL THE REGEX WENT
    QUIET. That is regenerating to green, which this project treats as the
    defect and not the fix, so the SCOPE was corrected instead: the rule is
    about refusals that are still OPEN.

    But an exemption keyed on a status word is exactly the shape that rots —
    "mark it CLOSED and the guard stops asking" is a real failure mode. So:
      · the status must be in the STATUS CELL, not anywhere in the prose, and
      · an OPEN refusal row missing its markers must still fail.
    Both are asserted here with synthetic rows, so the exemption ships with
    proof of what it does NOT let through."""
    open_row = ["9z", "the fetch REFUSED and nothing says why", "C", "OPEN",
                "have a look sometime"]
    assert not _is_closed(open_row), "an OPEN row must never be exempt"

    prose_dodge = ["9y", "REFUSED — we CLOSED the loop on this ages ago", "C",
                   "OPEN", "have a look sometime"]
    assert not _is_closed(prose_dodge), (
        "the word CLOSED appearing in the PROSE must not exempt a row — the "
        "status cell is the only thing that counts, or any row can talk its "
        "way out of the guard")

    closed_row = ["9x", "the reviewer REFUSED an empty diff; fixed", "relay",
                  "✅ CLOSED", "shipped as dea76e46"]
    assert _is_closed(closed_row), (
        "a genuinely CLOSED row must be exempt, or closing a defect honestly "
        "becomes harder than leaving it open")


def test_the_refusal_check_can_fail():
    """Known-positive control, using the real 08-16 wording that caused the loss."""
    row = ["20", "**the blend refused with no_control**", "A", "OPEN", "nothing"]
    joined = " ".join(row)
    assert any(w.lower() in joined.lower() for w in REFUSAL_WORDS), "detector misses a real refusal"
    assert not any(m.lower() in joined.lower() for m in UNBLOCK_MARKERS), (
        "the control row already satisfies the check — it proves nothing"
    )


def test_the_refusal_check_passes_a_properly_closed_refusal():
    """Known-negative control: a refusal done right must not trip the check."""
    row = ["20", "**refused: no_control**", "D",
           "WAITING — unblocked by Sleeper 2025 rows, owner C, recheck 08-18"]
    joined = " ".join(row)
    assert any(w.lower() in joined.lower() for w in REFUSAL_WORDS)
    assert any(m.lower() in joined.lower() for m in UNBLOCK_MARKERS), (
        "a correctly-closed refusal is being flagged — the check is too strict"
    )


def test_the_rule_is_written_where_lanes_read_it():
    text = (ROOT / "OPERATING-MODEL.md").read_text().lower()
    assert "unblocked by" in text, (
        "OPERATING-MODEL.md does not carry the refusal rule — a test that "
        "enforces an unwritten rule just looks like an obstacle"
    )


# ── 6. NO Q-ID COLLIDES OR DUPLICATES — the same defect class found in the
#      register (register_dedup_2026-08-18.md), found here the same evening
#      by the same audit ────────────────────────────────────────────────────

def _q_rows():
    """(id, first-cell-of-question-text) for every Q-numbered row, however the
    caller's `rows()` split it — re-derived directly here because this file's
    ids are `Q<n>`, not the bare `<n>[a-z]` shape REGISTER rows use."""
    out = []
    for line in QUESTIONS.read_text().splitlines():
        line = line.strip()
        if not line.startswith("|") or set(line) <= set("|-: "):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rid = cells[0].replace("*", "").replace("`", "").strip()
        if re.match(r"^Q\d+$", rid):
            out.append((rid, cells[1] if len(cells) > 1 else ""))
    return out


def _normalized(text):
    text = re.sub(r"^\s*\*?\(renumbered from [^)]*\)\*?\s*", "", text, flags=re.I)
    text = re.sub(r"[*_`✅🔴🟠🟡🟢⚠️📐🔑~]", "", text)
    return re.sub(r"\s+", " ", text).strip().lower()[:120]


def test_no_two_DIFFERENT_findings_share_a_Q_id():
    """DEFECT GUARDED: register_dedup's exact bug, but as an id COLLISION
    rather than a content duplicate — Q17 briefly named two unrelated
    questions (the live keeper-deadline decision and D's already-answered
    emergent-coverage finding) at once, found 2026-08-18 auditing for it."""
    by_id = {}
    for rid, text in _q_rows():
        by_id.setdefault(rid, []).append(_normalized(text))
    collisions = {
        rid: texts for rid, texts in by_id.items()
        if len(texts) > 1 and len(set(texts)) > 1
    }
    assert not collisions, (
        "one Q-id names more than one DIFFERENT question — renumber the "
        f"newer one:\n  " + "\n  ".join(f"{rid}: {texts}" for rid, texts in collisions.items())
    )


def test_no_two_DIFFERENT_Q_ids_carry_the_same_finding():
    """The other half: the SAME question filed twice under two different ids —
    found the same evening as a genuine duplicate, id Q16, produced by the
    same parallel-branch-merge shape as the register's."""
    by_text = {}
    for rid, text in _q_rows():
        by_text.setdefault(_normalized(text), set()).add(rid)
    dupes = {t: ids for t, ids in by_text.items() if len(ids) > 1}
    assert not dupes, (
        "the same question appears under more than one id — merge them:\n  "
        + "\n  ".join(f"{ids}: {t}" for t, ids in dupes.items())
    )


def test_the_Q_id_duplicate_checks_can_actually_fire():
    """Known-positive control for BOTH checks above, using the real shapes
    found tonight: a collision (one id, two different findings) and a
    duplicate (two ids, one finding)."""
    real = QUESTIONS.read_text()
    fake_collision = (
        "| Q97 | **keeper deadline is 08-21** | S | Cory |\n"
        "| Q97 | **does the opponent arm clear at RB** | M | D |\n"
    )
    fake_duplicate = (
        "| Q98 | **does averaging alone explain the blend gain** | S | D |\n"
        "| Q99 | **does averaging alone explain the blend gain** | S | D |\n"
    )
    import re as _re

    def _rows_from(text):
        out = []
        for line in text.splitlines():
            line = line.strip()
            if not line.startswith("|") or set(line) <= set("|-: "):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            rid = cells[0].replace("*", "").replace("`", "").strip()
            if _re.match(r"^Q\d+$", rid):
                out.append((rid, cells[1] if len(cells) > 1 else ""))
        return out

    by_id, by_text = {}, {}
    for rid, text in _rows_from(real + fake_collision + fake_duplicate):
        norm = _normalized(text)
        by_id.setdefault(rid, []).append(norm)
        by_text.setdefault(norm, set()).add(rid)

    collisions = {r: t for r, t in by_id.items() if len(t) > 1 and len(set(t)) > 1}
    dupes = {t: i for t, i in by_text.items() if len(i) > 1}
    assert "Q97" in collisions, "the fail arm did not detect a planted id collision"
    assert {"Q98", "Q99"} in [set(v) for v in dupes.values()], (
        "the fail arm did not detect a planted content duplicate"
    )

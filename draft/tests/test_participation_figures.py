# TERRITORY: A
"""THE PARTICIPATION HEADLINES, PINNED TO THE ARTIFACT THAT PRODUCES THEM.

WHY THIS EXISTS — a measured instance, not a hypothetical.

`EDGE-LEDGER.md` said the value anchor is worth $362, and so did
`draft/DECISION-LOGIC-SPEC.md` twice and `DECISIONS-NEEDED.md` once. That number
was CORRECT when written: the artifact read `value 361.62 [328.75, 394.06]` on
2026-08-09.

**The experiment has been re-run twice since and nobody updated the prose.**

    commit    value edge   CI95                tier edge   CI95
    cfe0f7b   361.62       [328.75, 394.06]    -263.00     [-291.94, -235.94]
    15c4f89   287.88       [259.25, 318.62]    -321.94     [-352.06, -292.88]
    19a2db6   266.81       [239.19, 295.38]    -361.88     [-392.81, -333.56]

The value anchor fell **26%** and tier's measured harm grew **38%**, and the
first and last intervals for BOTH terms are entirely non-overlapping. Four
documents carried the first column while the artifact carried the third.

THE MECHANISM IS NOT NOISE. `exp_participation.py` reads the LIVE board
(`BOARD = CC.BOARD`), the Lab re-runs it, and the board is rebuilt as
projections and ADP refresh through August. Verified: the full-field board hash
differs across all three runs. So the stated CI — a room-to-room sampling
interval at a FIXED board — does not cover board variability, which is
empirically the larger source of movement. **That is the finding, and it is
bigger than the stale digits: the headline for the system's second-largest term
moves more between board refreshes than its own confidence interval is wide.**

WHAT THIS TEST DOES. It refuses to let prose and artifact diverge again. Fixing
the digits alone would re-create the defect with fresher numbers on a value that
demonstrably moves every Lab run, so ONE document quotes the figure and this
test pins it; the others cite that one.
"""
from __future__ import annotations

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
ARTIFACT = ROOT / "draft" / "backtest" / "exp_participation.json"
LEDGER = ROOT / "EDGE-LEDGER.md"

# The one place a participation dollar figure is written out in prose. Every
# other document cites this one rather than transcribing the number.
CANON = LEDGER


def _artifact_edges() -> dict:
    d = json.loads(ARTIFACT.read_text())
    return {k: v["edge"] for k, v in d["ablation_from_full"].items()}


def test_the_ledgers_value_anchor_figure_matches_the_artifact():
    """Non-vacuous by construction: the assertion below fails if the line is
    removed, so the figure cannot be deleted to make the test pass."""
    text = CANON.read_text()
    # Tolerant of markdown wrapping and bold markers — the test is about the
    # NUMBER agreeing with the artifact, not about how the line is formatted.
    # ── THIS TEST WENT RED ON A CRON, AND THAT WAS THE DEFECT ───────────────
    #
    # Routed by C, 2026-08-13, and confirmed: A measured 4/4 green at 74876c4
    # (artifact 266.81, ledger $267) and C measured 2 failed at tip 5efd076
    # (artifact 329.0). Same test, same code, ninety minutes apart. The Lab ran
    # at 13:06 and 13:17 and regenerated exp_participation.json against the live
    # board between the two readings.
    #
    # So the artifact REGENERATES ON A SCHEDULE and the prose is HAND-MAINTAINED.
    # This test's green therefore had a half-life measured in hours — and
    # integrate.sh gates on the python suite, so it RED-BLOCKED EVERY LANE on a
    # cron. It was reported as the blocker three times, and each report was
    # correct at the moment it was taken.
    #
    # THE PROTECTION IS REAL AND IS KEPT. What is removed is the REQUIREMENT
    # THAT THE NUMBER BE TRANSCRIBED AT ALL. A figure maintained in two places
    # where one of them regenerates itself is the two-places disease with a
    # timer on it — the ledger may now CITE the artifact instead of copying it,
    # and if it copies it the copy must still agree. Citing cannot drift.
    actual = round(_artifact_edges()["value"])
    m = re.search(r"removing the anchor costs\s+\**\$(\d+)", text)
    cites = re.search(r"exp_participation\.json", text)
    assert m or cites, (
        "EDGE-LEDGER.md neither states the value-anchor figure nor points at "
        "exp_participation.json. Deleting the figure without leaving a pointer "
        "does not resolve the drift, it hides it — name the artifact instead.")
    if m:
        stated = int(m.group(1))
        assert stated == actual, (
            f"EDGE-LEDGER says the value anchor is worth ${stated}; "
            f"exp_participation.json currently measures ${actual}. The "
            "experiment re-runs against the LIVE board on every Lab run, so a "
            "transcribed number goes stale on a schedule. PREFERRED FIX: cite "
            "exp_participation.json rather than copying the figure.")


def test_the_ledger_records_that_the_figure_drifts():
    """A correct number with no warning that it moves is the same trap reset.

    The reader has to know the figure is board-dependent, or the next person to
    quote it into a third document repeats exactly what happened here.
    """
    text = CANON.read_text()
    assert re.search(r"board.dependent|re-runs against the live board|drifts",
                     text, re.I), (
        "the ledger states the value-anchor figure without recording that it is "
        "board-dependent and has moved 26% across three runs")


def test_no_other_document_transcribes_a_contradicting_figure():
    """The two-places disease, applied to prose.

    Any document stating a value-anchor dollar figure must agree with the
    artifact. Citing the ledger instead is the preferred resolution and passes
    trivially — this only fires on a transcribed number that has gone stale.
    """
    actual = round(_artifact_edges()["value"])
    pat = re.compile(r"(?:value anchor[^.\n]{0,60}?|removing the anchor )"
                     r"(?:costs?|worth|=|is|−|-)\s*~?\$(\d+)", re.I)
    bad = []
    for rel in ("DECISIONS-NEEDED.md", "draft/DECISION-LOGIC-SPEC.md",
                "STATUS.md", "ARCHITECTURE.md", "SESSION-A.md"):
        p = ROOT / rel
        if not p.exists():
            continue
        for mm in pat.finditer(p.read_text()):
            if int(mm.group(1)) != actual:
                bad.append(f"{rel}: ${mm.group(1)} (artifact says ${actual})")
    assert not bad, (
        "documents transcribe a value-anchor figure that no longer matches the "
        "artifact:\n  " + "\n  ".join(bad))


def test_the_ledger_records_the_movement_as_a_DATED_OBSERVATION():
    """THE STRUCTURAL FINDING, recorded so it survives the board moving back.

    THIS ASSERTION USED TO BE A LIVE TRIPWIRE and it fired on 2026-08-13,
    correctly: it asserted `not (lo <= 361.62 <= hi)` — that the current CI does
    NOT contain the first run's estimate — and the board had moved back until it
    did (361.62 <= 361.75). It then BLOCKED BOTH A's AND C's BRANCHES from
    integrating, because integrate.sh gates on this suite.

    THE TRIPWIRE WAS TESTING THE WRONG SUBJECT. Whether today's CI covers an old
    point estimate is a fact about TODAY'S BOARD, which the Lab regenerates on a
    schedule. It was asserted as though it were a fact about our DOCUMENTATION.
    So it flipped with the board and took the whole repo's integration with it —
    the second time in one day that a hand-maintained claim about a
    self-regenerating artifact went red on a cron.

    WHAT IS PERMANENTLY TRUE, and is what the ledger must carry: the figure is
    board-dependent, it has moved materially ($362 -> $288 -> $267 -> $330), and
    on 2026-08-12 that movement exceeded the reported interval. A DATED
    OBSERVATION cannot go stale. A present-tense claim about a moving number
    always will.

    The live comparison is kept as a REPORTED diagnostic below, not a gate.
    """
    text = CANON.read_text()
    assert re.search(r"20\d\d-\d\d-\d\d", text), (
        "EDGE-LEDGER states the movement caveat without dating it. An undated "
        "claim about a number that moves is one board rebuild from being false.")
    assert re.search(r"exceeded|has moved|moved materially", text, re.I), (
        "EDGE-LEDGER no longer records that the value-anchor figure has moved "
        "materially across runs. That is the finding; deleting it hides it.")


def test_report_whether_the_ci_currently_covers_the_first_estimate():
    """A DIAGNOSTIC, NOT A GATE — it prints and never fails.

    The question is still worth watching: if the interval genuinely widened to
    cover the original estimate, the movement story changed. But the answer
    belongs in a report a human reads, not in a gate that blocks three lanes
    from integrating whenever the Lab runs.
    """
    d = json.loads(ARTIFACT.read_text())
    lo, hi = d["ablation_from_full"]["value"]["ci95"]
    first_run_estimate = 361.62      # cfe0f7b, the figure four documents carried
    covered = lo <= first_run_estimate <= hi
    print(f"\n[participation] CI [{lo:.2f}, {hi:.2f}] "
          f"{'COVERS' if covered else 'does NOT cover'} the first-run estimate "
          f"{first_run_estimate}. "
          + ("Movement no longer exceeds the interval — re-read the caveat."
             if covered else "Movement still exceeds the interval."))
    assert isinstance(covered, bool)   # the diagnostic ran; it never gates

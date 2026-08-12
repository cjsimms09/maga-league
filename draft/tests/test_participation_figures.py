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
    m = re.search(r"removing the anchor costs\s+\**\$(\d+)", text)
    assert m, (
        "EDGE-LEDGER.md no longer states the value-anchor figure. It is the "
        "canonical place that figure is written; deleting it does not resolve "
        "the drift, it hides it.")
    stated = int(m.group(1))
    actual = round(_artifact_edges()["value"])
    assert stated == actual, (
        f"EDGE-LEDGER says the value anchor is worth ${stated}; "
        f"exp_participation.json currently measures ${actual}. The experiment "
        "re-runs against the LIVE board on every Lab run, so this number moves "
        "and the prose must move with it.")


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


def test_the_ci_does_not_cover_the_movement_between_runs():
    """THE STRUCTURAL FINDING, asserted so it cannot be quietly forgotten.

    The reported CI is a room-sampling interval at a FIXED board. If the current
    interval ever grew wide enough to contain the first run's point estimate,
    the caveat below would have stopped being true and should be revisited
    rather than left standing.
    """
    d = json.loads(ARTIFACT.read_text())
    lo, hi = d["ablation_from_full"]["value"]["ci95"]
    first_run_estimate = 361.62      # cfe0f7b, the figure four documents carried
    assert not (lo <= first_run_estimate <= hi), (
        "the current CI now contains the original estimate, so 'board movement "
        "exceeds the stated interval' is no longer true and the caveat in "
        "EDGE-LEDGER should be re-examined rather than left in place")

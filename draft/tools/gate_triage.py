#!/usr/bin/env python3
"""BOARD-GATE TRIAGE — does this suite failure mean THE BOARD is bad?

Register 55, fixed on Cory's call ("Let's just fix it now", 2026-08-19)
rather than deferred past the draft.

THE PROBLEM, measured: `draft-data.yml`'s acceptance gate runs the whole
python suite against the freshly built board and refuses to publish on
ANY failure. On 08-19 that refused Cory's board FOUR TIMES the night
before keeper lock, and of the six distinct failures across those runs
**exactly one was about the board** (real input drift from the vegas
refresh — the gate working). The other five were repo hygiene and
tooling: an artifact-consumer detector whose founding case had gained a
real reader, a store row count pinned to an exact number while nflverse
published more lines, a census one nightly stale, an enrollment test
pinning the live winner rather than the rule, and a git-history-dependent
pairing guard that cannot run under `fetch-depth: 2`. Every false refusal
spends the alarm the real one needs.

THE DESIGN, and why it is this way round: **everything blocks by
default.** Only an explicitly ADVISORY test — named here, with a reason —
can fail without stopping the publish. An unclassified failure is a
BLOCKING failure, so a new board defect can never become advisory by
omission. That is the safe direction three days before a draft.

TWO SELF-CHECKS, because an allowlist is exactly the thing that rots:
  * an advisory file that READS THE BOARD is refused at runtime (it would
    be classifying a board test as hygiene — the one mistake that matters);
  * an advisory entry whose file no longer exists is refused, so the list
    cannot quietly accumulate dead names.

Usage (in the gate, after pytest has written its output):
    python3 draft/tools/gate_triage.py /tmp/board_gate_output.txt
    exit 0 -> every failure is advisory; publish, with a warning
    exit 1 -> at least one BLOCKING failure; refuse to publish
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Tests that CANNOT indict the board: they audit the repo's own tooling
#: and artifacts. Each entry states why it cannot be about the board.
ADVISORY = {
    "draft/tests/test_stale_blockers.py":
        "repo hygiene: pairs a refusal artifact with later artifacts to find "
        "stale blockers. Depends on git history (git log per path), so it is "
        "unmeasurable under the gate's fetch-depth: 2 — it says nothing about "
        "the board's contents in either direction.",
    "draft/tests/test_unread_artifacts.py":
        "repo hygiene: detects committed artifacts with no consumer. Scans "
        "source files for readers; a pass or fail is a statement about "
        "wiring, never about a player row.",
}

BOARD_MARKERS = ("draft_data.json", "public/draft", "load_board", "BOARD =")
FAILED = re.compile(r"^FAILED\s+([^\s:]+)")


def advisory_is_still_honest():
    """Refuse the whole triage if the allowlist has rotted (rule 3f)."""
    problems = []
    for rel, reason in ADVISORY.items():
        p = ROOT / rel
        if not p.exists():
            problems.append(f"{rel}: listed as advisory but does not exist")
            continue
        if len(reason.strip()) < 40:
            problems.append(f"{rel}: advisory entry has no real reason")
        text = p.read_text()
        hits = [m for m in BOARD_MARKERS if m in text]
        if hits:
            problems.append(
                f"{rel}: READS THE BOARD ({', '.join(hits)}) — it must not be "
                "advisory; a board-reading test has to be able to refuse")
    return problems


def classify(output_text):
    blocking, advisory = [], []
    for line in output_text.splitlines():
        m = FAILED.match(line.strip())
        if not m:
            continue
        nodeid = m.group(1)
        path = nodeid.split("::")[0]
        (advisory if path in ADVISORY else blocking).append(nodeid)
    return blocking, advisory


def main(argv=None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print("gate-triage: no pytest output file given")
        return 1
    rot = advisory_is_still_honest()
    if rot:
        print("gate-triage: REFUSING — the advisory list itself is unsound:")
        for r in rot:
            print("  ✗ " + r)
        return 1

    text = Path(argv[0]).read_text(errors="replace")
    blocking, advisory = classify(text)

    if not blocking and not advisory:
        print("gate-triage: no FAILED lines parsed from the pytest output — "
              "treating as BLOCKING, because a gate that cannot read its own "
              "evidence must not wave a board through")
        return 1

    for n in advisory:
        print(f"  · ADVISORY  {n}\n      {ADVISORY[n.split('::')[0]]}")
    for n in blocking:
        print(f"  ✗ BLOCKING  {n}")

    if blocking:
        print(f"gate-triage: {len(blocking)} blocking failure(s) — "
              "REFUSING to publish this board.")
        return 1
    print(f"gate-triage: {len(advisory)} failure(s), ALL advisory (repo "
          "hygiene, not the board) — publishing. These still need fixing; "
          "they just do not get to hold Cory's board hostage.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

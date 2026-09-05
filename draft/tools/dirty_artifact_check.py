#!/usr/bin/env python3
# TERRITORY: relay (register 489's evidence half; A owns the durable fix)
"""DIRTY ARTIFACT CHECK — run this before you commit.

Register 489 (A, 2026-09-05): *running the Python suite rewrites six
committed data artifacts, including two the board reads, so every full-suite
run dirties the tree and the regenerated files get swept into whatever commit
comes next.* That is not hypothetical and it is not rare — it happened THREE
TIMES to the relay on 2026-09-05 alone, in a single evening's work, and each
time the only thing that stopped a regenerated artifact reaching `main` was
that `git rebase` refused to run with unstaged changes and forced a look.

With the season five days out, a swept artifact is a number Cory starts on
changing for a reason nobody wrote down. This is the cheap half of the fix:
a list of the artifacts a suite run is KNOWN to rewrite, and a check that
says which are dirty right now and the exact command to restore them.

WHAT THIS IS NOT: it is not a CI test, and deliberately so. In CI the tree is
a fresh checkout and these files are always clean, so a CI assertion here
would pass forever without ever having been able to fail — the vacuous-green
shape Rule 3e exists to refuse. The accident happens on a working tree,
between a suite run and a commit, so the check belongs there.

THE DURABLE FIX IS A's AND IS STILL OPEN (489): make these writers target a
temp directory when running under pytest, so a test run cannot touch a
committed artifact at all. Until that lands, this is the net.

Run:  python3 draft/tools/dirty_artifact_check.py          # 1 if any is dirty
      python3 draft/tools/dirty_artifact_check.py --list   # the declared set
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# OBSERVED, not guessed: every path below was seen modified in `git status`
# after a full `pytest draft/tests` run on 2026-09-05, and its writer was
# then found by grep. The writer is named so the next person can fix the
# cause rather than re-discover the symptom.
SUITE_WRITTEN = {
    "draft/KEEPER-OPTIMIZER.txt": "draft/keeper_optimize.py",
    "draft/data/seat_disagreement.json": "draft/tests/test_roster_robustness.py",
    "draft/data/clay_grade_2025.json": "draft/tools/clay_grade_2025.py",
    "draft/data/clay_projections_2025.json": "draft/tools/snapshot_add_clay.py / attach_multisource.py",
    "draft/data/clay_projections_2026.json": "draft/tools/snapshot_add_clay.py / attach_multisource.py",
}


def dirty():
    out = subprocess.run(["git", "status", "--porcelain", "--"] + sorted(SUITE_WRITTEN),
                         cwd=ROOT, capture_output=True, text=True).stdout
    found = []
    for line in out.splitlines():
        path = line[3:].strip()
        if path in SUITE_WRITTEN:
            found.append(path)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        print("Artifacts a full suite run is known to rewrite (register 489):\n")
        for path, writer in sorted(SUITE_WRITTEN.items()):
            print(f"  {path}\n      written by {writer}")
        return 0
    d = dirty()
    if not d:
        print(f"✅ none of the {len(SUITE_WRITTEN)} suite-written artifacts is dirty — safe to commit.")
        return 0
    print(f"🔴 {len(d)} suite-written artifact(s) are modified in your working tree.")
    print("   These are almost certainly a test run's byproduct, NOT your change.")
    print("   Two of them are read by the board, so committing one changes a number\n"
          "   Cory drafts or starts on, for a reason nobody wrote down (register 489).\n")
    for p in d:
        print(f"     {p}   (written by {SUITE_WRITTEN[p]})")
    print("\n   If you did not mean to change these:\n")
    print("     git checkout -- " + " ".join(d))
    print("\n   If you DID mean to — say so in the commit message and name what moved.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

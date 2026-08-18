#!/usr/bin/env python3
"""LAB OUTPUT MANIFEST — a run that wrote nothing must not read as a run.

THE CLASS (task #18, and STATUS.md's own instance): lab run 5 SUCCEEDED, its
report was swallowed by `git push || true`, and the loss was invisible — the
job was green, the artifact was gone. lab.yml also carries the softer twin:
`[ -f "$f" ] && git add "$f"` commits an output IF it exists and says nothing
when it does not, so a study whose write failed reads as "ran, nothing to
report". A green job must mean the declared outputs EXIST and WERE WRITTEN BY
THIS RUN.

Usage, two calls per job:
    python3 draft/tools/lab_output_manifest.py --stamp .lab-run-stamp
        (immediately after checkout — records the run's start instant)
    python3 draft/tools/lab_output_manifest.py --check A.md B.json --since-stamp .lab-run-stamp
        (immediately BEFORE the commit step — every declared path must exist
         and be newer than the stamp, or exit 1 naming what is missing/stale)

Declaring ZERO paths is itself a failure — a manifest with nothing in it is
the vacuous-green shape this tool exists to end.
"""
from __future__ import annotations

import argparse
import os
import sys
import time


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stamp", help="write the run-start stamp file and exit")
    ap.add_argument("--check", nargs="*", default=None,
                    help="declared output paths that must exist and be fresh")
    ap.add_argument("--since-stamp", help="the stamp file from --stamp")
    args = ap.parse_args(argv)

    if args.stamp:
        with open(args.stamp, "w") as f:
            f.write(str(time.time()))
        print(f"lab-output-manifest: stamped {args.stamp}")
        return 0

    if args.check is None:
        print("lab-output-manifest: nothing to do (no --stamp, no --check)")
        return 2
    if not args.check:
        print("lab-output-manifest: REFUSED — a manifest declaring zero outputs "
              "is the vacuous-green shape this tool exists to end. Declare the "
              "files the job claims to produce.")
        return 1
    if not args.since_stamp or not os.path.exists(args.since_stamp):
        print("lab-output-manifest: REFUSED — no run-start stamp. Call "
              "--stamp <file> after checkout, or freshness cannot be judged "
              "and 'exists from last week' would read as 'written today'.")
        return 1

    start = os.path.getmtime(args.since_stamp)
    problems = []
    for path in args.check:
        if not os.path.exists(path):
            problems.append(f"MISSING: {path} — the run claims to produce it and did not")
        elif os.path.getmtime(path) < start:
            problems.append(
                f"STALE: {path} — exists but predates this run's stamp "
                f"({os.path.getmtime(path):.0f} < {start:.0f}); the write was "
                "swallowed and the old file would have been committed as new")
    if problems:
        print("lab-output-manifest: DECLARED OUTPUTS NOT PRODUCED BY THIS RUN:")
        for p in problems:
            print("  ✗ " + p)
        return 1
    print(f"lab-output-manifest: all {len(args.check)} declared outputs "
          "exist and were written by this run")
    return 0


if __name__ == "__main__":
    sys.exit(main())

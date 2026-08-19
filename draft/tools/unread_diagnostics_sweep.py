#!/usr/bin/env python3
# TERRITORY: A
"""WHICH ARTIFACTS ARE RECORDING A PROBLEM NOBODY IS READING?

Born from register 80, 2026-08-19. `multisource_projections.json` carried an
`unmatched` list naming **"Derrick Henry (RB)"** and **"Kenneth Walker III
(RB)"** from the moment it was captured. Cory's entire keeper slate sat
unblended because of it, with keeper lock two days away — and the diagnostic
that would have caught it was sitting in the file the whole time. I wrote that
tool, validated that store at length, and never opened the field.

**A diagnostic nobody reads is worse than no diagnostic, because its existence
is mistaken for the check having been done.**

So this sweeps every committed artifact for non-empty "something did not work"
fields, and ranks them by size. It cannot tell a real problem from a deliberate
log — `roster_status_exclusions.json` is *supposed* to be full of exclusions —
so it does not try. **It produces a reading list, and a human decides.** The
one thing it does enforce is that the list gets looked at.

Run: python3 draft/tools/unread_diagnostics_sweep.py [--top N] [--min N]
"""
from __future__ import annotations

import glob
import json
import os
import sys

# Substrings that mean "this field records something the tool could not do".
# Deliberately broad: a false positive costs one line of reading, a false
# negative costs what register 80 cost.
KEYS = ("unmatched", "missing", "errors", "failures", "warnings", "skipped",
        "dropped", "excluded", "unresolved", "absent", "misses", "not_found",
        "rejected", "silently")

ROOTS = ("draft/data/*.json", "public/*.json", "draft/backtest/*.json")

# A known-positive control (rule 3e). This sweep's whole value is in what it
# FINDS, so a run that reports nothing must be distinguishable from a run whose
# matcher is broken. Register 80's field is the fixture: if the sweep cannot
# see the diagnostic that started it, the sweep is not working.
CONTROL = ("multisource_projections.json", "unmatched")


def scan():
    rows = []
    for pattern in ROOTS:
        for path in glob.glob(pattern):
            try:
                doc = json.load(open(path))
            except Exception:
                continue

            def walk(node, trail=""):
                if isinstance(node, dict):
                    for k, v in node.items():
                        if any(t in k.lower() for t in KEYS):
                            n = (len(v) if hasattr(v, "__len__")
                                 and not isinstance(v, str) else (1 if v else 0))
                            if n:
                                rows.append((path, (trail + "/" + k).lstrip("/"),
                                             n, str(v)[:100]))
                        elif isinstance(v, (dict, list)):
                            walk(v, trail + "/" + k)
                elif isinstance(node, list):
                    for i, v in enumerate(node[:5]):
                        if isinstance(v, (dict, list)):
                            walk(v, trail + "[%d]" % i)

            walk(doc)
    return rows


def main() -> int:
    argv = sys.argv[1:]
    top = int(argv[argv.index("--top") + 1]) if "--top" in argv else 25
    minimum = int(argv[argv.index("--min") + 1]) if "--min" in argv else 1

    rows = [r for r in scan() if r[2] >= minimum]
    rows.sort(key=lambda r: -r[2])

    ctrl = [r for r in rows if CONTROL[0] in r[0] and CONTROL[1] in r[1]]
    print("UNREAD DIAGNOSTICS SWEEP — artifacts recording a problem\n")
    print("  CONTROL (register 80's own field, the case that motivated this): "
          + ("✅ found — the matcher works, so the absences below mean something"
             if ctrl else
             "⛔ NOT FOUND. The sweep cannot see the diagnostic that started it. "
             "Every 'nothing here' below is the sweep, not the artifacts."))
    print(f"\n  {len(rows)} non-empty field(s) across committed artifacts. "
          "Most are deliberate logs — this is a READING LIST, not a defect list.\n")
    print(f"  {'n':>6}  {'artifact':<38} {'field':<44} sample")
    for path, key, n, sample in rows[:top]:
        print(f"  {n:>6}  {os.path.basename(path):<38} {key[:44]:<44} {sample[:52]}")
    if len(rows) > top:
        print(f"\n  ...and {len(rows) - top} more (--top N to see them). "
              "NOT a silent truncation: the count is stated.")
    return 0 if ctrl else 1


if __name__ == "__main__":
    raise SystemExit(main())

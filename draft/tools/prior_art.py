#!/usr/bin/env python3
# TERRITORY: relay — run this BEFORE filing a prediction, not after.
"""WHAT HAS THIS REPO ALREADY GRADED? — one command, so the check is not a memory test.

Cory, 2026-08-18, on the whole project: *"too much finding and not enough fixing and
following up."* **There is a second failure mode with the same cause, and on 08-18 the
relay committed it four times in one evening: RE-FILING A QUESTION THAT WAS ALREADY
ANSWERED.**

The record, because it is the reason this file exists:

  * **P30 (pace)** was filed as *"the one axis whose input is NOT yet committed."*
    `nflverse_pace.json` was committed AND graded. Corrected — then the correction
    RAISED its priority, and `pace_arm.json` turned out to hold a full preregistered
    grade of the exact arm, which **fails its own bar** (`clears: false`).
  * **P28 (air yards / EPA)** was filed as a fresh hypothesis.
    `advanced_efficiency_study.json` had already graded it: `clears: false`, 4 of 12
    (position, fold) cells beating control.

Both were findable in seconds. Neither was found, because nothing made looking cheap.

── WHAT IT DOES ───────────────────────────────────────────────────────────────

Scans every committed JSON artifact for a verdict-shaped field — `verdict`,
`headline`, `does_it_predict`, `_answer`, `clears`, `conclusion`, `_ruling` — and
prints them. **43 artifacts carry one today.** With `--grep` it filters to a topic.

**It deliberately does NOT judge relevance.** A tool that decided for you which prior
work counts would reintroduce the exact failure it exists to prevent: the whole problem
is a filter that silently excluded the thing you needed. It prints; you read.

Run:  python3 draft/tools/prior_art.py                # everything
      python3 draft/tools/prior_art.py --grep pace    # one topic
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SEARCH_DIRS = ("draft/backtest", "draft/data", "draft/audit")

#: Field names that carry a graded answer. Broad on purpose — a missed artifact costs a
#: duplicated study, a spurious one costs a line of reading.
VERDICT_KEYS = re.compile(
    r"verdict|headline|does_it_predict|_answer|clears|conclusion|_ruling|"
    r"recommendation|clearing_bar|pooled_verdict",
    re.I,
)


def verdicts_in(doc) -> list:
    """Every (key, short-value) pair in `doc` whose key looks like a graded answer."""
    out = []
    if not isinstance(doc, dict):
        return out
    for k, v in doc.items():
        if not VERDICT_KEYS.search(str(k)):
            continue
        if isinstance(v, str):
            s = v
        elif isinstance(v, bool):
            s = str(v)
        elif isinstance(v, dict):
            s = (v.get("_answer") or v.get("verdict") or v.get("text")
                 or json.dumps(v, ensure_ascii=False))
        else:
            s = json.dumps(v, ensure_ascii=False)
        out.append((str(k), " ".join(str(s).split())))
    return out


def scan(root: Path = ROOT, dirs=SEARCH_DIRS) -> list:
    rows = []
    for d in dirs:
        for f in sorted((root / d).glob("*.json")):
            try:
                doc = json.loads(f.read_text())
            except (ValueError, OSError):
                continue
            v = verdicts_in(doc)
            if v:
                rows.append((str(f.relative_to(root)), v))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grep", default="", help="filter by substring (path or verdict text)")
    ap.add_argument("--width", type=int, default=170)
    a = ap.parse_args()

    rows = scan()
    q = a.grep.lower()
    if q:
        rows = [(p, v) for p, v in rows
                if q in p.lower() or any(q in (k + s).lower() for k, s in v)]

    print("=" * 78)
    print("PRIOR ART — what this repo has ALREADY graded"
          + (f"   (filter: {a.grep!r})" if q else ""))
    print("=" * 78)
    if not rows:
        print("\n  Nothing matched. That is a REAL answer — but check a second spelling")
        print("  before filing: 'pace' and 'plays_per_game' are the same question.")
        return 0
    for path, vs in rows:
        print(f"\n  {path}")
        for k, s in vs:
            print(f"    [{k}] {s[:a.width]}")
    print(f"\n  {len(rows)} artifact(s) carry a graded answer.")
    print("  Read before filing. Two of the relay's own 08-18 rows duplicated work")
    print("  that was already sitting in these files.")
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())

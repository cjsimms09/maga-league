#!/usr/bin/env python3
# TERRITORY: A
"""AN ARM THAT CHANGED NOTHING DID NOT RUN — refuse to grade it as a null.

Found 2026-08-19. `--bye 1.0` produced a `seasons` block **bit-identical** to
the shipped arm across all 30 seats. Everything about it looked right:

  · the choice file differed by 176KB (key ordering only)
  · the read-back weights stamp correctly read "MEASURED_WEIGHTS with bye=1"
  · `weights_values` carried `"bye": 1`
  · it graded cleanly at **+0.0 points in 30 of 30 seats**

So P114 was about to be graded *"the bye weight does not pay"* when the truth is
that the bye TERM contributed exactly zero at every pick — `byeCollisionPenalty`
returns 0 unless the roster already holds a player at that position on that same
bye week, and the engine's own comment at `engine.js:1875` already recorded that
*"three of the seven sliders (keeper, bye, stack) could not change the top five
at ANY setting."*

**THE WEIGHTS STAMP CANNOT CATCH THIS CLASS.** The stamp was built after the
`--need` incident, where the flag was dropped and the weight was never applied.
Here the weight really was applied; the quantity it multiplies was zero. Only
comparing the OUTPUT distinguishes "this weight does not help" from "this weight
has nothing to multiply".

Exit 0 = every named arm differs from its control. Exit 1 = at least one arm is
inert (unless it is listed in KNOWN_INERT with a reason).

Run: python3 draft/tools/arm_participation_check.py [--strict]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"
CONTROL = BT / "engine_seat_choices.json"

ARMS = ["need1", "bye1", "auto"]

# An inert arm stays listed HERE with a reason and a register row, rather than
# being quietly dropped from the sweep — a name removed from a list is exactly
# how a known defect stops being chased.
KNOWN_INERT = {
    "bye1": "register 69 — byeCollisionPenalty needs a rostered same-position, "
            "same-bye player before it returns anything, and bundle boards may "
            "carry no bye week at all. Inert until that input gap is closed; "
            "P114 is NOT gradeable and is marked so.",
}


def seasons_of(path: Path):
    return json.loads(path.read_text()).get("seasons")


def main() -> int:
    strict = "--strict" in sys.argv
    if not CONTROL.exists():
        print(f"no control file at {CONTROL} — nothing to compare")
        return 0
    ctrl = json.dumps(seasons_of(CONTROL), sort_keys=True)

    inert, ran, missing = [], [], []
    for arm in ARMS:
        p = BT / f"engine_seat_choices_{arm}.json"
        if not p.exists():
            missing.append(arm)
            continue
        if json.dumps(seasons_of(p), sort_keys=True) == ctrl:
            inert.append(arm)
        else:
            ran.append(arm)

    for a in ran:
        print(f"  ✅ {a}: draft differs from the shipped arm — the term participates")
    for a in missing:
        print(f"  ·  {a}: no choice file (arm not run this time)")
    for a in inert:
        why = KNOWN_INERT.get(a)
        mark = "🟡 KNOWN" if why else "❌ NEW"
        print(f"  {mark} {a}: IDENTICAL draft to the shipped arm — the weight was "
              f"applied, the term it multiplies contributed ZERO at every pick.")
        print(f"        Grading this as a null publishes a false result.")
        if why:
            print(f"        {why}")

    unexpected = [a for a in inert if a not in KNOWN_INERT]
    if unexpected:
        print(f"\n  {len(unexpected)} arm(s) newly inert: {unexpected}")
        return 1
    if inert and strict:
        print("\n  --strict: a known-inert arm is still inert.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

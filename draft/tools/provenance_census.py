#!/usr/bin/env python3
# TERRITORY: relay — reads the board and the client tree, edits nothing.
"""EVERY PROVENANCE STAMP ON THE BOARD, ITS FULL VALUE SET, AND WHO READS IT.

── WHY THIS EXISTS, AND IT IS AN ERROR OF MINE RATHER THAN A PATTERN ─────────

2026-08-18. I annotated register row 4v with *"the remaining 9 are all K and DEF
— not one skill player in his range is affected"* and *"EVERY SKILL PLAYER IN
CORY'S DRAFT RANGE NOW CARRIES A MEASURED, PLAYER-SPECIFIC CEILING."* Both false.

`proj_ceiling_source` has THREE values. I had looked at two:

    measured-2023-25-p90-x-player-cv   per-player volatility tail
    measured-2023-25-p90               MEASURED, but a per-BAND constant
    gaussian_z                         no calibration cell at all

I read `gaussian_z` as the whole non-per-player population. The middle value is
measured AND still a cohort constant, which is precisely what 4v complains
about. Skipping it turned 25 into 9, and fifteen skill players into zero —
including Malik Nabers at ADP 28, five picks before Cory's first. **The error
pointed toward not doing the fix**, which is the worst direction available.

Two hours later the identical shape appeared in `proj_sd_source`: the stamp
`measured-2023-25-error` reads like a per-player measurement, and within-cell cv
says 13 of its 20 cells are flat to rounding.

**THE COMMON CAUSE IS NOT CARELESSNESS, IT IS THAT NOBODY EVER PRINTS THE ENUM.**
A stamp is a categorical field, and reasoning about a categorical field from the
two values you happen to have seen is a mistake available to anyone, every time.
Register 8b makes it likelier still: `proj_ceiling_source`, `proj_floor_source`,
`proj_sd_source` and `adp_sd_source` are read by NOTHING — no surface, no gate,
no tool — so there is no existing code path that would ever have listed them.

── WHAT THIS IS ─────────────────────────────────────────────────────────────

**A REPORT, NEVER A GATE.** Same standing as `prior_art.py`, `stale_blockers.py`
and `unread_artifacts.py`: every line is a question, never an answer. Multiple
constructions in one field are frequently correct — an honest refusal is a
construction too (register 2e). What is never correct is not knowing.

Run:  python3 draft/tools/provenance_census.py
      python3 draft/tools/provenance_census.py --window 27 160
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"

#: Fields whose NAME says they carry provenance. Deliberately name-shaped rather
#: than a hand-kept list: a new `*_source` added by any lane shows up here the
#: day it lands, which is the whole point of not maintaining an inventory.
STAMP = re.compile(r"_(source|provenance|why|basis|method)$")

#: Where a consumer could live. Same set `unread_artifacts.py` uses, and
#: deliberately excludes the test tree — a stamp read only by its own test is
#: exactly the produced-and-unread shape (register 8b).
SOURCE_DIRS = ("public/js", "views", "src", "netlify")


def board(path: Path = BOARD) -> dict:
    return json.loads(path.read_text(encoding="utf8"))


def stamps(players: list) -> list:
    seen: set = set()
    for p in players:
        seen |= {k for k in p if STAMP.search(k)}
    return sorted(seen)


def readers(field: str, root: Path = ROOT) -> list:
    """Client-tree files naming this field, comments stripped.

    COMMENTS ARE STRIPPED ON PURPOSE. `engine.js` mentions `proj_sd` in a prose
    comment and reads it nowhere; counting that would report the field as
    consumed, which is the false-negative `unread_artifacts.py` was built after.
    """
    out = []
    for d in SOURCE_DIRS:
        base = root / d
        if not base.exists():
            continue
        for f in list(base.rglob("*.js")) + list(base.rglob("*.ejs")):
            if "node_modules" in str(f):
                continue
            try:
                text = f.read_text(encoding="utf8", errors="ignore")
            except OSError:
                continue
            code = "\n".join(l for l in text.split("\n")
                             if not re.match(r"\s*(//|\*|/\*)", l))
            if re.search(r"\b" + re.escape(field) + r"\b", code):
                out.append(str(f.relative_to(root)))
    return sorted(out)


def adp_of(p: dict):
    for k in ("adjusted_adp", "raw_adp", "adp"):
        v = p.get(k)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return None


def main(argv: list | None = None) -> int:
    #: `argv` is a parameter so the test can call main([]) without argparse
    #: eating pytest's own arguments — the first version had no parameter and
    #: failed with "unrecognized arguments: draft/tests/... -q". A tool whose
    #: only end-to-end exercise is a shell invocation is a tool no test can run,
    #: which is how a report starts crashing without anybody noticing.
    #: `None` still means sys.argv, so the CLI is unchanged.
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", nargs=2, type=float, default=[27.0, 160.0],
                    metavar=("LO", "HI"),
                    help="ADP window to report separately (default: Cory's picks)")
    a = ap.parse_args(argv)
    lo, hi = a.window

    doc = board()
    players = doc.get("players") or []
    mine = ((doc.get("pick_order") or {}).get("my_picks")) or []
    win = [p for p in players
           if adp_of(p) is not None and lo <= adp_of(p) <= hi]

    print("=" * 78)
    print("PROVENANCE CENSUS — every stamp, its FULL value set, and who reads it")
    print("=" * 78)
    print(f"  {len(players)} board players · window ADP {lo:.0f}-{hi:.0f}: {len(win)}"
          + (f" · my picks {mine[0]}-{mine[-1]}" if mine else ""))
    print("  Print the whole enum. Reasoning about a categorical field from the two")
    print("  values you happen to have seen is how register 4v got annotated wrong.\n")

    def key(v):
        """A hashable, printable key for one stamp value.

        `variance_why` is a LIST of free-text reasons, not an enum, and the first
        version of this crashed on it. That is worth keeping rather than papering
        over: a name-shaped rule (`_why$`) catches a field that is prose, and the
        honest handling is to say so in the output instead of pretending it is
        categorical.
        """
        if isinstance(v, (list, tuple)):
            return " | ".join(str(x) for x in v)
        return v

    #: Above this many distinct values the field is prose, not an enum. Printing
    #: 400 free-text reasons buries the eight fields this tool exists to show.
    ENUM_MAX = 12

    unread = []
    for field in stamps(players):
        counts = Counter(key(p.get(field)) for p in players if p.get(field) is not None)
        wcounts = Counter(key(p.get(field)) for p in win if p.get(field) is not None)
        if len(counts) > ENUM_MAX:
            rs = readers(field)
            if not rs:
                unread.append(field)
            print(f"  {field}   ({len(counts)} distinct value(s) — FREE TEXT, not an enum"
                  f" · {'read by ' + str(len(rs)) + ' file(s)' if rs else 'NO READER'})")
            print(f"      not listed: a field with {len(counts)} values is prose, and "
                  "this tool is for enums.")
            print("      Its risk is the opposite one — nobody reads it at all.\n")
            continue
        rs = readers(field)
        if not rs:
            unread.append(field)
        print(f"  {field}   ({len(counts)} distinct value(s)"
              f" · {'read by ' + str(len(rs)) + ' file(s)' if rs else 'NO READER'})")
        width = max((len(str(v)) for v in counts), default=0)
        for val, n in counts.most_common():
            print(f"      {str(val):<{width}}  {n:>4} board"
                  f"  {wcounts.get(val, 0):>4} in window")
        if rs:
            print(f"      readers: {', '.join(rs[:4])}"
                  + (f" (+{len(rs) - 4})" if len(rs) > 4 else ""))
        print()

    if unread:
        print("  ── STAMPS NOTHING READS " + "─" * 51)
        print("  " + " · ".join(unread))
        print("  Register 8b: these exist so a consumer can tell constructions apart,")
        print("  and no consumer asks. A guard written and not wired. That is also why")
        print("  nothing would ever have printed the enum above without this file.\n")

    print("  Every line is a QUESTION — should these be one field? does a reader")
    print("  distinguish them? — never an answer. Several constructions in one field")
    print("  is often right; an honest refusal is a construction too (register 2e).")
    print("  What is never right is not knowing which values exist.")
    print("=" * 78)
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())

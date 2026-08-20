# TERRITORY: A
"""ARE CORY'S KEEPERS PRICED ON THE SAME TABLE AS EVERYONE ELSE ON HIS BOARD?

Found 2026-08-20 by draft/tests/keeper_seeded_with_a_value.test.js, which
compares each kept player's `vorp` against the board's own published identity:

    vorp == round(proj_mean - replacement.replacement_points[position], 2)

That identity holds on every one of the ~682 draftable rows. It did NOT hold on
the three kept ones:

    Ja'Marr Chase   99.95  where the board's formula says 101.70
    Derrick Henry   88.68                                  90.55
    Kenneth Walker  63.35                                  65.22

Implied replacement RB 170.47 / WR 171.85 against a published RB 168.60 /
WR 170.10. TWO REPLACEMENT TABLES -- register 148 exactly.

-- WHY IT HAPPENED ---------------------------------------------------------

build.py builds `kept_players` by copying rows out of `players` BEFORE
apply_vorp runs on `available` (the keeper-removed pool). Each copy therefore
arrives already carrying a vorp from a pass over a different pool. The block
meant to repair this was guarded `if rec.get("vorp") is None`, and by the time
it ran the absent case had been closed upstream -- so the guard never fired and
the stale number shipped. Fixed at the source in build.py the same day; this
tool exists because THE BOARD CANNOT REBUILD before the draft (register 151),
so the source fix does not reach the artifact Cory actually drafts from.

-- WHY THIS IS A REPAIR AND NOT A NEW OPINION ------------------------------

It does not compute a replacement level, choose one, or introduce a constant.
It applies THE ARTIFACT'S OWN PUBLISHED TABLE to three rows that were priced on
a different one, restoring an identity the same file already asserts everywhere
else. If `replacement.replacement_points` is missing it REFUSES rather than
inventing a level.

Is it material? About 1.8 points on players worth 63-100, roughly 2-3%. It
flips no pick by itself. It matters because keepers exist to be COMPARED against
draftable players -- "is holding Walker worth more than what pick 33 could get
me" -- and a comparison across two tables answers a question nobody asked.

REPORT-ONLY by default. Pass --fix to write.
Run: python3 draft/tools/keeper_vorp_parity.py [--fix]
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BOARD = os.path.join(ROOT, "public", "draft_data.json")
TOL = 0.011


def audit(board):
    repl = ((board.get("replacement") or {}).get("replacement_points")) or {}
    if not repl:
        raise SystemExit(
            "  REFUSING: the board publishes no replacement.replacement_points, "
            "so there is no table to price keepers on. Inventing one is the "
            "defect, not the fix.")
    rows = []
    for rec in board.get("kept_players") or []:
        pos, pm, got = rec.get("position"), rec.get("proj_mean"), rec.get("vorp")
        rp = repl.get(pos)
        want = (round(float(pm) - float(rp), 2)
                if rp is not None and pm is not None else None)
        rows.append({
            "name": rec.get("name"), "position": pos, "proj_mean": pm,
            "got": got, "want": want,
            "off": (want is not None and got is not None
                    and abs(float(got) - want) > TOL),
        })
    return repl, rows


def main():
    fix = "--fix" in sys.argv
    with open(BOARD) as fh:
        board = json.load(fh)
    repl, rows = audit(board)

    print("\n  KEEPER VORP PARITY -- one replacement table, or two?\n")
    print("  board replacement_points: %s" % {k: round(v, 2) for k, v in repl.items()})
    print("\n  %-18s %4s %9s %9s %9s  %s"
          % ("keeper", "pos", "proj", "vorp", "board", "verdict"))
    for r in rows:
        print("  %-18s %4s %9s %9s %9s  %s"
              % (r["name"], r["position"], r["proj_mean"], r["got"],
                 r["want"], "OFF" if r["off"] else "ok"))

    off = [r for r in rows if r["off"]]
    if not off:
        print("\n  all %d keepers agree with the board's own formula -- nothing to do\n"
              % len(rows))
        return 0

    print("\n  %d of %d keepers are priced on a DIFFERENT table than the board."
          % (len(off), len(rows)))
    for r in off:
        print("     %-18s implied replacement %.2f, board says %.2f"
              % (r["name"], float(r["proj_mean"]) - float(r["got"]),
                 repl[r["position"]]))

    if not fix:
        print("\n  REPORT ONLY. Re-run with --fix to apply the board's own table.\n")
        return 1

    by_name = {r["name"]: r for r in rows}
    for rec in board.get("kept_players") or []:
        r = by_name.get(rec.get("name"))
        if r and r["off"]:
            rec["vorp"] = r["want"]
    with open(BOARD, "w") as fh:
        json.dump(board, fh, separators=(",", ":"))

    _, after = audit(json.load(open(BOARD)))
    still = [r for r in after if r["off"]]
    if still:
        raise SystemExit("  WROTE BUT DID NOT CONVERGE: %s"
                         % [r["name"] for r in still])
    print("\n  repaired %d keeper(s); every kept row now reproduces the board's "
          "own identity\n" % len(off))
    return 0


if __name__ == "__main__":
    sys.exit(main())

# TERRITORY: A
"""FIELDS THAT HAVE NEVER, ON REAL DATA, HELD A VALUE (register 272).

── WHY THIS EXISTS ─────────────────────────────────────────────────────────

`is_mine` was `false` on all 150 rows of the 2026 draft, Cory's own twelve
picks included, because nothing on the live path ever set it. Nothing crashed.
No test failed. `--status` printed `mine: 0 of 12` on screen during the draft
and exited 0.

That is the general shape, and it is the reason this file is not about
`is_mine`: **a field that is always its default is indistinguishable from a
field that is correctly its default.** Both read as a healthy capture. The only
way to tell them apart is to look at whether the column has EVER carried
anything, and then to ask a human which of the answers is intended.

Rule 3e applied to a schema instead of to a probe: a column that only ever
reads False has not been tested, only run.

── WHAT IS AND IS NOT A DEFECT ─────────────────────────────────────────────

The sweep cannot know intent, and pretending otherwise would make it noise. So
it CLASSIFIES rather than judges:

  never_populated  every row null            — highest suspicion
  always_false     every row False           — high (this is `is_mine`)
  always_empty     every row [] / {} / ""    — high
  always_zero      every row 0               — medium
  constant         one distinct value        — report-only, usually by design
                                               (`season`, a source label…)

and an ACKNOWLEDGEMENT file records the ones a human has looked at and accepted.
A new dead field is then a FAILURE, while the known ones stay quiet. That is the
same shape as `constant_multiple_sweep` and the rail-fire budget: the point of a
detector is that it can fail, so it must not cry about what is already ruled on.

── THE CONTROL (Rules 3e, 3f) ──────────────────────────────────────────────

`self_test()` runs on the REAL 2026 pick log and requires the sweep to catch
`is_mine`, `my_actual_pick`, `my_deviation_reason` and `new_path_recommendation`
— four known dead fields — AND to leave `pick`, `player_id`, `position` and
`is_keeper` alone. A sweep that flags everything is as useless as one that flags
nothing, so both directions are required. `main()` refuses to print a report at
all when the control fails, rather than printing a reassuring "none found".

usage: python3 draft/tools/dead_field_sweep.py [--json] [PATH ...]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Stores swept by default. JSONL only — a row-per-line store is where a dead
#: column hides, because every row looks like every other row.
DEFAULT_STORES = [
    ROOT / "draft" / "data" / "draft_pick_log_2026.jsonl",
    ROOT / "draft" / "data" / "draft_shadow_2026.jsonl",
    ROOT / "draft" / "data" / "bovada_lines_2026.jsonl",
]

ACK_PATH = ROOT / "draft" / "data" / "dead_field_acks.json"

#: Classes that mean "this column may never have been wired". `constant` is
#: deliberately NOT here: one distinct non-empty value is usually intent.
SUSPECT = ("never_populated", "always_false", "always_empty")


def classify(values: list) -> str:
    """One field's values across every row -> a class. PURE."""
    if not values:
        return "no_rows"
    distinct = []
    for v in values:
        if not any(v == d and type(v) is type(d) for d in distinct):
            distinct.append(v)
        if len(distinct) > 1:
            break
    if len(distinct) > 1:
        return "varies"
    only = distinct[0]
    if only is None:
        return "never_populated"
    if only is False:
        return "always_false"
    if only in ([], {}, ""):
        return "always_empty"
    if only == 0 and not isinstance(only, bool):
        return "always_zero"
    return "constant"


def sweep_rows(rows: list) -> dict:
    """field -> {class, distinct_sample, rows_present, rows_total}. PURE.

    Only TOP-LEVEL fields. A nested dead field is a real thing, but flattening
    invites a different bug — a key that exists on some rows and not others
    reads as `never_populated` when it is really `sometimes absent`, which is a
    separate finding and a separate fix. `rows_present` is carried so that case
    is visible instead of silently folded in.
    """
    seen = defaultdict(list)
    for r in rows:
        for k, v in (r or {}).items():
            seen[k].append(v)
    out = {}
    for k, vals in seen.items():
        cls = classify(vals)
        out[k] = {
            "class": cls,
            "rows_present": len(vals),
            "rows_total": len(rows),
            "value": (vals[0] if cls not in ("varies", "no_rows") else None),
        }
    return out


def read_jsonl(p: Path) -> list:
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def load_acks() -> dict:
    if not ACK_PATH.exists():
        return {}
    return json.loads(ACK_PATH.read_text()).get("acknowledged", {})


def _label(p: Path) -> str:
    """Repo-relative where possible, absolute otherwise. `Path.relative_to`
    RAISES on a relative CLI argument rather than returning it unchanged, which
    crashed the tool on `draft/data/x.jsonl` — a path that obviously is in the
    repo. The label is also the ack key, so it must be stable between a
    relative and an absolute spelling of the same file."""
    try:
        return str(p.resolve().relative_to(ROOT))
    except ValueError:
        return str(p)


def sweep_store(p: Path) -> dict:
    rows = read_jsonl(p)
    # ROW COUNT TRAVELS WITH THE RESULT. Swept on its own, bovada_lines printed
    # nothing at all — which is the correct answer (67 rows, five top-level
    # fields, every one varying) and is also EXACTLY what an unread or empty
    # file prints. Rule 3e: a clean report and a probe that read nothing must
    # not look the same, so the count is on the line.
    return {"store": _label(p), "rows_read": len(rows), "fields": sweep_rows(rows)}


def unacknowledged(results: list, acks: dict) -> list:
    """Suspect fields nobody has ruled on yet — the thing that fails a build."""
    out = []
    for res in results:
        for field, info in sorted(res["fields"].items()):
            if info["class"] not in SUSPECT:
                continue
            if field in (acks.get(res["store"]) or {}):
                continue
            out.append({"store": res["store"], "field": field,
                        "class": info["class"], "rows": info["rows_present"]})
    return out


# ── THE CONTROL ─────────────────────────────────────────────────────────────

#: Four fields the 2026 pick log is KNOWN to have never populated, and four it
#: is known to populate. Both halves are required: a detector that flags
#: everything is exactly as useless as one that flags nothing, and only the
#: second half of this list can catch that.
KNOWN_DEAD = ("is_mine", "my_actual_pick", "my_deviation_reason",
              "new_path_recommendation")
KNOWN_LIVE = ("pick", "player_id", "position", "is_keeper")


def self_test() -> dict:
    log = ROOT / "draft" / "data" / "draft_pick_log_2026.jsonl"
    rows = read_jsonl(log)
    if not rows:
        return {"ran": False, "why": "no 2026 pick log in this checkout"}
    fields = sweep_rows(rows)
    caught = {f: fields.get(f, {}).get("class") for f in KNOWN_DEAD}
    quiet = {f: fields.get(f, {}).get("class") for f in KNOWN_LIVE}
    return {
        "ran": True,
        "rows": len(rows),
        "known_dead_caught": caught,
        "known_live_left_alone": quiet,
        "passed": (all(c in SUSPECT for c in caught.values())
                   and all(c == "varies" for c in quiet.values())),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("paths", nargs="*", help="JSONL stores (default: the draft capture)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    ctl = self_test()
    if not ctl["ran"]:
        print("CONTROL DID NOT RUN: %s" % ctl["why"])
        return 2
    if not ctl["passed"]:
        # Refusing to print a report is the point. A sweep whose control failed
        # prints "none found" just as confidently as a working one.
        print("*** CONTROL FAILED — refusing to report ***")
        print("  known dead, should all be suspect : %s" % ctl["known_dead_caught"])
        print("  known live, should all vary       : %s" % ctl["known_live_left_alone"])
        return 1

    stores = [Path(p) for p in args.paths] if args.paths else DEFAULT_STORES
    results = [sweep_store(p) for p in stores if p.exists()]
    acks = load_acks()
    new = unacknowledged(results, acks)

    if args.json:
        print(json.dumps({"control": ctl, "stores": results,
                          "unacknowledged": new}, indent=2))
        return 1 if new else 0

    print("DEAD-FIELD SWEEP — has this column EVER held a value?\n")
    print("CONTROL: caught %d known-dead, left %d known-live alone, on %d real "
          "rows — PASS" % (len(KNOWN_DEAD), len(KNOWN_LIVE), ctl["rows"]))
    for res in results:
        print("\n%s  (%d rows, %d top-level fields)"
              % (res["store"], res["rows_read"], len(res["fields"])))
        if not res["rows_read"]:
            print("     *** ZERO ROWS READ — this store reported nothing "
                  "because there was nothing to read, not because it is clean")
        elif all(i["class"] == "varies" for i in res["fields"].values()):
            print("     every field varies — nothing to report")
        for field, info in sorted(res["fields"].items(),
                                  key=lambda kv: (kv[1]["class"], kv[0])):
            if info["class"] == "varies":
                continue
            ack = (acks.get(res["store"]) or {}).get(field)
            suspect = info["class"] in SUSPECT
            # Only a SUSPECT field can fail, so only a suspect field may be
            # marked as needing a ruling. Marking the report-only constants
            # "NOT ACKNOWLEDGED" made twelve healthy columns — `freeze_sha256`
            # among them, where a NON-constant value would be the defect — read
            # as outstanding work. A display that overstates is the failure mode
            # this whole sweep exists to catch, so it must not be one.
            if suspect:
                mark = "  " if ack else "**"
                # The VERDICT only. Printing the whole ack object put a
                # paragraph of prose on each line and made the report unreadable
                # — which defeats a report whose job is to be scanned.
                verdict = (ack or {}).get("verdict") if isinstance(ack, dict) else ack
                tail = ("   [%s]" % verdict) if ack else "   <-- NEEDS A RULING"
            else:
                mark = "  "
                tail = "   (report-only; one distinct value is usually intent)"
            print("  %s %-32s %-16s %s%s" % (
                mark, field, info["class"], repr(info["value"])[:38], tail))
    if new:
        print("\n*** %d suspect field(s) nobody has ruled on ***" % len(new))
        for n in new:
            print("      %s :: %s (%s)" % (n["store"], n["field"], n["class"]))
        print("\n  Each is either a column that was never wired — which is the "
              "`is_mine` defect —\n  or a default that is correct, which is a "
              "one-line entry in %s." % ACK_PATH.relative_to(ROOT))
        return 1
    print("\nNo unacknowledged suspect fields.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

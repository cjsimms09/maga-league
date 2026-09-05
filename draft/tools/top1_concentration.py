#!/usr/bin/env python3
# TERRITORY: relay (filed for A, register 258)
"""TOP-1 CONCENTRATION GATE — the cheap sanity check register 258 asked for.

Register 258 (A, 2026-08-27): the draft-grading column stored the SAME player
as its #1 recommendation for 58 consecutive picks, and a defense on 80% of
them. The row's own words: *"the cheap sanity gate for whatever replaces it:
no single player may hold #1 for more than a handful of consecutive picks.
58 would have failed it instantly."* This is that gate, built rather than
described, so the 2027 draft cannot ship a grade off a column with the same
shape.

WHAT IT MEASURES, per artifact, over LIVE SELECTIONS ONLY (keepers are not
decisions anybody made):
  • longest_run  — the most consecutive picks one player held #1.
  • position_share — the largest share of #1 slots held by one position.
Both are shape checks on the RECOMMENDATION STREAM, not on quality: a column
can be perfectly calibrated and still be broken in this way, and a column
with this shape cannot be graded at all.

⚠️ THE MEASUREMENT CORRECTS THE ROW IT COMES FROM (relay, 2026-09-05, Rule
3i — look at the distribution before quoting it). 258 says "the artifact
that will grade the season's draft". There are TWO artifacts and only one
has the defect:

    draft_pick_log_2026.jsonl .old_path_recommendation
        127 live picks · longest run 58 (Los Angeles Rams) · DEF 80%   ← BROKEN
    draft_shadow_2026.jsonl   .tool_recommendation
        127 live picks · longest run 10 (Kenny Gainwell) · RB 53%      ← HEALTHY

So the engine's own shadow ledger is sane and is the artifact a 2026 draft
grade should be computed from; the pick log's `old_path_recommendation` is
the one that cannot be graded. (`new_path_recommendation` is null on all 127
live rows — a separate, already-known absence, reported here rather than
scored.)

CONTROLS (Rule 3e — a gate that has never fired has not been tested):
  the broken column IS the known positive. `--control` asserts that
  old_path_recommendation FAILS the gate and the shadow ledger PASSES it,
  so a future change that silently disables the gate is caught by the gate's
  own history rather than by nobody.

Run:  python3 draft/tools/top1_concentration.py [--json] [--control]
"""
import argparse
import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PICK_LOG = ROOT / "draft" / "data" / "draft_pick_log_2026.jsonl"
SHADOW = ROOT / "draft" / "data" / "draft_shadow_2026.jsonl"

# A player may legitimately sit at #1 while the room takes other positions.
# The healthy artifact's observed maximum is 10, so 12 gives real headroom
# and still fails 58 by a mile. A threshold nothing can fail is not a gate.
MAX_RUN = 12
# One position holding most of the #1 slots is the other half of the same
# defect (DEF 80% on the broken column; 53% on the healthy one).
MAX_POSITION_SHARE = 0.65


def top1(value):
    """(name, position) of the #1 recommendation, however the column stores
    it: a list of ranked dicts, a single dict, or null."""
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        return value.get("name"), value.get("position")
    return None, None


def longest_run(names):
    """Most consecutive identical non-null names, and who."""
    best, best_who, cur = 0, None, 0
    prev = object()
    for n in names:
        if n is not None and n == prev:
            cur += 1
        else:
            cur = 1 if n is not None else 0
        prev = n
        if cur > best:
            best, best_who = cur, n
    return best, best_who


def measure(path: Path, field: str) -> dict:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    live = [r for r in rows if r.get("is_selection")]
    names, positions, nulls = [], collections.Counter(), 0
    for r in live:
        name, pos = top1(r.get(field))
        if name is None:
            nulls += 1
        names.append(name)
        if pos:
            positions[pos] += 1
    run, who = longest_run(names)
    total = sum(positions.values())
    share, top_pos = (0.0, None)
    if total:
        top_pos, count = positions.most_common(1)[0]
        share = count / total
    reasons = []
    if not live:
        reasons.append("no live selections in the artifact")
    if nulls == len(live) and live:
        reasons.append(f"the column is null on all {nulls} live picks — nothing to grade")
    if run > MAX_RUN:
        reasons.append(f"one player held #1 for {run} consecutive picks ({who}); the bar is {MAX_RUN}")
    if share > MAX_POSITION_SHARE:
        reasons.append(f"{top_pos} holds {round(100 * share)}% of #1 slots; the bar is {round(100 * MAX_POSITION_SHARE)}%")
    return {
        "artifact": path.name, "field": field, "live_picks": len(live), "nulls": nulls,
        "longest_run": run, "longest_run_player": who,
        "top_position": top_pos, "top_position_share": round(share, 4),
        "positions": dict(positions.most_common()),
        "ok": not reasons, "reasons": reasons,
    }


def report():
    return {
        "_territory": "TERRITORY: relay — produced by draft/tools/top1_concentration.py (register 258's gate)",
        "_what": ("Shape check on every stored top-1 recommendation stream: how long one player held #1 and how "
                  "concentrated the #1 slots are by position. A stream that fails this cannot be graded, whatever "
                  "its accuracy."),
        "thresholds": {"max_consecutive_picks_at_1": MAX_RUN, "max_position_share": MAX_POSITION_SHARE},
        "columns": [
            measure(PICK_LOG, "old_path_recommendation"),
            measure(PICK_LOG, "new_path_recommendation"),
            measure(SHADOW, "tool_recommendation"),
        ],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--control", action="store_true")
    a = ap.parse_args()
    doc = report()
    if a.json:
        print(json.dumps(doc, indent=1))
    else:
        print(f"TOP-1 CONCENTRATION — bar: one player at #1 for at most {MAX_RUN} consecutive picks, "
              f"one position at most {round(100 * MAX_POSITION_SHARE)}% of #1 slots\n")
        for c in doc["columns"]:
            mark = "✅" if c["ok"] else "🔴"
            print(f"  {mark} {c['artifact']}.{c['field']}")
            print(f"       {c['live_picks']} live picks · longest run {c['longest_run']} ({c['longest_run_player']}) · "
                  f"{c['top_position']} {round(100 * c['top_position_share'])}% · nulls {c['nulls']}")
            for r in c["reasons"]:
                print(f"       🔴 {r}")
    if a.control:
        broken = next(c for c in doc["columns"] if c["field"] == "old_path_recommendation")
        healthy = next(c for c in doc["columns"] if c["field"] == "tool_recommendation")
        bad = []
        if broken["ok"]:
            bad.append("KNOWN POSITIVE FAILED: old_path_recommendation (58-pick run, DEF 80%) passed the gate")
        if not healthy["ok"]:
            bad.append(f"KNOWN NEGATIVE FAILED: the shadow ledger was rejected — {healthy['reasons']}")
        if bad:
            print("\n🔴 CONTROL FAILED — this gate cannot be trusted:")
            for b in bad:
                print("   ", b)
            return 1
        print("\n✅ CONTROL PASSED — the gate fires on the known-broken column and clears the healthy one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

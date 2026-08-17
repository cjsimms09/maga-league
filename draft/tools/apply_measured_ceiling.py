#!/usr/bin/env python3
"""APPLY THE MEASURED p90 CEILING TO THE COMMITTED BOARD, OFFLINE.

Cory, 2026-08-17: "We absolutely need to change draft board if we aren't
considering upside.."

`use_measured_ceiling` is now true, so every future rebuild computes this. But a
full rebuild needs Sleeper/FFC and both are 403 from here, and the draft is on
the 22nd — so this applies the identical arithmetic to the committed board by
IMPORTING projection_error.proj_ceiling_for, never by reimplementing it.

WHAT CHANGES, AND THE PROOF THAT NOTHING ELSE DOES. Exactly two fields per row:
`proj_ceiling` and `proj_ceiling_source`. The tool recomputes the within-position
projection rank the same way projections.blend does, looks up the measured cell,
and refuses to write if ANY other field on ANY row moved. There is no
partial-apply path.

WHY THIS IS NOT A STRATEGY CHANGE. It replaces an invented number with a
measured one. The old ceiling was mean + 1.036*sd over a per-band sd — a
monotone transform of the mean, so it could not carry player information by
construction. The new one is the measured p90 of realized/projected outcomes
across 1,304 graded player-seasons. The composite's `ceiling` WEIGHT stays 0.0;
what moves is the bench-branch ranking and the near-tie tiebreak, both of which
were being decided by a restatement of the mean.

Run:  python3 draft/tools/apply_measured_ceiling.py [--check]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

BOARD = ROOT / "public" / "draft_data.json"
CHANGED = {"proj_ceiling", "proj_ceiling_source",
           "proj_floor", "proj_floor_source"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    import projection_error as PE
    cal = PE.load()
    doc = json.loads(BOARD.read_text())
    rows = (doc.get("players") or []) + (doc.get("kept_players") or [])
    before = [dict(p) for p in rows]

    # Same within-position projection rank projections.blend computes.
    by_pos: dict = {}
    for p in rows:
        by_pos.setdefault(p.get("position") or "", []).append(p)
    rank = {}
    for _pos, grp in by_pos.items():
        for i, p in enumerate(sorted(grp, key=lambda x: -(x.get("proj_mean") or 0.0)), 1):
            rank[id(p)] = i

    applied = 0
    for p in rows:
        mean = p.get("proj_mean")
        if not mean or mean <= 0:
            continue
        c, status = PE.proj_ceiling_for(cal, p.get("position"), rank[id(p)], mean)
        f, fstatus = PE.proj_floor_for(cal, p.get("position"), rank[id(p)], mean)
        if fstatus == "measured" and f is not None:
            # max(0, ...) mirrors projections.blend — a negative floor is not a
            # football outcome, and QB|33+'s measured p10 is genuinely below zero.
            p["proj_floor"] = round(max(0.0, float(f)), 2)
            p["proj_floor_source"] = "measured-2023-25-p10"
        else:
            p.setdefault("proj_floor_source", "gaussian_z")
        if status == "measured" and c is not None:
            p["proj_ceiling"] = round(float(c), 2)
            p["proj_ceiling_source"] = "measured-2023-25-p90"
            applied += 1
        else:
            # ABSENT STAYS ABSENT: an unmeasured band keeps the Gaussian, and
            # the source field is what tells a consumer which one he is reading.
            p.setdefault("proj_ceiling_source", "gaussian_z")

    problems = []
    for old, now in zip(before, rows):
        for k, v in old.items():
            if k not in CHANGED and now.get(k) != v:
                problems.append(f"{old.get('name')}: {k} moved {v!r} -> {now.get(k)!r}")
        extra = set(now) - set(old) - CHANGED
        if extra:
            problems.append(f"{old.get('name')}: unexpected new keys {sorted(extra)}")

    print(f"measured ceiling applied to {applied} of {len(rows)} rows")
    print(f"fields other than {sorted(CHANGED)} that moved: {len(problems)}")
    if problems:
        print("REFUSING TO WRITE — this was supposed to touch two fields:", file=sys.stderr)
        for x in problems[:10]:
            print("   ", x, file=sys.stderr)
        return 1
    if args.check:
        print("--check: nothing written")
        return 0
    doc.setdefault("provenance", {})["measured_ceiling"] = {
        "applied_offline": True, "rows": applied,
        "source": "projection_error_calibration (1,304 graded player-seasons)",
        "ruling": "Cory 2026-08-17 — the board could not express upside at all",
    }
    BOARD.write_text(json.dumps(doc, indent=1))
    print(f"wrote {BOARD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

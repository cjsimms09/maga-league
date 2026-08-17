#!/usr/bin/env python3
"""ATTACH THE NFL DRAFT-CAPITAL COLUMN TO THE COMMITTED BOARD, OFFLINE.

Cory, 2026-08-17: "I'd want to give these players a boost due to upside
potential especially in dead rounds."

STEP 0 AND ONLY STEP 0. `build.py` now attaches this column on every rebuild,
but a full rebuild needs Sleeper/FFC and both are 403 from this sandbox. This
applies the identical attach — by IMPORTING the same `draft_capital.attach_capital`
the build calls, never by re-implementing it — so the column is live on the
branch before the draft.

WHY THIS ONE IS SAFER THAN apply_projection_correctness_2026_08_16.py, which it
otherwise mirrors: that tool CHANGED projections and therefore had to recompute
replacement / vorp / overall_rank / tiers and prove the recomputation matched.
This one recomputes NOTHING, because it changes nothing that anything downstream
reads. So its entire safety argument is one check, and the check is exhaustive
rather than representative:

    every pre-existing key on every row must be byte-identical afterwards, and
    the only new keys permitted are the four this column adds.

If that fails the tool writes nothing. There is no partial-apply path.

IDEMPOTENT by construction — re-attaching writes the same four values — so
unlike the correctness tool, a second run is a no-op rather than a refusal.

Run:  python3 draft/tools/apply_draft_capital_column.py [--check]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

BOARD = ROOT / "public" / "draft_data.json"
NEW_KEYS = {"nfl_draft_round", "nfl_draft_pick", "capital_tier", "is_nfl_rookie"}


def verify_additive(before: list[dict], after: list[dict]) -> dict:
    """THE WHOLE SAFETY ARGUMENT. Exhaustive, not sampled."""
    problems = []
    if len(before) != len(after):
        problems.append(f"row count changed: {len(before)} -> {len(after)}")
    for old, now in zip(before, after):
        for k, v in old.items():
            if now.get(k) != v:
                problems.append(f"{old.get('name')}: {k} changed {v!r} -> {now.get(k)!r}")
        extra = set(now) - set(old) - NEW_KEYS
        if extra:
            problems.append(f"{old.get('name')}: unexpected new keys {sorted(extra)}")
    return {"rows": len(after), "problems": problems, "additive": not problems}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="run the attach and the additive proof, write nothing")
    args = ap.parse_args()

    from draft_capital import attach_capital, load_capital

    doc = json.loads(BOARD.read_text())
    season = int((doc.get("provenance") or {}).get("season")
                 or doc.get("season") or 2026)
    rows = (doc.get("players") or []) + (doc.get("kept_players") or [])
    before = [dict(p) for p in rows]

    diag = attach_capital(rows, load_capital(), season=season)
    v = verify_additive(before, rows)

    print(f"season {season}: attached to {diag['attached']} of {len(rows)} rows "
          f"({diag['matched_by_id']} by id, {diag['matched_by_name']} by name)")
    if diag["unmatched_this_class"]:
        print(f"  {len(diag['unmatched_this_class'])} of this year's class did "
              f"not join by name: {', '.join(diag['unmatched_this_class'])}")
    print(f"additive proof: {v['rows']} rows, {len(v['problems'])} problems")
    if not v["additive"]:
        print("REFUSING TO WRITE — the attach was not purely additive:", file=sys.stderr)
        for p in v["problems"][:10]:
            print("   ", p, file=sys.stderr)
        return 1
    if args.check:
        print("--check: nothing written")
        return 0

    prov = doc.setdefault("provenance", {})
    prov["draft_capital"] = dict(diag, applied_offline=True, applied_by=Path(__file__).name)
    BOARD.write_text(json.dumps(doc, indent=1))
    print(f"wrote {BOARD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""THE DRAFT-REPLAY -> MONEY BRIDGE — the harness's final increment.

Turns the replay's per-pick policy choices (dump-replay.js) into money-graded
per-season rosters: reconstruct each policy's counterfactual roster at a seat,
score it week by week from the full-NFL per-week points table
(cli.py --weekly-out, our scoring engine), and grade it in dollars against the
real field (money_grade.grade_substituted — weekly-high + RS exact; playoff $
pending the bracket resim).

Its REAL test runs in CI (draft/tests/test_bridge.py) because building
bundles.json / weekly_points.json needs nflverse + FFC egress. The structural
logic below is fixture-tested everywhere.

Two honesty rules carried through:
  * A player with no weekly rows is ABSENT, never 0.0. Each graded roster
    reports COVERAGE (players with >=1 scored week / roster size); the CI gate
    holds a floor on it so an unmatchable roster cannot silently grade as zeros.
  * Ghost duplicates are counted, not hidden: the replay follows history, so a
    policy can choose the same still-on-board player at two picks. The bridge
    dedupes (a roster holds a player once) and reports how often.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

import money_grade as MG
import roster_sim as RS

HERE = Path(__file__).resolve().parent


# --- roster reconstruction ----------------------------------------------------

def policy_roster(season_dump: dict, policy: str, roster_id: int) -> dict:
    """One policy's counterfactual roster at a seat.

    Keepers (history's, same for every policy) + the policy's choice at each of
    that seat's decision picks. `policy='actual'` reproduces history's roster —
    the structural identity the CI gate checks.

    A policy key that never appears in ANY record's choices raises instead of
    silently producing a keeper-only roster. The first CI run taught this the
    hard way: asking for 'b0' where the replay writes 'B0' graded every seat a
    quiet $0 with coverage 0.0 — an empty roster wearing a bounded number.
    """
    records = season_dump.get("records", [])
    if policy != "actual" and not any(policy in (r.get("choices") or {}) for r in records):
        available = sorted({k for r in records for k in (r.get("choices") or {})})
        raise KeyError(f"policy '{policy}' appears in no replay record; available: {available}")
    ids: list[str] = []
    dupes = 0
    for k in season_dump.get("keepers", []):
        if int(k["roster_id"]) == int(roster_id):
            ids.append(str(k["player_id"]))
    for r in records:
        if int(r["roster_id"]) != int(roster_id):
            continue
        pid = r["actual"] if policy == "actual" else (r.get("choices") or {}).get(policy)
        if pid is None:
            continue
        pid = str(pid)
        if pid in ids:
            dupes += 1
            continue
        ids.append(pid)
    return {"roster": ids, "duplicates": dupes}


# --- weekly scoring + money ---------------------------------------------------

def weekly_scores_for(roster_ids: list[str], weekly_pts: dict, pos_by_id: dict) -> dict:
    """{week: best-legal-lineup points} for a roster over the per-week table."""
    out = {}
    for wk, pts in weekly_pts.items():
        out[int(wk)] = RS.best_lineup_points(pts, pos_by_id, roster_ids)["points"]
    return out


def coverage_of(roster_ids: list[str], weekly_pts: dict) -> float:
    """Fraction of the roster with at least one scored week. The honesty floor."""
    if not roster_ids:
        return 0.0
    seen = set()
    for pts in weekly_pts.values():
        for pid in roster_ids:
            if pid in pts:
                seen.add(pid)
    return round(len(seen) / len(roster_ids), 3)


def grade_policy_seat(history, payouts, season: str, roster_id: int,
                      roster_ids: list[str], weekly_pts: dict, pos_by_id: dict) -> dict:
    scores = weekly_scores_for(roster_ids, weekly_pts, pos_by_id)
    sub = MG.grade_substituted(history, payouts, season, int(roster_id), scores)
    return {
        "roster_id": int(roster_id),
        "weekly_high": sub["weekly_high"],
        "regular_season": sub["regular_season"],
        "graded_total_partial": sub["graded_total_partial"],
        "standings_rank": sub["standings_rank"],
        "coverage": coverage_of(roster_ids, weekly_pts),
        "roster_size": len(roster_ids),
    }


# --- the full run -------------------------------------------------------------

def run_bridge(bundles_path: Path, records_path: Path, weekly_path: Path,
               policies=("actual", "B0", "B3")) -> dict:
    bundles = json.loads(Path(bundles_path).read_text())
    dump = json.loads(Path(records_path).read_text())["seasons"]
    weekly_all = json.loads(Path(weekly_path).read_text())["weekly_points"]
    history, payouts = MG.load_history(), MG.load_payouts()

    pos_by_bundle = {}
    for b in bundles.get("bundles", []):
        pos_by_bundle[str(b["season"])] = {
            str(p["player_id"]): p.get("position") for p in (b.get("players") or [])}

    out = {"seasons": {}, "policies": list(policies)}
    for season, sd in dump.items():
        weekly_pts = weekly_all.get(season) or {}
        pos_by_id = pos_by_bundle.get(season) or {}
        if not weekly_pts:
            out["seasons"][season] = {"skipped": "no weekly points for this season"}
            continue
        seats = sorted({int(r["roster_id"]) for r in sd.get("records", [])})
        rows = {}
        for policy in policies:
            per_seat = {}
            for rid in seats:
                pr = policy_roster(sd, policy, rid)
                g = grade_policy_seat(history, payouts, season, rid,
                                      pr["roster"], weekly_pts, pos_by_id)
                g["duplicates"] = pr["duplicates"]
                per_seat[str(rid)] = g
            rows[policy] = per_seat
        out["seasons"][season] = rows
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundles", default=str(HERE / "bundles.json"))
    ap.add_argument("--records", default=str(HERE / "replay-records.json"))
    ap.add_argument("--weekly", default=str(HERE / "weekly_points.json"))
    ap.add_argument("--out", default=str(HERE / "bridge-results.json"))
    args = ap.parse_args()
    res = run_bridge(Path(args.bundles), Path(args.records), Path(args.weekly))
    Path(args.out).write_text(json.dumps(res, indent=1))
    for season, rows in res["seasons"].items():
        if "skipped" in rows:
            print(f"{season}: SKIPPED — {rows['skipped']}")
            continue
        for policy, per_seat in rows.items():
            tot = sum(v["graded_total_partial"] for v in per_seat.values())
            cov = min(v["coverage"] for v in per_seat.values())
            print(f"{season} {policy:7s}: total ${tot:8.2f} across {len(per_seat)} seats, min coverage {cov}")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

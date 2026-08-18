# TERRITORY: A
"""BUILD THE MISSING 2021/2022 WEEKLY-POINTS STORES — offline, from data we hold.

THE LIMIT THIS REMOVES. "own_v6 can only be graded on 2025" has capped nearly
every study in this repo at a single season of evidence. own_model_v2's
`late_rates` needs two prior seasons of weekly points, and
`nflverse_weekly_points_{2021,2022}.json` do not exist — so grading v6 on 2023
or 2024 was impossible and every verdict carried "N = 1 season" as its binding
confidence limit.

**The limit is true of the STORE, not of the DATA.** `component_stats_{2021,
2022}.json` are committed and carry every component the frozen scoring table
prices. The points store is a pure re-scoring of exactly those components.

PROVEN BEFORE BUILT, because a fabricated store is worse than a missing one.
Re-scoring `component_stats_2023.json` through `frozen_scoring_table()` and
comparing against the COMMITTED `nflverse_weekly_points_2023.json`:

    player-weeks compared : 5,371
    DISAGREEMENTS         : 0

Zero, not "close". The same arithmetic then produces 2021 and 2022. If that
reproduction ever stops being exact, this script must not run — the check is
the licence, and `--verify-only` exists to run it alone.

WHAT THIS IS NOT. It does not invent a single number. Every value is the
committed component line multiplied by the committed scoring table. A player
absent from the component store stays absent — never a zero — which matters
because `nflverse_weekly_points_2025.json` is known to DROP zero-point rows,
so row presence there means "scored something", not "played". This builder
inherits the component store's population, which is the honest one.

Run:
    python3 draft/backtest/build_weekly_points_from_components.py --verify-only
    python3 draft/backtest/build_weekly_points_from_components.py --seasons 2021 2022
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

#: The season whose committed store licenses this build. Chosen because it is
#: the oldest committed points store, so it exercises the oldest component
#: schema — the one most likely to have drifted.
VERIFY_SEASON = 2023


def score_row(row: dict, scoring: dict) -> float:
    """One component line -> fantasy points. Deliberately the same shape the
    verification runs, so the thing proven and the thing built cannot diverge:
    a non-numeric or unpriced field contributes nothing rather than raising."""
    return round(sum(float(row.get(k) or 0) * float(scoring.get(k, 0))
                     for k in row if isinstance(row.get(k), (int, float))), 2)


def rescore_season(comp: dict, scoring: dict) -> dict:
    """{week:int -> {player_id: points}} for one component store."""
    out = {}
    for w in comp.get("weeks", []):
        out[int(w["week"])] = {pid: score_row(row, scoring)
                               for pid, row in (w.get("players") or {}).items()}
    return out


def verify_against_committed(comp: dict, committed: dict, scoring: dict) -> dict:
    """Re-score the component store and diff against the committed points
    store. This is the LICENCE to build anything: exact or nothing."""
    have = {int(w["week"]): w["points"] for w in committed.get("weeks", [])}
    rebuilt = rescore_season(comp, scoring)
    compared, diffs, absent = 0, [], 0
    for wk, rows in rebuilt.items():
        if wk not in have:
            continue
        for pid, got in rows.items():
            exp = have[wk].get(pid)
            if exp is None:
                absent += 1
                continue
            compared += 1
            if abs(got - float(exp)) > 1e-9:
                diffs.append({"week": wk, "player_id": pid,
                              "rebuilt": got, "committed": exp})
    return {"compared": compared, "disagreements": len(diffs),
            "in_components_not_in_points": absent,
            "exact": not diffs, "sample": diffs[:5]}


def _fingerprint(scoring: dict) -> str:
    """Match the committed stores' `scoring-fingerprint/v1` field so a reader
    can tell at a glance that every season was scored under one table."""
    blob = json.dumps(scoring, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def build_doc(season: int, comp: dict, scoring: dict, fingerprint: str) -> dict:
    weeks = []
    for wk in sorted(rescore_season(comp, scoring)):
        pts = rescore_season(comp, scoring)[wk]
        weeks.append({"season": season, "week": wk, "points": pts,
                      "scoring": scoring, "scoring_fingerprint": fingerprint,
                      "row_count": len(pts)})
    wknums = [w["week"] for w in weeks]
    return {
        "_territory": "TERRITORY: A — produced by build_weekly_points_from_components.py",
        "_note": ("REBUILT OFFLINE from the committed component store, not "
                  "fetched. Licensed by an exact reproduction of the committed "
                  f"{VERIFY_SEASON} store (0 disagreements over 5,371 "
                  "player-weeks). Every value is a committed component line "
                  "times the frozen scoring table; nothing is invented. "
                  "Population is inherited from the component store, so a "
                  "player absent there is ABSENT here, never a zero."),
        "fingerprint_version": "scoring-fingerprint/v1",
        "scoring_fingerprints": [fingerprint],
        "weeks": weeks,
        "coverage": {str(season): {
            "weeks": len(weeks), "first": min(wknums) if wknums else None,
            "last": max(wknums) if wknums else None,
            "missing": [w for w in range(min(wknums), max(wknums) + 1)
                        if w not in wknums] if wknums else [],
            "complete": bool(wknums) and len(wknums) == (max(wknums) - min(wknums) + 1),
            "rebuilt_offline": True,
        }},
    }


def main() -> int:
    import fetch_component_stats as FCS
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*", type=int, default=[])
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()

    scoring = FCS.frozen_scoring_table()
    fp = _fingerprint(scoring)

    comp_v = json.loads((HERE / f"component_stats_{VERIFY_SEASON}.json").read_text())
    committed = json.loads((HERE / f"nflverse_weekly_points_{VERIFY_SEASON}.json").read_text())
    v = verify_against_committed(comp_v, committed, scoring)
    print(f"VERIFY against committed {VERIFY_SEASON}: compared {v['compared']}, "
          f"disagreements {v['disagreements']}, exact={v['exact']}")
    if not v["exact"]:
        print("REFUSING TO BUILD — the rebuild no longer reproduces a committed "
              "store, so it cannot be trusted to produce a missing one.",
              file=sys.stderr)
        for s in v["sample"]:
            print("   ", s, file=sys.stderr)
        return 1
    if args.verify_only:
        return 0

    for season in args.seasons:
        src = HERE / f"component_stats_{season}.json"
        if not src.exists():
            print(f"{season}: no component store — skipped")
            continue
        doc = build_doc(season, json.loads(src.read_text()), scoring, fp)
        out = HERE / f"nflverse_weekly_points_{season}.json"
        out.write_text(json.dumps(doc, indent=1))
        cov = doc["coverage"][str(season)]
        print(f"{season}: wrote {out.name} — {cov['weeks']} weeks "
              f"({cov['first']}-{cov['last']}), "
              f"{sum(w['row_count'] for w in doc['weeks'])} player-weeks")
    return 0


if __name__ == "__main__":
    sys.exit(main())

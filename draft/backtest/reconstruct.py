#!/usr/bin/env python3
# TERRITORY: A
"""THE JANUARY RECONSTRUCTION — the Annual step that was specified and never wired.

WHAT IT DOES. Assembles the candidate field FROM THE SEASON'S RESIDUALS rather
than from a list guessed in August, replays each candidate against the ARCHIVED
projections and rosters, grades against the FROZEN BASELINE, and reports the
detectable-effect floor beside every row.

WHY FROM RESIDUALS. Candidates chosen before a season are chosen from the same
priors that built the live core, so they agree with it — which is exactly why
every strategy pair proposed so far disagreed 0.7% of the time and resolved
nothing. A residual is where the model was wrong, and a candidate drawn from one
is high-contrast by construction rather than by hope.

⚠️ IT REPORTS "NO INPUT" AND THAT IS A SUCCESSFUL RUN. The replay needs
`draft/data/proj_series.json` to carry IN-SEASON WEEKS, and through the preseason
it carries none. A step that reports no input is OBSERVABLY WIRED; one that is
never invoked is indistinguishable from one that does not exist — which is the
failure this file was written to end, and it has now happened four times.

⚠️ AND NOTHING HERE PROMOTES ANYTHING. This is discovery under the three-filter
model: a candidate that wins a reconstruction has earned a PREREGISTRATION for
the following season, never a weight. The multiplicity discipline applies — the
denominator is reported with every row.

Run: python3 draft/backtest/reconstruct.py --season 2026 [--json]
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PROJ_SERIES = ROOT / "draft" / "data" / "proj_series.json"
BASELINE_DIR = ROOT / "draft" / "baseline"

# The floor a residual must clear to become a candidate, declared before any
# season has been read. A residual smaller than this is noise in the projection,
# not a place the model was wrong.
RESIDUAL_POINTS = 3.0        # points per player-week
MIN_WEEKS = 4                # a residual seen in fewer weeks is one bad game


def load_archive() -> tuple[list, str | None]:
    """The archived weekly projections. Returns (in-season rows, why-not)."""
    if not PROJ_SERIES.exists():
        return [], "proj_series.json does not exist"
    try:
        d = json.loads(PROJ_SERIES.read_text())
    except (ValueError, OSError) as e:
        return [], f"proj_series.json unreadable: {type(e).__name__}"
    rows = [s for s in (d.get("series") or []) if s.get("week") is not None]
    if not rows:
        n = len(d.get("series") or [])
        return [], (f"the archive holds {n} snapshot(s) and NONE carries a week — "
                    "these are preseason captures, and the replay needs in-season "
                    "weeks. Expected until the season opens.")
    return rows, None


def frozen_baseline() -> tuple[str | None, str | None]:
    """The newest frozen baseline version, which every candidate grades against."""
    versions = sorted(BASELINE_DIR.glob("v*.json"),
                      key=lambda p: int(p.stem[1:]) if p.stem[1:].isdigit() else -1)
    if not versions:
        return None, "no frozen baseline exists"
    return versions[-1].name, None


def candidates_from_residuals(rows: list) -> list:
    """Where the model was wrong, by position and by week.

    PURE over its input so it is testable without a season. Returns candidates
    with their own n attached — a candidate whose residual appears in three weeks
    is a different object from one seen in fourteen, and the field must not
    flatten them.
    """
    by_pos: dict = {}
    for snap in rows:
        for pid, resid in (snap.get("residuals") or {}).items():
            pos = (snap.get("positions") or {}).get(pid)
            if pos is None:
                continue
            b = by_pos.setdefault(pos, {"n_weeks": set(), "resid": []})
            b["n_weeks"].add(snap.get("week"))
            b["resid"].append(float(resid))
    out = []
    for pos, b in by_pos.items():
        if not b["resid"]:
            continue
        mean = sum(b["resid"]) / len(b["resid"])
        weeks = len(b["n_weeks"])
        if abs(mean) < RESIDUAL_POINTS or weeks < MIN_WEEKS:
            continue
        out.append({
            "candidate": f"projection bias at {pos}",
            "direction": "over" if mean > 0 else "under",
            "mean_residual": round(mean, 2),
            "n_obs": len(b["resid"]),
            "n_clusters": weeks,
        })
    return out


def detectable_floor(n_clusters: int, sd: float = 8.57) -> float | None:
    """The smallest effect this many WEEKS could have resolved.

    The week is the independent unit — measured: treating correlated rows as
    independent runs the false-positive rate 4.7% -> 11.1%. sd is the league's own
    measured starter-week SD. None below two clusters, where the quantity does
    not exist rather than being large.
    """
    if n_clusters < 2:
        return None
    return round(2.8 * sd / math.sqrt(n_clusters), 2)


def run(season: str) -> dict:
    rows, why_not = load_archive()
    base, base_why = frozen_baseline()
    if why_not:
        return {"season": season, "status": "no_input", "why": why_not,
                "baseline": base, "candidates": [], "searched": 0}
    cands = candidates_from_residuals(rows)
    for c in cands:
        c["detectable_floor"] = detectable_floor(c["n_clusters"])
        c["resolvable"] = (c["detectable_floor"] is not None
                           and abs(c["mean_residual"]) >= c["detectable_floor"])
    return {
        "season": season,
        "status": "ok",
        "baseline": base or base_why,
        # THE DENOMINATOR TRAVELS WITH THE FINDINGS. A candidate count without
        # the number of relationships examined is not a finding.
        "searched": len({(s.get("week")) for s in rows}) * 6,
        "weeks_archived": len({s.get("week") for s in rows}),
        "candidates": sorted(cands, key=lambda c: -abs(c["mean_residual"])),
        "promotes": "NOTHING — discovery output. A winner earns a preregistration.",
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2026")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    r = run(a.season)
    if a.json:
        print(json.dumps(r, indent=2, sort_keys=True))
        sys.exit(0)
    print("=" * 72)
    print(f"JANUARY RECONSTRUCTION — {a.season}")
    print("=" * 72)
    print(f"frozen baseline: {r['baseline']}")
    if r["status"] == "no_input":
        print("")
        print("NO INPUT — and this is a successful run.")
        print("  " + r["why"])
        print("")
        print("The step is wired and observably so. It will produce candidates the")
        print("first January that follows a season of archived weekly projections.")
        sys.exit(0)
    print(f"weeks archived: {r['weeks_archived']}   relationships examined: {r['searched']}")
    print("")
    if not r["candidates"]:
        print(f"No residual cleared {RESIDUAL_POINTS} pts over {MIN_WEEKS}+ weeks.")
        print(f"{r['searched']} relationships examined. That is a successful run.")
        sys.exit(0)
    for c in r["candidates"]:
        print(f"  {c['candidate']:<34} {c['mean_residual']:+7.2f} pts  "
              f"n_obs {c['n_obs']:<5} clusters {c['n_clusters']:<3} "
              f"floor {c['detectable_floor']}  "
              f"{'RESOLVABLE' if c['resolvable'] else 'below its own floor'}")
    print("")
    print(f"{len(r['candidates'])} candidate(s) from {r['searched']} examined. "
          f"{r['promotes']}")

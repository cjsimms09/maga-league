#!/usr/bin/env python3
"""OUR OWN 2026 PROJECTIONS — wiring lab_projections.walk_forward() to the live board.

`walk_forward()` (lab_projections.py) has existed for a while: a leak-free,
self-derived projection built strictly from prior-season production, scored under
OUR OWN scoring engine, regressed to the positional mean, age-adjusted. It has been
used for backtest replay (exp33/exp35/exp_regression_cv all measure it) but was never
attached to the LIVE 2026 board — the board's own baseline comes from Sleeper's
provider stat line (see projections.py: baseline_from_projections).

WHY THIS DOESN'T NEED THE NETWORK ACCESS THAT'S BEEN BLOCKING EVERYTHING ELSE TODAY.
Every other Lab script that hit `sleeper_import.fetch_players()` needed it to build a
FULL players_meta (name/position/age for the crosswalk AND for walk_forward's own
inputs). We don't need a fresh Sleeper fetch for either: positions and ages for every
2026 board player are already in `public/draft_data.json` (this year's real board,
686 players), and the gsis<->sleeper crosswalk comes from `nfl_data_py.import_ids()`
alone (12,472 rows, both columns present) — grade.py's crosswalk_gsis_to_sleeper()
already prefers this source over the Sleeper-derived one and only falls back to the
latter for a small residual (documented there as 22 of 761 unmapped in an earlier run).

WHAT THIS SCRIPT DOES, AND WHAT IT DELIBERATELY DOES NOT DO.
Computes proj_ownmodel for every player already on the live 2026 board and writes it
alongside the existing proj_sleeper / proj_fantasypros columns — additive, exactly the
pattern FantasyPros was added under (build.py's own comment: "attach FantasyPros
projections... alongside the raw Sleeper baseline... never a build dependency").
It does NOT change proj_mean, proj_baseline, VORP, or anything the live rankings
read — DECISIONS-NEEDED.md #6 is explicit that swapping the projection source needs a
clean grade first ("unlike the ADP anchor... there is NO clean projection grade to
justify a swap yet"), and this script doesn't have one either. It computes the third
number and reports where it agrees and disagrees with what's already there — the same
diagnostic-only posture as the existing FP-vs-Sleeper divergence check (#000).

Run: python draft/backtest/own_projections_2026.py

2026-08-15, LATER THE SAME DAY: the core (crosswalk -> nflverse fetch -> walk_forward
-> depth-chart dampening) was extracted to draft/own_projections.py so build.py could
attach `proj_ownmodel` to the LIVE board without a second copy of this logic — this
script now calls that shared function and keeps only its own report/diff/write
behavior. Two places computing the same number was exactly the "two-places disease"
this project has already found and fixed more than once (see proj_feed.js's comment
on the same mistake in a different file) — not repeating it here.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(REPO))

BOARD = REPO / "public" / "draft_data.json"
OUT = HERE / "own_projections_2026.json"


def main():
    import config_schema
    from own_projections import compute_own_projections

    board = json.loads(BOARD.read_text())
    season = int(board.get("league", {}).get("season") or 2026)
    cfg = config_schema.load(REPO / "draft" / "config" / "league_config.json")
    players = board["players"]

    print(f"Computing own projections for {season}...")
    proj, diag = compute_own_projections(players, cfg, season=season)
    print(f"  crosswalk: {diag['crosswalk_size']} gsis->sleeper mappings")
    print(f"  prior years used: {diag['prior_years_used']} "
          f"(wanted {diag['prior_years_wanted']})")
    print(f"  {diag['projected']} players projected")
    print(f"  depth-chart dampening applied to {diag['dampened']} players "
          f"(QB from order 2, RB/WR/TE from order 3 — UNMEASURED default "
          f"multipliers, see draft/own_projections.py)")

    board_ids = {str(p["player_id"]) for p in players}
    coverage = len(set(proj) & board_ids)
    print(f"  coverage on live board: {coverage} / {len(board_ids)} players")

    # Diagnostic-only comparison against what's already on the board. No write-back.
    diffs = []
    for p in players:
        pid = str(p["player_id"])
        own = proj.get(pid)
        sleeper = p.get("proj_sleeper")
        if own is not None and sleeper:
            diffs.append({
                "player_id": pid, "name": p.get("name"), "position": p.get("position"),
                "proj_ownmodel": own, "proj_sleeper": sleeper,
                "ratio": round(own / sleeper, 3) if sleeper else None,
            })

    by_pos: dict[str, list[float]] = {}
    for d in diffs:
        by_pos.setdefault(d["position"], []).append(d["ratio"])
    print("\nMedian proj_ownmodel / proj_sleeper ratio by position:")
    for pos, ratios in sorted(by_pos.items()):
        ratios.sort()
        med = ratios[len(ratios) // 2]
        print(f"  {pos}: n={len(ratios)} median={med}")

    OUT.write_text(json.dumps({
        "season": season, "prior_years_used": diag["prior_years_used"],
        "note": f"Wanted {diag['prior_years_wanted']}; used {diag['prior_years_used']} "
                f"(a wanted year that 404s from nflverse's parquet mirror is dropped, "
                f"not silently substituted).",
        "coverage": coverage, "board_size": len(board_ids),
        "proj_ownmodel": proj, "diagnostic_diffs": diffs[:50],
    }, indent=2))
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()

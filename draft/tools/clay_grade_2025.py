# TERRITORY: C
"""Grade Clay's 2025 guide against what actually happened in 2025.

Cory, 2026-08-20, uploading the 2025 PDF: "Here is Mike clays 2025 predictions
so we can upload and grade history." Unlike the 2026 store (frozen for a
January 2027 grade nobody can run yet), 2025 is a COMPLETED season -- real
realized points already sit in
`draft/backtest/nflverse_weekly_points_2025.json`, scored under this league's
own table. So this grade runs TODAY, not eleven months from now.

REUSED RATHER THAN REBUILT (rule 11): `season_totals` (sums the 18 realized
weeks into one per-player total) from `exp_fp_hist_proj.py`, and `cell` (MAE /
Spearman / bias / precision-at-N, with its own MIN_N floor) from
`sleeper_vs_fp_grade.py` -- both TERRITORY: A, imported read-only, exactly the
functions the project already trusts for this exact kind of grade. Nothing in
either file is edited or re-derived here.

WHAT THIS DOES NOT DO: does not touch the board, does not blend Clay into
anything, does not grade the 2026 store (that one has no outcomes yet). This
is retrospective evidence about the SOURCE, for whoever decides whether to
trust Clay going forward.

Run: python3 draft/tools/clay_grade_2025.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
BACKTEST = DRAFT / "backtest"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BACKTEST))

from clay_projections import build_store  # noqa: E402
from exp_fp_hist_proj import season_totals  # noqa: E402 (rule 11)
from sleeper_vs_fp_grade import cell, MIN_N  # noqa: E402 (rule 11)

OUT = DRAFT / "data" / "clay_grade_2025.json"
POSITIONS = ("QB", "RB", "WR", "TE")


def main() -> dict:
    clay_doc = build_store(2025)

    realized_store = json.loads((BACKTEST / "nflverse_weekly_points_2025.json").read_text())
    actual, games = season_totals(realized_store)

    proj = {}
    proj_per_game = {}
    actual_per_game = {}
    positions = {}
    excluded_no_realized_row = 0
    excluded_unmatched_crosswalk = 0
    for pid, p in clay_doc["players"].items():
        if not p["matched_board"]:
            excluded_unmatched_crosswalk += 1
            continue
        if pid not in actual:
            excluded_no_realized_row += 1
            continue
        proj[pid] = p["proj_clay_scored"]
        positions[pid] = p["position"]
        clay_g = (p.get("raw_stats") or {}).get("g") or 17.0
        proj_per_game[pid] = p["proj_clay_scored"] / clay_g
        actual_per_game[pid] = actual[pid] / games[pid]  # games[pid] >= 1: only present if a week's row existed

    pids_by_pos = {pos: [pid for pid, p in positions.items() if p == pos] for pos in POSITIONS}
    cells = {pos: cell(proj, actual, pids) for pos, pids in pids_by_pos.items()}

    all_pids = list(positions)
    cells["ALL"] = cell(proj, actual, all_pids)

    # SKILL CUT (Cory's own standard elsewhere in this project: "grade skill
    # not luck"). The season-total cell above conflates Clay's per-game
    # accuracy with which players got hurt -- something no preseason
    # projection can foresee. Per-game rate removes that confound: Lamar
    # Jackson/Jayden Daniels/Joe Burrow/Kyler Murray all missed 5+ games in
    # 2025, which is why the season-total QB bias below is large and positive
    # even though Clay's per-game numbers for the ones who stayed healthy
    # (Josh Allen, Jalen Hurts, Bo Nix) were close.
    skill_cells = {pos: cell(proj_per_game, actual_per_game, pids)
                   for pos, pids in pids_by_pos.items()}
    skill_cells["ALL"] = cell(proj_per_game, actual_per_game, all_pids)

    doc = {
        "_territory": "TERRITORY: C — written by draft/tools/clay_grade_2025.py",
        "_what": "Mike Clay's 2025 preseason projection (scored under our own table, "
                 "from raw stat lines -- his full-PPR points were never read) graded "
                 "against REALIZED 2025 season points from "
                 "draft/backtest/nflverse_weekly_points_2025.json, weeks 1-17.",
        "_reused": "season_totals (exp_fp_hist_proj.py) and cell (sleeper_vs_fp_grade.py), "
                   "both TERRITORY: A, imported read-only per rule 11 -- not re-derived.",
        "_how_to_read": "spearman is the ordering grade (did Clay rank players correctly); "
                        "mae is the level grade in fantasy points; bias is signed error "
                        "(positive = Clay projected too high on average). topN is the "
                        "fraction of the realized top-N Clay also had in his own top-N, "
                        "None when the position has fewer than N graded players. "
                        "`cells` grades SEASON TOTALS (Clay's assumed ~17 games vs however "
                        "many the player actually played -- includes injury luck no "
                        "preseason source can predict). `skill_cells` grades PER-GAME RATE "
                        "instead (Clay's total / his own assumed games, vs realized total / "
                        "games actually played) -- Cory's own standard elsewhere in this "
                        "project: grade skill, not luck.",
        "population": {
            "clay_players_2025": len(clay_doc["players"]),
            "excluded_unmatched_crosswalk": excluded_unmatched_crosswalk,
            "excluded_no_realized_2025_row": excluded_no_realized_row,
            "graded_total": len(all_pids),
            "graded_by_position": {pos: len(pids) for pos, pids in pids_by_pos.items()},
            "min_n_for_a_measured_cell": MIN_N,
        },
        "cells": cells,
        "skill_cells": skill_cells,
    }
    OUT.write_text(json.dumps(doc, indent=1))

    print("CLAY 2025 GRADE — against realized 2025 outcomes\n")
    print(f"  clay players (2025): {len(clay_doc['players'])}")
    print(f"  excluded (crosswalk unmatched): {excluded_unmatched_crosswalk}")
    print(f"  excluded (no realized 2025 row): {excluded_no_realized_row}")
    print(f"  graded: {len(all_pids)}\n")

    def _print(label, cc):
        print(f"  -- {label} --")
        for pos in (*POSITIONS, "ALL"):
            c = cc[pos]
            if c.get("status") == "unmeasurable":
                print(f"  {pos:4} unmeasurable (n={c['n']} < {MIN_N})")
            else:
                print(f"  {pos:4} n={c['n']:4}  spearman={c['spearman']:>7}  "
                      f"mae={c['mae']:>7}  bias={c['bias']:>7}  "
                      f"top12={c['top12']}  top24={c['top24']}  top48={c['top48']}")

    _print("SEASON TOTAL (actual, includes injury luck)", cells)
    _print("PER-GAME RATE (skill, injury luck removed)", skill_cells)
    print(f"\n  wrote {OUT.relative_to(ROOT)}")
    return doc


if __name__ == "__main__":
    main()

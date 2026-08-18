# TERRITORY: C
"""THE REUSABLE `grade()` ENTRY POINT — D13's metrics plus the metric the
2026-08-18 resource review added, in ONE place.

Routed 2026-08-18 (ROUTES.md, A -> C): "the D13+precision grading harness...
this is the v7 program's gate... Emit a reusable grade(projection_map) entry
point so A's v7 candidates grade through YOUR harness instead of a second
derivation — the one-derivation rule you just applied to
_assemble_asof_bundles, applied again."

TWO METRIC FAMILIES, BOTH PREREGISTERED IN `V7-CANDIDATE-PREREG.md` §2:

  1. FULL-BOARD — Spearman + MAE + bias per position. Unchanged from
     `model_accuracy_backtest.py` (TERRITORY: A, the existing D13 harness):
     same `spearman` (imported from `lab_projections`, not re-derived),
     same MIN_N=10 "unmeasurable, never a number" discipline, same
     exclusion-counting shape. This module does not edit that file — it is
     a NEW, independent harness callers use instead of either re-deriving
     the same metrics a third time or reaching into A's file.

  2. TOP-TIER PRECISION — P@12 and P@24 per position, the metric the
     resource review's position_predictor finding added: "a model can lose
     the full board and win the draftable zone, and the draftable zone is
     the only zone Cory picks in." Precision-at-K, the standard retrieval
     metric: of the model's TOP-K predicted players at a position, what
     fraction actually finished the season in the TOP-K by realized points?
     A model can have mediocre full-board Spearman (noisy ordering among
     replacement-level players nobody drafts) while nailing exactly who the
     top 12 are — which is what a drafter actually needs.

THIS MODULE TAKES DATA, NOT A SOURCE. `grade(projection_map, actual,
positions)` is pure — no fetch, no file read beyond what the caller already
has in memory. own_v6, sleeper_hist_proj, exp_fp_hist_proj and every v7
candidate all produce the SAME shape (`{player_id: points}`) already; this
harness grades any of them identically, so a head-to-head is a fact about
the projections, not about which grader happened to compute it.

K and DEF are STRUCTURALLY UNGRADEABLE here, same as D13: the weekly stores
this repo grades against carry no kicking or team-defense stats. Reported
`unmeasurable`, never silently dropped.

Every function here is pure and unit-tested without touching a store. There
is no `main()` / CLI — this harness has nothing of its own to fetch or
commit; it is called BY the modules that hold real projections (own_v6, a
v7 candidate, or a future Sleeper/FP per-player capture once one exists —
register D13/P38, still open, not solved by this file).
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from lab_projections import spearman  # noqa: E402 — reused, not re-derived (D13's own metric)

POSITIONS = ("QB", "RB", "WR", "TE")
UNMEASURABLE_POSITIONS = ("K", "DEF")
MIN_N = 10
PRECISION_KS = (12, 24)


def population(projection_map: dict, actual: dict, positions: dict) -> dict:
    """`{pos: {pid: (pred, act)}}` plus counted exclusions — the population
    every metric below is computed on. Same exclusion classes as D13's own
    `build_population` (no position on record, no realized weekly row), so
    a head-to-head against the D13 harness's own numbers is apples-to-apples.
    """
    cells: dict[str, dict] = {p: {} for p in POSITIONS}
    excl = {"excluded_no_position": 0, "excluded_no_actual": 0}
    for pid, pred in (projection_map or {}).items():
        pid = str(pid)
        pos = positions.get(pid)
        if pos not in POSITIONS:
            excl["excluded_no_position"] += 1
            continue
        act = actual.get(pid)
        if act is None:
            excl["excluded_no_actual"] += 1
            continue
        cells[pos][pid] = (float(pred), float(act))
    return {"cells": cells, "exclusions": excl}


def precision_at_k(pairs: dict, k: int) -> dict:
    """`pairs`: `{pid: (pred, act)}` for ONE position. Of the top-`k`
    players by PREDICTED points, what fraction are also top-`k` by REALIZED
    points? `unmeasurable` below `k` players in the population — precision
    at 24 needs 24 real candidates to mean anything, not the top of a
    12-player pool read twice."""
    if len(pairs) < k:
        return {"k": k, "status": "unmeasurable", "n_population": len(pairs)}
    pred_top = {pid for pid, _ in sorted(pairs.items(), key=lambda kv: -kv[1][0])[:k]}
    act_top = {pid for pid, _ in sorted(pairs.items(), key=lambda kv: -kv[1][1])[:k]}
    hits = len(pred_top & act_top)
    return {"k": k, "status": "measured", "n_population": len(pairs),
           "hits": hits, "precision": round(hits / k, 4)}


def grade_position(pairs: dict, min_n: int = MIN_N) -> dict:
    """One position's full cell: full-board metrics (D13, unchanged) plus
    both precision-at-K cells. `pairs`: `{pid: (pred, act)}`."""
    n = len(pairs)
    if n < min_n:
        return {"n": n, "status": "unmeasurable",
               "basis": "only %d graded player(s); min_n is %d" % (n, min_n),
               "spearman": None, "mae": None, "bias": None,
               "precision": {str(k): {"k": k, "status": "unmeasurable",
                                      "n_population": n} for k in PRECISION_KS}}
    preds = [p for p, _ in pairs.values()]
    acts = [a for _, a in pairs.values()]
    errs = [p - a for p, a in pairs.values()]
    return {"n": n, "status": "measured",
           "spearman": round(spearman(preds, acts), 4),
           "mae": round(sum(abs(e) for e in errs) / n, 2),
           "bias": round(sum(errs) / n, 2),
           "precision": {str(k): precision_at_k(pairs, k) for k in PRECISION_KS}}


def grade(projection_map: dict, actual: dict, positions: dict, *, min_n: int = MIN_N) -> dict:
    """THE REUSABLE ENTRY POINT. `projection_map`: `{player_id: points}` —
    any projection source in this shape (own_v6, a v7 candidate, a
    historical-source capture) grades identically. `actual`: `{player_id:
    realized_points}` for the graded season. `positions`: `{player_id:
    "QB"|"RB"|...}`, the RECORD not the live board (same discipline D13's
    own harness uses, to avoid the live-board join defect named elsewhere
    this session).

    Returns per-position cells (both metric families) plus exclusions —
    the shape a caller diffs two projection sources' `grade()` output
    against directly, position by position.
    """
    pop = population(projection_map, actual, positions)
    cells = {pos: grade_position(pop["cells"][pos], min_n) for pos in POSITIONS}
    graded_total = sum(c["n"] for c in cells.values())
    return {
        "_territory": "TERRITORY: C — produced by draft/backtest/model_accuracy_grade.py",
        "_note": "Full-board (Spearman/MAE/bias) is the D13 metric, unchanged. "
                 "precision.{12,24} is the top-tier metric the 2026-08-18 "
                 "resource review added (position_predictor transfer) -- a "
                 "model can lose the full board and win the draftable zone.",
        "min_n": min_n,
        "graded": graded_total,
        "exclusions": pop["exclusions"],
        "unmeasurable_positions": {p: "no kicking/team-defense stats in the "
                                     "weekly stores this harness grades "
                                     "against" for p in UNMEASURABLE_POSITIONS},
        "cells": cells,
    }

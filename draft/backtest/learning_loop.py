# TERRITORY: A
"""THE MISSING ARC OF THE CLOSED LOOP — measured grades → concrete, reviewable
model-update RECOMMENDATIONS. Built 2026-08-15 (model/learning audit, Mission 2).

── THE GAP THIS CLOSES, traced not asserted ──────────────────────────────────

The loop captures (predledger, claims-cron), resolves (claims-cron, forecast
resolutions), and grades (grade-cron → calibration:{season}:* snapshots +
evidence_weights:current). Then it stops:

    evidence_weights:current        written weekly, ZERO readers (grep: only
                                    its writer and a PARKED mention)
    calibration snapshots           read by /accuracy, /member, /standings —
                                    pages a human might look at
    projection_error_calibration    measured (C, 20 cells); its appliers
                                    proj_sd_for/proj_ceiling_for have NO
                                    production caller
    component_grades.json           all rows no_data; read by standing_check

Nothing in the MODEL — engine.js CFG, MEASURED_WEIGHTS, POSITION_VARIANCE,
the projection composition — reads any grade artifact. "Humans might look at
a page" is the entire learning mechanism today.

── WHAT THIS MODULE DOES AND REFUSES TO DO ──────────────────────────────────

DOES: turn each measured grade artifact into a RECOMMENDATION carrying the
exact proposed values, the evidence behind them, and the one-line acceptance
path — written to draft/data/model_update_recommendations.json.

REFUSES: to change any default. Every scoring/weight/projection constant in
production is exactly as gated — that class of change is Cory's ruling, always
(DECISIONS-NEEDED #6, the graduation gates). Accepting a recommendation here
is a reviewed one-line change by a human; this module only makes that change
concrete enough to review.

── PREREGISTRATION for the 2026 source grade (REC-2), fixed 2026-08-15,
   BEFORE any 2026 outcome exists ─────────────────────────────────────────────

    forecast          per source, the LAST snapshot in proj_series.json dated
                      on or before DRAFT_DATE (2026-08-22). A later snapshot
                      knows regular-season information and is REFUSED — the
                      leak guard is a test's fail arm, not a comment.
    outcome           realized 2026 points under OUR scoring, weeks 1-17, from
                      draft/backtest/nflverse_weekly_points_2026.json when the
                      weekly store starts writing it (C's capture path).
    population        per position (QB/RB/WR/TE), players carried by the
                      snapshot AND with ≥1 graded weekly row; MIN_N = 10 else
                      the cell is unmeasurable.
    metrics           MAE, mean signed bias, Spearman — the same three the
                      2025 backtest used (model_accuracy_backtest.py).
    weight rule       per position: w_s ∝ 1 / MSE_s over measured sources,
                      normalised to sum 1; any source unmeasurable in a cell
                      gets NO weight claim there (the cell reports
                      "insufficient evidence", never equal-by-default).
    what acceptance   a reviewed change to the projection composition in
    looks like        build.py — today proj_mean is single-source Sleeper;
                      the proposal would be the per-position weighted blend
                      with these measured weights. One diff, gated on Cory.

Run: python draft/backtest/learning_loop.py
Writes draft/data/model_update_recommendations.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from lab_projections import spearman  # noqa: E402

DATA = HERE.parent / "data"
OUT = DATA / "model_update_recommendations.json"

DRAFT_DATE = "2026-08-22"
GRADE_SEASON = 2026
LAST_SCORED_WEEK = 17
MIN_N = 10
POSITIONS = ("QB", "RB", "WR", "TE")


# ── REC-2 machinery: grade the frozen sources when the outcome exists ────────

def pre_draft_snapshot(series: list, source: str, cutoff: str = DRAFT_DATE):
    """The LAST snapshot for `source` dated on or before `cutoff`.

    A snapshot dated after the cutoff has seen regular-season football and
    grading it as a preseason forecast would flatter every source — refused by
    construction: it is simply never selected, and a series containing ONLY
    post-cutoff snapshots yields None rather than the least-contaminated one.
    """
    rows = [s for s in series
            if s.get("source") == source and (s.get("date") or "") <= cutoff]
    if not rows:
        return None
    return max(rows, key=lambda s: s.get("date") or "")


def realized_totals(store: dict, last_week: int = LAST_SCORED_WEEK) -> dict:
    out: dict[str, float] = {}
    for w in (store.get("weeks") or []):
        if w["week"] > last_week:
            continue
        for pid, v in w["points"].items():
            out[pid] = out.get(pid, 0.0) + float(v)
    return out


def grade_frozen_sources(series: list, store: dict, positions: dict,
                         cutoff: str = DRAFT_DATE) -> dict:
    """Per-source per-position accuracy + inverse-MSE weights, or a named
    refusal when the outcome data does not exist yet. Pure — callers supply
    every input, so the January run and the unit test are the same code path.
    """
    sources = sorted({s.get("source") for s in series if s.get("source")})
    if not sources:
        return {"status": "blocked", "why": "no frozen projection snapshots"}
    realized = realized_totals(store) if store else {}
    if not realized:
        return {"status": "blocked",
                "why": (f"no realized {GRADE_SEASON} weekly store yet — gradeable in "
                        "January 2027 from nflverse_weekly_points_2026.json"),
                "sources_frozen": sources}

    cells: dict = {}
    for pos in POSITIONS:
        row: dict = {}
        for src in sources:
            snap = pre_draft_snapshot(series, src, cutoff)
            if snap is None:
                row[src] = {"status": "unmeasurable",
                            "why": f"no snapshot on or before {cutoff}"}
                continue
            proj = snap.get("proj") or {}
            pairs = [(float(v), realized[pid]) for pid, v in proj.items()
                     if positions.get(pid) == pos and pid in realized]
            if len(pairs) < MIN_N:
                row[src] = {"status": "unmeasurable", "n": len(pairs)}
                continue
            errs = [f - a for f, a in pairs]
            row[src] = {
                "status": "measured", "n": len(pairs),
                "snapshot_date": snap.get("date"),
                "mae": round(sum(abs(e) for e in errs) / len(errs), 2),
                "bias": round(sum(errs) / len(errs), 2),
                "mse": round(sum(e * e for e in errs) / len(errs), 2),
                "spearman": round(spearman([f for f, _ in pairs],
                                           [a for _, a in pairs]), 4),
            }
        measured = {s: r for s, r in row.items() if r.get("status") == "measured"}
        if len(measured) >= 2:
            inv = {s: 1.0 / max(r["mse"], 1e-9) for s, r in measured.items()}
            tot = sum(inv.values())
            weights = {s: round(v / tot, 4) for s, v in inv.items()}
        elif len(measured) == 1:
            weights = {next(iter(measured)): 1.0}
        else:
            weights = None
        cells[pos] = {"sources": row, "proposed_weights": weights,
                      "weight_rule": "inverse-MSE over measured sources, normalised"}
    return {"status": "measured", "cutoff": cutoff, "cells": cells}


# ── the recommendation artifact ──────────────────────────────────────────────

def _load(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def build_recommendations() -> dict:
    cal = _load(HERE / "projection_error_calibration.json")
    acc = _load(HERE / "model_accuracy_2025.json")
    series_doc = _load(DATA / "proj_series.json") or {}
    series = series_doc.get("series") or []
    store_2026 = _load(HERE / f"nflverse_weekly_points_{GRADE_SEASON}.json")
    positions = ((_load(DATA / "player_positions.json") or {}).get("positions")) or {}

    recs = []

    # REC-1 — proj_sd from measured error instead of hand-set constants.
    if cal and cal.get("cells"):
        sd_table = {name: {"sd_ratio": c["sd_ratio"], "n": c["n"]}
                    for name, c in cal["cells"].items() if c.get("status") == "measured"}
        recs.append({
            "id": "REC-1-proj-sd-calibration",
            "status": "ready-for-ruling",
            "summary": ("Derive proj_sd from MEASURED 2023-25 projection error "
                        "(projection_error.proj_sd_for) instead of the hand-set "
                        "POSITION_VARIANCE constants, per position × projection-rank band."),
            "proposed_values": sd_table,
            "evidence": [
                "draft/backtest/projection_error_calibration.json — 20 measured cells, 1,304 graded players (C)",
                "draft/backtest/BOARD-UNCERTAINTY-AUDIT.md — shipped sd understates measured by median 1.38x; "
                "streaming-range QBs ship ~70 against measured 145-185",
                "draft/backtest/PROJ-SD-DECISION-ARM.md — the 12-seat plan's ROLES are identical under the "
                "measured arm, so adoption does not move the plan; what it fixes is every uncertainty surface "
                "reading an honest spread",
            ],
            "acceptance": ("one reviewed change: projections.blend() computes season_sd via "
                           "projection_error.proj_sd_for(cal, position, rank, mean) with the "
                           "POSITION_VARIANCE path as fallback for unmeasured cells. "
                           "NOT APPLIED — Cory's ruling gates every scoring-path change."),
            "caveat": ("calibration is fitted on walk_forward's error; provider baselines may be "
                       "tighter — C's stated assumption, unresolved until January 2027"),
        })

    # REC-2 — per-source per-position composition weights, evidence-gated.
    source_grade = grade_frozen_sources(series, store_2026 or {}, positions)
    recs.append({
        "id": "REC-2-source-weights",
        "status": ("ready-for-ruling" if source_grade.get("status") == "measured"
                   else "blocked-until-2027-01"),
        "summary": ("Per-position projection-source weights from measured accuracy. "
                    "proj_mean is single-source Sleeper today; Sleeper runs a median "
                    "+29-30 pts HOT vs FantasyPros at WR/TE on the same players under "
                    "the same scoring (measured on the 2026-08-15 board) and nothing "
                    "grades which source is right."),
        "grade": source_grade,
        "preregistered": ("metric, population, cutoff and weight rule fixed 2026-08-15 in "
                          "learning_loop.py, before any 2026 outcome exists — see module "
                          "docstring. The January run cannot be tuned to fit."),
        "acceptance": ("one reviewed change in build.py's composition once measured: "
                       "per-position weighted blend with the emitted weights. NOT APPLIED."),
    })

    # REC-3 — the own-model negative, recorded so it cannot be un-learned.
    if acc:
        h2h = acc.get("head_to_head_shared_population") or {}
        wf_loses = [p for p, row in h2h.items()
                    if row.get("status") == "measured"
                    and row["walk_forward"]["mae"] > row["recency_blend"]["mae"]]
        recs.append({
            "id": "REC-3-own-model-stays-display-only",
            "status": "standing-negative",
            "summary": ("proj_ownmodel (walk_forward) LOSES to the naive recency blend at "
                        f"{len(wf_loses)}/4 positions on MAE (shared population, 2025, "
                        "leak-free) and at 4/4 on rank correlation. It must stay a "
                        "display-only third opinion; any promotion to the composition is "
                        "evidence-blocked by this measurement."),
            "evidence": ["draft/backtest/model_accuracy_2025.json — head_to_head_shared_population"],
            "acceptance": ("nothing to accept — this recommendation BLOCKS a change. It expires "
                           "only if a future season's head-to-head reverses it."),
        })

    # REC-4 — the unread weights wire.
    recs.append({
        "id": "REC-4-evidence-weights-have-no-reader",
        "status": "wiring-gap",
        "summary": ("grade-cron writes evidence_weights:current every week and NOTHING reads "
                    "it — the one artifact designed to feed measured calibration back into "
                    "the model terminates in the store. Until a consumer exists the grading "
                    "loop's last arc is display, not learning."),
        "evidence": ["grep evidence_weights: writer in netlify/functions/grade-cron.js:88, "
                     "zero readers anywhere in src/, public/, draft/"],
        "acceptance": ("a reviewed consumer in the engine or the board build that reads "
                       "evidence_weights:current and adjusts a DECLARED, gated parameter. "
                       "Which parameter is a design ruling — deliberately not proposed here."),
    })

    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/learning_loop.py",
        "_note": ("Measured grading → concrete model-update recommendations. NOTHING here is "
                  "applied: every default is untouched, acceptance is a one-line reviewed "
                  "change per recommendation, gated on Cory's ruling."),
        "generated_by": "draft/backtest/learning_loop.py",
        "defaults_untouched": True,
        "recommendations": recs,
    }


def main() -> None:
    doc = build_recommendations()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(HERE.parent.parent)}")
    for r in doc["recommendations"]:
        print(f"  {r['id']}: {r['status']}")


if __name__ == "__main__":
    main()

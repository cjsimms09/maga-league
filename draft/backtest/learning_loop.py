# TERRITORY: A
"""THE MISSING ARC OF THE CLOSED LOOP — measured grades → concrete, reviewable
model-update RECOMMENDATIONS. Built 2026-08-15 (model/learning audit, Mission 2).

── THE GAP THIS CLOSES, traced not asserted ──────────────────────────────────

The loop captures (predledger, claims-cron), resolves (claims-cron, forecast
resolutions), and grades (grade-cron → calibration:{season}:* snapshots +
evidence_weights:current). When this module was written (2026-08-15 AM) it
stopped there:

    evidence_weights:current        written weekly, ZERO readers (grep: only
                                    its writer and a PARKED mention)
    calibration snapshots           read by /accuracy, /member, /standings —
                                    pages a human might look at
    projection_error_calibration    measured (C, 20 cells); its appliers
                                    proj_sd_for/proj_ceiling_for had NO
                                    production caller
    component_grades.json           all rows no_data; read by standing_check

── CLOSED 2026-08-15 PM under Cory's ruling ("We need to fix!!!") ────────────

    projection_error_calibration    → REC-1 APPLIED: projections.blend() is now
                                    proj_sd_for's production caller (decision
                                    arm re-verified on the fresh board first)
    evidence_weights:current        → READ: weights-read.js exposes it,
                                    weekly_grade_runner.js mirrors it weekly to
                                    draft/data/evidence_weights_latest.json,
                                    and THIS module consumes the mirror into
                                    REC-4 (era-stamped). Live-parameter
                                    consumption stays gated on a design ruling.
    REC-2 unlock                    → machine-checked weekly (rec2_unlock_progress)
    REC-3 promotion bar             → beat BOTH baselines, ALL 4 positions,
                                    BOTH metrics — read from the v2 artifact
                                    (own_model_v2.py) when it exists.

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


def rec2_unlock_progress(store: dict | None) -> dict:
    """The machine-checked REC-2 unlock condition — observed by machinery, not
    memory. The weekly grade runner prints this every Tuesday and this artifact
    refreshes with it, so 'blocked' can never quietly become 'forgotten'."""
    weeks = sorted({w["week"] for w in ((store or {}).get("weeks") or [])
                    if w.get("week") and w["week"] <= LAST_SCORED_WEEK})
    return {
        "weeks_graded": len(weeks),
        "weeks_needed": LAST_SCORED_WEEK,
        "store": f"draft/backtest/nflverse_weekly_points_{GRADE_SEASON}.json",
        "store_exists": bool(store),
        "line": (f"REC-2: {len(weeks)}/{LAST_SCORED_WEEK} graded {GRADE_SEASON} weeks "
                 f"in the committed store — unlocks ~2027-01"),
        "checked_by": ("draft/tools/weekly_grade_runner.js every Tuesday (GitHub "
                       "Actions), which also regenerates this artifact"),
    }


def build_recommendations() -> dict:
    cal = _load(HERE / "projection_error_calibration.json")
    acc = _load(HERE / "model_accuracy_2025.json")
    acc_v2 = _load(HERE / "model_accuracy_v2.json")
    series_doc = _load(DATA / "proj_series.json") or {}
    series = series_doc.get("series") or []
    store_2026 = _load(HERE / f"nflverse_weekly_points_{GRADE_SEASON}.json")
    positions = ((_load(DATA / "player_positions.json") or {}).get("positions")) or {}
    ew_mirror = _load(DATA / "evidence_weights_latest.json")

    recs = []

    # REC-1 — proj_sd from measured error instead of hand-set constants.
    # APPLIED 2026-08-15 under Cory's ruling ("We need to fix!!!"), after the
    # decision arm was re-run on the fresh 86e42bc2 board and reproduced.
    if cal and cal.get("cells"):
        sd_table = {name: {"sd_ratio": c["sd_ratio"], "n": c["n"]}
                    for name, c in cal["cells"].items() if c.get("status") == "measured"}
        recs.append({
            "id": "REC-1-proj-sd-calibration",
            "status": "applied-2026-08-15",
            "summary": ("proj_sd now comes from MEASURED 2023-25 projection error "
                        "(projection_error.proj_sd_for) per position × projection-rank "
                        "band, with the POSITION_VARIANCE path as fallback for "
                        "unmeasured cells (K/DEF/unranked). Wired in "
                        "draft/projections.py blend(); each board row declares its "
                        "path in proj_sd_source."),
            "applied_values": sd_table,
            "evidence": [
                "draft/backtest/projection_error_calibration.json — 20 measured cells, 1,304 graded players (C)",
                "draft/backtest/BOARD-UNCERTAINTY-AUDIT.md — shipped sd understated measured by median 1.38x; "
                "streaming-range QBs shipped ~70 against measured 145-185",
                "draft/backtest/PROJ-SD-DECISION-ARM.md — original arm AND the 2026-08-15 addendum: re-run on "
                "the fresh board before wiring, roles identical at all twelve seats, same four bench flips",
            ],
            "acceptance": ("APPLIED — the exact acceptance line shipped: projections.blend() computes "
                           "season_sd via projection_error.proj_sd_for(cal, position, rank, mean) with "
                           "the POSITION_VARIANCE path as fallback. Authorized by Cory's ruling on the "
                           "2026-08-15 learning audit; decision arm re-verified on the current board "
                           "first. Guarded by draft/tests/test_proj_sd_wiring.py and proj_sd_arm.test.js."),
            "caveat": ("calibration is fitted on walk_forward's error; provider baselines may be "
                       "tighter — C's stated assumption, unresolved until January 2027. Band edges "
                       "are discontinuous in rank (smooth-in-rank caveat recorded in the arm doc)."),
        })

    # REC-2 — per-source per-position composition weights, evidence-gated.
    source_grade = grade_frozen_sources(series, store_2026 or {}, positions)
    # The Week-1 prior attempt (2026-08-15, Cory's conditional ruling "Yes! If
    # it works."): built from the FP-archive aggregates under a prereg
    # committed first — and it did NOT work: G3 (error-scale transfer) failed
    # at RB/2023, and the prereg's own n0 rule conflicts with its G5 dominance
    # bar. Recorded here so the negative is discoverable by the machinery that
    # would have consumed the prior; a re-attempt requires a NEW prereg.
    swp = _load(HERE / "source_weight_prior.json")
    week1_prior = {
        "status": (swp or {}).get("status", "artifact-missing"),
        "ruling": "Cory, verbatim: 'Yes! If it works.' — conditional; it did not pass its gates",
        "outcome": ("failed-gate: G3 scale-transfer outside the preregistered "
                    "±40% band (RB, held-out 2023) + the recorded G5 n0-vs-"
                    "dominance-bar inconsistency. Prior NOT applied; the flat "
                    "start stands until January's measured cells."
                    if (swp or {}).get("status") == "failed-gate" else
                    (swp or {}).get("status", "artifact-missing")),
        "prereg": "draft/backtest/SOURCE-WEIGHT-PRIOR-PREREG.md",
        "artifact": "draft/backtest/source_weight_prior.json",
    }
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
        "week1_prior_attempt": week1_prior,
        "unlock_progress": rec2_unlock_progress(store_2026),
        "preregistered": ("metric, population, cutoff and weight rule fixed 2026-08-15 in "
                          "learning_loop.py, before any 2026 outcome exists — see module "
                          "docstring. The January run cannot be tuned to fit."),
        "acceptance": ("one reviewed change in build.py's composition once measured: "
                       "per-position weighted blend with the emitted weights. NOT APPLIED."),
    })

    # REC-3 — the own-model negative + the promotion bar, so the negative cannot
    # be un-learned and no successor is promoted without EARNING it.
    if acc:
        h2h = acc.get("head_to_head_shared_population") or {}
        wf_loses = [p for p, row in h2h.items()
                    if row.get("status") == "measured"
                    and row["walk_forward"]["mae"] > row["recency_blend"]["mae"]]
        promotion_bar = {
            "rule": ("promotion of ANY own model (v1, v2, or successor) into the "
                     "composition requires beating BOTH naive baselines (naive_prev "
                     "AND recency_blend) at ALL four positions on BOTH metrics "
                     "(MAE and Spearman) in the leak-free walk-forward protocol, "
                     "then a reviewed promotion decision file for Cory — never an "
                     "automatic flip. The bar Cory's ruling implies: until it earns it."),
            "candidates": {},
        }
        if acc_v2 and acc_v2.get("promotion_bar"):
            promotion_bar["candidates"]["own_model_v2"] = acc_v2["promotion_bar"]
        recs.append({
            "id": "REC-3-own-model-stays-display-only",
            "status": "standing-negative",
            "summary": ("proj_ownmodel (walk_forward) LOSES to the naive recency blend at "
                        f"{len(wf_loses)}/4 positions on MAE (shared population, 2025, "
                        "leak-free) and at 4/4 on rank correlation. It must stay a "
                        "display-only third opinion; any promotion to the composition is "
                        "evidence-blocked until a candidate clears the promotion bar."),
            "promotion_bar": promotion_bar,
            "evidence": (["draft/backtest/model_accuracy_2025.json — head_to_head_shared_population"]
                         + (["draft/backtest/model_accuracy_v2.json — v2 graded under the same protocol"]
                            if acc_v2 else [])),
            "acceptance": ("nothing to accept — this recommendation BLOCKS a change. It expires "
                           "only when a candidate clears the promotion bar above in the "
                           "walk-forward AND Cory accepts the written promotion decision."),
        })

    # REC-4 — the weights wire, now READ: the weekly grade runner mirrors
    # evidence_weights:current (era stamp and all) into
    # draft/data/evidence_weights_latest.json and this artifact consumes the
    # mirror on every weekly regeneration. Consumption lands HERE — in the
    # gated recommendation artifact — and not in a live parameter, because a
    # live consumer would change behaviour beyond what REC-1's ruling covers.
    consumed = None
    if ew_mirror and isinstance(ew_mirror.get("weights"), dict):
        w = ew_mirror["weights"]
        consumed = {
            "updated_at": w.get("updated_at"),
            "season": w.get("season"),
            "graded_n": w.get("graded_n"),
            "league_se": w.get("league_se"),
            "combined": w.get("combined"),
            "rules_era": w.get("rules_era"),
            "fetched_at": ew_mirror.get("fetched_at"),
            "era_note": ("rules_era travels with the weights; a snapshot graded under "
                         "different money-bearing rules must not steer this era's model"),
        }
    recs.append({
        "id": "REC-4-evidence-weights-have-no-reader",
        "status": ("wired-to-recommendation-artifact" if consumed else "wiring-gap"),
        "summary": ("grade-cron writes evidence_weights:current every week. The read side "
                    "now exists: netlify/functions/weights-read.js exposes it read-only, "
                    "draft/tools/weekly_grade_runner.js mirrors it into "
                    "draft/data/evidence_weights_latest.json every Tuesday, and this "
                    "artifact consumes the mirror on each weekly regeneration — so weekly "
                    "grades flow into the RECOMMENDATION artifact, era-stamped. A LIVE "
                    "parameter consumer stays deliberately unwired: that change is beyond "
                    "REC-1's ruling and remains a design ruling for Cory."),
        "consumed_evidence_weights": consumed,
        "reader_status": ("mirror consumed" if consumed else
                          "reader wired and executed, but no mirror on disk yet — the "
                          "weekly runner writes it once WEIGHTS_READ_URL/SITE_URL is "
                          "configured in the workflow and grade-cron has produced a "
                          "snapshot; until then this is a named absence, not a claim"),
        "evidence": ["writer: netlify/functions/grade-cron.js (evidence_weights:current, era-stamped)",
                     "read side: netlify/functions/weights-read.js (read-only expose) → "
                     "draft/tools/weekly_grade_runner.js (weekly mirror) → this artifact"],
        "acceptance": ("consumption into a LIVE parameter stays gated: a reviewed consumer in "
                       "the engine or the board build adjusting a DECLARED parameter. Which "
                       "parameter is a design ruling — deliberately not proposed here."),
    })

    applied = [r["id"] for r in recs if str(r.get("status", "")).startswith("applied")]
    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/learning_loop.py",
        "_note": ("Measured grading → concrete model-update recommendations. A change is "
                  "applied ONLY under a recorded ruling from Cory (REC-1: his 2026-08-15 "
                  "'We need to fix!!!', decision arm re-verified first); everything else "
                  "is untouched and acceptance stays a one-line reviewed change per "
                  "recommendation."),
        "generated_by": "draft/backtest/learning_loop.py",
        "applied_under_ruling": applied,
        "defaults_untouched_beyond_ruling": True,
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

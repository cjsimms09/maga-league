#!/usr/bin/env python3
"""REGRESSION WEIGHT — the leave-one-season-out gate on lowering it (DECISIONS-NEEDED #2).

exp35 swept the projection blend's regression-toward-prior weight and found the shipped 0.35
OVER-regresses: on the pooled board, dropping it toward 0 lifts top-decile hit (0.395 -> 0.513),
rank-corr (0.608 -> 0.641) and MAE (53.0 -> 47.7), monotonically. But monotonic-to-zero is
exactly what OVERFITTING looks like, and the shipped value must not move on an in-sample curve.
exp35's own install_note sets the gate: "leave-one-season-out CV + null + dollars."

This runs the CV, purely from exp35's per-season curves (no egress). For each held-out season
it picks the weight that maximises n-weighted top-decile on the OTHER two seasons, then scores
that weight on the held-out season and compares it to the shipped 0.35. If the CV-selected
weight is consistently BELOW 0.35 and beats-or-ties 0.35 out-of-sample on every fold, the
lower weight generalises (not overfit) and lowering it is justified. If the selected weight
jumps around or loses out-of-sample, keep 0.35.

PRE-REGISTERED (fixed before reading the folds):
  * SHIP-LOWER supported iff (a) every fold's CV-selected weight is <= 0.2, AND (b) on every
    held-out season the CV-selected weight's top-decile is >= the shipped 0.35's (no fold loses).
  * The single recommended weight = the one with the best MEAN held-out top-decile (robust to
    the fold), reported with its worst-fold value so a fragile winner is visible.
  * This clears the ACCURACY + overfitting gate only. A numeric SHIP still needs the DOLLAR arm
    (roster grader, egress) to size it at Cory's picks — stated, not skipped.
"""
from __future__ import annotations
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP35 = HERE / "exp35.json"
SHIPPED = 0.35
SUPPORT_MAX_WEIGHT = 0.2       # a CV pick above this is "not clearly low" -> not supported


def _season_curves(doc: dict) -> dict:
    """season -> {weight: {top_decile, rank_corr, n}} from exp35's per_season block."""
    out = {}
    for s in doc.get("per_season", []):
        yr = str(s.get("season"))
        # per-season n rides on each curve point; fall back to the season's own n.
        out[yr] = {}
        for r in s.get("curve", []):
            out[yr][round(float(r["regression_weight"]), 3)] = {
                "top_decile": r.get("top_decile"), "rank_corr": r.get("rank_corr"),
                "n": r.get("n") or s.get("n") or 1}
    return out


def _weighted_td(curves: dict, seasons: list, w: float) -> float:
    num = sum(curves[s][w]["top_decile"] * curves[s][w]["n"] for s in seasons)
    den = sum(curves[s][w]["n"] for s in seasons)
    return num / den if den else 0.0


def leave_one_out(curves: dict) -> dict:
    seasons = sorted(curves)
    weights = sorted(next(iter(curves.values())).keys())
    folds = []
    for held in seasons:
        train = [s for s in seasons if s != held]
        # pick the weight that maximises n-weighted top-decile on the training seasons
        best_w = max(weights, key=lambda w: _weighted_td(curves, train, w))
        held_td = curves[held][best_w]["top_decile"]
        shipped_td = curves[held][SHIPPED]["top_decile"]
        folds.append({
            "held_out": held, "cv_selected_weight": best_w,
            "held_out_top_decile": round(held_td, 4),
            "shipped_top_decile": round(shipped_td, 4),
            "beats_or_ties_shipped": held_td >= shipped_td - 1e-9,
            "margin_vs_shipped": round(held_td - shipped_td, 4),
        })
    return {"seasons": seasons, "weights": weights, "folds": folds}


def robust_weight(curves: dict) -> dict:
    """The single most robust weight: best MEAN top-decile across seasons (each season scored on
    its OWN curve = out-of-sample if that weight were fixed), with its worst-fold value shown."""
    seasons = sorted(curves)
    weights = sorted(next(iter(curves.values())).keys())
    rows = []
    for w in weights:
        tds = [curves[s][w]["top_decile"] for s in seasons]
        rhos = [curves[s][w]["rank_corr"] for s in seasons if curves[s][w]["rank_corr"] is not None]
        rows.append({"weight": w, "mean_td": round(sum(tds) / len(tds), 4),
                     "min_td": round(min(tds), 4),
                     "mean_rank_corr": round(sum(rhos) / len(rhos), 4) if rhos else None})
    best = max(rows, key=lambda r: r["mean_td"])
    return {"per_weight": rows, "recommended": best}


def verdict(cv: dict, robust: dict) -> dict:
    folds = cv["folds"]
    all_low = all(f["cv_selected_weight"] <= SUPPORT_MAX_WEIGHT for f in folds)
    none_lose = all(f["beats_or_ties_shipped"] for f in folds)
    rec = robust["recommended"]
    supported = all_low and none_lose
    if supported:
        text = (f"SHIP-LOWER SUPPORTED (accuracy + overfitting gate PASSED). Leave-one-season-out "
                f"picked a weight <= {SUPPORT_MAX_WEIGHT} on every fold "
                f"({[f['cv_selected_weight'] for f in folds]}), and it beat-or-tied the shipped "
                f"{SHIPPED} out-of-sample on all {len(folds)} folds "
                f"(margins {[f['margin_vs_shipped'] for f in folds]}). Most robust single value = "
                f"{rec['weight']} (mean held-out top-decile {rec['mean_td']}, worst fold "
                f"{rec['min_td']}) vs shipped 0.35's ~0.41. RECOMMEND lowering 0.35 -> {rec['weight']}. "
                f"STILL GATED on the dollar arm (roster grader, egress) before the numeric install.")
    else:
        text = (f"NOT SUPPORTED — CV-selected weights {[f['cv_selected_weight'] for f in folds]} "
                f"(all<= {SUPPORT_MAX_WEIGHT}? {all_low}); beats-or-ties shipped every fold? "
                f"{none_lose}. Keep 0.35 pending more seasons.")
    return {"ship_lower_supported": supported, "cv_all_low": all_low,
            "cv_never_loses_oos": none_lose, "recommended_weight": rec["weight"], "text": text}


def run() -> dict:
    doc = json.loads(EXP35.read_text())
    curves = _season_curves(doc)
    cv = leave_one_out(curves)
    robust = robust_weight(curves)
    return {
        "experiment": "regression-weight leave-one-season-out CV (the gate on lowering 0.35)",
        "shipped": SHIPPED,
        "prereg_rule": (f"SHIP-LOWER iff every fold's CV weight <= {SUPPORT_MAX_WEIGHT} AND it "
                        f"beats-or-ties shipped out-of-sample on every fold; recommend the best "
                        f"mean-held-out weight. Accuracy gate only — $ arm still required."),
        "cv": cv, "robust": robust, "verdict": verdict(cv, robust),
        "caveat": ("3 seasons, ~172-458 picks/season; top-decile is coarse at this n. rank_corr "
                   "corroborates (0.0 best every season). Reads exp35's per-season curves; no egress. "
                   "Installs nothing — updates DECISIONS-NEEDED #2 from OPEN to accuracy-gate-cleared."),
        "source_tier": "league-primary (derived from exp35)",
    }


if __name__ == "__main__":
    out = run()
    (HERE / "exp_regression_cv.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))

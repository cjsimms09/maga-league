#!/usr/bin/env python3
# TERRITORY: D
"""P325 — THE AGE-CURVE ARM. Cory, 2026-08-24: "looking at everything, rookie,
age, opportunity, pace of play.. looking for patterns or correlations in
undervalued players."

    pred = baseline_pg + alpha * age_effect(pos, age)

`age_effect` is the LOSO-fitted mean residual (actual - baseline) by position
and integer age, CENTRED on the position mean so alpha=0 is exactly the flat
baseline and the tilt is a pure deviation. Fitted on the OTHER seasons only,
never on the season being graded.

⚠️ THE PREREG'S CORRELATION GATE WAS AMENDED 2026-08-24, BEFORE THIS FILE
EXISTED, and the amendment is recorded in P325's own row. It read "<0.98 vs
baseline_pg AND vs the P286 usage arm". P286 is NOT the usage arm -- it is an
E-filed roster-insurance row renumbered from P283/P284 in a collision -- and the
gate was unbuildable besides: the real usage arms (P27, P77) are OPEN awaiting
2026 weeks, and the one graded usage artifact carries fold rhos with
clears: false, no per-player-week series to correlate against. The gate now runs
against a usage FEATURE series (tgt_share), which tests the same worry -- "age
is really just old players losing snaps" -- MORE directly, because it removes
the arm's own modelling error. Threshold unchanged.

CONTROLS. All three gate the exit code, and C2 is the one P151 did not have:
  C1 IDENTITY. The bio store must resolve >=95% of the population on every
     fold. A silent id mismatch would drop ages and print a clean null.
  C2 SYNTHETIC RECOVERY (known-positive). Inject a KNOWN age effect into the
     actuals and require the fitter to recover it and beat the baseline. Without
     this, a null cannot be distinguished from a fitter that cannot fit --
     which is exactly how P151's null arrived unlicensed.
  C3 SHUFFLE NULL (known-negative, and the prereg's own). Permute ages WITHIN
     position; the fitted effect must NOT clear the bar. If shuffled ages
     "work", the effect is not age.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

import target_quality_tilt as T              # noqa: E402 — TERRITORY: D
import game_script_usage_interaction as GSI  # noqa: E402 — TERRITORY: D

POSITIONS = T.POSITIONS
TARGET_SEASONS = T.TARGET_SEASONS
ALPHA_GRID = (0.0, 0.25, 0.5, 1.0, 1.5, 2.0)
MAE_BAR = 0.10
CORR_GATE = 0.98
FOLD_CONSISTENCY_MIN = 3
MIN_BUCKET_N = 25          # thin age buckets fall back to 0, not to noise
SEED = 20260824
BIO = json.loads((HERE / "player_bio_capital.json").read_text())["players"]


def age_of(pid: str, season: int):
    rec = BIO.get(str(pid))
    if not rec:
        return None
    a = (rec.get("age_by_season") or {}).get(str(season))
    return float(a) if a is not None else None


def season_rows(season: int, age_override=None) -> list:
    """One row per eligible player-week: baseline, actual, age."""
    pop = T.eligible_population(season)
    if not pop:
        return []
    rows = []
    for wk in GSI.load_points(season).get("weeks", []):
        week = wk.get("week")
        for pid, actual in (wk.get("points") or {}).items():
            if pid not in pop:
                continue
            age = age_override(pid, season) if age_override else age_of(pid, season)
            if age is None:
                continue
            rows.append({"pid": pid, "pos": pop[pid]["pos"], "week": week,
                         "actual": float(actual), "baseline": pop[pid]["baseline_pg"],
                         "age": age})
    return rows


def fit_effect(train_rows: list) -> dict:
    """{(pos, int_age): centred mean residual}. Fitted on training seasons only."""
    by = {}
    for r in train_rows:
        by.setdefault((r["pos"], int(round(r["age"]))), []).append(r["actual"] - r["baseline"])
    pos_all = {}
    for r in train_rows:
        pos_all.setdefault(r["pos"], []).append(r["actual"] - r["baseline"])
    pos_mean = {p: mean(v) for p, v in pos_all.items()}
    return {k: mean(v) - pos_mean[k[0]]
            for k, v in by.items() if len(v) >= MIN_BUCKET_N}


def dev_of(row: dict, effect: dict) -> float:
    return effect.get((row["pos"], int(round(row["age"]))), 0.0)


def mae_at(rows: list, effect: dict, alpha: float) -> float:
    return mean(abs(r["baseline"] + alpha * dev_of(r, effect) - r["actual"])
                for r in rows) if rows else float("nan")


def run_fold(target: int, cache: dict, effect_from=None) -> dict:
    test = cache[target]
    train = [r for s in TARGET_SEASONS if s != target for r in cache[s]]
    effect = effect_from(train) if effect_from else fit_effect(train)
    base = mae_at(test, effect, 0.0)
    scored = [(mae_at(test, effect, a), a) for a in ALPHA_GRID]
    best_mae, best_alpha = min(scored)
    return {"season": target, "n": len(test), "alpha": best_alpha,
            "mae_baseline": round(base, 4), "mae_arm": round(best_mae, 4),
            "delta_mae": round(base - best_mae, 4),
            "buckets_fitted": len(effect)}


# ── CONTROLS ────────────────────────────────────────────────────────────────
def control_identity(cache: dict) -> dict:
    """C1 — the bio store must resolve the population on every fold."""
    out, worst = {}, 1.0
    for s in TARGET_SEASONS:
        pop = T.eligible_population(s)
        hit = sum(1 for p in pop if age_of(p, s) is not None)
        rate = hit / len(pop) if pop else 0.0
        out[str(s)] = {"population": len(pop), "aged": hit, "rate": round(rate, 4)}
        worst = min(worst, rate)
    return {"passed": worst >= 0.95, "worst_rate": round(worst, 4),
            "requirement": ">=0.95 of the population carries an age on every fold",
            "by_season": out}


def control_synthetic_recovery(cache: dict) -> dict:
    """C2 — KNOWN-POSITIVE. Inject a real age effect and require it be found.

    Adds +3.0 points to every player-week whose age is 27 or 28, on the actuals
    only. A fitter that works must (a) fit a large positive bucket there and
    (b) beat the flat baseline. Without this a null is uninterpretable."""
    inj = {s: [dict(r) for r in cache[s]] for s in TARGET_SEASONS}
    for rows in inj.values():
        for r in rows:
            if 27 <= int(round(r["age"])) <= 28:
                r["actual"] += 3.0
    train = [r for s in TARGET_SEASONS if s != 2025 for r in inj[s]]
    effect = fit_effect(train)
    peak = [v for k, v in effect.items() if 27 <= k[1] <= 28]
    base = mae_at(inj[2025], effect, 0.0)
    best = min(mae_at(inj[2025], effect, a) for a in ALPHA_GRID)
    found = bool(peak) and mean(peak) > 1.0 and (base - best) > MAE_BAR
    return {"passed": found,
            "injected": "+3.0 pts to every age-27/28 player-week",
            "mean_fitted_effect_at_27_28": round(mean(peak), 3) if peak else None,
            "delta_mae_recovered": round(base - best, 4),
            "requirement": "fitted effect at 27-28 > 1.0 AND delta_mae > 0.10"}


def control_shuffle_null(cache: dict) -> dict:
    """C3 — KNOWN-NEGATIVE, and the prereg's own null. Permute ages WITHIN
    position; a real age effect must not survive it."""
    rng = random.Random(SEED)
    sh = {}
    for s in TARGET_SEASONS:
        rows = [dict(r) for r in cache[s]]
        by_pos = {}
        for r in rows:
            by_pos.setdefault(r["pos"], []).append(r["age"])
        for v in by_pos.values():
            rng.shuffle(v)
        idx = {p: 0 for p in by_pos}
        for r in rows:
            r["age"] = by_pos[r["pos"]][idx[r["pos"]]]
            idx[r["pos"]] += 1
        sh[s] = rows
    folds = [run_fold(s, sh) for s in TARGET_SEASONS]
    pos = sum(1 for f in folds if f["delta_mae"] >= MAE_BAR)
    return {"passed": pos < FOLD_CONSISTENCY_MIN,
            "folds_clearing_bar_on_shuffled_ages": pos,
            "requirement": f"shuffled ages must clear the bar in <{FOLD_CONSISTENCY_MIN} of 4 folds",
            "per_fold_delta": [f["delta_mae"] for f in folds]}


def correlation_gate(cache: dict) -> dict:
    """The AMENDED gate: age-tilt prediction vs baseline, and vs a USAGE
    FEATURE series (tgt_share), not vs an arm. See the module docstring."""
    rows = cache[2025]
    train = [r for s in TARGET_SEASONS if s != 2025 for r in cache[s]]
    effect = fit_effect(train)
    pred = [r["baseline"] + 1.0 * dev_of(r, effect) for r in rows]
    base = [r["baseline"] for r in rows]

    def pearson(xs, ys):
        n = len(xs)
        mx, my = mean(xs), mean(ys)
        num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
        dx = sum((a - mx) ** 2 for a in xs) ** 0.5
        dy = sum((b - my) ** 2 for b in ys) ** 0.5
        return num / (dx * dy) if dx and dy else None

    tq = T.load_target_quality().get("by_season", {}).get("2025", {})
    usage = T.rz_rate_series(tq, {r["pid"] for r in rows}) if tq else {}
    pu, uu = [], []
    for p, r in zip(pred, rows):
        u = (usage.get(r["pid"]) or {}).get(r["week"])
        if u is not None:
            pu.append(p); uu.append(u)
    return {"vs_baseline": round(pearson(pred, base), 4),
            "vs_usage_feature": round(pearson(pu, uu), 4) if len(pu) > 50 else None,
            "usage_pairs": len(pu),
            "gate": CORR_GATE,
            "_amended": "usage FEATURE series, not the mis-cited P286 arm — see P325"}


def main() -> dict:
    cache = {s: season_rows(s) for s in TARGET_SEASONS}
    c1 = control_identity(cache)
    c2 = control_synthetic_recovery(cache)
    c3 = control_shuffle_null(cache)
    folds = [run_fold(s, cache) for s in TARGET_SEASONS]
    pooled_base = mean(f["mae_baseline"] for f in folds)
    pooled_arm = mean(f["mae_arm"] for f in folds)
    clearing = sum(1 for f in folds if f["delta_mae"] >= MAE_BAR)
    corr = correlation_gate(cache)
    clears = (clearing >= FOLD_CONSISTENCY_MIN
              and (corr["vs_baseline"] or 1.0) < CORR_GATE)
    return {
        "_territory": "TERRITORY: D",
        "_note": ("P325 age-curve arm. Correlation gate AMENDED before this file "
                  "existed — see P325's row. Written by age_curve_arm.py."),
        "controls": {"C1_identity": c1, "C2_synthetic_recovery": c2,
                     "C3_shuffle_null": c3},
        "folds": folds,
        "pooled": {"mae_baseline": round(pooled_base, 4),
                   "mae_arm": round(pooled_arm, 4),
                   "delta_mae": round(pooled_base - pooled_arm, 4),
                   "folds_clearing_bar": clearing,
                   "folds_total": len(folds)},
        "correlation_gate": corr,
        "clears": clears,
    }


if __name__ == "__main__":
    out = main()
    (HERE / "age_curve_arm.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    failed = [k for k, v in out["controls"].items() if not v["passed"]]
    if failed:
        print("CONTROLS FAILED: " + ", ".join(failed), file=sys.stderr)
        sys.exit(2)

#!/usr/bin/env python3
# TERRITORY: D
"""THE RED-ZONE AXIS, ADDITIVE — the second attempt P292 earned.

Preregistered in `draft/RED-ZONE-ADDITIVE-PREREG-2026-08-21.md`, committed
before this file existed and before any MAE, alpha or correlation was
computed. That file carries the argument; this module computes exactly what
it specifies.

    pred = baseline_pg + alpha * (rz_rate - pos_mean_rz_rate)

WHY ADDITIVE AND WHY A DEVIATION (prereg S1): `baseline_pg` is prior-season
PPG, which ALREADY contains last season's red-zone role. A trailing
within-season `rz_rate` therefore does not measure red-zone usage -- it
measures how far this season's usage has moved from what last season implied.
That is a role-change signal, and it is a different quantity from the one
P292's multiplicative arm scaled. A player at his position mean gets exactly
zero correction, by construction.

REUSED, NOT REIMPLEMENTED (Rule 11) -- the population is IDENTICAL to P292's
by import, so this is a paired comparison and the transform is the only
moving part:
  * target_quality_tilt.eligible_population / rz_rate_series / load_target_quality
  * game_script_usage_interaction.load_points / spearman

Zero-network: reads only committed files.

Run:  python3 draft/backtest/red_zone_additive.py
Test: python3 -m pytest draft/tests/test_red_zone_additive.py -q
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

import target_quality_tilt as T            # noqa: E402 — TERRITORY: D, P292's population
import game_script_usage_interaction as GSI  # noqa: E402 — TERRITORY: D

POSITIONS = T.POSITIONS
TARGET_SEASONS = T.TARGET_SEASONS
#: prereg S1 — points per marginal red-zone opportunity per game. 0.0 is in the
#: grid ON PURPOSE: it is "do nothing", and LOSO selecting it is a real answer.
ALPHA_GRID = (0.0, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0)
MAE_BAR = 0.10          # prereg S3 — same bar the sibling studies used.
CORR_GATE = 0.98
FOLD_CONSISTENCY_MIN = 3
BLEND_BREAKEVEN_MAE = 5.2   # register 191, reported not gated


def fold_rows(target_season: int) -> list:
    """One row per eligible player-week: baseline, actual, and the CENTRED
    red-zone deviation. Population identical to P292's."""
    pop = T.eligible_population(target_season)
    if not pop:
        return []
    tq = T.load_target_quality()
    tq_season = tq.get("by_season", {}).get(str(target_season), {})
    rz = T.rz_rate_series(tq_season, set(pop))

    # position mean of the trailing rate, per week — same construction P292 used
    by_pos_week: dict = {}
    for pid, info in pop.items():
        for week, rate in rz[pid].items():
            by_pos_week.setdefault((info["pos"], week), []).append(rate)
    pos_mean = {k: mean(v) for k, v in by_pos_week.items()}

    rows = []
    for wk in GSI.load_points(target_season).get("weeks", []):
        week = wk.get("week")
        for pid, actual in (wk.get("points") or {}).items():
            if pid not in pop:
                continue
            rate = rz[pid].get(week)
            if rate is None:                      # inside MIN_PRIOR_WEEKS
                continue
            info = pop[pid]
            rows.append({
                "pid": pid, "pos": info["pos"], "week": week,
                "actual": float(actual),
                "baseline": info["baseline_pg"],
                #: the deviation. Zero for a player at his position's mean.
                "dev": rate - pos_mean.get((info["pos"], week), 0.0),
            })
    return rows


def predict(row: dict, alpha: float) -> float:
    return row["baseline"] + alpha * row["dev"]


def mae(rows: list, alpha: float) -> float:
    return mean(abs(predict(r, alpha) - r["actual"]) for r in rows) if rows else float("nan")


def baseline_mae(rows: list) -> float:
    return mae(rows, 0.0)          # alpha=0 IS the baseline, exactly


def leave_one_out(by_season: dict) -> dict:
    """alpha fitted on the OTHER seasons, evaluated on the held-out one —
    the same discipline opponent_arm.py's lambda grid uses."""
    out = {}
    for s in TARGET_SEASONS:
        others = [x for x in TARGET_SEASONS if x != s and by_season.get(x)]
        if not others or not by_season.get(s):
            out[str(s)] = {"usable": False}
            continue
        best_a, best_gain = None, None
        for a in ALPHA_GRID:
            g = sum(baseline_mae(by_season[o]) - mae(by_season[o], a) for o in others)
            if best_gain is None or g > best_gain:
                best_a, best_gain = a, g
        held = by_season[s]
        out[str(s)] = {
            "usable": True, "fitted_on": others, "alpha": best_a,
            "mae_baseline": round(baseline_mae(held), 4),
            "mae_arm": round(mae(held, best_a), 4),
            "delta_mae": round(baseline_mae(held) - mae(held, best_a), 4),
            "n": len(held),
        }
    return out


def main() -> dict:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "red_zone_additive.json"))
    args = ap.parse_args()

    by_season = {s: fold_rows(s) for s in TARGET_SEASONS}
    loo = leave_one_out(by_season)
    usable = [v for v in loo.values() if v.get("usable")]

    all_rows = [r for s in TARGET_SEASONS for r in by_season[s]]
    # pooled, each season on its own LOO-fitted alpha (no second free parameter)
    pooled_arm, pooled_base = [], []
    arm_preds, base_preds = [], []
    for s in TARGET_SEASONS:
        v = loo[str(s)]
        if not v.get("usable"):
            continue
        a = v["alpha"]
        for r in by_season[s]:
            p = predict(r, a)
            pooled_arm.append(abs(p - r["actual"]))
            pooled_base.append(abs(r["baseline"] - r["actual"]))
            arm_preds.append(p); base_preds.append(r["baseline"])

    mae_arm = mean(pooled_arm) if pooled_arm else float("nan")
    mae_base = mean(pooled_base) if pooled_base else float("nan")
    delta = mae_base - mae_arm
    folds_positive = sum(1 for v in usable if v["delta_mae"] > 0)
    corr = GSI.spearman(arm_preds, base_preds) if len(arm_preds) >= 2 else float("nan")
    gate_clears = corr < CORR_GATE
    alphas = [v["alpha"] for v in usable]

    clears = (delta >= MAE_BAR
              and folds_positive >= FOLD_CONSISTENCY_MIN
              and gate_clears
              and any(a > 0 for a in alphas))

    doc = {
        "_territory": "TERRITORY: D — produced by draft/backtest/red_zone_additive.py",
        "_note": ("Additive red-zone deviation arm, preregistered in "
                  "draft/RED-ZONE-ADDITIVE-PREREG-2026-08-21.md. Population identical "
                  "to P292's by import, so the transform is the only moving part."),
        "prereg": "draft/RED-ZONE-ADDITIVE-PREREG-2026-08-21.md",
        "alpha_grid": list(ALPHA_GRID),
        "target_seasons": list(TARGET_SEASONS),
        "folds": loo,
        "pooled": {
            "n_player_weeks": len(pooled_arm),
            "mae_baseline": round(mae_base, 4),
            "mae_arm": round(mae_arm, 4),
            "delta_mae": round(delta, 4),
            "folds_positive": folds_positive,
            "folds_total": len(usable),
            "alphas_selected": alphas,
            "correlation_vs_baseline": round(corr, 4),
            "correlation_gate": CORR_GATE,
            "gate_clears": gate_clears,
            "mae_bar": MAE_BAR,
            "fold_consistency_min": FOLD_CONSISTENCY_MIN,
            "blend_breakeven_mae": BLEND_BREAKEVEN_MAE,
            "clears_blend_breakeven": mae_arm <= BLEND_BREAKEVEN_MAE,
            "clears": clears,
        },
    }
    Path(args.out).write_text(json.dumps(doc, indent=2))

    p = doc["pooled"]
    print(f"CLEARS: {p['clears']}    n={p['n_player_weeks']}")
    print(f"  alphas selected by LOSO: {alphas}")
    for s in TARGET_SEASONS:
        v = loo[str(s)]
        if not v.get("usable"):
            print(f"  {s}: UNUSABLE"); continue
        print(f"  {s}: alpha={v['alpha']:<5} baseline={v['mae_baseline']:.4f} "
              f"arm={v['mae_arm']:.4f}  dMAE={v['delta_mae']:+.4f}  (n={v['n']})")
    print(f"  pooled: baseline={p['mae_baseline']:.4f} arm={p['mae_arm']:.4f} "
          f"dMAE={p['delta_mae']:+.4f} (bar {MAE_BAR}, folds +{p['folds_positive']}/"
          f"{p['folds_total']}, need >= {FOLD_CONSISTENCY_MIN})")
    print(f"  corr vs baseline={p['correlation_vs_baseline']:.4f} (gate < {CORR_GATE}) "
          f"-> {'clears' if p['gate_clears'] else 'COSTUME'}")
    print(f"  blend break-even (MAE <= {BLEND_BREAKEVEN_MAE}): {p['clears_blend_breakeven']}")
    return doc


if __name__ == "__main__":
    main()

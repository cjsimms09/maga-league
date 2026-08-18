# TERRITORY: D
"""IS THIS METRIC JUST VOLUME WEARING A NEW NAME? — one command, run it first.

Three candidate signals were graded on 2026-08-17 and the SAME question decided
all three. It costs one line and calls the result in advance, so it belongs in a
tool rather than in whoever happens to remember it.

THE TWO STEPS
  1. redundancy(metric, level) — rank correlation with the volume/level measure
     the metric is supposed to COMPLEMENT. Above ~|0.75| it is largely a copy.
  2. survives_control(next_metric, metric, level) — does the metric's
     year-over-year persistence survive removing `level`? BOTH failed candidates
     persisted strongly; both persistences were INHERITED. Step 2 is what
     separates a real trait from a rescaled projection, and step 1 alone does
     not settle it (see `weekly_sd` vs `cv` below — near-identical |rho| to the
     mean, opposite verdicts).

WHY IT MATTERS HERE SPECIFICALLY: this project spent weeks with `ceiling = 0`
because every dispersion field was `proj_mean x a constant`. A metric that is
80% collinear with volume is that defect re-entering under a new name.

Run: python3 draft/backtest/collinearity_check.py     (prints the calibration)
"""
from __future__ import annotations

import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from routes_tprr_study import (  # noqa: E402
    spearman, partial_spearman, permutation_p95,
)

#: Above this, the metric is largely a rescaled copy of the level measure.
REDUNDANT_ABOVE = 0.75

#: Step 2's null. Same draws and seed the graded studies used.
PERMUTATIONS = 400
SEED = 20260817

#: HOW BIG A PARTIAL HAS TO BE. Measured 2026-08-17 on synthetic data with ZERO
#: true trait, n=300, 40 seeds: the partial is UNBIASED (mean -0.001) but
#: spreads about +/-0.13. So a single fold returning +0.13 is a coin-flip draw,
#: not evidence, and the permutation null sits at ~+0.095 for that shape.
#: Read single-fold partials near the null as weak; weight replication over size.
NOISE_SPREAD_AT_N300 = 0.13

#: Measured 2026-08-17. Comparables so the next candidate is read against
#: something rather than against intuition. `verdict` is what the graded study
#: concluded, not what this tool guessed.
CALIBRATION = {
    "tprr_vs_targets": {"rho": "+0.74..+0.82", "survives": False,
                        "verdict": "null", "register": 14},
    "snap_share_vs_prior_points": {"rho": "+0.81..+0.84", "survives": False,
                                   "verdict": "null", "register": 13},
    "weekly_sd_vs_mean": {"rho": "+0.83..+0.86", "survives": False,
                          "verdict": "persistence is inherited — do not wire",
                          "register": 30},
    "weekly_cv_vs_mean": {"rho": "-0.66..-0.74", "survives": True,
                          "verdict": "real level-independent trait",
                          "register": 30},
}


def redundancy(metric: list, level: list) -> dict:
    """Step 1. Rank correlation between a metric and the level it should add to."""
    rho = spearman(metric, level)
    return {"rho": round(rho, 4) if rho is not None else None,
            "redundant": rho is not None and abs(rho) >= REDUNDANT_ABOVE,
            "threshold": REDUNDANT_ABOVE}


def survives_control(next_metric: list, metric: list, level: list,
                     permutations: int = PERMUTATIONS, seed: int = SEED) -> dict:
    """Step 2, and the decisive one. Partial rank correlation of the metric's
    own future value against its present value, controlling for `level`,
    judged against a PERMUTATION NULL.

    A metric whose persistence vanishes here is persisting because the LEVEL
    persists — which is what both failed candidates were doing.

    THE VERDICT IS THE NULL, NOT A RATIO. An earlier version of this function
    called a metric inherited when `partial < raw / 2`, and that heuristic
    contradicted the graded result it was built from: weekly_cv is +0.264
    partial against +0.605 raw, so the ratio rule flagged it inherited while
    the actual study — which compared against a permutation null it clears at
    +0.116 — found it real. The tool now uses what was actually measured.
    """
    rng = random.Random(seed)
    raw = spearman(metric, next_metric)
    partial = partial_spearman(next_metric, metric, level)
    p95 = permutation_p95(
        lambda idx: partial_spearman([next_metric[i] for i in idx], metric, level),
        len(metric), rng) if partial is not None else None
    survives = (partial is not None and p95 is not None and partial > p95)
    return {"raw_persistence": round(raw, 4) if raw is not None else None,
            "partial_persistence": round(partial, 4) if partial is not None else None,
            "null_p95": round(p95, 4) if p95 is not None else None,
            "survives": survives,
            "inherited": (partial is not None and p95 is not None and not survives)}


def main() -> None:
    print(f"redundancy threshold |rho| >= {REDUNDANT_ABOVE}\n")
    print(f"{'case':30s} {'rho vs level':>14s} {'survives':>9s}  verdict")
    for name, c in CALIBRATION.items():
        print(f"{name:30s} {c['rho']:>14s} {str(c['survives']):>9s}  "
              f"{c['verdict']} (register {c['register']})")
    print("\nStep 1 does not settle it: weekly_sd and weekly_cv sit at nearly the "
          "same |rho| to the mean and reach OPPOSITE verdicts. Run step 2.")


if __name__ == "__main__":
    main()

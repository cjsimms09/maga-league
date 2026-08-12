#!/usr/bin/env python3
# TERRITORY: A
"""WHAT CAN THE SURVIVAL ROW ACTUALLY CLAIM — resized, 2026-08-12.

WHY THIS EXISTS. `src/component_specs.js` was written assuming external replay
would supply "a few hundred leagues", giving a few hundred CLUSTERS. C's Route 1
ceiling is TENS in one season, and the figure today is ZERO. An order of
magnitude in the sample is not a caveat on a spec, it changes what the row is
allowed to say — so the row gets resized against the number that exists rather
than the number it was designed for.

THE UNIT IS THE DRAFT, AND AT THIS MAGNITUDE THAT MATTERS MORE, NOT LESS.
A run on running backs moves every survival forecast in that window the same
way. Treating each forecast as independent turns 20 drafts into ~600
"observations" and shrinks the detectable-effect floor by roughly sqrt(30) — a
factor of five and a half of pure fiction. At 300 clusters that error is
embarrassing; at 20 clusters it is the difference between "we measured
something" and "we measured nothing and said otherwise".

WHAT IS SIMULATED. Per draft: `m` survival forecasts, each a probability, each
resolved 0/1. Brier is scored for our model and for the base-rate baseline, and
the DIFFERENCE is aggregated to the draft, which is the independent unit. A
shared per-draft shock (`rho`) makes the forecasts inside a draft wrong
together, which is what a positional run actually does.

THE EFFECT IS INJECTED, NEVER FITTED — the circularity guard from the power
work. `edge` is the true Brier advantage per forecast and is a free parameter.

Run: python draft/backtest/survival_power.py
"""
from __future__ import annotations

import math
import random

ALPHA = 0.05
POWER = 0.80
TRIALS = 700          # pure Python; enough to size a floor, not to quote a p-value
FORECASTS_PER_DRAFT = 30      # "dozens per replayed draft", taken at the low end


MODEL_NOISE = 0.06     # each arm's own estimation error, independent of the other


def _one_draft(rng, m, edge, rho, base_p=0.6):
    """Mean (baseline_brier - model_brier) over one draft's forecasts.

    POSITIVE means the model beat the base rate. The shared shock is applied to
    the OUTCOME PROBABILITY, not to the score, so it makes the whole draft's
    forecasts wrong together the way a run does — the same construction error
    that made an earlier correlation experiment unable to detect correlation
    (a random +/-1 per decision is independent noise, not a shared shock).

    ── THE NULL HAD TO BE A REAL NULL, AND MY FIRST VERSION'S WAS NOT ──────────

    The first version set `p_model = base_p + (p_true - base_p) * edge` against a
    CONSTANT `p_base = base_p`. At edge = 0 those are the same number, so every
    difference was exactly 0, the variance was 0, and the test could never
    reject: FALSE POSITIVES READ 0.0% IN EVERY CELL. That is not a calibrated
    test, it is a test with no sampling distribution — and it produced a floor
    that did not move with the cluster count, which is the tell I should have
    read first.

    Rule 13f, on my own instrument, for the fourth time today: the null confirmed
    what I expected and the instrument could not have produced anything else.

    Both arms now carry INDEPENDENT estimation noise, so at equal skill they
    disagree randomly and the difference has a real distribution. `edge` is the
    model's extra information about p_true and remains a free parameter, never
    fitted.
    """
    shock = rng.gauss(0, 1) * rho
    diffs = []
    for _ in range(m):
        p_true = min(0.98, max(0.02, base_p + shock * 0.25 + rng.gauss(0, 0.12)))
        outcome = 1 if rng.random() < p_true else 0
        p_model = min(0.99, max(0.01,
            base_p + (p_true - base_p) * edge + rng.gauss(0, MODEL_NOISE)))
        p_base = min(0.99, max(0.01, base_p + rng.gauss(0, MODEL_NOISE)))
        diffs.append((p_base - outcome) ** 2 - (p_model - outcome) ** 2)
    return sum(diffs) / len(diffs)


def power_at(k_clusters, edge, rho, m=FORECASTS_PER_DRAFT, trials=TRIALS, seed=11):
    """Share of simulated worlds where a paired t-test over CLUSTERS rejects."""
    rng = random.Random(seed)
    hits = 0
    for _ in range(trials):
        vals = [_one_draft(rng, m, edge, rho) for _ in range(k_clusters)]
        mean = sum(vals) / len(vals)
        if len(vals) < 2:
            continue
        var = sum((v - mean) ** 2 for v in vals) / (len(vals) - 1)
        se = math.sqrt(var / len(vals))
        if se <= 0:
            continue
        # 1.96 rather than a t table: at k>=10 the difference is small and it
        # errs toward MORE power, so the floor reported is optimistic — which is
        # the safe direction for a number used to say "we cannot see this".
        if abs(mean / se) > 1.96:
            hits += 1
    return hits / trials


def mde(k_clusters, rho, lo=0.0, hi=1.0, tol=0.03):
    """Smallest `edge` reaching POWER at this cluster count. None if unreachable."""
    if power_at(k_clusters, hi, rho) < POWER:
        return None
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if power_at(k_clusters, mid, rho) >= POWER:
            hi = mid
        else:
            lo = mid
    return hi


def brier_gain(edge, rho, m=FORECASTS_PER_DRAFT, trials=1500, seed=7):
    """Translate an `edge` into the Brier improvement it actually buys, so the
    floor can be compared against the materiality bar the spec declares (0.02)."""
    rng = random.Random(seed)
    vals = [_one_draft(rng, m, edge, rho) for _ in range(trials)]
    return sum(vals) / len(vals)


if __name__ == "__main__":
    print("=" * 74)
    print("SURVIVAL ROW — what it can claim at the sample that will exist")
    print("=" * 74)
    print(f"{FORECASTS_PER_DRAFT} forecasts per replayed draft. The CLUSTER is the draft.")
    print(f"alpha {ALPHA}, power {POWER}, {TRIALS} simulated worlds per cell.")
    print("Materiality bar declared in component_specs.js: 0.02 Brier.")
    print("")

    # FALSE POSITIVES FIRST, at a true edge of ZERO. Checking the null case is
    # what caught the broken block bootstrap; a floor from a test that does not
    # hold its size is not a floor.
    print("── CALIBRATION AT A TRUE EDGE OF ZERO ─────────────────────────────")
    for k in (10, 20, 40):
        for rho in (0.0, 0.6):
            fp = power_at(k, 0.0, rho)
            print(f"   {k:>3} clusters, rho {rho}: false positive {fp * 100:4.1f}%")
    print("")

    print("── THE FLOOR, IN BRIER, BY CLUSTER COUNT ──────────────────────────")
    print("   clusters │  rho=0.0          │  rho=0.6 (a real slate)")
    for k in (10, 20, 40, 100):
        row = f"   {k:>8} │ "
        for rho in (0.0, 0.6):
            e = mde(k, rho)
            if e is None:
                row += " unreachable      │ "
            else:
                g = brier_gain(e, rho)
                row += f" {g:.4f} Brier     │ "
        print(row)
    print("")
    print("Compare against the declared material bar of 0.02.")

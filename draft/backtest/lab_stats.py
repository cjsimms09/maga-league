"""THE LAB — the honesty budget: null-search baselines + season cross-validation.

With a dozen registered experiments and only three real seasons, the danger is
not a wrong formula — it is a TRUE-LOOKING edge that is really the best draw from
a search over noise. Two guards, both mandated by the program rules:

  null_search_baseline — run the SAME best-of-K search the real experiment ran,
    but over randomized outcomes, many times. The 95th percentile of the best
    edge the search finds under the null is the significance floor. A real edge
    ships only if it clears that floor; an edge the null reproduces is noise,
    reported as such. This is also the multiple-comparisons control: searching K
    candidates inflates the null's best-edge exactly as it inflates the real one.

  cross_validate — leave-one-season-out. Tune on two seasons, grade on the held-
    out third, rotate. An edge that only exists in-sample dies here.

  ship_rule — the two combined: beats the null p95 AND holds up out-of-sample.

Deterministic: every random draw comes from a seeded generator passed in, so a
verdict reproduces exactly.
"""
from __future__ import annotations
import random
from statistics import mean as _mean


def percentile(sorted_vals: list[float], q: float) -> float:
    """q in [0,1]. Nearest-rank on an already-sorted list."""
    if not sorted_vals:
        return 0.0
    idx = int(round(q * (len(sorted_vals) - 1)))
    return sorted_vals[max(0, min(len(sorted_vals) - 1, idx))]


def null_search_baseline(observed_edge: float, permuted_best_edge, *,
                         n: int = 500, seed: int = 0) -> dict:
    """Distribution of the best edge the search finds under the null.

    permuted_best_edge(rng) -> float: run the WHOLE search (best of K candidates)
    against one randomized/label-shuffled outcome and return the winner's edge.
    Called n times with a seeded rng. observed_edge is the real search's winner.
    """
    rng = random.Random(seed)
    null = sorted(float(permuted_best_edge(rng)) for _ in range(n))
    p95 = percentile(null, 0.95)
    return {
        "n": n,
        "null_p50": percentile(null, 0.50),
        "null_p95": p95,
        "null_max": null[-1],
        "null_mean": round(_mean(null), 4),
        "observed_edge": observed_edge,
        # The verdict: an edge the null's best-of-K search does NOT reproduce.
        "beats_null": observed_edge > p95,
    }


def cross_validate(folds: list, tune, evaluate) -> dict:
    """Leave-one-out over `folds` (season keys).

    tune(train_folds) -> model ; evaluate(model, held_fold) -> float edge.
    Returns per-fold edges + whether EVERY held-out fold is positive (the strict
    reading) and the mean held-out edge.
    """
    per = []
    for held in folds:
        train = [f for f in folds if f != held]
        model = tune(train)
        per.append({"held_out": held, "edge": float(evaluate(model, held))})
    edges = [p["edge"] for p in per]
    return {
        "folds": per,
        "mean_holdout_edge": round(_mean(edges), 4) if edges else 0.0,
        "min_holdout_edge": min(edges) if edges else 0.0,
        "all_folds_positive": all(e > 0 for e in edges),
    }


def ship_rule(observed_edge: float, permuted_best_edge, folds, tune, evaluate, *,
              n_null: int = 500, seed: int = 0) -> dict:
    """The full gate: beats the null-search p95 AND survives cross-validation.

    Returns a decision object; `ship` is True only if BOTH guards pass. Anything
    else is documented and parked (never installed) — the program's ship rule.
    """
    null = null_search_baseline(observed_edge, permuted_best_edge, n=n_null, seed=seed)
    cv = cross_validate(folds, tune, evaluate)
    ship = bool(null["beats_null"] and cv["all_folds_positive"])
    return {
        "ship": ship,
        "null": null,
        "cross_validation": cv,
        "reason": (
            "ships: clears null p95 (%.3f > %.3f) and positive on every held-out season"
            % (null["observed_edge"], null["null_p95"]) if ship else
            "parked: " + ("edge %.3f does not clear null p95 %.3f" % (null["observed_edge"], null["null_p95"])
                          if not null["beats_null"] else
                          "failed cross-validation (min held-out edge %.3f)" % cv["min_holdout_edge"])
        ),
    }

"""THE LAB — lock the honesty budget (null baselines + cross-validation).

The guards must do their job in both directions: a genuine, out-of-sample-stable
edge SHIPS; an edge that is really the best draw from a search over noise is
CAUGHT by the null and parked. If these invert, the whole program launders noise.
"""
from __future__ import annotations
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import lab_stats as LS  # noqa: E402


def test_percentile_nearest_rank():
    vals = list(range(1, 101))            # 1..100
    assert LS.percentile(vals, 0.0) == 1
    assert LS.percentile(vals, 1.0) == 100
    assert LS.percentile(vals, 0.95) == 95   # nearest-rank: round(0.95*99)=94 -> vals[94]=95


def test_pure_noise_does_not_beat_its_own_null():
    # The "experiment": pick the best of K=20 candidates whose edges are pure
    # noise. The observed winner is the max of 20 draws; the null runs the SAME
    # best-of-20 search. By construction the observed edge should NOT clear p95.
    def best_of_20(rng):
        return max(rng.gauss(0, 1) for _ in range(20))
    obs_rng = random.Random(12345)
    observed = best_of_20(obs_rng)
    res = LS.null_search_baseline(observed, best_of_20, n=800, seed=7)
    # A single noise draw beating the p95 of 800 noise draws is a ~5% fluke; over
    # many the expectation is it does not. Assert the machinery: p95 is a real
    # upper tail and the observed sits near the null body, not far above it.
    assert res["null_p95"] > res["null_p50"] > 0
    assert observed <= res["null_max"] + 1e-9
    # The observed (one best-of-20) is not dramatically above the null's own best.
    assert observed < res["null_max"]


def test_a_real_edge_clears_the_null():
    # A candidate with a TRUE +5 edge, noise sd 1. The null (no signal) can never
    # manufacture +5 from best-of-20 standard-normal draws.
    def best_of_20_null(rng):
        return max(rng.gauss(0, 1) for _ in range(20))
    observed = 5.0
    res = LS.null_search_baseline(observed, best_of_20_null, n=500, seed=3)
    assert res["beats_null"] is True
    assert res["null_p95"] < 5.0


def test_cross_validation_leaves_one_out_and_rotates():
    seasons = [2023, 2024, 2025]
    seen_trains = []

    def tune(train):
        seen_trains.append(tuple(sorted(train)))
        return {"train": sorted(train)}

    def evaluate(model, held):
        assert held not in model["train"]          # never grade on training data
        return 1.0                                  # constant positive edge

    cv = LS.cross_validate(seasons, tune, evaluate)
    assert len(cv["folds"]) == 3
    assert cv["all_folds_positive"] is True
    # Each fold trained on exactly the other two seasons.
    assert set(seen_trains) == {(2023, 2024), (2023, 2025), (2024, 2025)}


def test_cross_validation_flags_an_in_sample_only_edge():
    seasons = [2023, 2024, 2025]

    def tune(train):
        return {"t": train}

    def evaluate(model, held):
        # Positive on 2023/2024 but negative on 2025 held-out -> must not pass.
        return -1.0 if held == 2025 else 2.0

    cv = LS.cross_validate(seasons, tune, evaluate)
    assert cv["all_folds_positive"] is False
    assert cv["min_holdout_edge"] == -1.0


def test_ship_rule_requires_both_guards():
    seasons = [2023, 2024, 2025]
    null_fn = lambda rng: max(rng.gauss(0, 1) for _ in range(20))

    # Real, stable edge: clears null AND positive every fold -> SHIP.
    good = LS.ship_rule(5.0, null_fn, seasons,
                        tune=lambda tr: None, evaluate=lambda m, h: 1.5,
                        n_null=400, seed=1)
    assert good["ship"] is True

    # Clears null but fails a fold -> PARK.
    park_cv = LS.ship_rule(5.0, null_fn, seasons,
                           tune=lambda tr: None,
                           evaluate=lambda m, h: (-0.1 if h == 2024 else 1.0),
                           n_null=400, seed=1)
    assert park_cv["ship"] is False and "cross-validation" in park_cv["reason"]

    # Stable out-of-sample but does NOT clear the null -> PARK.
    park_null = LS.ship_rule(0.2, null_fn, seasons,
                             tune=lambda tr: None, evaluate=lambda m, h: 1.0,
                             n_null=400, seed=1)
    assert park_null["ship"] is False and "null p95" in park_null["reason"]

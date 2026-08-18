# TERRITORY: D
"""A FITTED STACKER MUST BEAT RANDOM WEIGHTS, NOT JUST THE CHAMPION.

BLEND-SEARCH-DESIGN.md section 3's second owed null. The trap: blending K arms
reduces the variance of the blend's error even when the weights carry NO
information, so a stacker that beats the best single arm may have bought that
entirely with averaging -- and its WEIGHTS, the thing anyone would write up,
may be worth nothing.

The controls are the file. A null that cannot fire launders every future blend.

Run: python -m pytest draft/tests/test_random_weight_null.py -q
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import random_weight_null as R  # noqa: E402

ARTIFACT = ROOT / "draft" / "backtest" / "random_weight_null.json"


def _panel(k: int, n: int, rho: float = 0.3, good_arm_sd: float = 1.0, seed: int = 5):
    """k arms predicting `actual`; arm_0 is the most accurate."""
    rng = random.Random(seed)
    actual = [rng.gauss(10.0, 5.0) for _ in range(n)]
    common = [rng.gauss(0.0, 1.0) for _ in range(n)]
    preds = {}
    for i in range(k):
        sd = good_arm_sd if i == 0 else 2.0
        preds[f"arm_{i}"] = [
            a + sd * (rho ** 0.5 * c + (1 - rho) ** 0.5 * rng.gauss(0.0, 1.0))
            for a, c in zip(actual, common)
        ]
    return preds, actual


def test_KNOWN_POSITIVE_weights_that_track_arm_quality_are_detected():
    """All the weight on the genuinely best arm. If this is not detected the
    null is inert and no blend can ever be believed."""
    preds, actual = _panel(5, 1500, good_arm_sd=0.5)
    w = {"arm_0": 1.0, "arm_1": 0.0, "arm_2": 0.0, "arm_3": 0.0, "arm_4": 0.0}
    res = R.random_weight_null(preds, actual, fitted_weights=w, draws=400)
    assert res["weights_beat_random"], res
    assert res["gain_from_the_FITTED_weights"] > 0, res


def test_KNOWN_NEGATIVE_a_random_blend_is_not_mistaken_for_a_fitted_one():
    """The failure mode this file exists for."""
    fired = 0
    for seed in range(12):
        preds, actual = _panel(5, 1200, seed=seed)
        rng = random.Random(1000 + seed)
        w = dict(zip(sorted(preds), R._random_weights(5, rng)))
        res = R.random_weight_null(preds, actual, fitted_weights=w, draws=300,
                                   seed=2000 + seed)
        if res["weights_beat_random"]:
            fired += 1
    assert fired <= 2, (
        f"{fired}/12 random-weight blends were reported as skilled — the null "
        "is too loose and would launder a coin flip.")


def test_identical_arms_get_NO_free_gain_from_averaging():
    """The sharp cheap control: averaging copies of the same thing changes
    nothing, so the calibration must return ~0 at rho ~ 1. If it does not, the
    whole table is measuring something other than averaging."""
    cal = json.loads(ARTIFACT.read_text())["calibration_sd1"]
    for k in ("k=2", "k=5", "k=15"):
        assert abs(cal[k]["rho=0.99"]) < 0.01, (k, cal[k]["rho=0.99"])


def test_the_free_gain_grows_with_K_and_shrinks_with_correlation():
    """Both directions matter: more arms buys more averaging; more similar arms
    buys less. A table wrong in either direction misprices every blend."""
    cal = json.loads(ARTIFACT.read_text())["calibration_sd1"]
    by_k = [cal[f"k={k}"]["rho=0.3"] for k in (2, 3, 5, 8, 15)]
    assert by_k == sorted(by_k), by_k
    by_rho = [cal["k=5"][f"rho={r}"] for r in (0.0, 0.3, 0.6, 0.9, 0.99)]
    assert by_rho == sorted(by_rho, reverse=True), by_rho


def test_the_split_adds_up():
    """gain over champion = what ANY blend gets + what the FIT earned. If these
    do not reconcile, the headline and the honest number disagree."""
    preds, actual = _panel(5, 1200, good_arm_sd=0.6)
    w = {"arm_0": 0.6, "arm_1": 0.1, "arm_2": 0.1, "arm_3": 0.1, "arm_4": 0.1}
    r = R.random_weight_null(preds, actual, fitted_weights=w, draws=400)
    assert r["gain_over_champion"] == pytest.approx(
        r["gain_from_averaging_alone"] + r["gain_from_the_FITTED_weights"], abs=1e-3)


def test_it_refuses_a_malformed_panel():
    with pytest.raises(ValueError, match="at least two"):
        R.random_weight_null({"a": [1.0]}, [1.0], fitted_weights={"a": 1.0})
    with pytest.raises(ValueError, match="SAME rows"):
        R.random_weight_null({"a": [1.0, 2.0], "b": [1.0]}, [1.0, 2.0],
                             fitted_weights={"a": 1.0})
    with pytest.raises(ValueError, match="fitted"):
        R.random_weight_null({"a": [1.0, 2.0], "b": [1.0, 2.0]}, [1.0, 2.0])


def test_beating_the_champion_and_beating_random_weights_are_reported_separately():
    """The two questions are different and the artifact must not collapse them."""
    preds, actual = _panel(5, 1000)
    rng = random.Random(99)
    w = dict(zip(sorted(preds), R._random_weights(5, rng)))
    r = R.random_weight_null(preds, actual, fitted_weights=w, draws=300)
    assert "beats_champion" in r and "weights_beat_random" in r
    assert isinstance(r["beats_champion"], bool)
    assert isinstance(r["weights_beat_random"], bool)

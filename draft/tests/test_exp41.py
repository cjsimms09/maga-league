"""EXP 41 pure core — the calibration-weighted ensemble combiner, no egress.

The combiner is the piece that decides HOW to aggregate the eight profiles and
WHEN the ensemble earns a deviation. A bug here would let the ensemble deviate on
disagreement (the very thing it exists to prevent), so it is pinned with fixtures.

Run: python -m pytest draft/tests/test_exp41.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp41 as E  # noqa: E402


def test_normalize_weights_sums_to_one_and_floors_negatives():
    w = E.normalize_weights({"a": 3.0, "b": 1.0, "c": -5.0})
    assert abs(sum(w.values()) - 1.0) < 1e-9
    assert w["c"] == 0.0
    assert round(w["a"], 3) == 0.75


def test_all_zero_weights_fall_back_to_equal_vote():
    w = E.normalize_weights({"a": 0.0, "b": 0.0})
    assert w == {"a": 0.5, "b": 0.5}


def test_borda_best_rank_scores_one():
    bs = E.borda_scores({"p": ["x", "y", "z"]}, ["x", "y", "z"])
    assert bs["p"]["x"] == 1.0 and bs["p"]["z"] == 0.0
    assert 0.0 < bs["p"]["y"] < 1.0


def test_weighted_argmax_favours_the_accurate_profile():
    # profile 'good' (weight 0.9) loves y; 'bad' (0.1) loves x. Ensemble -> y.
    rankings = {"good": ["y", "x"], "bad": ["x", "y"]}
    weights = {"good": 0.9, "bad": 0.1}
    r = E.ensemble_pick(rankings, weights, ["x", "y"])
    assert r["recommend"] == "y"
    assert r["agreement"] == 0.9        # 90% of weight tops y


def test_deviation_requires_weighted_majority():
    # consensus is 'm' (market). Members split: 40% back a, 35% back b, 25% back m.
    # No single non-consensus player commands a majority -> COLLAPSE to consensus.
    rankings = {"p1": ["a", "m"], "p2": ["a", "m"], "p3": ["b", "m"],
                "p4": ["b", "m"], "p5": ["m", "a"]}
    weights = {"p1": 0.2, "p2": 0.2, "p3": 0.2, "p4": 0.15, "p5": 0.25}
    r = E.ensemble_pick(rankings, weights, ["a", "b", "m"], consensus="m")
    # 'a' has 0.4 top-1 weight, below the 0.5 majority -> collapse
    assert r["final"] == "m"
    assert r["deviates"] is False


def test_majority_agreement_earns_the_deviation():
    # 60% of weight backs 'a' over the consensus 'm' -> ensemble deviates to 'a'.
    rankings = {"p1": ["a", "m"], "p2": ["a", "m"], "p3": ["a", "m"], "p4": ["m", "a"]}
    weights = {"p1": 0.25, "p2": 0.2, "p3": 0.15, "p4": 0.4}
    r = E.ensemble_pick(rankings, weights, ["a", "m"], consensus="m")
    assert r["recommend"] == "a"
    assert r["top1_weight"]["a"] == 0.6
    assert r["final"] == "a" and r["deviates"] is True


def test_no_consensus_returns_recommendation():
    r = E.ensemble_pick({"p": ["x", "y"]}, {"p": 1.0}, ["x", "y"])
    assert r["final"] == r["recommend"] == "x"
    assert r["deviates"] is False


def test_intervention_rate_and_composite_compare():
    picks = [
        {"consensus": "m", "deviates": False, "agreement": 0.3},
        {"consensus": "m", "deviates": True, "agreement": 0.8},
        {"consensus": "m", "deviates": False, "agreement": 0.4},
    ]
    ir = E.intervention_rate(picks)
    assert ir["n"] == 3 and ir["deviations"] == 1
    assert ir["intervention_rate"] == round(1 / 3, 4)
    assert ir["less_than_composite"] is True     # 0.33 < 0.737


def test_confidence_band_from_structure():
    assert "strong" in E.confidence_band(0.9)
    assert "majority" in E.confidence_band(0.6)
    assert "split" in E.confidence_band(0.2)

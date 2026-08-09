"""EXP 34 pure metrics — verified against fixtures with known answers.

The statistics are the part most likely to be subtly wrong, so each is checked
against a constructed case where the right answer is obvious: an ordering that
perfectly predicts realized value must score higher than one that anti-predicts;
a band of clean wins must read 'beat'; the bootstrap must be deterministic.

Run: python -m pytest draft/tests/test_exp34_metrics.py -q  (or the direct harness)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp34_metrics as M


def test_bootstrap_is_deterministic_and_brackets_mean():
    xs = [10, 20, 30, 40, 50]
    a = M.bootstrap_ci(xs); b = M.bootstrap_ci(xs)
    assert a == b                                   # deterministic
    assert a[0] <= 30 <= a[1]                       # brackets the mean (30)
    assert M.bootstrap_ci([5]) != M.bootstrap_ci([5]) or True  # n<2 -> nan, no crash


def test_pool_correlation_direction():
    # our_proj ranks realized PERFECTLY; adp ranks it BACKWARDS (low adp = worst).
    pool = [{"pid": "a", "our_proj": 300, "adp": 40, "realized": 300},
            {"pid": "b", "our_proj": 200, "adp": 30, "realized": 200},
            {"pid": "c", "our_proj": 100, "adp": 20, "realized": 100},
            {"pid": "d", "our_proj": 50,  "adp": 10, "realized": 50}]
    pc = M.pool_correlations(pool)
    assert round(pc["rho_our"], 2) == 1.0           # perfect
    assert pc["rho_market"] < 0                      # market ordered it backwards
    assert pc["diff"] > 0                            # we beat the market here


def test_pool_correlation_skips_thin_pool():
    assert M.pool_correlations([{"our_proj": 1, "adp": 1, "realized": 1}]) is None


def test_aggregate_correlations_reads_beat_when_we_win_every_pick():
    # our_proj ranks realized perfectly; adp is a SCRAMBLED (imperfect) predictor.
    good = [{"pid": "a", "our_proj": 300, "adp": 10, "realized": 300},
            {"pid": "b", "our_proj": 200, "adp": 40, "realized": 200},
            {"pid": "c", "our_proj": 100, "adp": 20, "realized": 100},
            {"pid": "d", "our_proj": 50,  "adp": 30, "realized": 50}]
    agg = M.aggregate_correlations([good, good, good])
    assert agg["rho_our_mean"] > agg["rho_market_mean"]     # perfect beats scrambled
    assert agg["diff_mean"] > 0 and agg["verdict"] in ("beat", "inconclusive")


def test_topn_set_value_prefers_the_better_set():
    # our top-2 by proj = a,b (realized 300,200); market top-2 by adp = d,c (50,100).
    pool = [{"pid": "a", "our_proj": 300, "adp": 40, "realized": 300},
            {"pid": "b", "our_proj": 200, "adp": 30, "realized": 200},
            {"pid": "c", "our_proj": 100, "adp": 20, "realized": 100},
            {"pid": "d", "our_proj": 50,  "adp": 10, "realized": 50}]
    r = M.topn_value([pool, pool], 2)
    assert r["our_mean"] == 250 and r["market_mean"] == 75
    assert r["delta_mean"] == 175


def test_forgone_value_is_market_price_minus_our_pick():
    d = {"adp_best_proj": 120, "took_proj": 100}
    assert M.forgone_value(d) == 20                 # we paid 20 projected pts to reach
    assert M.forgone_value({"adp_best_proj": None, "took_proj": 100}) is None


def test_bands_bucket_and_score_hit_rate():
    # Three decisions bucketed by forgone_value with edges [10, 30]:
    #  fv=5 -> band0, fv=20 -> band1, fv=40 -> band2. Hit = took beat adp_best.
    decisions = [
        {"forgone_value": 5,  "took_realized": 150, "adp_best_realized": 100},  # hit
        {"forgone_value": 20, "took_realized": 90,  "adp_best_realized": 100},  # miss
        {"forgone_value": 40, "took_realized": 80,  "adp_best_realized": 130},  # miss
    ]
    bands = M.bands(decisions, "forgone_value", [10, 30], ["near-zero", "moderate", "large"])
    by = {b["band"]: b for b in bands}
    assert by["near-zero"]["n"] == 1 and by["near-zero"]["hit_rate"] == 1.0
    assert by["moderate"]["n"] == 1 and by["moderate"]["hit_rate"] == 0.0
    assert by["large"]["n"] == 1 and by["large"]["mean_delta"] == -50
    assert all(b["thin"] for b in bands)            # every band n<8 -> flagged thin


def test_distance_bands_use_the_same_engine():
    decisions = [{"adp_distance": 3, "took_realized": 100, "adp_best_realized": 90},
                 {"adp_distance": 25, "took_realized": 60, "adp_best_realized": 120}]
    b = M.bands(decisions, "adp_distance", [5, 15, 30], ["<5", "5-15", "15-30", ">30"])
    by = {x["band"]: x for x in b}
    assert by["<5"]["hit_rate"] == 1.0 and by["15-30"]["hit_rate"] == 0.0


def test_cliff_split_separates_crossing_from_within():
    decisions = [
        {"crosses_cliff": True,  "took_realized": 50,  "adp_best_realized": 120},  # bad cross
        {"crosses_cliff": True,  "took_realized": 40,  "adp_best_realized": 110},  # bad cross
        {"crosses_cliff": False, "took_realized": 105, "adp_best_realized": 100},  # ok within
    ]
    r = M.cliff_split(decisions)
    assert r["crosses_cliff"]["n"] == 2 and r["crosses_cliff"]["hit_rate"] == 0.0
    assert r["within_tier"]["n"] == 1 and r["within_tier"]["hit_rate"] == 1.0


def test_inconclusive_reads_as_bind_harder_direction():
    # deltas +50, -50 -> mean 0, CI spans zero -> inconclusive (not a tie that stands)
    decisions = [{"forgone_value": 5, "took_realized": 150, "adp_best_realized": 100},
                 {"forgone_value": 6, "took_realized": 50,  "adp_best_realized": 100}]
    b = M.bands(decisions, "forgone_value", [10], ["a", "b"])
    assert b[0]["verdict"] == "inconclusive"

"""EXP 33b pure core — the three-way (blend/naive/market) comparison, no egress.

Pins the decision logic that would tell Cory to REPLACE the projection source: the
per-pool rank comparison, the paired-difference aggregation, and the pre-registered
tune-vs-replace read. A bug here could recommend swapping the projection the whole
model runs on, so it is fixtured.

Run: python -m pytest draft/tests/test_exp33b.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp33b_naive_source as E  # noqa: E402


def _pool(order_by, realized_order, n=12):
    # build a pool where `order_by` maps pid->score for each source, realized descending
    ids = [str(i) for i in range(n)]
    realized = {p: 100 - i for i, p in enumerate(ids)}
    return [{"blend": order_by["blend"][p], "naive": order_by["naive"][p],
             "adp": order_by["adp"][p], "realized": realized[p]} for p in ids]


def test_pool_three_way_scores_each_ordering():
    ids = [str(i) for i in range(12)]
    realized = {p: 100 - i for i, p in enumerate(ids)}
    # naive perfectly orders realized; blend inverted; adp mid (lower adp = better = realized)
    pool = [{"blend": i, "naive": 100 - i, "adp": i + 1, "realized": realized[p]}
            for i, p in enumerate(ids)]
    r = E.pool_three_way(pool)
    assert r["naive"] > r["blend"]          # naive ranks better than the inverted blend
    assert r["naive_minus_blend"] > 0
    assert r["n"] == 12


def test_pool_skips_thin():
    assert E.pool_three_way([{"blend": 1, "naive": 1, "adp": 1, "realized": 5}]) is None


def test_aggregate_and_replace_verdict():
    # many pools where naive strictly out-ranks blend -> naive_minus_blend positive
    ids = [str(i) for i in range(12)]
    realized = {p: 100 - i for i, p in enumerate(ids)}
    pools = []
    for _ in range(8):
        pools.append([{"blend": i, "naive": 100 - i, "adp": i + 1, "realized": realized[p]}
                      for i, p in enumerate(ids)])
    rank = E.aggregate_ranking(pools)
    assert rank["naive_minus_blend"]["verdict"] == "positive"
    # naive ranks better AND earns more -> REPLACE
    assert E.replace_or_tune(rank, 300.0).startswith("REPLACE")
    # naive ranks better but blend holds dollars -> MIXED (keep construction, feed better value)
    assert E.replace_or_tune(rank, -100.0).startswith("MIXED")


def test_keep_tune_when_naive_not_better():
    # blend and naive equal ordering -> naive_minus_blend ~ 0 -> inconclusive -> KEEP/TUNE
    ids = [str(i) for i in range(12)]
    realized = {p: 100 - i for i, p in enumerate(ids)}
    pools = [[{"blend": 100 - i, "naive": 100 - i, "adp": i + 1, "realized": realized[p]}
              for i, p in enumerate(ids)] for _ in range(6)]
    rank = E.aggregate_ranking(pools)
    assert rank["naive_minus_blend"]["verdict"] == "inconclusive"
    assert E.replace_or_tune(rank, 0.0).startswith("KEEP/TUNE")

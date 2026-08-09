"""Source grade — pure comparison core (no egress).
Run: python -m pytest draft/tests/test_source_grade.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_source_grade as SG  # noqa: E402


def _region(n, pos, base_realized, ranker):
    """n players in one (round, position) cell; realized set by base_realized(i);
    ranker(i) gives the adp used by the source under test."""
    meta, realized, adp = {}, {}, {}
    for i in range(n):
        pid = f"{pos}{i}"
        meta[pid] = {"position": pos, "round": 5}      # r4-7 band
        realized[pid] = base_realized(i)
        adp[pid] = ranker(i)
    return meta, realized, adp


def test_source_that_orders_value_better_wins_the_region():
    # 10 WRs; realized decreases with i. Source A ranks them correctly (adp=i);
    # source B ranks them BACKWARDS (adp = -i). A should win the region.
    meta, realized, adpA = _region(10, "WR", lambda i: 200 - 10 * i, lambda i: i + 1)
    _, _, adpB = _region(10, "WR", lambda i: 200 - 10 * i, lambda i: 100 - i)
    res = SG.compare_sources(realized, meta, {"A": adpA, "B": adpB})
    w = res["per_region_winner"]["r4-7|WR"]
    assert w["winner"] == "A" and w["rho"] > 0
    assert res["best_single_source"] == "A"


def test_thin_cell_is_not_graded():
    meta, realized, adp = _region(5, "TE", lambda i: 100 - i, lambda i: i + 1)  # n=5 < floor 8
    res = SG.compare_sources(realized, meta, {"A": adp})
    assert res["surfaces"]["A"]["cells"]["r4-7"]["TE"]["rho"] is None
    assert res["surfaces"]["A"]["cells"]["r4-7"]["TE"]["n"] == 5


def test_composite_beats_a_pair_of_noisy_members():
    # Two sources each half-right (one nails the top half, one the bottom half);
    # the composite (mean rank) orders the whole cell better than either alone.
    n = 12
    realized = {}
    meta = {}
    for i in range(n):
        pid = f"RB{i}"
        meta[pid] = {"position": "RB", "round": 5}
        realized[pid] = 200 - 12 * i           # strictly decreasing truth
    # A: correct in top half, random-ish (flat) in bottom half
    adpA = {f"RB{i}": (i if i < n // 2 else n // 2) for i in range(n)}
    # B: correct in bottom half, flat in top half
    adpB = {f"RB{i}": (0 if i < n // 2 else i) for i in range(n)}
    res = SG.compare_sources(realized, meta, {"A": adpA, "B": adpB})
    # composite exists and is graded
    assert res["composite_weighted_rho"] is not None
    # composite should be >= the better single member here (mean rank recovers full order)
    assert res["composite_weighted_rho"] >= res["best_single_weighted_rho"] - 1e-9


def test_verdict_names_the_winner():
    meta, realized, adp = _region(10, "WR", lambda i: 200 - 10 * i, lambda i: i + 1)
    res = SG.compare_sources(realized, meta, {"FFC": adp})
    assert "FFC" in res["verdict"] or "composite" in res["verdict"]

"""Preseason projection snapshots — pure core. Run: python -m pytest draft/tests/test_proj_series.py -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import proj_series as P  # noqa: E402


def test_append_dedups_by_date_and_source():
    s = P.append_snapshot([], "2026-08-10", "sleeper", {"1": 300, "2": 200})
    s = P.append_snapshot(s, "2026-08-10", "fantasypros", {"1": 310, "2": 190})
    s = P.append_snapshot(s, "2026-08-10", "sleeper", {"1": 305, "2": 205})   # same date+source -> replace
    assert len(s) == 2                                # sleeper replaced, fantasypros kept
    assert P.latest(s, "sleeper")["1"] == 305.0
    assert P.latest(s, "fantasypros")["1"] == 310.0


def test_append_keeps_top_n():
    s = P.append_snapshot([], "d", "sleeper", {"a": 300, "b": 200, "c": 100}, top_n=2)
    assert set(s[-1]["proj"]) == {"a", "b"}           # the two highest projections kept


def test_divergence_identical_sources_agree():
    a = {"1": 300, "2": 200, "3": 100, "4": 50}
    d = P.divergence(a, dict(a))
    assert d["rank_corr"] == 1.0 and d["n"] == 4


def test_divergence_flags_the_disagreement():
    a = {"1": 300, "2": 200, "3": 100}   # ranks 1,2,3
    b = {"1": 100, "2": 200, "3": 300}   # reversed -> player 1 and 3 swap
    d = P.divergence(a, b)
    assert d["rank_corr"] == -1.0
    top = d["top_disagreements"][0]
    assert abs(top["rank_a"] - top["rank_b"]) == 2    # the biggest swap is 2 ranks


def test_divergence_thin_is_honest():
    assert P.divergence({"1": 1}, {"1": 1})["rank_corr"] is None

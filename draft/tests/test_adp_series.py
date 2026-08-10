"""Daily ADP series — pure append/velocity/staleness. Run: python -m pytest draft/tests/test_adp_series.py -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import adp_series as S  # noqa: E402


def test_append_dedups_by_date_and_sorts():
    s = S.append_snapshot([], "2026-08-08", {"1": 10, "2": 20})
    s = S.append_snapshot(s, "2026-08-09", {"1": 8, "2": 22})
    s = S.append_snapshot(s, "2026-08-09", {"1": 7, "2": 22})   # same day → replace, not double
    assert [x["date"] for x in s] == ["2026-08-08", "2026-08-09"]
    assert s[-1]["adp"]["1"] == 7.0


def test_append_keeps_top_n_only():
    s = S.append_snapshot([], "2026-08-09", {"a": 1, "b": 2, "c": 3}, top_n=2)
    assert set(s[-1]["adp"]) == {"a", "b"}       # the two lowest ADP (best) kept


def test_append_bounds_max_days():
    s = []
    for d in range(1, 6):
        s = S.append_snapshot(s, f"2026-08-0{d}", {"1": d}, max_days=3)
    assert [x["date"] for x in s] == ["2026-08-03", "2026-08-04", "2026-08-05"]


def test_velocity_positive_is_rising():
    s = [{"date": "d1", "adp": {"1": 30}}, {"date": "d2", "adp": {"1": 15}}]
    # ADP fell 30→15 (moved to an earlier pick) → RISING → positive
    assert S.velocity(s, "1") == 15.0


def test_velocity_negative_is_falling():
    s = [{"date": "d1", "adp": {"1": 20}}, {"date": "d2", "adp": {"1": 33}}]
    assert S.velocity(s, "1") == -13.0


def test_velocity_windowed_and_missing():
    s = [{"date": "d1", "adp": {"1": 40}}, {"date": "d2", "adp": {"1": 30}}, {"date": "d3", "adp": {"1": 25}}]
    assert S.velocity(s, "1", days=1) == 5.0          # d2→d3 only
    assert S.velocity(s, "1", days=2) == 15.0         # d1→d3
    assert S.velocity(s, "9", days=2) is None         # absent player


def test_stale_flag_thresholds_and_direction():
    assert S.stale_flag(12.0, 3)["direction"] == "rising"
    assert S.stale_flag(-9.0, 3)["direction"] == "falling"
    assert S.stale_flag(4.0, 3) is None               # below threshold
    assert S.stale_flag(20.0, 0) is None              # no span → cannot judge staleness


def test_span_days():
    assert S.span_days([]) == 0
    assert S.span_days([{"date": "d1", "adp": {}}]) == 0     # one snapshot = no velocity yet
    assert S.span_days([{"date": "d1", "adp": {}}, {"date": "d2", "adp": {}}]) == 1

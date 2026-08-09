"""FORWARD-PREDICTION GRADER — the forward guarantee and the three grade types.

Run: python -m pytest draft/tests/test_forecast_grade.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import forecast_grade as FG   # noqa: E402


def fc(key, ftype, value, at, **payload):
    return {"kind": "forecast", "method": "forecast-v1", "decision_at": at,
            "payload": {"key": key, "ftype": ftype, "value": value,
                        "resolution_rule": "stated", **payload}}


def res(key, outcome, at):
    return {"kind": "forecast_resolution", "decision_at": at,
            "payload": {"forecast_key": key, "outcome": outcome}}


def test_probability_brier_and_reliability():
    entries = [
        fc("a", "probability", 0.9, "2026-08-22T00:00:00Z"),
        res("a", 1, "2026-12-01T00:00:00Z"),          # said 0.9, happened -> brier 0.01
        fc("b", "probability", 0.2, "2026-08-22T00:00:00Z"),
        res("b", 0, "2026-12-01T00:00:00Z"),          # said 0.2, didn't -> brier 0.04
    ]
    g = FG.grade(entries)
    assert g["n_graded"] == 2
    assert abs(g["probability"]["brier"] - 0.025) < 1e-6
    # reliability table has 10 buckets, and the 90% bucket observed 100%
    b90 = next(r for r in g["probability"]["reliability"] if r["bucket"] == "90-100%")
    assert b90["n"] == 1 and b90["observed_rate"] == 1.0


def test_point_bias_and_mae():
    entries = [
        fc("r", "point", 1500, "2026-08-22T00:00:00Z", unit="$"),
        res("r", 1400, "2027-01-05T00:00:00Z"),        # ran +100 high
        fc("s", "point", 1000, "2026-08-22T00:00:00Z", unit="$"),
        res("s", 1300, "2027-01-05T00:00:00Z"),        # ran -300 low
    ]
    g = FG.grade(entries)
    assert g["point"]["n"] == 2
    assert abs(g["point"]["bias"] - (-100.0)) < 1e-6   # mean signed error
    assert abs(g["point"]["mae"] - 200.0) < 1e-6


def test_categorical_accuracy():
    entries = [
        fc("seat3", "categorical", "Bijan", "2026-08-22T00:00:00Z"),
        res("seat3", "Bijan", "2026-08-22T23:00:00Z"),   # hit
        fc("seat4", "categorical", "Jefferson", "2026-08-22T00:00:00Z"),
        res("seat4", "Chase", "2026-08-22T23:00:00Z"),    # miss
    ]
    g = FG.grade(entries)
    assert g["categorical"]["n"] == 2 and g["categorical"]["accuracy"] == 0.5


def test_forward_guarantee_disqualifies_backdated_forecast():
    # A "forecast" written AFTER reality is not forward — it must be disqualified,
    # not silently graded (the failure mode that inflates a retrospective score).
    entries = [
        fc("late", "probability", 0.99, "2026-12-02T00:00:00Z"),
        res("late", 1, "2026-12-01T00:00:00Z"),          # resolved BEFORE the forecast
    ]
    g = FG.grade(entries)
    assert g["n_graded"] == 0 and g["n_disqualified"] == 1
    assert g["disqualified"][0]["key"] == "late"
    assert "not forward" in g["disqualified"][0]["reason"]


def test_missing_timestamp_fails_closed():
    entries = [
        {"kind": "forecast", "decision_at": None,
         "payload": {"key": "x", "ftype": "probability", "value": 0.5, "resolution_rule": "r"}},
        res("x", 1, "2026-12-01T00:00:00Z"),
    ]
    g = FG.grade(entries)
    assert g["n_graded"] == 0 and g["n_disqualified"] == 1   # no stamp -> not provably forward


def test_pending_and_orphans_reported():
    entries = [
        fc("open", "point", 5, "2026-08-22T00:00:00Z"),      # no resolution yet
        res("ghost", 1, "2026-12-01T00:00:00Z"),             # resolves a forecast we never made
    ]
    g = FG.grade(entries)
    assert g["n_pending"] == 1 and g["pending_keys"] == ["open"]
    assert g["orphan_resolution_keys"] == ["ghost"]

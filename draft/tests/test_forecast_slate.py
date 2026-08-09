"""THE FORECAST SLATE — the committed claims validate before they reach the ledger,
and materialized entries grade correctly end-to-end.

Run: python -m pytest draft/tests/test_forecast_slate.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import forecast_slate as FS      # noqa: E402
import forecast_grade as FG      # noqa: E402


def test_every_template_has_a_resolution_rule_and_type():
    for t in FS.PRE_DRAFT + FS.WEEKLY:
        assert t["resolution_rule"] and t["resolves_when"]
        assert t["ftype"] in FS.FORECAST_TYPES
        assert t["method"].endswith("-v1")


def test_the_four_pre_draft_categories_cory_named_are_present():
    ids = {t["id"] for t in FS.PRE_DRAFT}
    assert {"survival", "adp_fall", "room_seat", "roster_dollars"} <= ids


def test_materialize_carries_the_rule_and_validates_probability():
    e = FS.materialize("survival", "survival:p99@pick45", 0.72)
    assert e["kind"] == "forecast" and e["payload"]["ftype"] == "probability"
    assert e["payload"]["resolution_rule"]           # rule travels with the commitment
    assert e["method"] == "survival-forecast-v1"


def test_materialize_rejects_a_bad_probability():
    import pytest
    with pytest.raises(ValueError):
        FS.materialize("survival", "k", 1.5)


def test_point_forecast_carries_its_unit():
    e = FS.materialize("roster_dollars", "roster_dollars", 1450)
    assert e["payload"]["unit"] == "$" and e["payload"]["ftype"] == "point"


def test_end_to_end_materialize_then_grade_forward():
    # Commit two forecasts, resolve them later, grade forward.
    f1 = FS.materialize("survival", "survival:a@pick45", 0.9)
    f1["decision_at"] = "2026-08-22T00:00:00Z"
    f2 = FS.materialize("roster_dollars", "roster_dollars", 1500)
    f2["decision_at"] = "2026-08-22T00:00:00Z"
    r1 = FS.resolution("survival:a@pick45", 1, source="draft board")
    r1["decision_at"] = "2026-08-22T02:00:00Z"
    r2 = FS.resolution("roster_dollars", 1400, source="Annual")
    r2["decision_at"] = "2027-01-05T00:00:00Z"
    g = FG.grade([f1, f2, r1, r2])
    assert g["n_graded"] == 2
    assert abs(g["probability"]["brier"] - 0.01) < 1e-6   # 0.9 said, happened
    assert abs(g["point"]["bias"] - 100.0) < 1e-6         # $1500 vs $1400 -> +100


def test_resolution_needs_an_outcome():
    import pytest
    with pytest.raises(ValueError):
        FS.resolution("k", None)

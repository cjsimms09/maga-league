# TERRITORY: A
"""THE STANDING CHECK CAN FIRE — which is the only property that matters.

A periodic pass that stays silent is indistinguishable from a periodic pass that
CANNOT SPEAK, and this project has now built four things whose null was their own
construction. So every escalation path is exercised against synthetic data that
crosses its threshold, and the quiet path is exercised too — a check that always
escalates is as useless as one that never does.

Rule 13f applied to the instrument: before believing "nothing has crossed", ask
whether this thing could have produced anything else. These tests are that answer.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import standing_check as SC                                    # noqa: E402


def _stamp(days_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _date(days_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


# ── THE QUIET PATH IS REAL ──────────────────────────────────────────────────

def test_a_healthy_series_is_quiet(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    p = tmp_path / "s.json"
    p.write_text(json.dumps({"series": [{"date": _date(1), "x": 1}]}))
    row = SC.check_series("s", "s.json")
    assert row["state"] == "quiet", row


# ── AND SO IS EVERY ESCALATION ──────────────────────────────────────────────

def test_a_series_that_stopped_updating_escalates(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    (tmp_path / "s.json").write_text(json.dumps(
        {"series": [{"date": _date(SC.T["series_stale_days"] + 5)}]}))
    row = SC.check_series("s", "s.json")
    assert row["state"] == "ESCALATE", row
    assert "stopped updating" in row["detail"]


def test_a_series_with_no_findable_date_is_BLIND_not_quiet(tmp_path, monkeypatch):
    """THE DEFECT THIS FILE CAUGHT ON ITS FIRST RUN.

    external_adp_series stamps `observed_at`, not `date`. The first version read
    no date, computed a newest of "", and called the row quiet — a staleness
    check that could never fire, inside the file that exists to catch exactly
    that. A series whose date cannot be found is BLIND.
    """
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    (tmp_path / "s.json").write_text(json.dumps({"series": [{"when": "2020-01-01"}]}))
    row = SC.check_series("s", "s.json")
    assert row["state"] == "BLIND", row
    assert "UNCHECKABLE" in row["detail"]


def test_a_missing_archive_is_BLIND_not_quiet(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    row = SC.check_series("s", "nope.json")
    assert row["state"] == "BLIND"
    assert "cannot tell 'not started' from 'lost'" in row["detail"]


def test_a_dead_market_capture_escalates(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "market_snapshots"
    d.mkdir(parents=True)
    (d / "capture_health.json").write_text(json.dumps(
        {"last_success_at": _stamp(SC.T["market_stale_days"] + 2)}))
    row = SC.check_market_snapshots()
    assert row["state"] == "ESCALATE", row
    assert "unrecoverable" in row["detail"]


def test_enough_paired_events_escalates_signal_c(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "market_snapshots"
    d.mkdir(parents=True)
    (d / "capture_health.json").write_text(json.dumps({"last_success_at": _stamp(0.1)}))
    events = [{"event_id": f"e{i}"} for i in range(SC.T["market_movement_events"] + 3)]
    for k in range(2):
        (d / f"usa-nfl-preseason_2026-08-0{k + 1}T000000Z.json").write_text(
            json.dumps({"events": events}))
    row = SC.check_market_snapshots()
    assert row["state"] == "ESCALATE", row
    assert row["n"] >= SC.T["market_movement_events"]
    assert "Signal C is askable" in row["detail"]


def test_one_observation_per_event_stays_quiet(tmp_path, monkeypatch):
    """The control: many events, one snapshot. Points, not a series."""
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "market_snapshots"
    d.mkdir(parents=True)
    (d / "capture_health.json").write_text(json.dumps({"last_success_at": _stamp(0.1)}))
    (d / "usa-nfl-preseason_2026-08-01T000000Z.json").write_text(json.dumps(
        {"events": [{"event_id": f"e{i}"} for i in range(99)]}))
    row = SC.check_market_snapshots()
    assert row["state"] == "quiet", row
    assert row["n"] == 0


def test_enough_realized_weeks_escalates_the_projection_archive(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    (d / "proj_series.json").write_text(json.dumps(
        {"series": [{"date": _date(i), "week": w}
                    for i, w in enumerate(range(1, SC.T["proj_weeks_realized"] + 1))]}))
    row = SC.check_proj_archive()
    assert row["state"] == "ESCALATE", row
    assert "checkable" in row["detail"]


def test_preseason_snapshots_alone_stay_quiet(tmp_path, monkeypatch):
    """The control for the row above: five snapshots, no week, nothing to grade."""
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    (d / "proj_series.json").write_text(json.dumps(
        {"series": [{"date": _date(i), "source": "fantasypros"} for i in range(5)]}))
    row = SC.check_proj_archive()
    assert row["state"] == "quiet", row


def test_a_measurable_component_escalates(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    (d / "component_grades.json").write_text(json.dumps({"components": [
        {"name": "projection", "verdict": "too_thin"},
        {"name": "opportunity_adj", "verdict": "hurting"},
    ]}))
    row = SC.check_components()
    assert row["state"] == "ESCALATE", row
    assert "opportunity_adj" in row["detail"]


def test_thin_components_stay_quiet(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    (d / "component_grades.json").write_text(json.dumps({"components": [
        {"name": "projection", "verdict": "too_thin"},
        {"name": "survival", "verdict": "noise"},
    ]}))
    assert SC.check_components()["state"] == "quiet"


# ── A CHECK THAT THROWS IS BLIND, NEVER SILENT ──────────────────────────────

def test_a_check_that_raises_reports_BLIND(monkeypatch):
    def boom():
        raise RuntimeError("the archive moved")
    monkeypatch.setattr(SC, "CHECKS", [boom])
    rows = SC.run()
    assert rows[0]["state"] == "BLIND"
    assert "the check itself failed" in rows[0]["detail"]


# ── THE RENDERED OUTPUT IS ONE LINE WHEN NOTHING CROSSED ────────────────────

def test_quiet_output_is_a_single_line():
    rows = [{"archive": "a", "state": "quiet", "detail": "x", "n": 1},
            {"archive": "b", "state": "quiet", "detail": "y", "n": 2}]
    out = SC.render(rows)
    assert len(out.splitlines()) == 1
    assert "nothing has crossed" in out


def test_a_crossed_threshold_names_the_archive():
    rows = [{"archive": "a", "state": "quiet", "detail": "x", "n": 1},
            {"archive": "market_snapshots", "state": "ESCALATE", "detail": "z", "n": 30}]
    out = SC.render(rows)
    assert "market_snapshots" in out
    assert "1 of 2" in out



# ── THE CALIBRATION-DRIFT ROW ───────────────────────────────────────────────

def test_a_drifted_calibration_escalates(tmp_path, monkeypatch):
    """The survival bias has been known for weeks in a test assertion, where
    nothing could read it and nothing noticed if it got worse. This row is the
    watcher; it must be able to fire."""
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    (d / "calibration_readings.json").write_text(json.dumps({"readings": [
        {"component": "survival", "status": "drifted_worse", "drift_pp": 26},
    ]}))
    row = SC.check_calibration_drift()
    assert row["state"] == "ESCALATE", row
    assert "nothing has applied it" in row["detail"]


def test_a_calibration_within_its_floor_stays_quiet(tmp_path, monkeypatch):
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    (d / "calibration_readings.json").write_text(json.dumps({"readings": [
        {"component": "survival", "status": "within_floor"},
    ]}))
    assert SC.check_calibration_drift()["state"] == "quiet"


def test_no_readings_names_the_known_bias_rather_than_going_silent(tmp_path, monkeypatch):
    """A row that says only 'nothing yet' loses the fact that a KNOWN,
    UNCORRECTED bias is sitting under VONA. It names it every week instead."""
    monkeypatch.setattr(SC, "ROOT", tmp_path)
    row = SC.check_calibration_drift()
    assert row["state"] == "quiet"
    assert "15-57%" in row["detail"]

# ── PARKING IS A DEADLINE, NOT A MUTE ───────────────────────────────────────

def test_a_parked_row_is_quiet_before_its_date(monkeypatch):
    monkeypatch.setattr(SC, "PARKED", {"x": ("2099-01-01", "because")})
    row = SC._apply_parking(SC._row("x", "BLIND", "unreadable"))
    assert row["state"] == "quiet"
    assert "PARKED until 2099-01-01" in row["detail"]
    assert "Blind because: unreadable" in row["detail"]   # the reason survives


def test_a_parked_row_escalates_once_its_date_passes(monkeypatch):
    monkeypatch.setattr(SC, "PARKED", {"x": ("2020-01-01", "because")})
    row = SC._apply_parking(SC._row("x", "BLIND", "unreadable"))
    assert row["state"] == "BLIND"
    assert "THAT DATE HAS PASSED" in row["detail"]


def test_an_unparked_blind_row_escalates_immediately(monkeypatch):
    monkeypatch.setattr(SC, "PARKED", {})
    assert SC._apply_parking(SC._row("x", "BLIND", "gone"))["state"] == "BLIND"


def test_parking_never_silences_a_check_that_crashed(monkeypatch):
    """A parked archive is one we understand. A check that threw is not, so
    parking must not reach it — otherwise a crash inside a parked row's own
    reader would be reported as a quiet, well-understood park."""
    def boom():
        raise RuntimeError("x")
    boom.__name__ = "pred_ledger"
    monkeypatch.setattr(SC, "CHECKS", [boom])
    monkeypatch.setattr(SC, "PARKED", {"pred_ledger": ("2099-01-01", "because")})
    assert SC.run()[0]["state"] == "BLIND"


def test_every_parked_archive_is_one_a_check_actually_reports():
    """A park for an archive nobody checks is a note that will never expire."""
    names = {r["archive"] for r in SC.run()}
    assert set(SC.PARKED).issubset(names), set(SC.PARKED) - names

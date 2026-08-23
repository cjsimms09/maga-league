# TERRITORY: C
"""Capture cron health -- register: page-turn dispatch, item 6 ("register
155's class must never need a human to notice again"). The
external_adp_series.json extractor test uses the real committed store's
own date-only `observed_at` shape (verified by hand before writing the
extractor, rule 3f) -- not an invented format.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import capture_cron_health as CCH  # noqa: E402


def test_parse_timestamp_handles_a_full_iso_datetime():
    dt = CCH.parse_timestamp("2026-08-20T12:00:00Z")
    assert dt.year == 2026 and dt.month == 8 and dt.day == 20
    assert dt.tzinfo is not None


def test_parse_timestamp_handles_a_real_date_only_string():
    # THE REAL SHAPE: external_adp_series.json's `observed_at` is
    # "2026-08-17", not a full datetime -- verified against the live file.
    dt = CCH.parse_timestamp("2026-08-17")
    assert dt.year == 2026 and dt.month == 8 and dt.day == 17
    assert dt.tzinfo is not None  # naive result stamped UTC, comparable to `now`


def test_parse_timestamp_returns_none_for_garbage():
    assert CCH.parse_timestamp("") is None
    assert CCH.parse_timestamp(None) is None
    assert CCH.parse_timestamp("not a date") is None


def test_latest_series_entry_extracts_the_real_shape():
    extractor = CCH._latest_series_entry("series", "observed_at")
    doc = {"series": [{"observed_at": "2026-08-11"}, {"observed_at": "2026-08-17"}]}
    assert extractor(doc) == "2026-08-17"  # the LAST entry, not sorted again


def test_latest_series_entry_returns_none_on_empty_series():
    extractor = CCH._latest_series_entry("series", "observed_at")
    assert extractor({"series": []}) is None
    assert extractor({}) is None


def test_is_healthy_accepts_ok_and_pending_rejects_everything_else():
    assert CCH.is_healthy("OK") is True
    assert CCH.is_healthy("OK (no timestamp field)") is True
    assert CCH.is_healthy("PENDING (preseason-gated)") is True
    assert CCH.is_healthy("STALE") is False
    assert CCH.is_healthy("MISSING") is False
    assert CCH.is_healthy("CONTROL_FAILED") is False


# ── real fail arm: a genuinely stale file must be caught, not just a
#    currently-passing check (rule 3e) ──────────────────────────────────

def test_check_store_flags_a_genuinely_stale_file(tmp_path, monkeypatch):
    monkeypatch.setattr(CCH, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    (d / "external_adp_series.json").write_text(json.dumps(
        {"series": [{"observed_at": "2026-08-01"}]}))
    spec = CCH.MANIFEST["external_adp_series"]
    now = datetime(2026, 8, 20, tzinfo=timezone.utc)
    result = CCH.check_store("external_adp_series", spec, now)
    assert result["status"] == "STALE"
    assert result["age_days"] > 15


def test_check_store_passes_a_genuinely_fresh_file(tmp_path, monkeypatch):
    monkeypatch.setattr(CCH, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    (d / "external_adp_series.json").write_text(json.dumps(
        {"series": [{"observed_at": "2026-08-20"}]}))
    spec = CCH.MANIFEST["external_adp_series"]
    now = datetime(2026, 8, 20, 12, tzinfo=timezone.utc)
    result = CCH.check_store("external_adp_series", spec, now)
    assert result["status"] == "OK"


def test_check_store_reports_missing_as_a_real_problem_when_not_gated(tmp_path, monkeypatch):
    monkeypatch.setattr(CCH, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    spec = CCH.MANIFEST["external_adp_series"]  # not preseason_gated
    now = datetime(2026, 8, 20, tzinfo=timezone.utc)
    result = CCH.check_store("external_adp_series", spec, now)
    assert result["status"] == "MISSING"


def test_check_store_treats_a_preseason_gated_absence_as_pending_not_a_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(CCH, "ROOT", tmp_path)
    (tmp_path / "draft" / "backtest").mkdir(parents=True)
    spec = CCH.MANIFEST["fp_expert_ranks_weekly"]  # preseason_gated: True
    now = datetime(2026, 8, 20, tzinfo=timezone.utc)
    result = CCH.check_store("fp_expert_ranks_weekly", spec, now)
    assert result["status"] == "PENDING (preseason-gated)"
    assert CCH.is_healthy(result["status"]) is True


def test_check_store_control_only_reports_failure_when_the_control_failed(tmp_path, monkeypatch):
    monkeypatch.setattr(CCH, "ROOT", tmp_path)
    d = tmp_path / "draft" / "backtest"
    d.mkdir(parents=True)
    (d / "player_bio_capital.json").write_text(json.dumps(
        {"rule_3e_control": {"ok": False}}))
    spec = CCH.MANIFEST["player_bio_capital"]
    now = datetime(2026, 8, 20, tzinfo=timezone.utc)
    result = CCH.check_store("player_bio_capital", spec, now)
    assert result["status"] == "CONTROL_FAILED"


# ── real integration: against the ACTUAL committed weekly_projection_archive
#    output, whichever week is currently on disk ────────────────────────

def test_run_against_the_real_committed_stores_does_not_crash():
    doc = CCH.run()
    names = {r["name"] for r in doc["results"]}
    # bovada_closing_line_cadence is a special-case check outside the
    # single-timestamp MANIFEST pattern (Cory's in-season queue item 5) --
    # every MANIFEST name must appear, plus that one extra.
    assert names == set(CCH.MANIFEST) | {"bovada_closing_line_cadence"}
    assert "checked_at" in doc


# ── bovada_closing_line_cadence (Cory's in-season queue item 5) ──────────

def _write_bovada_jsonl(tmp_path, monkeypatch, rows):
    monkeypatch.setattr(CCH, "ROOT", tmp_path)
    d = tmp_path / "draft" / "data"
    d.mkdir(parents=True)
    path = d / "bovada_lines_2026.jsonl"
    with path.open("w") as f:
        for ts in rows:
            f.write(json.dumps({"ts": ts, "game": "X @ Y"}) + "\n")
    return path


def test_check_bovada_cadence_ok_when_both_days_present_and_capture_is_old_enough(tmp_path, monkeypatch):
    # An old anchor row (establishes the capture existed well before the
    # window, clearing bootstrap grace) plus a real recent Thursday
    # (2026-08-13) and Sunday (2026-08-16) inside the trailing window.
    _write_bovada_jsonl(tmp_path, monkeypatch,
                        ["2026-07-01T12:00:00Z",
                        "2026-08-13T12:00:00Z", "2026-08-16T16:00:00Z"])
    now = datetime(2026, 8, 20, tzinfo=timezone.utc)
    result = CCH.check_bovada_cadence(CCH.BOVADA_PATH, now)
    assert result["status"] == "OK"


def test_check_bovada_cadence_flags_a_genuinely_missing_thursday(tmp_path, monkeypatch):
    # THE REAL INCIDENT this pins: a capture old enough to have had a real
    # Thu+Sun cycle, but only Sunday snapshots landed -- a real gap, not a
    # bootstrap artifact. Two Sundays, spread across weeks so the capture's
    # own age clears the bootstrap grace, no Thursday anywhere.
    _write_bovada_jsonl(tmp_path, monkeypatch,
                        ["2026-08-02T16:00:00Z", "2026-08-09T16:00:00Z",
                        "2026-08-16T16:00:00Z"])
    now = datetime(2026, 8, 20, tzinfo=timezone.utc)
    result = CCH.check_bovada_cadence(CCH.BOVADA_PATH, now)
    assert result["status"] == "STALE"
    assert "Thursday" in result["detail"]


def test_check_bovada_cadence_bootstrap_grace_does_not_false_positive_a_new_capture(tmp_path, monkeypatch):
    # THE REAL INCIDENT this pins directly: bovada-lines-capture.yml's own
    # first real Actions history (checked 2026-08-23) has exactly one
    # `event: schedule` run ever (Sunday) and zero Thursday runs, because
    # the workflow was merged to main only days earlier and has not seen
    # its first real Thursday yet. That is correctly PENDING, not STALE.
    _write_bovada_jsonl(tmp_path, monkeypatch, ["2026-08-23T16:13:11Z"])
    now = datetime(2026, 8, 23, 20, 0, tzinfo=timezone.utc)
    result = CCH.check_bovada_cadence(CCH.BOVADA_PATH, now)
    assert result["status"] == "PENDING (bootstrap grace)"


def test_check_bovada_cadence_missing_file_is_a_real_problem(tmp_path, monkeypatch):
    monkeypatch.setattr(CCH, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    now = datetime(2026, 8, 20, tzinfo=timezone.utc)
    result = CCH.check_bovada_cadence(CCH.BOVADA_PATH, now)
    assert result["status"] == "MISSING"

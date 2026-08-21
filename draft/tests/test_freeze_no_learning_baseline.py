"""Tests for draft/tools/freeze_no_learning_baseline.py — P298's control.

THE POINT OF THIS FILE: a drift detector that has never detected drift is
indistinguishable from one that cannot (Rule 3e). The committed freeze
correctly reports zero drift today, which is exactly the shape a completely
broken detector would also produce. So the tests below plant real changes and
require the verifier to FIRE on each of them.

This is not hypothetical here: the verifier's first live run reported drift in
`model_config_v5` seconds after the freeze was taken, when the true answer was
necessarily zero. Cause was tuple-vs-list after the JSON round-trip. Left in,
the control would have shown permanent false drift and a real change would have
been invisible against it. `test_KNOWN_NEGATIVE_*` pins that fix.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import freeze_no_learning_baseline as F  # noqa: E402

FREEZE = ROOT / "draft" / "data" / "frozen_no_learning_baseline_2026.json"


def _doc() -> dict:
    return json.loads(FREEZE.read_text())


# ── the artifact ──────────────────────────────────────────────────────────

def test_the_freeze_exists_and_is_dated_the_day_the_rule_was_ruled():
    """P298 says 'weights and logic as of 08-21'. A freeze relabelled by a
    later rerun would be a different control than the one Cory ruled."""
    d = _doc()
    assert d["frozen_as_of"] == "2026-08-21"
    assert F.FROZEN_AS_OF == "2026-08-21"


def test_the_freeze_captures_the_arm_set_BY_VALUE_not_by_reference():
    """The snapshot must survive A's modules changing — that is the whole
    point of a control."""
    s = _doc()["state"]
    assert [a["name"] for a in s["arms"]] == [
        "v1", "v1_tilt150", "v1_tilt050", "v1_notilt", "v1_pg16"]
    assert s["champion"]["arm"] == "v1"
    assert set(s["model_config_v5"]) == {"QB", "RB", "WR", "TE"}
    # a real weight, spot-checked, so an empty-but-well-shaped freeze fails
    assert s["model_config_v5"]["WR"]["volume"] == "share"
    assert s["model_config_v5"]["QB"]["volume"] == "raw"


def test_the_payload_hash_matches_its_own_contents():
    d = _doc()
    recomputed = F._sha({k: v for k, v in d.items() if k != "_sha256_of_payload"})
    assert d["_sha256_of_payload"] == recomputed


def test_the_artifact_says_in_its_own_text_that_it_must_not_be_tuned():
    """P298: the frozen arm never retires and never absorbs a finding. If that
    warning is ever dropped, someone will 'improve' the control."""
    d = _doc()
    warning = d["_this_is_a_control_not_a_competitor"].lower()
    #: assert the SUBSTANCE, not a word that happens to sit in the key name —
    #: the first version of this test checked for "control" and failed, because
    #: that word is in the key, not the warning text.
    assert "do not promote it" in warning and "tune it" in warning
    assert "never retires" in warning
    assert "P298" in d["_authority"]


# ── the verifier: it must FIRE, not just pass ─────────────────────────────

def test_KNOWN_NEGATIVE_a_freshly_taken_freeze_reports_ZERO_drift():
    """The tuple-vs-list regression. If this breaks, the control reports
    permanent false drift and real drift becomes invisible."""
    r = F.verify(FREEZE)
    assert r["exists"] and r["hash_ok"]
    assert r["drift"] == {}, f"false drift: {r['drift_keys']}"


def test_KNOWN_POSITIVE_the_verifier_DETECTS_a_changed_weight(tmp_path):
    """Plant a real change in the frozen copy and require it to be caught."""
    d = _doc()
    d["state"]["model_config_v5"]["WR"]["vg"] = 0.99          # was 0.5
    d["_sha256_of_payload"] = F._sha(
        {k: v for k, v in d.items() if k != "_sha256_of_payload"})
    p = tmp_path / "planted.json"
    p.write_text(json.dumps(d))
    r = F.verify(p)
    assert r["hash_ok"], "hash should still be self-consistent"
    assert "model_config_v5" in r["drift_keys"], r["drift_keys"]


def test_KNOWN_POSITIVE_the_verifier_DETECTS_an_added_or_removed_arm(tmp_path):
    """The failure mode that matters most: the arm set growing as the season
    learns. If this is not caught, the control silently becomes a competitor."""
    d = _doc()
    d["state"]["arms"].append({"name": "v2_usage", "divisor": 17, "tilt_scale": 1.0})
    d["_sha256_of_payload"] = F._sha(
        {k: v for k, v in d.items() if k != "_sha256_of_payload"})
    p = tmp_path / "extra_arm.json"
    p.write_text(json.dumps(d))
    assert "arms" in F.verify(p)["drift_keys"]


def test_KNOWN_POSITIVE_the_verifier_DETECTS_a_tampered_artifact(tmp_path):
    """Editing the freeze without recomputing the hash must be caught — that
    is a different failure from drift and is reported separately."""
    d = _doc()
    d["state"]["champion"]["arm"] = "v1_tilt150"
    p = tmp_path / "tampered.json"
    p.write_text(json.dumps(d))          # hash deliberately NOT recomputed
    r = F.verify(p)
    assert r["hash_ok"] is False, "a silent edit slipped past the hash"


def test_a_missing_freeze_is_reported_as_missing_not_as_passing(tmp_path):
    r = F.verify(tmp_path / "nope.json")
    assert r["exists"] is False
    assert r["hash_ok"] is None, "absence must not read as a pass"

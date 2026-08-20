# TERRITORY: C
"""weekly_projection_archive — pure logic (fingerprint, raw_and_scored,
build_archive_doc) tested against SYNTHETIC fixtures shaped exactly like
the real sources. join_by_sleeper_id/sleeper_rows are
external_source_projections.py's own (rule 11, imported unmodified) and
already covered by that file's context — this file tests the NEW glue:
raw-beside-scored assembly, change detection, and the archive doc shape.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import weekly_projection_archive as WPA  # noqa: E402
import adp as ADP  # noqa: E402

SCORING = {"pass_yd": 0.04, "pass_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
          "rec_yd": 0.1, "rec": 0.5}

SLEEPER_PLAYERS = {
    "101": {"full_name": "Puka Nacua", "position": "WR", "team": "LAR", "search_rank": 10},
    "102": {"full_name": "Amon-Ra St. Brown", "position": "WR", "team": "DET", "search_rank": 12},
}
NAME_IDX = ADP.build_index(SLEEPER_PLAYERS)

SLEEPER_STATS = {
    "101": {"rec": 6.5, "rec_yd": 78.5},
    "102": {"rec": 7.0, "rec_yd": 82.5},
}

FP_ROWS = [
    {"name": "Puka Nacua", "position": "WR", "team": "LAR",
     "stats": {"rec": 6.0, "rec_yd": 75.0}, "fp_fpts": 13.5},
    {"name": "Amon-Ra St. Brown", "position": "WR", "team": "DET",
     "stats": {"rec": 7.5, "rec_yd": 85.0}, "fp_fpts": 15.0},
]


# ── fingerprint ──────────────────────────────────────────────────────────

def test_fingerprint_deterministic():
    a = WPA.fingerprint({"101": {"rec": 6.5}})
    b = WPA.fingerprint({"101": {"rec": 6.5}})
    assert a == b


def test_fingerprint_changes_on_different_data():
    a = WPA.fingerprint({"101": {"rec": 6.5}})
    b = WPA.fingerprint({"101": {"rec": 7.0}})
    assert a != b


def test_fingerprint_order_independent():
    a = WPA.fingerprint({"101": {"rec": 6.5}, "102": {"rec": 7.0}})
    b = WPA.fingerprint({"102": {"rec": 7.0}, "101": {"rec": 6.5}})
    assert a == b


# ── raw_and_scored ───────────────────────────────────────────────────────

def test_raw_and_scored_keeps_both():
    out = WPA.raw_and_scored(SLEEPER_STATS, SCORING)
    assert out["101"]["raw"] == {"rec": 6.5, "rec_yd": 78.5}
    want = 6.5 * 0.5 + 78.5 * 0.1
    assert out["101"]["scored"] == pytest.approx(round(want, 2), abs=1e-6)


def test_raw_and_scored_skips_empty_stat_lines():
    out = WPA.raw_and_scored({"999": {}, "101": SLEEPER_STATS["101"]}, SCORING)
    assert "999" not in out
    assert "101" in out


# ── build_archive_doc ────────────────────────────────────────────────────

def test_build_archive_doc_shape():
    doc = WPA.build_archive_doc(2026, 3, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "draft/data/weekly_own/x.json", True)
    assert doc["season"] == 2026
    assert doc["week"] == 3
    assert doc["own_weekly_ref"] == {"path": "draft/data/weekly_own/x.json",
                                     "exists": True}


def test_build_archive_doc_joins_both_sources():
    doc = WPA.build_archive_doc(2026, 3, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False)
    assert set(doc["sleeper_weekly"]) == {"101", "102"}
    assert set(doc["fantasypros_weekly"]) == {"101", "102"}


def test_build_archive_doc_fp_side_keeps_raw_and_fpts_cross_check():
    doc = WPA.build_archive_doc(2026, 3, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False)
    row = doc["fantasypros_weekly"]["101"]
    assert row["raw"] == {"rec": 6.0, "rec_yd": 75.0}
    assert row["fp_fpts"] == 13.5           # cross-check, not the scored value
    assert row["scored"] != row["fp_fpts"]  # our conversion, not the vendor's


def test_build_archive_doc_no_prior_fingerprints_no_findings():
    doc = WPA.build_archive_doc(2026, 1, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False, prior_fingerprints=None)
    assert doc["findings"] == []


def test_build_archive_doc_unchanged_sleeper_payload_is_a_finding():
    sleeper_hash = WPA.fingerprint(SLEEPER_STATS)
    doc = WPA.build_archive_doc(2026, 4, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False,
                                prior_fingerprints={"sleeper": sleeper_hash,
                                                    "fantasypros": "different"})
    assert len(doc["findings"]) == 1
    assert "sleeper_weekly" in doc["findings"][0]
    assert "UNCHANGED" in doc["findings"][0]


def test_build_archive_doc_both_unchanged_two_findings():
    fp_raw = {"101": FP_ROWS[0]["stats"], "102": FP_ROWS[1]["stats"]}
    sleeper_hash = WPA.fingerprint(SLEEPER_STATS)
    fp_hash = WPA.fingerprint(fp_raw)
    doc = WPA.build_archive_doc(2026, 4, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False,
                                prior_fingerprints={"sleeper": sleeper_hash,
                                                    "fantasypros": fp_hash})
    assert len(doc["findings"]) == 2


def test_build_archive_doc_diagnostics_present():
    doc = WPA.build_archive_doc(2026, 3, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False)
    assert doc["diagnostics"]["joined_rows"] == 2


def test_reuses_external_source_projections_functions_not_reimplemented():
    # rule 11 pin -- these must be the SAME function objects, not copies
    import external_source_projections as ESP
    assert WPA.join_by_sleeper_id is ESP.join_by_sleeper_id
    assert WPA.sleeper_rows is ESP.sleeper_rows

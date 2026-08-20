# TERRITORY: C
"""Pins the 2025-specific behavior of clay_projections.py -- the parts that
differ from the 2026 edition already covered in test_clay_projections.py:
no Kicker section, and no Sleeper-agreement check against a board from a
different year.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import clay_projections as C  # noqa: E402


def _doc():
    return C.build_store(2025)


def test_known_positive_2025_gibbs():
    doc = _doc()
    g = next(p for p in doc["players"].values() if p["clay_name"] == "Jahmyr Gibbs")
    assert g["raw_stats"]["ru_yds"] == 1153.0
    assert g["raw_stats"]["rec"] == 60.0


def test_no_kicker_section_is_zero_rows_not_a_crash():
    doc = _doc()
    assert doc["coverage"]["kickers"] == 0
    assert doc["kickers"] == {}


def test_sleeper_agreement_is_explicitly_skipped_not_silently_wrong():
    doc = _doc()
    a = doc["agreement_vs_sleeper_spearman"]
    assert a["spearman"] is None
    assert a["n"] == 0
    assert "why_skipped" in a


def test_coverage_matches_the_known_2025_page_counts():
    doc = _doc()
    assert doc["coverage"]["by_position"] == {"QB": 40, "RB": 116, "WR": 179, "TE": 80}


def test_crosswalk_note_present_for_a_non_current_year():
    doc = _doc()
    assert doc["crosswalk_note"] is not None


def test_positional_plausibility_still_holds_on_2025():
    doc = _doc()
    assert doc["positional_plausibility_violations"] == []


def test_2026_store_is_unaffected_by_building_2025():
    # both years share BOARD/lookup_board/etc -- building 2025 must not leak
    # state into the 2026 store or its own known-positive control.
    doc26 = C.main()
    assert doc26["coverage"]["by_position"] == {"QB": 40, "RB": 111, "WR": 187, "TE": 80}

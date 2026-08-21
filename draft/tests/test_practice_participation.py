# TERRITORY: C
"""Practice-participation store — source-hunt item 2. Fixtures use the real
2024 shapes verified by hand before this module was written (rule 3f): a
real Full/Limited/DNP triple, the real whitespace-garbage artifact
('\\n    ', 36 real 2024 rows), and the real Xavier Weaver known-positive.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import practice_participation as PP  # noqa: E402

CROSSWALK = {"00-0039521": "7146"}  # Xavier Weaver's real gsis/sleeper pair


def test_build_week_maps_all_three_real_status_strings():
    rows = [
        {"gsis_id": "a", "practice_status": "Full Participation in Practice"},
        {"gsis_id": "b", "practice_status": "Limited Participation in Practice"},
        {"gsis_id": "c", "practice_status": "Did Not Participate In Practice"},
    ]
    crosswalk = {"a": "1", "b": "2", "c": "3"}
    out, unmatched = PP.build_week(rows, crosswalk)
    assert out == {"1": "FP", "2": "LP", "3": "DNP"}
    assert unmatched == set()


def test_build_week_excludes_the_real_whitespace_garbage_artifact():
    rows = [{"gsis_id": "a", "practice_status": "\n    "}]
    out, unmatched = PP.build_week(rows, {"a": "1"})
    assert out == {}
    assert unmatched == set()  # excluded by status, not by a failed crosswalk


def test_build_week_excludes_note_same_as_the_sibling_module():
    rows = [{"gsis_id": "a", "practice_status": "Note"}]
    out, unmatched = PP.build_week(rows, {"a": "1"})
    assert out == {}


def test_build_week_lists_unmatched_gsis_rather_than_dropping():
    rows = [{"gsis_id": "unknown-gsis", "practice_status": "Full Participation in Practice"}]
    out, unmatched = PP.build_week(rows, {})
    assert out == {}
    assert "unknown-gsis" in unmatched


def test_build_season_filters_to_reg_and_buckets_by_week():
    rows = [
        {"game_type": "REG", "week": 1, "gsis_id": "a",
         "practice_status": "Did Not Participate In Practice"},
        {"game_type": "POST", "week": 1, "gsis_id": "a",
         "practice_status": "Did Not Participate In Practice"},
    ]
    season_doc = PP.build_season(2024, rows, {"a": "1"})
    assert season_doc["weeks"] == {"1": {"1": "DNP"}}


def test_verify_known_positive_passes_on_the_real_fixture():
    doc = {"by_season": {"2024": {"1": {"7146": "DNP"}}}}
    control = PP.verify_known_positive(doc)
    assert control["ok"] is True


def test_verify_known_positive_fails_on_a_broken_pipeline():
    doc = {"by_season": {"2024": {"1": {"7146": "FP"}}}}  # wrong code
    control = PP.verify_known_positive(doc)
    assert control["ok"] is False


# ── real end-to-end, against a live nflverse fetch ──────────────────────────

def test_run_against_the_real_nflverse_source():
    doc = PP.run(seasons=(2024,))
    assert doc["rule_3e_control"]["ok"] is True
    assert doc["population"]["total_designations"] > 0
    # real measured shape: FP/LP/DNP only, no fourth code ever appears
    codes_seen = {c for wk in doc["by_season"]["2024"].values() for c in wk.values()}
    assert codes_seen <= {"FP", "LP", "DNP"}

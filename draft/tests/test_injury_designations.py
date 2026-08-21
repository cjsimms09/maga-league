# TERRITORY: C
"""Historical injury designations 2021-25 -- register: relay's 08-20
dispatch, "two more" ASK 1. Real fixture (Xavier Weaver, week 1 2024)
copied verbatim from the live nflverse injuries release, checked by hand
before writing this file (rule 3f).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import injury_designations as ID  # noqa: E402


CROSSWALK = {"00-0039521": "11921"}  # Xavier Weaver

# ── real row, 2024 week 1, nflverse injuries release ────────────────────────
WEAVER_ROW = {"season": 2024, "game_type": "REG", "week": 1,
             "gsis_id": "00-0039521", "report_status": "Out"}


def test_build_week_resolves_the_real_weaver_out_designation():
    week_out, unmatched = ID.build_week([WEAVER_ROW], CROSSWALK)
    assert week_out == {"11921": "O"}
    assert unmatched == set()


def test_build_week_maps_all_three_real_status_values():
    rows = [
        {**WEAVER_ROW, "report_status": "Questionable"},
        {**WEAVER_ROW, "gsis_id": "00-0000002", "report_status": "Doubtful"},
        {**WEAVER_ROW, "gsis_id": "00-0000003", "report_status": "Out"},
    ]
    cw = {**CROSSWALK, "00-0000002": "2", "00-0000003": "3"}
    week_out, _ = ID.build_week(rows, cw)
    assert week_out == {"11921": "Q", "2": "D", "3": "O"}


def test_build_week_excludes_the_real_note_rows_not_a_real_designation():
    # THE REAL ROW: a 2024 "Note" status is informational ("cleared
    # concussion protocol and does not have a game status"), not a real
    # designation -- must not be mapped to a fourth code.
    row = {**WEAVER_ROW, "report_status": "Note"}
    week_out, unmatched = ID.build_week([row], CROSSWALK)
    assert week_out == {}
    assert unmatched == set()


def test_build_week_excludes_a_row_with_no_status_at_all():
    row = {**WEAVER_ROW, "report_status": None}
    week_out, _ = ID.build_week([row], CROSSWALK)
    assert week_out == {}


def test_build_week_lists_an_unresolved_gsis_rather_than_dropping():
    row = {**WEAVER_ROW, "gsis_id": "00-9999999"}
    week_out, unmatched = ID.build_week([row], CROSSWALK)
    assert week_out == {}
    assert unmatched == {"00-9999999"}


def test_build_season_filters_to_reg_season_only():
    rows = [WEAVER_ROW, {**WEAVER_ROW, "game_type": "WC", "week": 19}]
    doc = ID.build_season(2024, rows, CROSSWALK)
    assert set(doc["weeks"]) == {"1"}  # the WC row is excluded


def test_build_store_reports_total_designations():
    per_season = {2024: ID.build_season(2024, [WEAVER_ROW], CROSSWALK)}
    doc = ID.build_store(per_season)
    assert doc["population"]["total_designations"] == 1
    assert doc["by_season"]["2024"]["1"]["11921"] == "O"


# ── rule 3e control: real fixture, real fail arm ─────────────────────────

def test_verify_known_positive_matches_the_real_weaver_row():
    per_season = {2024: ID.build_season(2024, [WEAVER_ROW], CROSSWALK)}
    doc = ID.build_store(per_season)
    control = ID.verify_known_positive(doc)
    assert control["ok"] is True
    assert control["designations_that_week"] == 1


def test_verify_known_positive_is_a_real_fail_arm():
    doc = {"by_season": {"2024": {"1": {}}}}  # nobody matched at all
    control = ID.verify_known_positive(doc)
    assert control["ok"] is False

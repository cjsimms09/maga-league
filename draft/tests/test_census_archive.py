# TERRITORY: C
"""CAPTURE MUST NOT LOSE A ROW. Every mutation here destroys history."""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
import census_archive as CA  # noqa: E402

REP = {"season": 2026, "observed_at": "2026-08-12", "examined": 138, "matched": 0,
       "rejected_by_reason": {"F1.teams": 29},
       "crosswalk": {"pooled_rate": 0.97},
       "format_census": {"readable_leagues": 120, "teams": {"12": 71},
                         "pass_td_points": {"4 (market standard)": 49, "6 (OURS)": 33},
                         "reception_points": {}, "superflex": {}, "draft_type": {},
                         "keeper_type": {}}}


def test_the_census_row_carries_the_passing_TD_prevalence():
    """The number Cory named: computed on every run, printed on none, saved on none.
    MUTATION: drop it from the row and the one field the capture audit called out by
    name is the one that still is not archived."""
    doc = CA.append(REP, path="/nonexistent/x.json")
    assert doc["series"][0]["pass_td_points"]["6 (OURS)"] == 33


def test_a_SECOND_run_the_same_day_REPLACES_rather_than_doubling():
    """MUTATION: append unconditionally. A re-run silently doubles the weight of
    whichever day someone happened to re-run, and the series stops being one row per
    pool observation."""
    doc = CA.append(REP, path="/nonexistent/x.json")
    tmp = Path("/tmp/claude-census-test.json"); tmp.write_text(json.dumps(doc))
    again = CA.append(REP, path=str(tmp))
    assert len(again["series"]) == 1
    tmp.unlink()


def test_a_DIFFERENT_day_is_a_NEW_row():
    doc = CA.append(REP, path="/nonexistent/x.json")
    tmp = Path("/tmp/claude-census-test2.json"); tmp.write_text(json.dumps(doc))
    r2 = dict(REP); r2["observed_at"] = "2026-08-13"
    again = CA.append(r2, path=str(tmp))
    assert len(again["series"]) == 2
    tmp.unlink()


def test_an_UNREADABLE_series_RAISES_rather_than_starting_fresh():
    """The one failure this archive cannot survive. MUTATION: swallow the error and
    start a new document — every prior row is destroyed by a single corrupt write,
    silently, and the loss is only visible years later when the series is wanted."""
    tmp = Path("/tmp/claude-census-bad.json"); tmp.write_text("{not json")
    with pytest.raises(ValueError):
        CA.append(REP, path=str(tmp))
    tmp.unlink()


def test_the_archive_carries_its_own_field_population():
    """Cory's ruling, 2026-08-12: a durable record states which fields are populated.

    The concrete failure this closes IN THIS FILE: `keeper_type` was absent from the
    census row for a week and nothing said so. A field that stops being emitted now
    drops off 100% in a number sitting beside the rows.
    """
    doc = CA.append({"season": 2026, "observed_at": "2026-08-12", "examined": 10,
                  "matched": 0,
                  "format_census": {"readable_leagues": 9, "teams": {"12": 9},
                                    "keeper_type": {"none": 9}}},
                 path="/nonexistent/census.json")
    pop = doc["population"]
    assert pop["rows"] == 1
    assert pop["fields"]["keeper_type"]["pct"] == 100.0
    # and the fields this run could not fill are NAMED, not silently dropped
    assert "pass_td_points" in pop["fields"]
    assert "pass_td_points" in pop["empty"]


def test_a_field_the_writer_STOPS_emitting_is_still_named():
    """The case the declared list exists for, and the one that actually happened.

    Found by a surviving mutation. `keeper_type` was absent from the census row for a
    week. If the declared field list is derived from the row being written, dropping a
    field also drops it from the record — the archive then looks complete because the
    only witness to the missing field was the missing field.
    """
    # A census file written BEFORE `keeper_type` existed on the row.
    tmp = Path("/tmp/claude-census-legacy.json")
    tmp.write_text(json.dumps({
        "version": "format-census-series/v1",
        "series": [{"observed_at": "2026-08-01", "season": 2026, "examined": 5}]}))
    doc = CA.append({"season": 2026, "observed_at": "2026-08-12"}, path=str(tmp))
    kt = doc["population"]["fields"]["keeper_type"]
    assert kt["missing"] == 1                 # the legacy row never had the key
    assert "keeper_type" in doc["population"]["empty"]
    tmp.unlink()


def test_the_declared_field_list_cannot_drift_from_the_row():
    """Forces an update rather than letting a new field slip in unrecorded."""
    doc = CA.append({"season": 2026, "observed_at": "2026-08-12"},
                    path="/nonexistent/census.json")
    assert list(doc["series"][0]) == CA.CENSUS_FIELDS

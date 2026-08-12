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

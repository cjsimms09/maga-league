# TERRITORY: C
"""EVERY SOURCE'S OWN PRICE MUST SURVIVE THE MERGE THAT REPLACES IT.

A's finding: `adp_series.json` stores the MERGED price with no source field, so
every day we record what the anchor said and destroy what every other source said.
`merge_primary_over_ffc` overwrites 211 of FFC's 215 prices — 144 of them inside
the draftable board, including Allen, Lamar, Burrow, Maye, Daniels, Hurts, Herbert
and Prescott — and none of that is recoverable, because neither provider serves ADP
as of a past date.

So the anchor question ("does FFC actually price quarterbacks earlier, and by how
much") is not answerable from anything on disk, and would not have been next
August either. These assertions are about keeping the alternatives, not about
choosing between them.

Run: python3 -m pytest draft/tests/test_external_source_capture.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_source_capture as S  # noqa: E402

POS = {"1": "QB", "2": "QB", "3": "RB", "4": "WR"}


def test_TWO_SOURCES_ON_ONE_DAY_ARE_BOTH_KEPT():
    """THE WHOLE POINT. A merge keeps one price; this keeps both.

    MUTATION: key the dedupe on (year, date) without the SOURCE — the second
    source overwrites the first, the file looks healthy with one row per day, and
    the comparison this exists for becomes impossible again."""
    ser = S.append_day([], "ffc", 2026, "2026-08-14", {"1": 20.0})
    ser = S.append_day(ser, "fantasypros", 2026, "2026-08-14", {"1": 35.0})
    assert len(ser) == 2, ser
    assert {s["source"] for s in ser} == {"ffc", "fantasypros"}
    assert {s["rows"]["1"] for s in ser} == {20.0, 35.0}


def test_a_SAME_DAY_RERUN_REPLACES_rather_than_doubling():
    """A retried workflow must not create two boards for one source-day; a
    duplicated day is indistinguishable from two real observations downstream.

    MUTATION: append unconditionally — a retry doubles the day and every median
    computed over it is silently weighted toward whichever source retried."""
    ser = S.append_day([], "ffc", 2026, "2026-08-14", {"1": 20.0})
    ser = S.append_day(ser, "ffc", 2026, "2026-08-14", {"1": 21.0, "2": 40.0})
    assert len(ser) == 1 and ser[0]["rows"] == {"1": 21.0, "2": 40.0}
    assert ser[0]["row_count"] == 2


def test_the_FETCH_PARAMETERS_TRAVEL_WITH_THE_PRICES():
    """A price without its format is not evidence. Half-PPR at ten teams and
    full-PPR at twelve are different quantities wearing the same field name, which
    is the entire reason this file exists.

    MUTATION: drop `params` — a year later nobody can tell whether the FFC column
    was our league size, and the comparison silently compares two formats."""
    ser = S.append_day([], "ffc", 2026, "2026-08-14", {"1": 20.0},
                       params={"format": "half-ppr", "teams": 10, "year": 2026})
    assert ser[0]["params"]["teams"] == 10
    assert ser[0]["params"]["format"] == "half-ppr"


def test_the_DISAGREEMENT_IS_REPORTED_PER_POSITION_not_just_overall():
    """The format difference that matters — 4-point passing TDs against our 6 —
    bites at ONE position, and a whole-board median hides it. That is exactly how
    a QB-shaped effect gets averaged into nothing.

    MUTATION: report the overall median only — a source that prices quarterbacks
    fifteen slots differently and everyone else identically reads as agreeing."""
    ser = S.append_day([], "a", 2026, "2026-08-14",
                       {"1": 20.0, "2": 40.0, "3": 30.0, "4": 50.0})
    ser = S.append_day(ser, "b", 2026, "2026-08-14",
                       {"1": 35.0, "2": 55.0, "3": 31.0, "4": 49.0})
    d = S.disagreement(ser, 2026, "2026-08-14", POS)
    assert d["status"] == "measured"
    pair = d["pairs"]["a->b"]
    assert pair["shared"] == 4
    assert pair["by_position"]["QB"]["median"] == 15.0, pair
    assert abs(pair["by_position"]["RB"]["median"]) <= 1.0
    assert pair["by_position"]["QB"]["n"] == 2


def test_ONE_SOURCE_ON_A_DAY_IS_UNMEASURED_not_agreement():
    """A day with one source is a day on which no comparison can be made. Calling
    that zero disagreement would report perfect agreement from a single opinion.

    MUTATION: return a median of 0 when only one source is present — every day the
    second fetch fails reads as the sources agreeing exactly."""
    ser = S.append_day([], "ffc", 2026, "2026-08-14", {"1": 20.0})
    d = S.disagreement(ser, 2026, "2026-08-14", POS)
    assert d["status"] == "unmeasured", d
    assert d["sources"] == ["ffc"]


def test_a_DAY_MISSING_A_SOURCE_IS_NAMED_not_counted_as_covered():
    """The failure this reports: one source silently stops arriving, the others
    keep coming, the file keeps growing, and the comparison quietly becomes a
    comparison of fewer things.

    MUTATION: count days by date alone — a day where only one of three sources
    landed reads as fully covered."""
    ser = S.append_day([], "ffc", 2026, "2026-08-13", {"1": 20.0})
    ser = S.append_day(ser, "fantasypros", 2026, "2026-08-13", {"1": 35.0})
    ser = S.append_day(ser, "ffc", 2026, "2026-08-14", {"1": 21.0})   # fp missing
    cov = S.coverage(ser, 2026)
    assert cov["days"] == ["2026-08-13", "2026-08-14"]
    assert cov["days_missing_a_source"] == ["2026-08-14"], cov
    assert cov["sources"]["ffc"]["day_count"] == 2
    assert cov["sources"]["fantasypros"]["day_count"] == 1


def test_a_NULL_PRICE_IS_NOT_STORED_AS_A_NUMBER():
    """An absent price and a price of zero are different states, and only one of
    them is a measurement.

    MUTATION: coerce None to 0.0 — a player nobody priced becomes the first pick
    of the draft in every comparison that reads this file."""
    ser = S.append_day([], "ffc", 2026, "2026-08-14", {"1": 20.0, "2": None})
    assert ser[0]["rows"] == {"1": 20.0}
    assert ser[0]["row_count"] == 1


def test_the_SAVED_FILE_ROUND_TRIPS(tmp_path):
    """Written and read by the same module, because an archive nothing can reload
    is a write-only file.

    MUTATION: save without the `series` key — `load` returns empty and every day
    already captured is invisible while the file still looks large on disk."""
    p = tmp_path / "src.json"
    ser = S.append_day([], "ffc", 2026, "2026-08-14", {"1": 20.0},
                       params={"teams": 10})
    S.save(ser, str(p))
    back = S.load(str(p))
    assert len(back) == 1 and back[0]["source"] == "ffc"
    assert back[0]["params"] == {"teams": 10}

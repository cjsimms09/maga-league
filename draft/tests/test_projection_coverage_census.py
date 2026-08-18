# TERRITORY: D
"""THE SHARED POPULATION IS A MEASUREMENT, NOT AN ASSUMPTION.

DEFECT GUARDED: PROJECTION-PROGRAM-2027's bar is "same players and weeks", and
the in-season prompt says a comparison over "whoever each source happened to
cover" is not a comparison. Nobody had the number, so nobody could tell whether
a three-way grade was even well-defined.

It is, and the reason is structural: the universes are perfectly NESTED --
FantasyPros is a strict subset of both Sleeper and of what own_weekly_v1 can
price. These guards fail the moment that stops being true, because the whole
grading design rests on it.

They also pin the two facts a grader must not rediscover the hard way: that
FantasyPros publishes no K/DEF (so a three-way grade structurally cannot
include them), and that 188 players we price are outside any three-way
comparison.

draft/audit/weekly_coverage_row1_2026-08-18.md
Run: python -m pytest draft/tests/test_projection_coverage_census.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CENSUS = ROOT / "draft" / "backtest" / "projection_coverage_census.json"

#: Bands, not point values -- providers add and drop players weekly, and only a
#: STRUCTURAL change (nesting breaking) is a finding.
MIN_SHARED = 300
MIN_SOURCES = 3


def _doc() -> dict:
    return json.loads(CENSUS.read_text())


def test_all_three_universes_were_measured():
    """CONTROL -- with a source missing every assertion below is vacuous."""
    u = _doc()["universes"]
    assert len(u) >= MIN_SOURCES, u
    for src in ("sleeper", "fantasypros", "own_weekly_v1"):
        assert u.get(src, 0) > 0, (src, u)


def test_the_universes_are_nested_so_the_shared_population_is_unambiguous():
    """The load-bearing structural fact. If this breaks, the grading design
    needs a partial-overlap rule that does not currently exist -- which is a
    design decision for A, not something to paper over."""
    n = _doc()["nesting"]
    assert n["fantasypros_subset_of_sleeper"], n
    assert n["fantasypros_subset_of_ours"], n
    assert n["ours_subset_of_sleeper"], n
    assert n["in_fantasypros_not_ours"]["n"] == 0, (
        "FantasyPros now prices players own_weekly_v1 cannot. The shared "
        "population is no longer simply FP's set — read "
        "draft/audit/weekly_coverage_row1_2026-08-18.md before grading."
    )


def test_the_shared_population_is_big_enough_to_grade_and_covers_four_positions():
    s = _doc()["shared_population"]
    assert s["n"] >= MIN_SHARED, s
    assert set(s["by_position"]) == {"QB", "RB", "WR", "TE"}, s["by_position"]
    # The bar is "3 of 4 positions", so every position needs enough rows to
    # carry a verdict on its own.
    assert all(v >= 40 for v in s["by_position"].values()), s["by_position"]


def test_the_shared_population_really_is_a_subset_of_each_universe():
    """KNOWN-POSITIVE CONTROL on the arithmetic: the shares must be consistent
    with the counts, or the census is reporting an intersection it did not
    compute."""
    d = _doc()
    u, s = d["universes"], d["shared_population"]
    assert s["n"] <= min(u["sleeper"], u["fantasypros"], u["own_weekly_v1"])
    assert s["share_of_sleeper"] == pytest.approx(s["n"] / u["sleeper"], abs=1e-3)
    assert s["share_of_fantasypros"] == pytest.approx(s["n"] / u["fantasypros"], abs=1e-3)
    assert s["share_of_ours"] == pytest.approx(s["n"] / u["own_weekly_v1"], abs=1e-3)


def test_k_and_def_are_declared_rather_than_silently_absent():
    """A position nobody prices must be a stated fact with a reason, never an
    empty cell -- the same absent-vs-zero rule the calibration refusal follows."""
    k = _doc()["k_def"]
    assert k["on_board"] > 0, k
    assert k["own_weekly_v1_prices"] == 0, k
    assert k["fantasypros_covers"] == 0, (
        "FantasyPros now publishes K/DEF. A three-way grade could include them, "
        "and own_weekly_v1's QB/RB/WR/TE formula becomes the binding limit."
    )
    assert k["note"], "the reason must travel with the number"


def test_the_secondary_population_is_reported_beside_the_primary_not_instead():
    """The wider two-way set is bigger and flattering; the design must not let
    it quietly become the headline."""
    r = _doc()["recommended_grading_populations"]
    assert r["primary_three_way"]["n"] < r["secondary_two_way_vs_sleeper"]["n"]
    assert r["primary_three_way"]["n"] == _doc()["shared_population"]["n"]
    for v in r.values():
        assert v.get("why"), v


def test_the_limit_and_its_retest_trigger_travel_with_the_number():
    """A season-projection proxy for a weekly universe is a dated claim."""
    d = _doc()
    assert "SEASON" in d["_limit"] and "week 1" in d["_limit"], d["_limit"]
    assert d["measured_from"], d

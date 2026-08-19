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


def test_the_only_reason_we_cannot_price_a_fantasypros_player_is_a_missing_projection():
    """⚠️ REWRITTEN 2026-08-18. The first version asserted FP is a strict subset
    of what we price, and it CAUGHT ITS AUTHOR: that claim was false and this
    test failed on the corrected census. The fix is to the claim, not the guard.

    What is actually true, and is the stronger statement: every FantasyPros
    player we cannot price is explained by ONE cause -- no `proj_ownmodel` on
    the board row, so price_week skips them. If a second cause ever appears,
    that is a new defect and this fails.
    """
    d = _doc()
    n = d["nesting"]
    assert n["fantasypros_subset_of_sleeper"], n
    assert n["ours_subset_of_sleeper"], n

    unpriceable = set(d["silently_dropped_by_price_week"]["in_fantasypros"])
    assert n["in_fantasypros_not_ours"]["n"] == len(unpriceable), (
        "some FantasyPros players are unpriceable for a reason OTHER than a "
        "missing proj_ownmodel. That is a new cause and needs its own row — "
        "see draft/audit/weekly_coverage_row1_2026-08-18.md."
    )


def test_the_silent_drop_is_counted_and_named():
    """The defect the second pass found: price_week names byes and names
    no-line players, and says NOTHING about players it drops for a missing
    proj_ownmodel. A snapshot reader cannot tell "everyone was priced" from
    "117 were dropped". Same shape as `cells_unmeasurable: 0` counting only
    cells that were attempted."""
    s = _doc()["silently_dropped_by_price_week"]
    assert s["n"] > 0, (
        "no board player is missing proj_ownmodel any more. Good — but the "
        "audit doc and the ROUTES entry to A both rest on this being nonzero, "
        "so re-read them before deleting this test."
    )
    assert s["why"], "the reason must travel with the count"
    assert s["by_position"], s
    # The ones that matter are the ones inside a gradeable population.
    assert isinstance(s["in_fantasypros"], list), s
    assert s["named_top"], "the costly ones must be NAMED, not just counted"
    assert all(r.get("name") for r in s["named_top"]), s["named_top"]


def test_ours_matches_price_weeks_actual_population_rule_on_the_live_board():
    """KNOWN-POSITIVE CONTROL on the mirrored rule. The census restates
    price_week's population rule rather than importing it, so it must be
    re-derived from the board here — otherwise a drift in A's module silently
    re-inflates this number, which is exactly the error being corrected."""
    import json as _json
    board = _json.loads((ROOT / "public" / "draft_data.json").read_text())["players"]
    rule = {
        str(p["player_id"]) for p in board
        if p.get("position") in ("QB", "RB", "WR", "TE")
        and p.get("proj_ownmodel") is not None
    }
    d = _doc()
    assert d["universes"]["own_weekly_v1"] == len(rule), (
        d["universes"]["own_weekly_v1"], len(rule))
    # ...and the board's raw skill count must be BIGGER, or the drop is fiction
    skill = {str(p["player_id"]) for p in board
             if p.get("position") in ("QB", "RB", "WR", "TE")}
    assert len(skill) > len(rule), (len(skill), len(rule))
    assert d["silently_dropped_by_price_week"]["on_board_skill"] == len(skill)


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

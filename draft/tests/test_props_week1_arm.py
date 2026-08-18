# TERRITORY: D
"""PROPS-WEEK1 mechanics — the arm's machinery, not its verdict.

Preregistered in draft/backtest/PROPS-WEEK1-PREREG.md; result in
props_week1_arm.json (`clears: false`, but props beat own_v6 on both metrics at
WR and TE — draft/audit/props_week1_arm_2026-08-17.md).

Each test names the defect it guards. The load-bearing one is the corrupt-market
exclusion: the committed week-1 stores predate fetch_historical_props'
AMERICAN_IMPOSSIBLE_BAND guard and carry `any_td` as DECIMAL ODDS rather than
expected touchdowns (2025: 0.80-4.21, median 2.69), which line_to_points prices
at 6.0 each. The first run of this arm included the column and reported MAE
249-362 against own_v6's 23-83 — a 7-10x level error that was a store defect,
not a null. empirical_draft_value.props_ordering() had documented it all along.

Run: python -m pytest draft/tests/test_props_week1_arm.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
sys.path.insert(0, str(ROOT / "draft" / "tools"))
sys.path.insert(0, str(ROOT / "draft"))

import props_week1_arm as W  # noqa: E402

RESULT = ROOT / "draft" / "backtest" / "props_week1_arm.json"

#: A week-1 fixture whose player has BOTH a point-quoted market and the corrupt
#: decimal-odds column, so the two constructions differ by a large, obvious
#: amount rather than a rounding.
FIXTURE = [{"week": 1, "players": {
    "Test Receiver": {"rec": 5.5, "rec_yd": 70.5, "any_td": 2.69},
}}]
SCORING = {"rec": 0.5, "rec_yd": 0.1, "pass_yd": 0.04, "rush_yd": 0.1,
           "pass_td": 4.0, "rec_td": 6.0, "rush_td": 6.0}


def test_the_corrupt_market_stays_excluded():
    """DEFECT GUARDED: re-admitting any_td from stores that predate the
    fetcher's guard. It is decimal odds, not touchdowns, and pricing it at 6.0
    points inflated this arm's projections 7-10x on its first run.
    """
    assert "any_td" in W.CORRUPT_MARKETS

    got = W.season_projection(FIXTURE, SCORING)
    clean = (5.5 * 0.5 + 70.5 * 0.1) * W.GAMES          # 9.80/gm -> 166.6
    assert abs(got["Test Receiver"] - round(clean, 2)) < 0.51, got

    # KNOWN-POSITIVE CONTROL — the assertion above would pass just as happily if
    # season_projection ignored every market. Re-admit the column and require a
    # much larger number, proving the exclusion is doing real work.
    saved = W.CORRUPT_MARKETS
    try:
        W.CORRUPT_MARKETS = ()
        dirty = W.season_projection(FIXTURE, SCORING)
    finally:
        W.CORRUPT_MARKETS = saved
    assert dirty["Test Receiver"] > got["Test Receiver"] * 2, (
        f"including any_td changed the projection from {got} to {dirty} — if "
        "those are close, the column is no longer being priced and this control "
        "no longer proves the exclusion matters")


def test_the_week_one_only_control_can_fail():
    """The entire leak-free basis of this arm is that week-1 lines close before
    any game of the season. A control that could not detect a second week would
    make the whole result worthless, so it is checked in both directions."""
    assert W.control_store_is_week_one_only(FIXTURE)["is_week_one_only"] is True

    two_weeks = FIXTURE + [{"week": 2, "players": {"Test Receiver": {"rec": 4.5}}}]
    bad = W.control_store_is_week_one_only(two_weeks)
    assert bad["is_week_one_only"] is False, (
        "a store containing week 2 was accepted as week-1-only — this arm would "
        "then be measuring the same in-season information as its sibling")
    assert bad["week_numbers"] == [1, 2]


def test_absent_stays_absent():
    """A player carrying ONLY the excluded column has no point-quoted market and
    therefore no projection. He must vanish, never appear at zero — a zero would
    read as 'the market expects nothing from him', which is a measurement."""
    only_corrupt = [{"week": 1, "players": {
        "Ghost": {"any_td": 3.10},
        "Real": {"rec": 4.5, "rec_yd": 55.5},
    }}]
    got = W.season_projection(only_corrupt, SCORING)
    assert "Ghost" not in got, got
    assert "Real" in got and got["Real"] > 0


def test_the_committed_result_records_its_controls_and_its_limits():
    """Row 18's lesson plus this arm's own: a number is not readable without the
    population it was measured over AND the exclusion that shaped it."""
    doc = json.loads(RESULT.read_text())
    assert doc["status"] == "graded"

    c = doc["controls"]["store_is_week_one_only"]
    assert c["is_week_one_only"] is True, "the leak-free basis did not hold"

    ex = doc["excluded_markets"]
    assert "any_td" in ex["markets"]
    for term in ("DECIMAL", "LOWER BOUND"):
        blob = json.dumps(ex)
        assert term in blob, (
            f"the exclusion record no longer says {term!r} — the reason and the "
            "cost must both travel with this artifact, or the WR/TE wins read as "
            "a fair estimate rather than a lower bound")

    cov = doc["coverage"]
    assert isinstance(cov["week1_props_forecasts"], int)
    assert cov["crosswalk_loss_rate"] < 0.05, (
        f"crosswalk loss {cov['crosswalk_loss_rate']:.1%} — above 5% the shared "
        "population is doing the work, not the signal")

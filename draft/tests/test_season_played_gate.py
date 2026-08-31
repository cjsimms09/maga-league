# TERRITORY: A
"""THE MONEY BOARD PAID CORY $1,500 FOR A SEASON THAT HAD NOT STARTED.

Register 338. `league_history.json` carries the current season as an
eighteen-week SCHEDULE — 180 team-weeks, every one of them `0.0` — from the
moment the season object exists. `money_history.analyse()` graded any season
with a non-empty `weeks` dict, and the weekly high is `max(scored)`, which on a
ten-way tie at 0.0 silently returns the FIRST roster. In 2026 that is roster 1,
which is Cory. Fifteen paying weeks x $100, to one seat, for zero football.

MEASURED, with the season removed as a control: the board distributed $13,375
against era-correct pots of $11,500, and it moved Cory from SIXTH ($800) to
SECOND ($2,550) on the career money board.

AND BOTH INDEPENDENT PATHS HAD IT — `money_grade.grade_actual(.., "2026")`
returned the same $1,875 by its own route. The reconciliation in
`test_data_spine` is supposed to be the guard against exactly this, and it was
blind to it: it only failed because its own season list stopped at 2025. **Two
surfaces agreeing is not evidence when they share the defect.** That list is
now derived; these tests guard the gate itself.

Run: python -m pytest draft/tests/test_season_played_gate.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

DRAFT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DRAFT))
sys.path.insert(0, str(DRAFT / "backtest"))

import money_grade as MG    # noqa: E402
import money_history as MH  # noqa: E402
import season_played as SP  # noqa: E402


@pytest.fixture(scope="module")
def history():
    return json.loads((DRAFT / "data" / "league_history.json").read_text())


# ── the predicate, both ways round ───────────────────────────────────────────

def test_a_SCHEDULE_of_zeroes_is_not_a_played_season():
    """The known negative. This exact shape is what shipped."""
    sched = {"weeks": {str(w): [{"roster_id": r, "points": 0.0}
                                for r in range(1, 11)] for w in range(1, 19)}}
    assert SP.has_been_played(sched) is False
    assert SP.played_seasons({"2026": sched}) == {}


def test_ONE_POINT_ANYWHERE_makes_it_played():
    """The known positive, and it is deliberately the smallest one: the gate must
    not need a full week, a full slate, or a threshold — those are all numbers
    somebody would have to choose, and any of them would refuse a real week 1
    that had not finished yet."""
    s = {"weeks": {"1": [{"roster_id": 1, "points": 0.0},
                         {"roster_id": 2, "points": 0.1}]}}
    assert SP.has_been_played(s) is True
    assert list(SP.played_seasons({"2026": s})) == ["2026"]


def test_the_gate_survives_the_shapes_the_store_actually_uses():
    assert SP.has_been_played({}) is False
    assert SP.has_been_played({"weeks": {}}) is False
    assert SP.has_been_played({"weeks": {"1": []}}) is False
    assert SP.has_been_played({"weeks": {"1": [{"roster_id": 1}]}}) is False
    assert SP.has_been_played({"weeks": {"1": [{"points": None}]}}) is False
    # list form and dict form must agree — the two money paths normalise at
    # different points and a helper that spoke one dialect would move the drift
    played = {"season": "2023", "weeks": {"1": [{"roster_id": 1, "points": 99.0}]}}
    assert list(SP.played_seasons([played])) == ["2023"]
    assert list(SP.played_seasons({"2023": played})) == ["2023"]


def test_a_TIED_WEEK_HAS_NO_HIGH_because_max_breaks_ties_toward_roster_one():
    ten_way = [{"roster_id": r, "points": 0.0} for r in range(1, 11)]
    assert SP.week_has_a_single_high(ten_way) is False
    two_way = [{"roster_id": 1, "points": 150.0}, {"roster_id": 2, "points": 150.0}]
    assert SP.week_has_a_single_high(two_way) is False
    real = [{"roster_id": 1, "points": 150.0}, {"roster_id": 2, "points": 149.9}]
    assert SP.week_has_a_single_high(real) is True


# ── the gate, on the real store ──────────────────────────────────────────────

def test_THE_REAL_STORE_STILL_CONTAINS_THE_HAZARD(history):
    """CONTROL (Rule 3f). Everything below asserts that an unplayed season is
    excluded. If the store no longer HAS one, those assertions pass while
    checking nothing, and this test says so instead of letting them.

    It is written to survive the season starting: once 2026 has real scores the
    hazard is genuinely gone and the file skips rather than fails.
    """
    seasons = history.get("seasons") or []
    unplayed = [s["season"] for s in seasons if not SP.has_been_played(s)]
    if not unplayed:
        pytest.skip("every stored season has been played — the hazard is absent")
    assert len(unplayed) == 1, ("more than one unplayed season in the store: %s"
                                % unplayed)
    s = next(x for x in seasons if x["season"] == unplayed[0])
    pts = [t.get("points") for wk in s["weeks"].values() for t in wk]
    assert pts and set(pts) == {0.0}, (
        "the unplayed season has non-zero scores — re-read it before trusting "
        "any of the gates below")


def test_the_MONEY_BOARD_grades_only_played_seasons(history):
    unplayed = {s["season"] for s in (history.get("seasons") or [])
                if not SP.has_been_played(s)}
    graded = set(MH.analyse()["graded_seasons"])
    assert not (graded & unplayed), (
        "the Money Board is grading %s, which nobody has played"
        % sorted(graded & unplayed))
    assert graded, "the board grades nothing at all — the gate is too tight"


def test_the_LAB_GRADER_distributes_nothing_from_an_unplayed_season(history):
    """The second path, checked on its OWN route rather than through the board —
    they agreed on the wrong answer once already."""
    hist, pay = MG.load_history(), MG.load_payouts()
    unplayed = [s["season"] for s in (history.get("seasons") or [])
                if not SP.has_been_played(s)]
    if not unplayed:
        pytest.skip("no unplayed season in the store")
    for season in unplayed:
        g = MG.grade_actual(hist, pay, season)
        assert g.get("unplayed") is True, season
        assert g["distributed"] == 0.0, (season, g["distributed"])
        assert all(v["total"] == 0.0 for v in g["per_roster"].values()), season


def test_THE_LEAGUE_WIDE_TOTAL_IS_THE_POTS_AND_NOT_A_DOLLAR_MORE():
    """The headline, in the unit that pays. $13,375 was going out against
    $11,500 of pots — the $1,875 gap WAS the unplayed season."""
    board = MH.analyse()
    total = sum(r["total_$"] for r in board["dollar_standings"])
    pay = MG.load_payouts()
    expected = sum(MG.season_pay(pay, s)["total_pot"]
                   for s in board["graded_seasons"])
    assert total == pytest.approx(expected, abs=0.01), (total, expected)


def test_NO_WEEK_PAYS_A_WEEKLY_HIGH_ON_A_ZERO(history):
    """The narrower half of the same defect, pinned separately: even inside a
    season that HAS been played, a week with no football must pay nobody. The
    grader splits ties, so an unguarded zero week did not go to one roster — it
    went to all ten, $10 each, which still empties $100 from the pot."""
    for s in history.get("seasons") or []:
        field = MG.field_weekly_scores(s)
        winners = MG.weekly_high_winners(field, MG.regular_season_weeks(s))
        for wk, rids in winners.items():
            top = max((field.get(wk) or {}).values())
            assert top > 0, ("%s week %s pays %s on a top score of %s"
                             % (s["season"], wk, rids, top))

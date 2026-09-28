"""A SEASON IN PROGRESS IS A THIRD STATE, AND IT PAID CORY $1,300 HE HAD NOT WON.

Register 338 taught the money paths one distinction: a season that has been
played versus one that has not. Every season was one or the other when it was
written. The moment 2026 kicked off there was a third state — PARTLY played —
and it broke the money in two separate places at once, on the Money Board Cory
actually reads:

  1. WEEKLY HIGH ON A WEEK NOBODY PLAYED. `money_history` gated at the SEASON
     level only, so on 2026 it walked all fifteen paying weeks. Thirteen of them
     are a ten-way 0.0 tie, and `max` breaks a tie silently toward the first
     roster in the list — roster 1, Cory. $1,300, measured. `money_grade` never
     had this (it refuses a top score <= 0), and `season_played` already carried
     `week_has_a_single_high`, written for exactly this, which `money_history`
     never called. Fix the instance, miss the twin.

  2. A STANDINGS LEAD PAID AS A PRIZE. Both paths handed out the full $375
     regular-season prize after TWO weeks of football, off a two-week standings
     table Sleeper publishes from week 1. The live site never had this bug —
     `season_awards.js` refuses reg_1/reg_2 until the regular season is over —
     so the Lab and the site disagreed about the same dollars.

And the guard that should have caught it was itself asserting the wrong thing:
"every started season has distributed its whole pot" is false while a season is
being played, so it went red the week football started and took the nightly
board publish down with it for eighteen days.

Run: python3 -m pytest draft/tests/test_partly_played_season_money.py
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest

DRAFT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DRAFT))
sys.path.insert(0, str(DRAFT / "backtest"))

import money_history as MH  # noqa: E402
import money_grade as MG    # noqa: E402
import season_played as SP  # noqa: E402

HIST = MG.load_history()
PAY = MG.load_payouts()
FINISHED = ["2023", "2024", "2025"]

#: The numbers as they stood BEFORE the fix, for the three seasons that were
#: already over. Verbatim from the committed store, not invented (rule 121):
#: each finished season distributes exactly its era-correct pot. If a future
#: change to the weekly/rs gates moves a settled season's money, that is a
#: regression and this says so in dollars.
POTS = {"2023": 3500, "2024": 4000, "2025": 4000}


def _season(key):
    return MG.season_of(HIST, key)


# ── the concept that was missing ────────────────────────────────────────────

def test_the_three_states_are_distinguishable():
    """started / finished / neither — and 2026 is the one that has no third slot."""
    for key in FINISHED:
        s = _season(key)
        assert SP.has_been_played(s), key
        assert SP.is_complete(s), f"{key} is over and must read complete"
    s26 = _season("2026")
    assert SP.has_been_played(s26), "2026 has football in it"
    assert not SP.is_complete(s26), "2026 is not finished, and must not read as if it were"


def test_CONTROL_is_complete_can_say_NO_for_each_reason_separately():
    """Rule 3e — a predicate that has only ever returned True is untested.

    Both halves must be able to fail on their own, or `is_complete` could be
    riding on one of them and nobody would know which.
    """
    played = {"weeks": {str(w): [{"roster_id": 1, "points": 100.0}] for w in range(1, 16)},
              "brackets": {"winners": [{"p": 1, "w": 1, "l": 2}]}}
    assert SP.is_complete(played), "the fixture that should pass does not — the rest is void"

    no_champ = {**played, "brackets": {"winners": [{"p": 1}]}}
    assert SP.regular_season_is_over(no_champ)
    assert not SP.playoffs_are_decided(no_champ), "an unplayed bracket must not count as decided"
    assert not SP.is_complete(no_champ)

    short = {"weeks": {**played["weeks"], "9": [{"roster_id": 1, "points": 0.0}]},
             "brackets": played["brackets"]}
    assert SP.playoffs_are_decided(short)
    assert not SP.regular_season_is_over(short), "a 0.0 week is not a played week"
    assert not SP.is_complete(short)


# ── defect 1: the weekly high on a week nobody played ───────────────────────

def test_NO_WEEKLY_HIGH_IS_PAID_ON_A_WEEK_WITH_NO_FOOTBALL():
    """The $1,300, asserted so it cannot come back."""
    seasons, pay = MH._load()
    amt = (pay.get("weekly_high") or {}).get("amount", 100)
    paying = (pay.get("weekly_high") or {}).get("weeks", 15)
    for key, s in sorted(SP.played_seasons(seasons).items()):
        for wk, entries in (s.get("weeks") or {}).items():
            if int(wk) > paying:
                continue
            pts = [t.get("points") for t in entries
                   if isinstance(t.get("points"), (int, float))]
            if pts and max(pts) <= 0:
                assert not SP.week_has_a_single_high(entries), \
                    f"{key} week {wk} has no football but reads as having a winner"
    assert amt  # the amount is real, so the assertion above is about real money


def test_THE_1300_IS_GONE_FROM_CORYS_ROW():
    """Named and numbered, because a generic 'it reconciles' would have passed
    on the old code too — both paths agreed on $1,875 once before (register 338),
    which is why this pins the OWNER and the AMOUNT."""
    board = {r["name"]: r for r in MH.analyse()["dollar_standings"]}
    mine = board.get("Cory (me)") or board.get(MH.MY_OWNER)
    assert mine, f"Cory is not on the board at all: {list(board)}"

    # What he has actually won, derived from the OTHER path, season by season.
    # Derived rather than typed: a literal here would be a second place for the
    # number to rot, which is the failure this whole file is about.
    earned = 0.0
    for key in [s["season"] for s in HIST.get("seasons") or []]:
        s = _season(key)
        if not SP.has_been_played(s):
            continue
        g = MG.grade_actual(HIST, PAY, key)
        for rid, v in g["per_roster"].items():
            if MH._owner_name(s, rid) in ("Cory (me)", MH.MY_OWNER):
                earned += v["weekly_high"]

    assert mine["weekly_$"] == pytest.approx(earned, abs=0.01), \
        f"the Money Board credits Cory {mine['weekly_$']} of weekly high; he has won {earned}"
    assert mine["weekly_$"] < 1700, \
        "the $1,300 of weekly high for weeks nobody played is back on Cory's row"


# ── defect 2: a standings lead is not a prize ───────────────────────────────

def test_NO_REGULAR_SEASON_PRIZE_BEFORE_THE_REGULAR_SEASON_IS_OVER():
    for key in [s["season"] for s in HIST.get("seasons") or []]:
        s = _season(key)
        if not SP.has_been_played(s) or SP.regular_season_is_over(s):
            continue
        g = MG.grade_actual(HIST, PAY, key)
        paid = sum(v["regular_season"] for v in g["per_roster"].values())
        assert paid == 0.0, \
            f"{key}'s regular season is not over but {paid} of placement money is paid"


def test_THE_LAB_AND_THE_SITE_AGREE_ABOUT_WHEN_A_PRIZE_IS_DECIDED():
    """The live site's rule, restated here against the same store. `season_awards.js`
    pays reg_1/reg_2 only once every paying week is played; if the Lab ever pays
    earlier again, these two surfaces are describing different leagues."""
    s26 = _season("2026")
    weeks_with_football = sum(
        1 for w, e in (s26.get("weeks") or {}).items()
        if int(w) <= 15 and [t for t in e if isinstance(t.get("points"), (int, float)) and t["points"] > 0])
    assert weeks_with_football < 15, "2026 finished its regular season — update this test's premise"
    assert not SP.regular_season_is_over(s26)
    g = MG.grade_actual(HIST, PAY, "2026")
    assert sum(v["regular_season"] for v in g["per_roster"].values()) == 0.0


# ── the settled seasons must not move ───────────────────────────────────────

@pytest.mark.parametrize("key", FINISHED)
def test_a_FINISHED_season_still_distributes_exactly_its_pot(key):
    """The fix touched the weekly and regular-season gates on both paths. A
    finished season must be untouched by all of it — this is the control that
    licenses the changes above."""
    got = MG.grade_actual(HIST, PAY, key)["distributed"]
    assert got == pytest.approx(POTS[key], abs=0.01), \
        f"{key} distributed {got} against a pot of {POTS[key]} — a settled season moved"


def test_an_IN_PROGRESS_season_distributes_only_what_is_decided():
    g = MG.grade_actual(HIST, PAY, "2026")
    pot = MG.season_pay(PAY, "2026")["total_pot"]
    weekly = sum(v["weekly_high"] for v in g["per_roster"].values())
    assert 0 <= g["distributed"] < pot
    assert g["distributed"] == pytest.approx(weekly, abs=0.01), \
        ("while the regular season and the bracket are undecided, the weekly high is "
         f"the ONLY thing that can be banked — distributed {g['distributed']} vs weekly {weekly}")

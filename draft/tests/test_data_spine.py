"""THE DATA SPINE — the cross-surface reconciliation proof (data-spine.md §3).

The rule: every derived money fact renders from ONE canonical computation, so the
same fact is identical everywhere. This test is the assertion behind that rule.

`money_history.py` powers the Money Board / settlement (career earnings per owner).
`money_grade.py` is the Lab's per-season E[$] grader. They are INDEPENDENT code
paths over the SAME canonical sources (league_history.json x payouts.json). If
they ever disagree on a derived fact — weekly-high $, regular-season $, playoff $
— one surface is showing a number the other contradicts, which §3 defines as a
red build. This test makes that a hard failure instead of a hope.
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

#: DERIVED, NOT TYPED. This was `["2023", "2024", "2025"]`, and that literal is
#: the only reason the four money reconciliations went red on 2026-08-25 —
#: BY ACCIDENT, not by design. The Money Board and the Lab grader are meant to
#: be an independent cross-check of each other, and on the unplayed 2026 season
#: they AGREED: both handed out $1,875 that does not exist. The test caught it
#: solely because one side's season list stopped short of the other's.
#: **A cross-surface reconciliation is blind to any defect both surfaces share.**
#: So the list is derived from the store, which means next September this pair
#: covers 2026 the moment football starts instead of the year after somebody
#: remembers to edit it. Register 338.
SEASONS = sorted(SP.played_seasons(MG.load_history().get("seasons") or []))


def _grade_career_by_owner():
    """Career {owner: {weekly, rs, playoff}} from the Lab grader (money_grade),
    summed across seasons and keyed by the SAME owner-name resolver the Money
    Board uses — so any mismatch is a real cross-surface disagreement."""
    hist, pay = MG.load_history(), MG.load_payouts()
    acc: dict[str, dict[str, float]] = {}
    for season in SEASONS:
        s = MG.season_of(hist, season)
        g = MG.grade_actual(hist, pay, season)
        for rid, v in g["per_roster"].items():
            name = MH._owner_name(s, rid)
            a = acc.setdefault(name, {"weekly": 0.0, "rs": 0.0, "playoff": 0.0})
            a["weekly"] += v["weekly_high"]
            a["rs"] += v["regular_season"]
            a["playoff"] += v["playoff"]
    return acc


def _money_board_by_owner():
    """Career {owner: {weekly, rs, playoff, total}} as the Money Board renders it."""
    res = MH.analyse()
    assert "dollar_standings" in res, res.get("error")
    out = {}
    for row in res["dollar_standings"]:
        name = MH.MY_OWNER if row["name"] == "Cory (me)" else row["name"]
        out[name] = {"weekly": row["weekly_$"], "rs": row["rs_$"],
                     "playoff": row["playoff_$"], "total": row["total_$"]}
    return out


def test_the_two_paths_grade_the_same_set_of_owners():
    grade = _grade_career_by_owner()
    board = _money_board_by_owner()
    assert set(grade.keys()) == set(board.keys()), \
        f"owner sets differ: only-grade={set(grade)-set(board)}, only-board={set(board)-set(grade)}"


@pytest.mark.parametrize("component", ["weekly", "rs", "playoff"])
def test_each_money_component_reconciles_per_owner(component):
    grade = _grade_career_by_owner()
    board = _money_board_by_owner()
    for owner in board:
        assert grade[owner][component] == pytest.approx(board[owner][component], abs=0.01), \
            f"{component} $ for {owner}: Lab grader {grade[owner][component]} != Money Board {board[owner][component]}"


def test_career_totals_reconcile_per_owner():
    grade = _grade_career_by_owner()
    board = _money_board_by_owner()
    for owner, b in board.items():
        g_total = grade[owner]["weekly"] + grade[owner]["rs"] + grade[owner]["playoff"]
        assert g_total == pytest.approx(b["total"], abs=0.01), \
            f"career $ for {owner}: {g_total} != {b['total']}"


def test_league_wide_dollars_equal_the_summed_pots():
    """Money in == money out — but only for a season that is actually OVER.

    ⚠️ THIS ASSERTED THE IDENTITY OVER EVERY *STARTED* SEASON, and from the
    moment 2026 kicked off that reported correct behaviour as a defect: an
    in-progress season has most of its pot still undistributed, by design. The
    identity belongs to a FINISHED season. Register 338 gave this family
    "started"; `season_played.is_complete` is the half it was missing.

    The in-progress season is not skipped — it gets the assertion that actually
    applies to it, which is that it may not distribute MORE than its pot.
    """
    hist, pay = MG.load_history(), MG.load_payouts()
    complete, in_progress = [], []
    for s in SEASONS:
        (complete if SP.is_complete(MG.season_of(hist, s)) else in_progress).append(s)

    assert complete, "no finished season in the store — the identity has nothing to hold on"

    distributed = {s: MG.grade_actual(hist, pay, s)["distributed"] for s in SEASONS}
    for s in complete:
        pot = MG.season_pay(pay, s)["total_pot"]
        assert distributed[s] == pytest.approx(pot, abs=0.01), \
            f"{s} is finished but distributes {distributed[s]} against a pot of {pot}"

    for s in in_progress:
        pot = MG.season_pay(pay, s)["total_pot"]
        assert 0 <= distributed[s] < pot, \
            f"{s} is still being played but distributes {distributed[s]} of a {pot} pot"

    # and the Money Board's grand total is exactly what the grader distributes,
    # season by season — the cross-surface half, which is the point of the file.
    board_total = sum(v["total"] for v in _money_board_by_owner().values())
    assert board_total == pytest.approx(sum(distributed.values()), abs=0.01), \
        f"Money Board distributes {board_total}, the Lab grader {sum(distributed.values())}"

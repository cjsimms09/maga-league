# TERRITORY: C
"""EMPIRICAL WAIVER REPLACEMENT — what was actually gettable, from 1,091 transactions.

Item 3 of A's brief. The bench equation currently prices a bench slot against the
"best undrafted player", which A correctly calls an UPPER bound: nobody gets the best
undrafted player every week, because ten managers are bidding and the good ones are
gone by Wednesday.

WHAT THIS MEASURES, AND WHAT IT DOES NOT. This is the REALIZED-ACQUISITION level:
what a manager in this league actually added off waivers, and what that player then
scored that week. That is a LOWER bound on what was gettable — the best available
player is by definition at least as good as the one somebody chose to take, and
managers add for need and for hunches, not only for points.

**So the two numbers bracket the truth from opposite sides**, and neither is the
answer alone. Reporting this as "the" waiver replacement level would replace an
overstatement with an understatement and lose the bracket, which is the useful part.

Run: python3 -m pytest draft/tests/test_waiver_replacement.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import waiver_replacement as W  # noqa: E402


def hist(**weeks):
    return {"seasons": [{"season": "2025", "transactions": dict(weeks)}]}


def tx(adds, type="waiver", status="complete", bid=None, roster=6):
    return {"type": type, "status": status, "waiver_bid": bid,
            "adds": {a: roster for a in adds}, "drops": {}, "roster_ids": [roster]}


# ── which rows count ────────────────────────────────────────────────────────
def test_a_FAILED_claim_is_not_an_acquisition():
    """26% of the 1,091 rows are `failed` — a claim somebody lost. Counting them
    puts players nobody could get into the pool of what was gettable, which is the
    exact overstatement this module exists to replace. MUTATION: count every row."""
    h = hist(**{"3": [tx(["a"]), tx(["b"], status="failed")]})
    got = W.acquisitions(h, 2025)
    assert [g["player_id"] for g in got] == ["a"]
    rep = W.report(h, 2025)
    assert rep["failed"] == 1 and rep["complete"] == 1


def test_a_TRADE_is_not_a_waiver_acquisition():
    """A traded player cost assets, not a waiver claim. MUTATION: include trades —
    the replacement level absorbs players who were never on waivers at all."""
    h = hist(**{"3": [tx(["a"]), tx(["t"], type="trade")]})
    assert [g["player_id"] for g in W.acquisitions(h, 2025)] == ["a"]


def test_free_agent_adds_COUNT_and_are_labelled():
    """143-154 per season are `free_agent` — no bid, but genuinely gettable, and
    they are the cheap end of the same shelf. MUTATION: drop them and the pool
    becomes bid-only, which overstates the cost of a replacement."""
    h = hist(**{"3": [tx(["a"], type="waiver", bid=7), tx(["f"], type="free_agent")]})
    got = {g["player_id"]: g for g in W.acquisitions(h, 2025)}
    assert set(got) == {"a", "f"}
    assert got["a"]["bid"] == 7 and got["f"]["bid"] is None
    assert got["f"]["type"] == "free_agent"


def test_one_transaction_adding_TWO_players_yields_TWO_acquisitions():
    """`adds` is a MAP, not a single id. MUTATION: read one key — a multi-add
    week silently loses players and every per-week count is understated."""
    h = hist(**{"3": [tx(["a", "b"])]})
    assert sorted(g["player_id"] for g in W.acquisitions(h, 2025)) == ["a", "b"]


def test_the_week_key_rides_along_as_an_INT():
    """The bench question is per-week — a week-2 add and a week-14 add are not the
    same shelf. MUTATION: drop the week and the whole seasonal shape collapses."""
    h = hist(**{"2": [tx(["a"])], "14": [tx(["b"])]})
    assert {g["player_id"]: g["week"] for g in W.acquisitions(h, 2025)} == {"a": 2, "b": 14}


# ── the join to what they then scored ───────────────────────────────────────
def test_the_score_is_the_SAME_WEEK_the_player_was_added():
    """A week-3 claim is made to start him in week 3. MUTATION: join to the week
    before — the number becomes the score that MOTIVATED the add rather than the
    one it delivered, which is the single most flattering error available here."""
    h = hist(**{"3": [tx(["a"])]})
    pts = {2: {"a": 30.0}, 3: {"a": 8.0}}
    out, _ = W.replacement(h, 2025, pts, {"a": "RB"}, min_n=1)
    assert out[("RB", 3)]["points"] == [8.0]


def test_a_player_with_NO_ROW_that_week_is_ABSENT_not_zero():
    """A stashed rookie or an IR add has no weekly row. Scoring him 0.0 drags the
    shelf down with players nobody started. MUTATION: default missing to 0.0."""
    h = hist(**{"3": [tx(["a"]), tx(["ghost"])]})
    out, rep = W.replacement(h, 2025, {3: {"a": 8.0}}, {"a": "RB", "ghost": "RB"},
                             min_n=1)
    assert out[("RB", 3)]["points"] == [8.0]
    assert rep["unscored"] == 1


def test_a_player_who_PLAYED_and_scored_zero_is_kept():
    """The other side of the line, and it is most of the shelf: the honest waiver
    add is often a dud. MUTATION: treat 0.0 as missing and the level inflates."""
    h = hist(**{"3": [tx(["a"]), tx(["b"])]})
    out, _ = W.replacement(h, 2025, {3: {"a": 8.0, "b": 0.0}},
                           {"a": "RB", "b": "RB"}, min_n=1)
    assert sorted(out[("RB", 3)]["points"]) == [0.0, 8.0]


def test_a_DEFENCE_add_keyed_by_TEAM_CODE_is_not_silently_dropped():
    """`adds` for a defence is {"GB": roster} — a team code where every other row
    carries a numeric id. MUTATION: require a numeric id; every DEF acquisition
    vanishes and the position with the busiest waiver churn reports no data."""
    h = hist(**{"3": [tx(["GB"])]})
    got = W.acquisitions(h, 2025)
    assert [g["player_id"] for g in got] == ["GB"]


# ── the refusal ─────────────────────────────────────────────────────────────
def test_a_THIN_CELL_reports_a_STATUS_not_a_median():
    """One add in a week is an anecdote. A median of one reads exactly like a
    median of forty to anything consuming it. MUTATION: emit the number anyway."""
    h = hist(**{"3": [tx(["a"])]})
    out, _ = W.replacement(h, 2025, {3: {"a": 8.0}}, {"a": "RB"}, min_n=5)
    assert out[("RB", 3)]["status"] == "unmeasurable"
    assert out[("RB", 3)]["median"] is None


def test_the_BRACKET_is_reported_rather_than_a_single_number():
    """The whole point. This measures what WAS taken, a lower bound; `best
    undrafted` is an upper bound. MUTATION: return the median alone and the
    consumer cannot tell a floor from an estimate."""
    h = hist(**{"3": [tx([c]) for c in "abcde"]})
    pts = {3: {"a": 1.0, "b": 4.0, "c": 6.0, "d": 9.0, "e": 20.0}}
    out, _ = W.replacement(h, 2025, pts, {c: "RB" for c in "abcde"}, min_n=5)
    cell = out[("RB", 3)]
    assert cell["status"] == "measured"
    assert cell["median"] == 6.0
    assert cell["p75"] == 9.0 and cell["best"] == 20.0
    assert cell["bound"] == "lower", (
        "this is what was TAKEN, not what was available — the label has to say so")


def test_a_DEFENCE_is_RESOLVED_as_DEF_rather_than_counted_as_unpositioned():
    """Measured 2026-08-13: 207 of 764 acquisitions across 2023-2025 fail the
    nflverse position join, and ALL 207 are team codes — zero numeric ids fail. A
    defence streamed off waivers is the busiest churn there is, and reporting it as
    `unpositioned` reads as a broken crosswalk rather than as the named data gap it
    is (nflverse weekly is player-level offence and carries no DEF scoring).
    MUTATION: leave them unpositioned — 27% of the sample looks like a join defect."""
    h = hist(**{"3": [tx(["GB"]), tx(["4034"])]})
    out, rep = W.replacement(h, 2025, {3: {"4034": 9.0}}, {"4034": "RB"}, min_n=1)
    assert rep["unpositioned"] == 0, rep
    assert rep["def_adds"] == 1
    assert rep["def_unscorable"] == 1, "counted, and named as a source gap"

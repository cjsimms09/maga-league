"""The AsOf store must REFUSE the future, not merely be documented as refusing it.

A backtest that peeks does not fail — it succeeds and reports an edge nobody
can collect, and the leak is invisible in the output. These tests are the only
thing standing between "the composite gained 14 points a draft" and that number
meaning nothing.
"""
import sys, os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from backtest.asof import AsOfDataStore, GradingStore, TimeTravelError


HISTORY = {
    "seasons": [
        {"season": 2024, "owners": [{"id": str(i)} for i in range(10)],
         "scoring_settings": {"rec": 0.5, "pass_td": 4},
         "roster_positions": ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"],
         "final_rosters": [{"roster_id": 1, "wins": 11}],
         "brackets": [{"round": 1}],
         "drafts": [{"draft_id": "d24", "type": "snake", "picks": [
             {"pick_no": 1, "round": 1, "roster_id": 3, "player_id": "aaa", "is_keeper": True},
             {"pick_no": 2, "round": 1, "roster_id": 4, "player_id": "bbb", "is_keeper": None},
             {"pick_no": 3, "round": 1, "roster_id": 5, "player_id": "ccc", "is_keeper": None},
         ]}]},
        {"season": 2023, "owners": [], "drafts": [{"draft_id": "d23", "picks": [
             {"pick_no": 1, "round": 1, "roster_id": 1, "player_id": "zzz"}]}]},
    ]
}


def store(**kw):
    return AsOfDataStore(2024, HISTORY, **kw)


# -- what it must refuse ----------------------------------------------------
@pytest.mark.parametrize("call", [
    lambda s: s.final_rosters(),
    lambda s: s.brackets(),
    lambda s: s.standings(),
    lambda s: s.actual_points(["aaa"]),
    lambda s: s.outcomes(),
    lambda s: s.weekly_stats(),
    lambda s: s.weekly_stats(2024),
    lambda s: s.weekly_stats(2025),
])
def test_forbidden_data_raises(call):
    with pytest.raises(TimeTravelError):
        call(store())


def test_prior_pbp_refuses_the_replay_season_and_later():
    s = store(pbp_loader=lambda seasons: {"seasons": seasons})
    with pytest.raises(TimeTravelError):
        s.prior_pbp([2023, 2024])
    with pytest.raises(TimeTravelError):
        s.prior_pbp([2025])
    assert s.prior_pbp([2022, 2023])["seasons"] == [2022, 2023]


def test_adp_refuses_to_guess_rather_than_fall_back_to_this_year():
    """The most dangerous leak is the quiet one: with no historical loader, a
    fallback to current ADP would produce a plausible number built on the
    market's opinion formed AFTER the season being replayed."""
    with pytest.raises(TimeTravelError):
        store().adp(teams=10)


def test_adp_is_requested_for_the_replayed_year():
    seen = {}
    def loader(fmt, teams, year):
        seen.update(fmt=fmt, teams=teams, year=year)
        return {"players": []}
    store(adp_loader=loader).adp(teams=10)
    assert seen["year"] == 2024, "must ask FFC for the replayed season, not today"


# -- what it must serve, and how --------------------------------------------
def test_take_until_shows_only_what_that_drafter_had_seen():
    s = store()
    assert [p["pick_no"] for p in s.take_until(1)] == []
    assert [p["pick_no"] for p in s.take_until(3)] == [1, 2]


def test_there_is_no_accessor_that_hands_over_the_whole_pick_list():
    """take_until is the only read path. A method returning every pick would
    move the leak one layer down into whoever forgot to slice it."""
    s = store()
    assert not hasattr(s, "all_picks")
    assert not hasattr(s, "picks")


def test_keepers_union_the_seasons_separate_ledger_draft():
    """2023's shape: the main draft carries NO is_keeper flags and a separate
    ledger draft carries all of them. keepers() must union both — reading
    only the main draft gave 2023 an empty slate and every 2023 replay
    decided keeper slots as live picks (live-edge run, 2026-08-17)."""
    hist = {"seasons": [{
        "season": 2023, "owners": [],
        "drafts": [
            {"draft_id": "main", "picks": [
                {"pick_no": 1, "roster_id": 1, "player_id": "kp1",
                 "is_keeper": None},
                {"pick_no": 2, "roster_id": 2, "player_id": "liv",
                 "is_keeper": None}]},
            {"draft_id": "ledger", "picks": [
                {"pick_no": 1, "roster_id": 1, "player_id": "kp1",
                 "is_keeper": True}]},
        ]}]}
    s = AsOfDataStore(2023, hist)
    assert [k["player_id"] for k in s.keepers()] == ["kp1"]
    # and a keeper flagged in BOTH records appears once, not twice.
    hist["seasons"][0]["drafts"][0]["picks"][0]["is_keeper"] = True
    assert [k["player_id"] for k in AsOfDataStore(2023, hist).keepers()] == \
        ["kp1"]


def test_config_and_keepers_are_pre_draft_facts():
    s = store()
    cfg = s.league_config()
    assert cfg["season"] == 2024 and cfg["teams"] == 10
    assert cfg["scoring"]["rec"] == 0.5
    assert [k["player_id"] for k in s.keepers()] == ["aaa"]


def test_pick_at_reveals_the_choice_but_not_the_outcome():
    got = store().pick_at(2)
    assert got["player_id"] == "bbb"
    assert "points" not in got and "wins" not in got


def test_grading_store_is_a_separate_object():
    """If grading shared the AsOf object, the only guard would be which method
    somebody happened to call."""
    g = GradingStore(2024, weekly_loader=lambda *a: {"bbb": 210.5})
    assert g.rest_of_season_points(["bbb"])["bbb"] == 210.5
    assert not isinstance(g, AsOfDataStore)
    assert not hasattr(store(), "rest_of_season_points")

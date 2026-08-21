# TERRITORY: capture (C's family)
"""Bovada per-event props probe — the follow-up free_odds_probe named:
does the per-event detail path carry player props where the general
coupon endpoint showed zero? Pure logic only; the event-detail URL
pattern itself is an unverified guess (stated in the module docstring),
confirmed only by a real CI dispatch's own status field.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import bovada_event_props_probe as P  # noqa: E402


def test_event_url_appends_the_links_final_slug_to_the_coupon_base():
    url = P.event_url("/football/nfl/baltimore-ravens-dallas-cowboys-202609271625")
    assert url == P.COUPON_URL + "/baltimore-ravens-dallas-cowboys-202609271625"


def test_event_url_handles_a_link_with_no_leading_slash():
    url = P.event_url("football/nfl/team-a-team-b-1")
    assert url.endswith("/team-a-team-b-1")


def test_classify_markets_finds_no_player_props_in_known_game_line_groups():
    result = P.classify_markets(["Point Spread", "Total", "Moneyline",
                                 "Game Props|Total Points Range",
                                 "Score Props|Both teams to score 3+"])
    assert result["has_player_props"] is False
    assert result["player_like"] == []
    assert result["total_markets"] == 5


def test_classify_markets_flags_a_real_player_prop_group():
    result = P.classify_markets(["Point Spread",
                                 "Passing Props|Player Passing Yards"])
    assert result["has_player_props"] is True
    assert result["player_like"] == ["Passing Props|Player Passing Yards"]


def test_classify_markets_is_case_insensitive():
    result = P.classify_markets(["RUSHING PROPS|Player Rushing Yards"])
    assert result["has_player_props"] is True


def test_classify_markets_flags_anytime_td_by_name():
    result = P.classify_markets(["Touchdown Scorer|Anytime TD Scorer"])
    assert result["has_player_props"] is True

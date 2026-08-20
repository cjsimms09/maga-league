# TERRITORY: C
"""Schedule-context store -- register: relay's 08-20 pull-list item 3. Real
fixtures (BUF's real 2026 week 1-3 slate) copied verbatim from the
committed nfl_schedule_2026.json, checked by hand before writing this file
(rule 3f).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import schedule_context as SC  # noqa: E402


# ── real rows, BUF's 2026 weeks 1-3, nfl_schedule_2026.json ────────────────
BUF_W1 = {"game_id": 1, "week": 1, "date": "2026-09-13T17:00:00.000Z",
         "home": "HOU", "away": "BUF"}
BUF_W2 = {"game_id": 2, "week": 2, "date": "2026-09-18T00:15:00.000Z",
         "home": "BUF", "away": "DET"}
BUF_W3 = {"game_id": 3, "week": 3, "date": "2026-09-27T17:00:00.000Z",
         "home": "BUF", "away": "LAC"}


def test_opponent_of_returns_the_other_side():
    assert SC.opponent_of(BUF_W1, "BUF") == "HOU"
    assert SC.opponent_of(BUF_W1, "HOU") == "BUF"
    assert SC.opponent_of(BUF_W1, "KC") is None


def test_games_by_team_sorts_chronologically_regardless_of_input_order():
    rows = [BUF_W3, BUF_W1, BUF_W2]
    by_team = SC.games_by_team(rows)
    weeks = [int(r["week"]) for r in by_team["BUF"]]
    assert weeks == [1, 2, 3]


def test_build_team_context_week1_has_no_rest_days_no_prior_game():
    ctx = SC.build_team_context([BUF_W1])
    assert "rest_days" not in ctx[1]
    assert "short_week" not in ctx[1]


def test_build_team_context_matches_the_real_buf_short_week():
    # THE REAL CASE: BUF plays Sunday 09-13, then Friday 09-18 -- 5 real
    # days of rest, a genuine short week.
    ctx = SC.build_team_context([BUF_W1, BUF_W2])
    assert ctx[2]["rest_days"] == 5
    assert ctx[2]["short_week"] is True


def test_build_team_context_matches_the_real_buf_recovery_week():
    # THE REAL CASE: after that Friday game, BUF's next game is Sunday
    # 09-27 -- 9 real days, NOT a short week even though it follows one.
    ctx = SC.build_team_context([BUF_W1, BUF_W2, BUF_W3])
    assert ctx[3]["rest_days"] == 9
    assert ctx[3]["short_week"] is False


def test_short_week_threshold_does_not_flag_an_ordinary_seven_day_gap():
    w1 = {"game_id": 1, "week": 1, "date": "2026-09-13T17:00:00.000Z",
         "home": "KC", "away": "DEN"}
    w2 = {"game_id": 2, "week": 2, "date": "2026-09-20T17:00:00.000Z",
         "home": "KC", "away": "CIN"}
    ctx = SC.build_team_context([w1, w2])
    assert ctx[2]["rest_days"] == 7
    assert ctx[2]["short_week"] is False


def test_a_bye_week_shows_as_real_elevated_rest_not_a_gap():
    w1 = {"game_id": 1, "week": 1, "date": "2026-09-13T17:00:00.000Z",
         "home": "SEA", "away": "DEN"}
    # SEA has no week-2 game (bye), next real game is week 3
    w3 = {"game_id": 2, "week": 3, "date": "2026-09-27T17:00:00.000Z",
         "home": "SEA", "away": "ARI"}
    ctx = SC.build_team_context([w1, w3])
    assert set(ctx) == {1, 3}       # no week-2 entry at all
    assert ctx[3]["rest_days"] == 14
    assert ctx[3]["short_week"] is False


def test_build_store_joins_the_real_shape_with_opponent_and_home_away():
    schedule_doc = {"season": 2026, "rows": [BUF_W1, BUF_W2]}
    doc = SC.build_store(schedule_doc)
    buf = doc["by_team"]["BUF"]
    assert buf["1"]["opponent"] == "HOU"
    assert buf["1"]["home_away"] == "away"
    assert buf["2"]["opponent"] == "DET"
    assert buf["2"]["home_away"] == "home"
    assert buf["2"]["rest_days"] == 5
    assert buf["2"]["short_week"] is True


def test_build_store_matches_the_real_committed_schedule():
    import json
    schedule_doc = json.loads((Path(__file__).resolve().parent.parent
                               / "data" / "nfl_schedule_2026.json").read_text())
    doc = SC.build_store(schedule_doc)
    assert len(doc["by_team"]) == 32
    buf = doc["by_team"]["BUF"]
    assert buf["1"]["opponent"] == "HOU"
    assert "rest_days" not in buf["1"]      # week 1, no prior game
    assert buf["2"]["rest_days"] == 5
    assert buf["2"]["short_week"] is True
    assert buf["3"]["rest_days"] == 9
    assert buf["3"]["short_week"] is False

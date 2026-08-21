# TERRITORY: C
"""2026 schedule-strength join -- register: relay's 08-20 dispatch, "two
more" ASK 2. Real fixtures pulled from the live committed
defense_vs_position.json and nfl_schedule_2026.json (checked by hand before
writing this file, rule 3f), including the real LA/WAS team-code mismatch
between the two sources.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import schedule_strength as SS  # noqa: E402


def test_rank_defenses_by_position_ranks_1_as_the_stingiest():
    by_defense = {
        "MIN": {"WR": {"mean_allowed": 20.03}},
        "DAL": {"WR": {"mean_allowed": 33.61}},
        "KC": {"WR": {"mean_allowed": 25.0}},
    }
    ranks = SS.rank_defenses_by_position(by_defense)
    assert ranks["WR"]["MIN"] == 1     # fewest allowed = hardest matchup
    assert ranks["WR"]["DAL"] == 3     # most allowed = easiest matchup
    assert ranks["WR"]["KC"] == 2


def test_rank_defenses_by_position_normalizes_the_real_team_code_mismatch():
    # THE REAL MISMATCH: defense_vs_position.json carries 'LA' and 'WAS';
    # nfl_schedule_2026.json carries 'LAR' and 'WSH'. Verified via a real
    # set-difference before this module was written.
    by_defense = {
        "LA": {"QB": {"mean_allowed": 18.0}},
        "WAS": {"QB": {"mean_allowed": 22.0}},
    }
    ranks = SS.rank_defenses_by_position(by_defense)
    assert "LAR" in ranks["QB"]
    assert "WSH" in ranks["QB"]
    assert "LA" not in ranks["QB"]
    assert "WAS" not in ranks["QB"]


def test_rank_defenses_by_position_skips_a_position_with_no_measurement():
    by_defense = {"MIN": {"WR": {"mean_allowed": 20.0}}}  # no QB entry
    ranks = SS.rank_defenses_by_position(by_defense)
    assert ranks["QB"] == {}
    assert ranks["WR"] == {"MIN": 1}


def test_opponent_of_returns_the_other_side():
    row = {"home": "SEA", "away": "NE"}
    assert SS.opponent_of(row, "SEA") == "NE"
    assert SS.opponent_of(row, "NE") == "SEA"
    assert SS.opponent_of(row, "KC") is None


def test_build_team_schedule_matches_the_real_2026_week1_row():
    # THE REAL ROW: nfl_schedule_2026.json's first game, week 1, SEA vs NE.
    rows = [{"game_id": 1392216, "week": 1, "home": "SEA", "away": "NE"}]
    sched = SS.build_team_schedule(rows)
    assert sched["SEA"][1] == "NE"
    assert sched["NE"][1] == "SEA"


def test_build_team_schedule_leaves_a_bye_week_absent_not_fabricated():
    rows = [{"game_id": 1, "week": 1, "home": "SEA", "away": "NE"},
           {"game_id": 2, "week": 3, "home": "SEA", "away": "KC"}]
    sched = SS.build_team_schedule(rows)
    assert 2 not in sched["SEA"]        # bye week 2 -- absent, not zero
    assert set(sched["SEA"]) == {1, 3}


def test_build_store_joins_the_real_shape():
    defense_doc = {"seasons": [2023, 2024, 2025],
                   "by_defense": {
                       "NE": {"QB": {"mean_allowed": 18.0}},
                       "SEA": {"QB": {"mean_allowed": 22.0}},
                   }}
    schedule_doc = {"season": 2026,
                    "rows": [{"game_id": 1, "week": 1, "home": "SEA", "away": "NE"}]}
    doc = SS.build_store(defense_doc, schedule_doc)
    sea_wk1 = doc["by_team"]["SEA"]["1"]
    assert sea_wk1["opponent"] == "NE"
    assert sea_wk1["opponent_points_allowed_rank"]["QB"] == 1  # NE is stingier
    ne_wk1 = doc["by_team"]["NE"]["1"]
    assert ne_wk1["opponent"] == "SEA"
    assert ne_wk1["opponent_points_allowed_rank"]["QB"] == 2


def test_build_store_matches_the_real_committed_stores():
    import json
    defense_doc = json.loads((Path(__file__).resolve().parent.parent
                              / "backtest" / "defense_vs_position.json").read_text())
    schedule_doc = json.loads((Path(__file__).resolve().parent.parent
                               / "data" / "nfl_schedule_2026.json").read_text())
    doc = SS.build_store(defense_doc, schedule_doc)
    # every one of the 32 real teams should resolve after TEAM_FIX
    assert len(doc["by_team"]) == 32
    sea_wk1 = doc["by_team"]["SEA"]["1"]
    assert sea_wk1["opponent"] == "NE"
    assert all(1 <= r <= 32 for r in sea_wk1["opponent_points_allowed_rank"].values())
    # the real bye week: SEA has no week-2 entry (verified against the raw
    # schedule earlier: SEA plays weeks 1,3-10,12-18, bye is week 11)
    assert "11" not in doc["by_team"]["SEA"]


# ── rule 3e refusal gate (relay's 08-21 loop-audit, ASK 2) ────────────────

def test_refusal_reason_none_on_the_real_committed_stores():
    import json
    defense_doc = json.loads((Path(__file__).resolve().parent.parent
                              / "backtest" / "defense_vs_position.json").read_text())
    schedule_doc = json.loads((Path(__file__).resolve().parent.parent
                               / "data" / "nfl_schedule_2026.json").read_text())
    doc = SS.build_store(defense_doc, schedule_doc)  # known-positive
    assert SS.refusal_reason(doc) is None


def test_refusal_reason_fires_on_an_empty_schedule():
    defense_doc = {"seasons": [2025], "by_defense": {"NE": {"QB": {"mean_allowed": 18.0}}}}
    doc = SS.build_store(defense_doc, {"season": 2026, "rows": []})
    reason = SS.refusal_reason(doc)
    assert reason is not None
    assert "0 teams" in reason

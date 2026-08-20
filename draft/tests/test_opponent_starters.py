# TERRITORY: C
"""Opponent-starters store -- register: relay's 08-20 dispatch ASK 1. The
2025-week-1 fixture is copied verbatim from the real, committed
league_history.json (checked by hand before writing this file), not
invented.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import opponent_starters as OS  # noqa: E402


# ── real row, 2025 week 1 roster 1, league_history.json ─────────────────────
REAL_ROSTER_POSITIONS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K",
                        "DEF", "BN", "BN", "BN", "BN", "BN", "BN"]

REAL_WEEK1_ROW = {
    "roster_id": 1, "matchup_id": 5, "points": 95.22,
    "starters": ["6770", "3198", "8151", "7564", "11632", "4217", "5872",
                "8259", "DET"],
    "players": ["11576", "11632", "11637", "12530", "12533", "3198", "4217",
               "5872", "6770", "7564", "8144", "8151", "8154", "8259", "DET"],
    "starters_points": [10.82, 28.7, 3.9, 3.6, 9.6, 10.5, 19.1, 9.0, 0.0],
}


def test_expected_slot_count_counts_non_bench_entries():
    assert OS.expected_slot_count(REAL_ROSTER_POSITIONS) == 9


def test_expected_slot_count_handles_missing_positions():
    assert OS.expected_slot_count(None) == 0
    assert OS.expected_slot_count([]) == 0


def test_build_season_derives_bench_as_the_real_set_difference():
    season_doc = {"roster_positions": REAL_ROSTER_POSITIONS,
                  "weeks": {"1": [REAL_WEEK1_ROW]}}
    out = OS.build_season(season_doc)
    rec = out["1"]["1"]
    assert set(rec["bench"]) == {"11576", "11637", "12530", "12533",
                                 "8144", "8154"}
    assert rec["starters"] == REAL_WEEK1_ROW["starters"]
    assert rec["starters_points"] == REAL_WEEK1_ROW["starters_points"]


def test_build_season_marks_a_full_roster_week_not_short():
    season_doc = {"roster_positions": REAL_ROSTER_POSITIONS,
                  "weeks": {"1": [REAL_WEEK1_ROW]}}
    out = OS.build_season(season_doc)
    rec = out["1"]["1"]
    assert rec["slot_count"] == 9
    assert rec["expected_slot_count"] == 9
    assert rec["short"] is False


# ── rule 3e control: fail arm proving SHORT detection actually fires ────────

def test_build_season_lists_a_short_roster_week_rather_than_dropping_it():
    short_row = {**REAL_WEEK1_ROW, "roster_id": 2,
                "starters": REAL_WEEK1_ROW["starters"][:7]}  # 7, not 9
    season_doc = {"roster_positions": REAL_ROSTER_POSITIONS,
                  "weeks": {"1": [short_row]}}
    out = OS.build_season(season_doc)
    rec = out["1"]["2"]
    assert rec["short"] is True
    assert rec["slot_count"] == 7
    assert rec["expected_slot_count"] == 9


def test_build_store_lists_short_weeks_at_the_top_level_not_silently():
    history_doc = {"seasons": [
        {"season": "2025", "roster_positions": REAL_ROSTER_POSITIONS,
         "weeks": {"1": [REAL_WEEK1_ROW,
                        {**REAL_WEEK1_ROW, "roster_id": 2,
                         "starters": REAL_WEEK1_ROW["starters"][:7]}]}},
    ]}
    doc = OS.build_store(history_doc)
    assert doc["population"]["total_roster_weeks"] == 2
    assert doc["population"]["short_weeks_count"] == 1
    assert doc["short_weeks"][0]["roster_id"] == "2"
    assert doc["short_weeks"][0]["slot_count"] == 7


def test_build_store_skips_2026_because_no_games_have_been_played():
    history_doc = {"seasons": [
        {"season": "2026", "roster_positions": REAL_ROSTER_POSITIONS,
         "weeks": {}},
        {"season": "2025", "roster_positions": REAL_ROSTER_POSITIONS,
         "weeks": {"1": [REAL_WEEK1_ROW]}},
    ]}
    doc = OS.build_store(history_doc)
    assert "2026" not in doc["seasons"]
    assert "2025" in doc["seasons"]


def test_build_store_matches_the_real_committed_history_with_zero_short_weeks():
    # THE REAL POPULATION, MEASURED BEFORE SHIPPING: every one of 540 real
    # roster-weeks (2023-2025) carries exactly 9 starters. This is the
    # KNOWN-NEGATIVE control -- the real data proves the flag does not fire
    # on true positives, complementing the synthetic fail arm above which
    # proves it CAN fire.
    import json
    history_path = (Path(__file__).resolve().parent.parent / "data"
                    / "league_history.json")
    history_doc = json.loads(history_path.read_text())
    doc = OS.build_store(history_doc)
    assert doc["population"]["total_roster_weeks"] == 540
    assert doc["population"]["short_weeks_count"] == 0

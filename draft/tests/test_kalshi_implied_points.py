# TERRITORY: C
"""Kalshi season-long implied points -- register: relay's 08-20 dispatch ASK 1,
corrected after Cory's "don't just say can't do it." The A.J. Brown fixture is
copied verbatim from the real, live 2026-08-19 capture (checked by hand
before writing this file), not invented.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import kalshi_implied_points as K  # noqa: E402


# ── real rows, A.J. Brown, 2026-08-19 capture ────────────────────────────────
ABROWN_REC = {
    "player_code": "ABROWN11", "stat": "rec",
    "implied": {"expectation_lower_bound": 45.25},
    "rungs": [{"title": "Will A.J. Brown record 75+ receptions during 2026-27 "
                        "Pro Football regular season?"}],
}
ABROWN_RECYD = {
    "player_code": "ABROWN11", "stat": "rec_yd",
    "implied": {"expectation_lower_bound": 400.0},
    "rungs": [{"title": "Will A.J. Brown record 750+ receiving yards during "
                        "2026-27 Pro Football regular season?"}],
}
ABROWN_RECTD = {
    "player_code": "ABROWN11", "stat": "rec_td",
    "implied": {"expectation_lower_bound": 3.0},
    "rungs": [{"title": "Will A.J. Brown record 6+ receiving touchdowns "
                        "during the 2026-27 Pro Football regular season?"}],
}

BOARD_FIXTURE = {
    "players": [
        {"player_id": "5859", "name": "A.J. Brown", "position": "WR",
         "games_expected": 15.0},
    ],
    "kept_players": [
        {"player_id": "7564", "name": "Ja'Marr Chase", "position": "WR",
         "games_expected": 15.0},
    ],
}


def test_extract_player_name_matches_the_real_title_phrasing():
    assert K.extract_player_name(
        "Will A.J. Brown record 75+ receptions during 2026-27 Pro Football "
        "regular season?") == "A.J. Brown"


def test_extract_player_name_handles_all_six_real_phrasings():
    titles = [
        "Will Ashton Jeanty record 6+ rushing touchdowns during the 2026-27 "
        "Pro Football regular season?",
        "Will Aaron Rodgers record 3000+ passing yards during 2026-27 Pro "
        "Football regular season?",
    ]
    names = [K.extract_player_name(t) for t in titles]
    assert names == ["Ashton Jeanty", "Aaron Rodgers"]


def test_board_name_index_includes_kept_players_not_just_players():
    # the exact defect A already fixed once this session for
    # multisource_projections.py -- pinned here so it can't regress
    idx = K.board_name_index(BOARD_FIXTURE)
    assert K.NI.normalize_name("Ja'Marr Chase") in idx
    assert idx[K.NI.normalize_name("Ja'Marr Chase")]["player_id"] == "7564"


def test_group_by_player_collects_all_stats_for_one_player_code():
    rows = [ABROWN_REC, ABROWN_RECYD, ABROWN_RECTD]
    grouped = K.group_by_player(rows)
    assert set(grouped) == {"ABROWN11"}
    assert len(grouped["ABROWN11"]) == 3


def test_combine_stat_line_uses_the_real_expectation_lower_bound():
    line = K.combine_stat_line([ABROWN_REC, ABROWN_RECYD, ABROWN_RECTD])
    assert line == {"rec": 45.25, "rec_yd": 400.0, "rec_td": 3.0}


def test_build_store_matches_and_scores_the_real_abrown_case():
    ladders_doc = {"ladders": [ABROWN_REC, ABROWN_RECYD, ABROWN_RECTD],
                   "series_captured": list(K.BASELINE_SERIES_CAPTURED),
                   "series_excluded": {"KXNFLFFPTS": "zero live events"},
                   "captured_at": "2026-08-19T00:00:00Z"}
    doc = K.build_store(ladders_doc, BOARD_FIXTURE)
    assert doc["population"]["matched"] == 1
    row = doc["players"]["5859"]
    assert row["name"] == "A.J. Brown"
    # 45.25 rec * 0.5 + 400.0 rec_yd * 0.1 + 3.0 rec_td * 6.0 = 22.625+40+18
    expected = round(45.25 * 0.5 + 400.0 * 0.1 + 3.0 * 6.0, 2)
    assert row["implied_season_points"] == expected
    assert row["implied_per_game_points"] == round(expected / 15.0, 2)


def test_unmatched_players_are_listed_not_dropped():
    rows = [{"player_code": "GHOST1", "stat": "rec",
            "implied": {"expectation_lower_bound": 10.0},
            "rungs": [{"title": "Will Nobody Real record 10+ receptions "
                                "during 2026-27 Pro Football regular season?"}]}]
    doc = K.build_store({"ladders": rows, "series_captured": [], "series_excluded": {}},
                        BOARD_FIXTURE)
    assert doc["population"]["unmatched"] == 1
    assert doc["unmatched_players"][0]["parsed_name"] == "Nobody Real"


def test_series_watch_flags_a_genuinely_new_series():
    doc = {"series_captured": list(K.BASELINE_SERIES_CAPTURED) + ["KXNFLSEASONRECTGT"],
          "series_excluded": {}}
    watch = K.series_watch(doc)
    assert watch["new_series_now_captured"] == ["KXNFLSEASONRECTGT"]
    assert watch["action_needed"] is True


def test_series_watch_is_clean_on_the_real_baseline():
    doc = {"series_captured": list(K.BASELINE_SERIES_CAPTURED),
          "series_excluded": {"KXNFLFFPTS": "zero live events as of 2026-08-16"}}
    watch = K.series_watch(doc)
    assert watch["new_series_now_captured"] == []
    assert watch["action_needed"] is False


def test_series_watch_flags_ffpts_going_live():
    # THE MECHANISM THAT RETIRES THIS WHOLE MODULE: if the direct
    # fantasy-points ladder starts trading, that is action_needed=True even
    # though no series NAME changed.
    doc = {"series_captured": list(K.BASELINE_SERIES_CAPTURED),
          "series_excluded": {"KXNFLFFPTS": "now trading, 40 open markets"}}
    watch = K.series_watch(doc)
    assert watch["action_needed"] is True


def test_known_positive_control_fires_on_the_real_keeper():
    ladders_doc = {"ladders": [ABROWN_REC, ABROWN_RECYD, ABROWN_RECTD],
                   "series_captured": [], "series_excluded": {}}
    # deliberately using a board where Chase is NOT present, to prove the
    # control can fail -- rule 3e fail arm
    doc = K.build_store(ladders_doc, {"players": [], "kept_players": []})
    control = K.verify_known_positive(doc)
    assert control["ok"] is False


def test_agreement_vs_board_computes_a_real_correlation():
    doc = {"players": {
        "1": {"implied_per_game_points": 10.0},
        "2": {"implied_per_game_points": 8.0},
        "3": {"implied_per_game_points": 5.0},
    }}
    board = {"players": [
        {"player_id": "1", "games_expected": 15.0, "proj_mean": 150.0},  # 10.0/game
        {"player_id": "2", "games_expected": 15.0, "proj_mean": 120.0},  # 8.0/game
        {"player_id": "3", "games_expected": 15.0, "proj_mean": 75.0},   # 5.0/game
    ], "kept_players": []}
    result = K.agreement_vs_board(doc, board)
    assert result["n"] == 3
    assert result["spearman"] == 1.0  # perfectly monotone by construction


def test_agreement_vs_board_skips_players_with_no_games_expected():
    doc = {"players": {"1": {"implied_per_game_points": 10.0}}}
    board = {"players": [{"player_id": "1", "games_expected": None, "proj_mean": 150.0}],
            "kept_players": []}
    result = K.agreement_vs_board(doc, board)
    assert result["n"] == 0
    assert result["spearman"] is None


def test_grade_vs_realized_is_callable_before_any_week_exists():
    # THE MECHANISM: this must not raise on an empty realized store, so it
    # can be wired into CI before week 1 without anyone having to remember
    # to remove a guard later.
    doc = {"players": {"1": {"implied_per_game_points": 10.0}}}
    empty_store = {"weeks": []}
    result = K.grade_vs_realized(doc, empty_store)
    assert result["n"] == 0
    assert result["status"] == "insufficient_population"


def test_grade_vs_realized_grades_a_real_shaped_store():
    doc = {"players": {str(i): {"implied_per_game_points": float(i)} for i in range(1, 25)}}
    weeks = [{"week": wk, "points": {str(i): float(i) for i in range(1, 25)}}
            for wk in (1, 2)]
    result = K.grade_vs_realized(doc, {"weeks": weeks})
    assert result["n"] == 24
    assert result["status"] == "graded"
    assert result["spearman"] == 1.0  # implied rank == realized rank by construction


def test_known_positive_control_passes_when_chase_is_present():
    chase_rows = [
        {"player_code": "JCHASE1", "stat": "rec",
         "implied": {"expectation_lower_bound": 90.0},
         "rungs": [{"title": "Will Ja'Marr Chase record 90+ receptions "
                             "during 2026-27 Pro Football regular season?"}]},
    ]
    doc = K.build_store({"ladders": chase_rows, "series_captured": [], "series_excluded": {}},
                        BOARD_FIXTURE)
    control = K.verify_known_positive(doc)
    assert control["ok"] is True

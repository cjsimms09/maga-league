# TERRITORY: C
"""Register 67: K and DEF have never had a realized-points store, any season.
These pin the pure assembly logic — stat-line mapping, points-allowed banding,
team-week aggregation, the kicker crosswalk, and the season builder — against
fixtures copied from REAL nflverse rows (verified by hand against the live
release assets, 2026-08-20), not invented numbers. The real fetches themselves
(player_stats_kicking/_def, games.parquet, Sleeper's player pool) are CI-only
egress and are not re-hit here, same convention as every other source in this
repo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import kdef_weekly_points as K  # noqa: E402


# ── real row, Matt Prater, week 1 2024 (player_stats_kicking_2024.parquet) ──
PRATER_W1_2024 = {
    "season": 2024, "week": 1, "season_type": "REG", "player_id": "00-0023853",
    "team": "ARI", "player_name": "M.Prater", "player_display_name": "Matt Prater",
    "position": "K", "fg_made": 2.0, "fg_att": 2.0, "fg_missed": 0.0,
    "fg_made_0_19": 0.0, "fg_made_20_29": 1.0, "fg_made_30_39": 1.0,
    "fg_made_40_49": 0.0, "fg_made_50_59": 0.0, "fg_made_60_": 0.0,
    "pat_made": 2.0, "pat_att": 2.0, "pat_missed": 0.0, "pat_blocked": 0.0,
    "gwfg_att": 0,
}


def test_the_real_prater_row_scores_exactly_right_under_this_leagues_table():
    # 1x fgm_20_29 (3.0) + 1x fgm_30_39 (3.0) + 2x xpm (1.0 each) = 8.0
    line = K.kicker_stat_line(PRATER_W1_2024)
    assert line["fgm_20_29"] == 1.0 and line["fgm_30_39"] == 1.0
    assert line["fgm_50p"] == 0.0
    assert line["xpm"] == 2.0
    import scoring
    cfg = (__import__("json").loads(
        (Path(__file__).resolve().parents[1] / "config" / "league_config.json")
        .read_text())["scoring"])
    assert scoring.score_stat_line(line, cfg) == 8.0


def test_fifty_and_sixty_plus_combine_into_one_bucket_not_two():
    row = {**PRATER_W1_2024, "fg_made_50_59": 1.0, "fg_made_60_": 1.0}
    line = K.kicker_stat_line(row)
    assert line["fgm_50p"] == 2.0


def test_gwfg_is_not_double_counted():
    # real shape: gwfg_att>0 rows still satisfy fg_made == sum(distance buckets)
    row = {**PRATER_W1_2024, "gwfg_att": 1, "gwfg_made": 1.0}
    line = K.kicker_stat_line(row)
    assert line["fgm_20_29"] + line["fgm_30_39"] == 2.0  # unchanged by gwfg fields


def test_missed_and_blocked_pats_both_count_toward_xpmiss():
    row = {**PRATER_W1_2024, "pat_missed": 1.0, "pat_blocked": 1.0}
    line = K.kicker_stat_line(row)
    assert line["xpmiss"] == 2.0


# ── points-allowed banding, this league's own table ─────────────────────────

def test_band_boundaries_match_this_leagues_scoring_settings():
    assert K.band_points_allowed(0) == "pts_allow_0"
    assert K.band_points_allowed(6) == "pts_allow_1_6"
    assert K.band_points_allowed(7) == "pts_allow_7_13"
    assert K.band_points_allowed(13) == "pts_allow_7_13"
    assert K.band_points_allowed(14) == "pts_allow_14_20"
    assert K.band_points_allowed(20) == "pts_allow_14_20"
    assert K.band_points_allowed(21) == "pts_allow_21_27"
    assert K.band_points_allowed(27) == "pts_allow_21_27"
    assert K.band_points_allowed(28) == "pts_allow_28_34"
    assert K.band_points_allowed(35) == "pts_allow_35p"


# real 2025 week 1 game: PHI 24, DAL 20 (games.parquet) -- DAL allowed 24
# (pts_allow_21_27), PHI allowed 20 (pts_allow_14_20)
REAL_W1_2025_GAME = {"season": 2025, "week": 1, "game_type": "REG",
                     "home_team": "PHI", "away_team": "DAL",
                     "home_score": 24.0, "away_score": 20.0}


def test_def_team_week_line_bands_the_real_2025_opener_correctly():
    line_dal = K.def_team_week_line([], 24.0)  # DAL allowed PHI's 24
    line_phi = K.def_team_week_line([], 20.0)  # PHI allowed DAL's 20
    assert line_dal["pts_allow_21_27"] == 1.0
    assert line_phi["pts_allow_14_20"] == 1.0


def test_def_team_week_line_sums_individual_defenders():
    rows = [
        {"def_sacks": 1.0, "def_interceptions": 0.0, "def_fumble_recovery_opp": 0.0,
         "def_tds": 0.0, "def_safety": 0},
        {"def_sacks": 0.5, "def_interceptions": 1.0, "def_fumble_recovery_opp": 1.0,
         "def_tds": 1.0, "def_safety": 0},
    ]
    line = K.def_team_week_line(rows, 10.0)
    assert line["sack"] == 1.5 and line["int"] == 1.0
    assert line["fum_rec"] == 1.0 and line["def_td"] == 1.0
    assert line["pts_allow_7_13"] == 1.0


def test_missing_defender_rows_still_score_the_points_allowed_band():
    # a played game with zero qualifying defender rows must not vanish
    line = K.def_team_week_line([], 45.0)
    assert line["pts_allow_35p"] == 1.0
    assert line["sack"] == 0.0


# ── team code fix ────────────────────────────────────────────────────────────

def test_la_becomes_lar_and_everything_else_is_unchanged():
    assert K._fix_team("LA") == "LAR"
    assert K._fix_team("KC") == "KC"
    assert K._fix_team("BUF") == "BUF"


def test_build_def_weeks_applies_the_team_fix():
    games = [{"season": 2024, "week": 1, "game_type": "REG",
             "home_team": "LA", "away_team": "SF",
             "home_score": 14.0, "away_score": 9.0}]
    out = K.build_def_weeks([], games, 2024)
    assert "LAR" in out[1] and "LA" not in out[1]


# ── kicker crosswalk (K-only, local, does not touch sleeper_name_index.ROSTERED) ─

POOL = {
    "4949": {"full_name": "Matt Prater", "position": "K", "team": "ARI"},
    "1111": {"full_name": "A Punter", "position": "P", "team": "NE"},
    "2222": {"full_name": "A Kicker", "position": "K", "team": "NE"},
    "3333": {"full_name": "A Kicker", "position": "K", "team": "SEA"},  # collision
}


def test_kicker_index_resolves_a_real_name():
    idx = K.kicker_name_index(POOL)
    assert idx[K.NI.normalize_name("Matt Prater")] == "4949"


def test_kicker_index_excludes_punters():
    idx = K.kicker_name_index(POOL)
    assert K.NI.normalize_name("A Punter") not in idx


def test_kicker_index_excludes_collisions_rather_than_guessing():
    idx = K.kicker_name_index(POOL)
    assert K.NI.normalize_name("A Kicker") not in idx


def test_kicker_index_does_not_mutate_sleeper_name_index_ROSTERED():
    # this module must not have touched the shared file's own scope
    import sleeper_name_index as NI
    assert "K" not in NI.ROSTERED


def test_build_kicker_weeks_uses_the_crosswalk():
    idx = {K.NI.normalize_name("Matt Prater"): "4949"}
    out = K.build_kicker_weeks([PRATER_W1_2024], idx)
    assert out[1]["4949"] == 8.0


def test_build_kicker_weeks_drops_unmatched_rather_than_scoring_zero():
    out = K.build_kicker_weeks([PRATER_W1_2024], {})
    assert out == {}


def test_build_kicker_weeks_skips_past_the_leagues_own_last_scored_week():
    row = {**PRATER_W1_2024, "week": 18}
    idx = {K.NI.normalize_name("Matt Prater"): "4949"}
    out = K.build_kicker_weeks([row], idx)
    assert out == {}


# ── full season assembly, via nflverse_weekly_store (append_week/save, reused) ─

def test_build_store_produces_a_store_the_shared_reader_can_load():
    games = [{"season": 2024, "week": 1, "game_type": "REG",
             "home_team": "ARI", "away_team": "BUF",
             "home_score": 10.0, "away_score": 20.0}]
    defense = [{"season_type": "REG", "week": 1, "team": "ARI",
               "def_sacks": 2.0, "def_interceptions": 0.0,
               "def_fumble_recovery_opp": 0.0, "def_tds": 0.0, "def_safety": 0}]
    idx_players = {"4949": {"full_name": "Matt Prater", "position": "K", "team": "ARI"}}
    series = K.build_store(2024, [PRATER_W1_2024], defense, games, idx_players)
    assert len(series) == 1
    assert series[0]["points"]["4949"] == 8.0
    assert "ARI" in series[0]["points"]  # DEF row present, keyed by team code

    import nflverse_weekly_store as STORE
    totals = STORE.season_totals(series, 2024)
    assert totals["4949"] == 8.0


def test_build_store_reuses_append_week_not_a_reimplementation():
    # rule 11 pin
    import nflverse_weekly_store as STORE
    assert K.STORE.append_week is STORE.append_week
    assert K.STORE.save is STORE.save

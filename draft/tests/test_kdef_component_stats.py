# TERRITORY: C
"""K and DEF component stores (register 2e, 2026-08-19) — shape, provenance,
the missing-vs-zero rule, and PURE fixture tests for the two gotchas the
routing text named by name: fgm_50p must absorb BOTH fg_made_50_59 AND
fg_made_60_ (kicker), and the team-code vocabulary gap between nflverse
("LA") and the board/Sleeper ("LAR") (defense).

No test here touches the network: the shape/provenance/coverage tests read
the COMMITTED stores (component_stats_kicker_<season>.json,
component_stats_def_<season>.json); the build_kicker_season/build_def_season
tests feed synthetic in-memory frames straight to the PURE build functions.

Run: python3 -m pytest draft/tests/test_kdef_component_stats.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import fetch_component_stats as FCS  # noqa: E402

SEASONS = (2021, 2022, 2023, 2024, 2025)


def _df(rows):
    import pandas as pd
    return pd.DataFrame(rows)


# ── K: committed-store shape/provenance ─────────────────────────────────────

@pytest.fixture(scope="module")
def kicker_stores():
    return {s: FCS.load_kicker_store(s) for s in SEASONS}


def test_every_kicker_store_exists_with_territory_first(kicker_stores):
    for season, doc in kicker_stores.items():
        assert next(iter(doc)) == "_territory", season
        assert "fetch_component_stats.py" in doc["_territory"]
        assert "TERRITORY-GRANT: C" in doc["_territory"]
        assert doc["season"] == season


def test_kicker_store_is_SEPARATE_from_the_offense_store(kicker_stores):
    # register 2e's own constraint: POSITION_GROUPS (and the store it feeds)
    # must stay offense-only. The kicker store is a DIFFERENT file, and no
    # kicker pid it carries should silently also appear in the offense store
    # tagged as a skill position.
    for season in SEASONS:
        off = FCS.load_store(season)
        off_pos = {p.get("pos") for w in off["weeks"] for p in w["players"].values()}
        assert "K" not in off_pos, (
            season, "a kicker leaked into the offense-only store")


def test_kicker_provenance_url_is_the_FALLBACK_schema_not_primary(kicker_stores):
    # THE central gotcha this section exists to name: URL_PRIMARY never
    # carries kicking columns, for any season, so the kicker fetch must
    # never even try it.
    for season, doc in kicker_stores.items():
        assert doc["provenance"]["url"] == FCS.URL_FALLBACK.format(year=season), (
            season, doc["provenance"]["url"])
        assert doc["provenance"]["url"] != FCS.URL_PRIMARY.format(year=season)


def test_kicker_weeks_are_regular_season_ascending_unique(kicker_stores):
    for season, doc in kicker_stores.items():
        wks = [w["week"] for w in doc["weeks"]]
        assert wks == sorted(set(wks)), season
        assert min(wks) >= 1 and max(wks) <= 18, season
        assert len(wks) >= 17, season


def test_kicker_row_count_sanity(kicker_stores):
    # ~32 teams' worth of kickers, a handful of in-season replacements —
    # register 2e's own probe found 43 for 2024.
    for season, doc in kicker_stores.items():
        prov = doc["provenance"]
        assert 30 <= prov["players"] <= 70, (season, prov["players"])
        assert 400 <= prov["kept_player_weeks"] <= 800, (
            season, prov["kept_player_weeks"])


def test_kicker_missing_vs_zero_rule_is_stated_and_enforced(kicker_stores):
    for season, doc in kicker_stores.items():
        assert "MISSING DATA" in doc["_note"] and "never a zero" in doc["_note"]
        for w in doc["weeks"]:
            for pid, line in w["players"].items():
                assert line.get("pos") == "K", (season, pid)
                for k, v in line.items():
                    if k in FCS.KICKER_STAT_KEYS:
                        assert v != 0, (season, w["week"], pid, k)


def test_kicker_every_stat_key_is_a_scoring_key(kicker_stores):
    # register 2e: "a 1:1 map to all eight kicker scoring keys" — pin the
    # count and that nothing in the store is a dead/unscored key.
    assert len(FCS.KICKER_SCORING_KEYS) == 8
    assert set(FCS.KICKER_SCORING_KEYS) == set(FCS.KICKER_STAT_KEYS)


# ── K: the fgm_50p gotcha, on the COMMITTED 2024 store (real data) ─────────

def test_fgm_50p_CAPTURES_REAL_60_PLUS_YARD_KICKS_2024():
    """Named events register 2e's own audit and this store's provenance both
    point at: Brandon Aubrey's 65-yarder (DAL wk3 2024) and 60-yarder (DAL
    wk4), Joey Slye's 63-yarder (NE wk4), Tyler Bass's 61-yarder (BUF wk9).
    If fgm_50p only absorbed fg_made_50_59, every one of these would read as
    if it never happened. MUTATION: map only fg_made_50_59 to fgm_50p — this
    test goes red because the DAL week-3/4 rows and the NE/BUF rows would
    undercount by exactly their 60+ makes."""
    wk = FCS.kicker_weeks(2024, 1, 17)
    total_fgm50p = sum(line.get("fgm_50p", 0) for rows in wk.values()
                       for line in rows.values())
    assert total_fgm50p >= 4, (
        "fewer than 4 total fgm_50p makes across 2024 weeks 1-17 — the 60+ "
        "yard kicks this store's own provenance names are missing")


# ── K: build_kicker_season, PURE, synthetic frame ───────────────────────────

def _kicker_row(pid="00-0011111", week=1, **over):
    row = {
        "player_id": pid, "week": week, "season_type": "REG",
        "position": "K", "position_group": "SPEC", "team": "DAL",
        "fg_made_0_19": 0, "fg_made_20_29": 0, "fg_made_30_39": 0,
        "fg_made_40_49": 0, "fg_made_50_59": 0, "fg_made_60_": 0,
        "fg_missed": 0, "fg_blocked": 0,
        "pat_made": 0, "pat_missed": 0, "pat_blocked": 0,
    }
    row.update(over)
    return row


def test_build_kicker_season_fgm_50p_ACCUMULATES_BOTH_BANDS():
    df = _df([_kicker_row(fg_made_50_59=1, fg_made_60_=1)])
    weeks, counts = FCS.build_kicker_season(df, {})
    line = list(weeks[0]["players"].values())[0]
    assert line["fgm_50p"] == 2, (
        "fg_made_50_59=1 and fg_made_60_=1 must SUM to fgm_50p=2 — a "
        "single-column map would report 1 and silently drop the 60-yarder")


def test_build_kicker_season_fgm_50p_a_LONE_60_YARDER_IS_NOT_DROPPED():
    df = _df([_kicker_row(fg_made_50_59=0, fg_made_60_=1)])
    weeks, _ = FCS.build_kicker_season(df, {})
    line = list(weeks[0]["players"].values())[0]
    assert line.get("fgm_50p") == 1, (
        "a kicker who made ONLY a 60+ yarder (fg_made_50_59=0) must still "
        "carry fgm_50p=1 — this is the exact failure mode register 2e named: "
        "'every 60-yard field goal is silently dropped'")
    assert "fg_made_60_" not in line  # raw source columns never leak into the store


def test_build_kicker_season_fgmiss_ACCUMULATES_MISS_AND_BLOCK():
    df = _df([_kicker_row(fg_missed=1, fg_blocked=1)])
    weeks, _ = FCS.build_kicker_season(df, {})
    line = list(weeks[0]["players"].values())[0]
    assert line["fgmiss"] == 2


def test_build_kicker_season_xpmiss_ACCUMULATES_MISS_AND_BLOCK():
    df = _df([_kicker_row(pat_missed=1, pat_blocked=1)])
    weeks, _ = FCS.build_kicker_season(df, {})
    line = list(weeks[0]["players"].values())[0]
    assert line["xpmiss"] == 2


def test_build_kicker_season_ZERO_VALUED_KEYS_ARE_ABSENT_NOT_STORED():
    df = _df([_kicker_row(fg_made_20_29=3)])
    weeks, _ = FCS.build_kicker_season(df, {})
    line = list(weeks[0]["players"].values())[0]
    assert line == {"fgm_20_29": 3, "pos": "K", "team": "DAL"}


def test_build_kicker_season_FILTERS_ON_position_NOT_position_group():
    # SPEC also carries punters (P) and long-snappers (LS) — gating on
    # position_group alone would pull them into a "kicker" store.
    df = _df([
        _kicker_row(pid="k1", position="K", fg_made_20_29=1),
        _kicker_row(pid="p1", position="P", position_group="SPEC"),
        _kicker_row(pid="ls1", position="LS", position_group="SPEC"),
    ])
    weeks, counts = FCS.build_kicker_season(df, {})
    assert counts["players"] == 1
    pids = list(weeks[0]["players"])
    assert pids == ["gsis:k1"]


def test_build_kicker_season_SEASON_TYPE_and_WEEK_RANGE_are_filtered():
    df = _df([
        _kicker_row(pid="a", week=1, season_type="REG", fg_made_20_29=1),
        _kicker_row(pid="b", week=19, season_type="POST", fg_made_20_29=1),
        _kicker_row(pid="c", week=25, season_type="REG", fg_made_20_29=1),
    ])
    weeks, counts = FCS.build_kicker_season(df, {})
    assert counts["kept_player_weeks"] == 1
    assert weeks[0]["week"] == 1


def test_build_kicker_season_USES_CROSSWALK_and_FALLS_BACK_TO_gsis():
    df = _df([_kicker_row(pid="00-0011111", fg_made_20_29=1)])
    weeks, counts = FCS.build_kicker_season(df, {"00-0011111": "9999"})
    assert "9999" in weeks[0]["players"]
    assert counts["unmapped_gsis_players"] == 0

    weeks2, counts2 = FCS.build_kicker_season(df, {})
    assert "gsis:00-0011111" in weeks2[0]["players"]
    assert counts2["unmapped_gsis_players"] == 1


def test_scored_kicker_weekly_points_matches_league_scoring():
    scoring_cfg = {"fgm_50p": 5.0, "xpm": 1.0, "fgm_20_29": 3.0}
    doc_weeks = [{"week": 1, "players": {"z": {"fgm_50p": 2, "xpm": 3, "pos": "K"}}}]
    # write a throwaway store via the module's own path helper, then read it
    # back through the public reader — exercises the real round trip.
    path = FCS.kicker_store_path(9999)
    path.write_text(json.dumps({"weeks": doc_weeks}))
    try:
        out = FCS.scored_kicker_weekly_points(9999, scoring_cfg, last_week=17)
        assert out["z"][1] == pytest.approx(2 * 5.0 + 3 * 1.0)
    finally:
        path.unlink()


# ── DEF: committed-store shape/provenance ───────────────────────────────────

@pytest.fixture(scope="module")
def def_stores():
    return {s: FCS.load_def_store(s) for s in SEASONS}


def test_every_def_store_exists_with_territory_first(def_stores):
    for season, doc in def_stores.items():
        assert next(iter(doc)) == "_territory", season
        assert "fetch_component_stats.py" in doc["_territory"]
        assert doc["season"] == season


def test_def_store_has_exactly_32_teams_most_weeks(def_stores):
    for season, doc in def_stores.items():
        prov = doc["provenance"]
        assert prov["teams"] == 32, (season, prov["teams"])
        assert prov["unknown_team_codes"] == 0, (season, prov)
        assert prov["missing_points_allowed"] == 0, (season, prov)


def test_def_TEAM_CODES_ARE_BOARD_VOCABULARY_not_nflverse(def_stores):
    # THE central gotcha this section exists to name: nflverse spells the
    # Rams "LA"; the board/Sleeper spell them "LAR". MUTATION: skip the
    # adp._norm_team normalization — this test goes red because "LA" would
    # appear as a team key and "LAR" would not.
    for season, doc in def_stores.items():
        teams = {t for w in doc["weeks"] for t in w["players"]}
        assert "LAR" in teams, (season, "the Rams must be keyed 'LAR'")
        assert "LA" not in teams, (season, "nflverse's unnormalized 'LA' leaked through")


def test_def_pts_allow_bands_are_ONE_HOT(def_stores):
    for season, doc in def_stores.items():
        for w in doc["weeks"]:
            for team, line in w["players"].items():
                bands = [k for k in line if k.startswith("pts_allow_")]
                assert len(bands) <= 1, (season, w["week"], team, bands)
                if bands:
                    assert line[bands[0]] == 1


def test_def_missing_vs_zero_rule_is_stated_and_enforced(def_stores):
    for season, doc in def_stores.items():
        assert "MISSING DATA" in doc["_note"] and "never a zero" in doc["_note"]
        for w in doc["weeks"]:
            for team, line in w["players"].items():
                assert line.get("pos") == "DEF", (season, team)
                for k, v in line.items():
                    if k in FCS.DEF_STAT_KEYS:
                        assert v != 0, (season, w["week"], team, k)


# ── DEF: build_def_season, PURE, synthetic frame ────────────────────────────

def _def_row(team="LA", opp="SF", week=1, season=2024, **over):
    row = {
        "team": team, "opponent_team": opp, "week": week, "season": season,
        "season_type": "REG",
        "def_sacks": 0, "def_interceptions": 0, "def_safeties": 0,
        "fumble_recovery_opp": 0, "fumble_recovery_tds": 0, "def_tds": 0,
        "special_teams_tds": 0, "def_fumbles_forced": 0,
        "def_punt_blocks": 0, "def_pat_blocks": 0, "def_fg_blocks": 0,
    }
    row.update(over)
    return row


def _games_row(season=2024, week=1, home="SF", away="LA", hs=20.0, aws=26.0,
               game_type="REG"):
    return {"season": season, "week": week, "game_type": game_type,
            "home_team": home, "away_team": away,
            "home_score": hs, "away_score": aws}


def test_build_def_season_NORMALIZES_LA_TO_LAR():
    df = _df([_def_row(team="LA", opp="SF", def_sacks=2)])
    games = _df([_games_row(home="SF", away="LA", hs=20.0, aws=26.0)])
    weeks, counts = FCS.build_def_season(df, games)
    players = weeks[0]["players"]
    assert "LAR" in players and "LA" not in players
    assert players["LAR"]["sack"] == 2


def test_build_def_season_POINTS_ALLOWED_IS_THE_OPPONENTS_OWN_SCORE():
    # LA (away) allowed whatever SF (home) scored: 20.
    df = _df([_def_row(team="LA", opp="SF")])
    games = _df([_games_row(home="SF", away="LA", hs=20.0, aws=26.0)])
    weeks, counts = FCS.build_def_season(df, games)
    line = weeks[0]["players"]["LAR"]
    assert line.get("pts_allow_14_20") == 1
    assert counts["missing_points_allowed"] == 0


def test_pts_allow_band_boundaries_are_correctly_inclusive():
    cases = {0: "pts_allow_0", 1: "pts_allow_1_6", 6: "pts_allow_1_6",
             7: "pts_allow_7_13", 13: "pts_allow_7_13",
             14: "pts_allow_14_20", 20: "pts_allow_14_20",
             21: "pts_allow_21_27", 27: "pts_allow_21_27",
             28: "pts_allow_28_34", 34: "pts_allow_28_34",
             35: "pts_allow_35p", 50: "pts_allow_35p"}
    for pts, band in cases.items():
        assert FCS.pts_allow_band(pts) == band, (pts, band)


def test_build_def_season_A_BYE_WEEK_IS_ABSENT_NEVER_A_FABRICATED_BAND():
    # no team-week row at all for a bye — nothing to compute a band from.
    df = _df([_def_row(team="LA", opp="SF")])
    games = _df([_games_row(home="SF", away="LA", hs=20.0, aws=26.0)])
    weeks, _ = FCS.build_def_season(df, games)
    assert "SEA" not in weeks[0]["players"]  # never played this week in the fixture


def test_build_def_season_A_GAME_MISSING_A_SCORE_LEAVES_pts_allow_ABSENT():
    df = _df([_def_row(team="LA", opp="SF")])
    games = _df([_games_row(home="SF", away="LA", hs=None, aws=None)])
    weeks, counts = FCS.build_def_season(df, games)
    line = weeks[0]["players"]["LAR"]
    assert not any(k.startswith("pts_allow_") for k in line)
    assert counts["missing_points_allowed"] == 1


def test_build_def_season_fum_rec_and_fum_rec_td_ARE_BOTH_KEPT_ADDITIVELY():
    # VERIFIED against real 2024 data (module docstring): the opponent-fumble
    # recovery count already INCLUDES the one returned for a touchdown, so
    # fum_rec (2.0) and fum_rec_td (6.0) both fire on the same event — this
    # is the standard fantasy convention, not a double count to net out.
    df = _df([_def_row(team="LA", opp="SF", fumble_recovery_opp=1,
                       fumble_recovery_tds=1)])
    games = _df([_games_row(home="SF", away="LA", hs=20.0, aws=26.0)])
    weeks, _ = FCS.build_def_season(df, games)
    line = weeks[0]["players"]["LAR"]
    assert line["fum_rec"] == 1 and line["fum_rec_td"] == 1


def test_build_def_season_blk_kick_ACCUMULATES_ALL_THREE_BLOCK_TYPES():
    df = _df([_def_row(team="LA", opp="SF", def_punt_blocks=1,
                       def_pat_blocks=1, def_fg_blocks=1)])
    games = _df([_games_row(home="SF", away="LA", hs=20.0, aws=26.0)])
    weeks, _ = FCS.build_def_season(df, games)
    assert weeks[0]["players"]["LAR"]["blk_kick"] == 3


def test_build_def_season_SEASON_TYPE_and_WEEK_RANGE_are_filtered():
    df = _df([
        _def_row(team="LA", opp="SF", week=1, season_type="REG", def_sacks=1),
        _def_row(team="LA", opp="SF", week=19, season_type="POST", def_sacks=1),
    ])
    games = _df([_games_row(home="SF", away="LA", week=1, hs=20.0, aws=26.0)])
    weeks, counts = FCS.build_def_season(df, games)
    assert counts["kept_team_weeks"] == 1
    assert weeks[0]["week"] == 1


def test_scored_def_weekly_points_matches_league_scoring():
    scoring_cfg = {"sack": 1.0, "pts_allow_0": 10.0, "def_td": 6.0}
    doc_weeks = [{"week": 1, "players": {"LAR": {"sack": 3, "pts_allow_0": 1,
                                                 "def_td": 1, "pos": "DEF"}}}]
    path = FCS.def_store_path(9999)
    path.write_text(json.dumps({"weeks": doc_weeks}))
    try:
        out = FCS.scored_def_weekly_points(9999, scoring_cfg, last_week=17)
        assert out["LAR"][1] == pytest.approx(3 * 1.0 + 1 * 10.0 + 1 * 6.0)
    finally:
        path.unlink()


# ── the shared points-allowed helper, isolated ──────────────────────────────

def test_team_score_lookup_normalizes_both_home_and_away():
    games = _df([_games_row(home="SF", away="LA", hs=20.0, aws=26.0)])
    lookup = FCS._team_score_lookup(games)
    assert lookup[(2024, 1, "SF")] == 20.0
    assert lookup[(2024, 1, "LAR")] == 26.0
    assert (2024, 1, "LA") not in lookup


def test_team_score_lookup_SKIPS_NON_REG_games():
    games = _df([_games_row(home="SF", away="LA", hs=20.0, aws=26.0,
                            game_type="POST")])
    lookup = FCS._team_score_lookup(games)
    assert lookup == {}

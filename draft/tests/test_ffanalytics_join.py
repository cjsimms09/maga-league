# TERRITORY: C
"""ffanalytics_join — load_real_rows/join_rows/price_row/build_from tested
against SYNTHETIC fixtures shaped like the real committed CSV's columns.
`adp.build_index`/`match_player` are reused unmodified (rule 11) — this file
tests the NEW glue: the source filter, the pricing gaps named in the module
docstring, and the dispersion shape.
"""
import csv
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "backtest"))

import adp as ADP  # noqa: E402
import ffanalytics_join as FJ  # noqa: E402

SCORING = {
    "pass_yd": 0.04, "pass_td": 4.0, "pass_int": -2.0,
    "rush_yd": 0.1, "rush_td": 6.0,
    "rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "fum_lost": -2.0,
    "xpm": 1.0, "xpmiss": -1.0,
    "fgm_0_19": 3.0, "fgm_20_29": 3.0, "fgm_30_39": 3.0, "fgm_40_49": 3.0,
    "fgm_50p": 5.0,
    "def_td": 6.0, "sack": 1.0, "int": 2.0, "fum_rec": 2.0, "safe": 2.0,
    "pts_allow_0": 10.0, "pts_allow_1_6": 7.0, "pts_allow_7_13": 4.0,
    "pts_allow_14_20": 1.0, "pts_allow_21_27": 0.0, "pts_allow_28_34": -1.0,
    "pts_allow_35p": -4.0,
}

SLEEPER_PLAYERS = {
    "111": {"full_name": "Josh Allen", "position": "QB", "team": "BUF", "search_rank": 5},
    "222": {"full_name": "Cam Little", "position": "K", "team": "JAX", "search_rank": 200},
    "333": {"full_name": "Los Angeles Rams", "position": "DEF", "team": "LAR", "search_rank": 300},
}


def _index():
    return ADP.build_index(SLEEPER_PLAYERS)


def _row(**kw):
    base = {c: "NA" for c in (
        "player", "pos", "team", "games", "pass_yds", "pass_tds", "pass_int",
        "rush_yds", "rush_tds", "rec", "rec_yds", "rec_tds", "fumbles_lost",
        "site_pts", "source", "fg", "fg_50", "xp", "xp_att",
        "dst_td", "dst_pts_allowed", "dst_pts_allowed_g",
    )}
    base.update(kw)
    return base


# ── load_real_rows: the source filter ───────────────────────────────────────

def test_load_real_rows_excludes_fantasypros_and_walterfootball(tmp_path):
    p = tmp_path / "raw.csv"
    rows = [_row(player="A", source="CBS"), _row(player="B", source="FantasyPros"),
            _row(player="C", source="Walterfootball"), _row(player="D", source="FFToday")]
    with open(p, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    out = FJ.load_real_rows(p)
    assert {r["source"] for r in out} == {"CBS", "FFToday"}


# ── join_rows: crosswalk + coverage, nothing silently dropped ──────────────

def test_join_matches_by_name_and_counts_coverage():
    rows = [_row(player="Josh Allen", pos="QB", team="BUF", source="CBS"),
            _row(player="Nobody Real", pos="QB", team="BUF", source="CBS")]
    joined, coverage = FJ.join_rows(rows, _index())
    assert len(joined) == 1
    assert joined[0]["sleeper_id"] == "111"
    assert coverage["CBS"] == {"matched": 1, "unmatched": 1}


def test_join_unmatched_row_is_counted_not_silently_dropped():
    rows = [_row(player="Totally Unknown Player", pos="WR", team="BUF", source="ESPN")]
    joined, coverage = FJ.join_rows(rows, _index())
    assert joined == []
    assert coverage["ESPN"]["unmatched"] == 1


# ── price_row: the three named pricing gaps ─────────────────────────────────

def test_price_row_direct_stats_priced_through_our_table():
    row = _row(pass_yds="300", pass_tds="2", rec="0")
    points, approx = FJ.price_row(row, SCORING)
    assert points == pytest.approx(300 * 0.04 + 2 * 4.0)
    assert approx == []


def test_price_row_ignores_site_pts_entirely():
    row = _row(pass_yds="100", site_pts="999")
    points, _ = FJ.price_row(row, SCORING)
    assert points == pytest.approx(100 * 0.04)


def test_price_row_fg_with_50_split_is_exact_not_approximated():
    row = _row(fg="10", fg_50="4")
    points, approx = FJ.price_row(row, SCORING)
    assert points == pytest.approx(4 * 5.0 + 6 * 3.0)
    assert "fg_50_split" not in approx


def test_price_row_fg_without_50_split_is_flagged_approximated():
    row = _row(fg="10")
    points, approx = FJ.price_row(row, SCORING)
    assert points == pytest.approx(10 * 3.0)
    assert "fg_50_split" in approx


def test_price_row_dst_td_priced_at_flat_def_td_weight():
    row = _row(dst_td="2.5")
    points, approx = FJ.price_row(row, SCORING)
    assert points == pytest.approx(2.5 * 6.0)


def test_price_row_pts_allowed_from_per_game_column():
    row = _row(dst_pts_allowed_g="10", games="16")
    points, approx = FJ.price_row(row, SCORING)
    assert points == pytest.approx(16 * SCORING["pts_allow_7_13"])
    assert "pts_allow_band" in approx


def test_price_row_pts_allowed_derived_from_season_total_and_games():
    row = _row(dst_pts_allowed="160", games="16")  # 10/game -> same band as above
    points, _ = FJ.price_row(row, SCORING)
    assert points == pytest.approx(16 * SCORING["pts_allow_7_13"])


def test_price_row_pts_allowed_absent_without_games_is_unpriced_not_zero_guessed():
    row = _row(dst_pts_allowed="160")  # no games -> cannot derive per-game
    points, approx = FJ.price_row(row, SCORING)
    assert points == 0.0
    assert "pts_allow_band" not in approx


# ── build_from: the dispersion shape ────────────────────────────────────────

def test_dispersion_below_two_sources_has_no_sd():
    rows = [_row(player="Josh Allen", pos="QB", team="BUF", source="CBS", pass_yds="300")]
    doc = FJ.build_from(rows, _index(), SCORING)
    p = doc["players"]["111"]
    assert p["n_sources"] == 1
    assert p["sd"] is None
    assert p["min"] == p["max"] == p["mean"]


def test_dispersion_two_plus_sources_computes_real_spread():
    rows = [_row(player="Josh Allen", pos="QB", team="BUF", source="CBS", pass_yds="300"),
            _row(player="Josh Allen", pos="QB", team="BUF", source="ESPN", pass_yds="400")]
    doc = FJ.build_from(rows, _index(), SCORING)
    p = doc["players"]["111"]
    assert p["n_sources"] == 2
    assert p["sd"] > 0
    assert p["min"] < p["max"]
    assert doc["two_plus_source_count"] == 1


def test_dispersion_by_source_keeps_each_sources_own_number():
    rows = [_row(player="Josh Allen", pos="QB", team="BUF", source="CBS", pass_yds="300"),
            _row(player="Josh Allen", pos="QB", team="BUF", source="ESPN", pass_yds="400")]
    doc = FJ.build_from(rows, _index(), SCORING)
    by_src = doc["players"]["111"]["by_source"]
    assert set(by_src) == {"CBS", "ESPN"}
    assert by_src["ESPN"] > by_src["CBS"]


def test_build_from_shape_and_player_count():
    rows = [_row(player="Josh Allen", pos="QB", team="BUF", source="CBS", pass_yds="300"),
            _row(player="Cam Little", pos="K", team="JAX", source="ESPN", fg="20", fg_50="3")]
    doc = FJ.build_from(rows, _index(), SCORING)
    assert doc["sources"] == ["CBS", "ESPN", "FFToday"]
    assert doc["player_count"] == 2
    assert doc["coverage"]["CBS"] == {"matched": 1, "unmatched": 0}


def test_ffanalytics_full_team_name_dst_rows_join_via_team_aliases():
    """Real bug, found against the real committed CSV: FFToday writes DST rows
    with the FULL team name ("Houston Texans"), never a code, and the
    `def-team` fallback in `adp.match_player` compares team CODES — so every
    FFToday defense row joined 0/32 until `adp.TEAM_ALIASES` learned FFToday's
    full names. Pinned here against the fix, not just the mechanism."""
    sleeper_players = {"HOU": {"full_name": "", "position": "DEF", "team": "HOU"}}
    idx = ADP.build_index(sleeper_players)
    row = _row(player="NA", pos="DST", team="Houston Texans", source="FFToday")
    joined, coverage = FJ.join_rows([row], idx)
    assert coverage["FFToday"] == {"matched": 1, "unmatched": 0}
    assert joined[0]["sleeper_id"] == "HOU"


def test_reuses_adp_match_player_not_a_second_crosswalk():
    # rule 11 pin: join_rows must call the SAME function, not a copy
    rows = [_row(player="Josh Allen", pos="QB", team="BUF", source="CBS")]
    idx = _index()
    direct_pid, _ = ADP.match_player({"name": "Josh Allen", "position": "QB", "team": "BUF"}, idx)
    joined, _ = FJ.join_rows(rows, idx)
    assert joined[0]["sleeper_id"] == direct_pid

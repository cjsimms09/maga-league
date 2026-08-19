# TERRITORY: D
"""THE THREE-ARM DISPERSION GRADE MUST TELL A FLAT CONSTANT FROM REAL SIGNAL.

Rule 3e: this ships with a known-negative control. `player_spread_in_sd` is off
in league_config.json, so `measured-2023-25-error`'s weekly_sd is architecturally
a per-(position, band) CONSTANT with no player-level differentiation -- its
CV rank-correlation against realized volatility MUST come back near zero. A
version of this grader that returned a strong correlation for a flat constant
would be measuring something other than what it claims to.

Run: python -m pytest draft/tests/test_dispersion_baseline_grade.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import dispersion_baseline_grade as DG  # noqa: E402


def _draft_data(rows):
    return {"built_at": "2026-08-19T00:00:00Z", "players": rows}


def _realized(entries):
    return {"players": entries}


def test_KNOWN_NEGATIVE_a_flat_band_constant_shows_no_shape_correlation():
    # Every player's weekly_sd is EXACTLY proj_mean * 0.2 (a flat constant, as
    # measured-2023-25-error is with player_spread_in_sd off) while realized
    # volatility varies genuinely player to player and has no relationship to
    # proj_mean's scale. A correlation near zero is the correct answer.
    rows = []
    realized = {}
    import random
    rng = random.Random(7)
    for i in range(30):
        pid = str(1000 + i)
        proj_mean = 100 + i * 5
        rows.append({"player_id": pid, "name": "p%d" % i, "position": "RB",
                     "proj_sd_source": "flat_constant",
                     "proj_mean": proj_mean, "weekly_sd": proj_mean * 0.2})
        realized[pid] = {"2024": {"status": "measured",
                                  "weekly_sd": rng.uniform(3, 15),
                                  "mean_points": rng.uniform(5, 20)}}
    built = DG.build_rows(_draft_data(rows), _realized(realized))
    assert len(built) == 30
    graded = DG.grade(built)
    rho = graded["flat_constant"]["cv_spearman"]
    assert rho is not None
    assert abs(rho) < 0.35, "a flat per-player constant must not show strong rank correlation: %r" % rho


def test_KNOWN_POSITIVE_a_perfect_predictor_shows_rho_near_one():
    # weekly_sd tracks realized_cv exactly (scaled by proj_mean) -- board_cv
    # equals realized_cv by construction, so rank correlation must be ~1.0.
    rows, realized = [], {}
    for i in range(20):
        pid = str(2000 + i)
        proj_mean = 150.0
        cv = 0.1 + (i * 0.02)
        rows.append({"player_id": pid, "name": "q%d" % i, "position": "WR",
                     "proj_sd_source": "oracle", "proj_mean": proj_mean,
                     "weekly_sd": proj_mean * cv})
        realized[pid] = {"2023": {"status": "measured",
                                  "weekly_sd": 10.0 * cv,
                                  "mean_points": 10.0}}
    built = DG.build_rows(_draft_data(rows), _realized(realized))
    graded = DG.grade(built)
    assert graded["oracle"]["cv_spearman"] > 0.95


def test_imputed_seasons_are_excluded_not_averaged_in():
    # A player with only an IMPUTED season (no real games) contributes nothing
    # -- grading a fallback prior against itself would not be a measurement.
    rows = [{"player_id": "3000", "name": "r", "position": "TE",
            "proj_sd_source": "x", "proj_mean": 100.0, "weekly_sd": 20.0}]
    realized = {"3000": {"2025": {"status": "imputed", "weekly_sd": 5.0, "mean_points": 8.0}}}
    built = DG.build_rows(_draft_data(rows), _realized(realized))
    assert built == []


def test_a_player_absent_from_the_realized_store_is_dropped_not_zeroed():
    rows = [{"player_id": "9999", "name": "s", "position": "QB",
            "proj_sd_source": "x", "proj_mean": 200.0, "weekly_sd": 30.0}]
    built = DG.build_rows(_draft_data(rows), _realized({}))
    assert built == []


def test_thin_groups_report_ratio_but_withhold_rho():
    rows, realized = [], {}
    for i in range(3):  # below MIN_N_FOR_CORR
        pid = str(4000 + i)
        rows.append({"player_id": pid, "name": "t%d" % i, "position": "QB",
                     "proj_sd_source": "thin", "proj_mean": 100.0, "weekly_sd": 15.0})
        realized[pid] = {"2024": {"status": "measured", "weekly_sd": 8.0, "mean_points": 12.0}}
    built = DG.build_rows(_draft_data(rows), _realized(realized))
    graded = DG.grade(built)
    assert graded["thin"]["ratio_board_over_realized"] is not None
    assert graded["thin"]["cv_spearman"] is None


def test_live_committed_files_actually_graded_at_least_one_real_arm():
    doc_players = DG.json.loads(DG.DRAFT_DATA.read_text())
    realized = DG.json.loads(DG.REALIZED_STORE.read_text())
    built = DG.build_rows(doc_players, realized)
    assert len(built) > 100, "the committed board and store should overlap on well over 100 players"
    graded = DG.grade(built)
    assert "measured-2023-25-error" in graded or "cross-source-disagreement" in graded

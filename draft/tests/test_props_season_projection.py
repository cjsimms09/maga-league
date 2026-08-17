# TERRITORY: A
"""props_season_projection — line->points conversion, season aggregation,
name matching and the graded comparison against own_v6, all tested against
SYNTHETIC fixtures (no real historical props exist yet — see the module's
own `run()`, which refuses honestly until draft/backtest/
historical_props_2025.json is committed). This file's read-only reproduction
of own_model_v6's construction is checked against the ALREADY COMMITTED
model_accuracy_v6.json by draft/tools/check_artifact_freshness.py (registry
entry "props_season_projection_v6_reproduction"), not by a pytest test here
— see draft/audit/artifact_freshness_infra_2026-08-16.md.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import props_season_projection as P  # noqa: E402
from own_model_v2 import POSITIONS  # noqa: E402

SCORING = {"pass_yd": 0.04, "pass_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
          "rec_yd": 0.1, "rec": 0.5, "fum_lost": -2.0}


# ── line_to_points ──────────────────────────────────────────────────────

def test_line_to_points_single_stat():
    assert P.line_to_points({"pass_yd": 275.5}, SCORING) == pytest.approx(11.02)


def test_line_to_points_multiple_stats_sum():
    got = P.line_to_points({"pass_yd": 250.0, "pass_td": 1.5, "rush_yd": 20.0},
                           SCORING)
    want = 250.0 * 0.04 + 1.5 * 6.0 + 20.0 * 0.1
    assert got == pytest.approx(round(want, 4))


def test_line_to_points_absent_market_contributes_nothing():
    only_pass = P.line_to_points({"pass_yd": 250.0}, SCORING)
    with_zero_rush = P.line_to_points({"pass_yd": 250.0, "rush_yd": 0.0}, SCORING)
    # explicit 0.0 line vs absent key must be the SAME (a 0.0 line means the
    # market thinks 0 yards is the median, which multiplies to 0 anyway —
    # the real test is that an unrecognized/None stat never contributes).
    assert only_pass == with_zero_rush


def test_line_to_points_unknown_stat_key_ignored():
    got = P.line_to_points({"pass_yd": 100.0, "made_up_stat": 999.0}, SCORING)
    assert got == pytest.approx(4.0)


def test_line_to_points_none_value_ignored():
    got = P.line_to_points({"pass_yd": 100.0, "rush_yd": None}, SCORING)
    assert got == pytest.approx(4.0)


# ── week_implied_points / season_implied_totals ────────────────────────────

def test_week_implied_points_per_player():
    week = {"p1": {"pass_yd": 250.0}, "p2": {"rush_yd": 50.0}}
    got = P.week_implied_points(week, SCORING)
    assert got == {"p1": pytest.approx(10.0), "p2": pytest.approx(5.0)}


def test_season_implied_totals_sums_and_counts_games():
    weeks = [
        {"week": 1, "players": {"p1": {"pass_yd": 250.0}}},
        {"week": 2, "players": {"p1": {"pass_yd": 300.0}}},
        {"week": 3, "players": {"p2": {"rush_yd": 100.0}}},
    ]
    totals, games = P.season_implied_totals(weeks, SCORING)
    assert totals["p1"] == pytest.approx(10.0 + 12.0)
    assert games["p1"] == 2
    assert totals["p2"] == pytest.approx(10.0)
    assert games["p2"] == 1


def test_season_implied_totals_absent_week_never_fabricated():
    """p1 missing from week 2 must not silently count as a 0-point game —
    games[p1] stays 1, not 2."""
    weeks = [
        {"week": 1, "players": {"p1": {"pass_yd": 250.0}}},
        {"week": 2, "players": {}},
    ]
    totals, games = P.season_implied_totals(weeks, SCORING)
    assert games["p1"] == 1
    assert totals["p1"] == pytest.approx(10.0)


def test_season_implied_totals_empty_weeks():
    assert P.season_implied_totals([], SCORING) == ({}, {})


# ── normalize_name / match_player_name / crosswalk_props_to_pid ────────────

@pytest.mark.parametrize("raw,want", [
    ("Patrick Mahomes", "patrick mahomes"),
    ("A.J. Brown", "aj brown"),
    ("Michael Pittman Jr.", "michael pittman"),
    ("Odell Beckham III", "odell beckham"),
    ("  Ja'Marr   Chase ", "jamarr chase"),
])
def test_normalize_name(raw, want):
    assert P.normalize_name(raw) == want


def test_match_player_name_hit_and_miss():
    idx = {"patrick mahomes": "4046"}
    assert P.match_player_name("Patrick Mahomes", idx) == "4046"
    assert P.match_player_name("Patrick  Mahomes", idx) == "4046"
    assert P.match_player_name("Nobody Here", idx) is None


def test_crosswalk_props_to_pid_rekeys_and_counts_unmatched():
    idx = {"patrick mahomes": "4046", "isiah pacheco": "8151"}
    weeks = [{"week": 1, "players": {
        "Patrick Mahomes": {"pass_yd": 260.5},
        "Some Unknown Player": {"rush_yd": 20.0},
    }}]
    rekeyed, unmatched = P.crosswalk_props_to_pid(weeks, idx)
    assert rekeyed[0]["players"] == {"4046": {"pass_yd": 260.5}}
    assert unmatched == ["Some Unknown Player"]


def test_crosswalk_props_to_pid_never_drops_silently_two_unmatched_deduped():
    idx = {}
    weeks = [
        {"week": 1, "players": {"Nobody One": {"pass_yd": 1.0}}},
        {"week": 2, "players": {"Nobody One": {"pass_yd": 2.0}}},
    ]
    rekeyed, unmatched = P.crosswalk_props_to_pid(weeks, idx)
    assert unmatched == ["Nobody One"]     # deduped, not counted twice
    assert rekeyed == [{"week": 1, "players": {}}, {"week": 2, "players": {}}]


# ── verdict_vs_v6 — pure arithmetic on a synthetic h2h ─────────────────────

def _h2h_row(n, props_mae, props_sp, v6_mae, v6_sp):
    return {"n": n, "status": "measured",
            "props_season": {"mae": props_mae, "spearman": props_sp},
            "own_v6": {"mae": v6_mae, "spearman": v6_sp}}


def test_verdict_vs_v6_clears_when_all_four_positions_beat_v6():
    h2h = {p: _h2h_row(50, 30.0, 0.80, 40.0, 0.70) for p in POSITIONS}
    v = P.verdict_vs_v6(h2h)
    assert v["clears"] is True
    for pos in POSITIONS:
        assert v["per_position"][pos]["mae_beats_v6"] is True
        assert v["per_position"][pos]["spearman_beats_v6"] is True


def test_verdict_vs_v6_fails_if_even_one_position_loses():
    h2h = {p: _h2h_row(50, 30.0, 0.80, 40.0, 0.70) for p in POSITIONS}
    h2h["QB"] = _h2h_row(50, 90.0, 0.5, 40.0, 0.70)   # QB loses on both
    v = P.verdict_vs_v6(h2h)
    assert v["clears"] is False
    assert v["per_position"]["QB"]["mae_beats_v6"] is False


def test_verdict_vs_v6_unmeasurable_position_fails_the_bar():
    h2h = {p: _h2h_row(50, 30.0, 0.80, 40.0, 0.70) for p in POSITIONS}
    h2h["TE"] = {"status": "unmeasurable", "n": 3}
    v = P.verdict_vs_v6(h2h)
    assert v["clears"] is False
    assert v["per_position"]["TE"]["status"] == "unmeasurable"


def test_verdict_vs_v6_no_measured_positions_never_clears():
    h2h = {p: {"status": "unmeasurable", "n": 0} for p in POSITIONS}
    v = P.verdict_vs_v6(h2h)
    assert v["clears"] is False


# ── run() refuses honestly until real data exists ──────────────────────────

def test_run_refuses_when_no_real_store_exists(monkeypatch, tmp_path):
    fake_missing = tmp_path / "historical_props_2025.json"
    monkeypatch.setattr(P.FHP, "store_path", lambda season: fake_missing)
    doc = P.run()
    assert doc["status"] == "pending_real_data"
    assert "tested_on_fixtures" in doc
    assert doc["pending_real_data"]


# ── PARITY: the read-only v6 reproduction matches the committed artifact ──
#
# NOTE (2026-08-16, artifact-freshness infra): the committed-artifact ==
# regeneration pin that used to live here (`test_v6_reproduction_matches_
# committed_model_accuracy_v6`, @pytest.mark.repo_parity) is now covered by
# draft/data/artifact_registry.json + `draft/tools/check_artifact_
# freshness.py` (entry "props_season_projection_v6_reproduction") instead of
# a bespoke pytest function — see
# draft/audit/artifact_freshness_infra_2026-08-16.md. That check reproduces
# `_v6_predictions` + `_grade_models` exactly as this test did and diffs the
# per-position cells against model_accuracy_v6.json's
# `arm_2025.models.own_v6.cells`; it is informational (FRESH/STALE), never a
# pytest gate item, because positions_record()/board_ages() move with the
# nightly board rebuild — a mismatch says the board is NEW, not that this
# file's reproduction has drifted from v6.py's construction. (A REAL drift
# between the reproduction and v6.py would show up as a freshness-script
# ERROR-free but perpetually-STALE entry even on an unchanged board; if that
# is ever suspected, fix the reproduction here, never v5.py/v6.py — read-only
# per TERRITORY discipline.)

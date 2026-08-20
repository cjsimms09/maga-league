# TERRITORY: C
"""C6 -- qb_context_receiver_features.py's pure logic (starting_qb,
qb_ppg_prior, build_rows) on fixtures. The egress path (nfl_data_py +
committed season_totals) is untestable without live/committed data and is
excluded from coverage in the module itself.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import qb_context_receiver_features as F  # noqa: E402


# ── starting_qb ───────────────────────────────────────────────────────────

def test_starting_qb_picks_depth_team_1():
    rows = [{"gsis_id": "backup", "depth_team": 2}, {"gsis_id": "starter", "depth_team": 1}]
    assert F.starting_qb(rows) == "starter"


def test_starting_qb_none_when_depth_chart_empty():
    assert F.starting_qb([]) is None


# ── qb_ppg_prior ──────────────────────────────────────────────────────────

def test_qb_ppg_prior_computes_points_over_games():
    totals = {"s1": 300.0}
    games = {"s1": 15}
    assert F.qb_ppg_prior("s1", totals, games) == 20.0


def test_qb_ppg_prior_none_when_qb_id_is_none():
    assert F.qb_ppg_prior(None, {"s1": 300.0}, {"s1": 15}) is None


def test_qb_ppg_prior_none_for_a_rookie_with_no_prior_season_row():
    # QB exists this season but never appeared in the prior season's store
    assert F.qb_ppg_prior("rookie_qb", {"s1": 300.0}, {"s1": 15}) is None


def test_qb_ppg_prior_none_rather_than_divide_by_zero_on_zero_games():
    assert F.qb_ppg_prior("s1", {"s1": 0.0}, {"s1": 0}) is None


# ── build_rows (full assembly) ────────────────────────────────────────────

def test_build_rows_attaches_the_teams_starting_qb_to_every_receiver():
    receivers = {"KC": [{"gsis_id": "wr1", "position": "WR"},
                        {"gsis_id": "te1", "position": "TE"}]}
    qb_depth = {"KC": [{"gsis_id": "qb1", "depth_team": 1},
                       {"gsis_id": "qb2", "depth_team": 2}]}
    prior_totals = {"sqb1": 320.0}
    prior_games = {"sqb1": 16}
    crosswalk = {"wr1": "swr1", "te1": "ste1", "qb1": "sqb1", "qb2": "sqb2"}
    rows = F.build_rows(receivers, qb_depth, prior_totals, prior_games,
                        crosswalk, season=2025, as_of="x")
    by_pid = {r["player_id"]: r for r in rows}
    assert set(by_pid) == {"swr1", "ste1"}
    assert by_pid["swr1"]["attached_qb_id"] == "sqb1"
    assert by_pid["swr1"]["attached_qb_ppg_prior"] == 20.0
    assert by_pid["ste1"]["attached_qb_id"] == "sqb1"
    assert by_pid["ste1"]["position"] == "TE"


def test_build_rows_null_qb_context_when_team_has_no_depth_chart():
    receivers = {"KC": [{"gsis_id": "wr1", "position": "WR"}]}
    crosswalk = {"wr1": "swr1"}
    rows = F.build_rows(receivers, {}, {}, {}, crosswalk, season=2025, as_of="x")
    assert rows[0]["attached_qb_id"] is None
    assert rows[0]["attached_qb_ppg_prior"] is None


def test_build_rows_drops_an_unmapped_receiver_gsis_id_rather_than_guessing():
    receivers = {"KC": [{"gsis_id": "unmapped", "position": "WR"}]}
    qb_depth = {"KC": [{"gsis_id": "qb1", "depth_team": 1}]}
    crosswalk = {"qb1": "sqb1"}
    rows = F.build_rows(receivers, qb_depth, {}, {}, crosswalk, season=2025, as_of="x")
    assert rows == []


def test_build_rows_multiple_teams_are_independent():
    receivers = {"KC": [{"gsis_id": "wr1", "position": "WR"}],
                 "SF": [{"gsis_id": "wr2", "position": "WR"}]}
    qb_depth = {"KC": [{"gsis_id": "qbk", "depth_team": 1}],
               "SF": [{"gsis_id": "qbs", "depth_team": 1}]}
    prior_totals = {"sqbk": 200.0, "sqbs": 400.0}
    prior_games = {"sqbk": 16, "sqbs": 16}
    crosswalk = {"wr1": "swr1", "wr2": "swr2", "qbk": "sqbk", "qbs": "sqbs"}
    rows = F.build_rows(receivers, qb_depth, prior_totals, prior_games,
                        crosswalk, season=2025, as_of="x")
    by_pid = {r["player_id"]: r for r in rows}
    assert by_pid["swr1"]["attached_qb_ppg_prior"] == 12.5
    assert by_pid["swr2"]["attached_qb_ppg_prior"] == 25.0


def test_build_rows_carries_as_of_and_source():
    receivers = {"KC": [{"gsis_id": "wr1", "position": "WR"}]}
    crosswalk = {"wr1": "swr1"}
    rows = F.build_rows(receivers, {}, {}, {}, crosswalk, season=2025,
                        as_of="season 2025 week 1 QB depth chart")
    assert rows[0]["as_of"] == "season 2025 week 1 QB depth chart"
    assert "nfl_data_py" in rows[0]["source"]


# ── definitions travel with the artifact ──────────────────────────────────

def test_every_computed_field_has_a_definition():
    computed = {"attached_qb_id", "attached_qb_ppg_prior"}
    assert computed <= set(F.DEFINITIONS)
    for field in computed:
        assert F.DEFINITIONS[field], field


# ── reuse, not re-derivation (rule 11) ──────────────────────────────────────

def test_starting_qb_reuses_rb_offseason_features_depth_ranks():
    import rb_offseason_features as C4
    assert F.depth_ranks is C4.depth_ranks

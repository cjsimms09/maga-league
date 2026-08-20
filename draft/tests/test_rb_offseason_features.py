# TERRITORY: C
"""C4 -- rb_offseason_features.py's pure logic (depth_ranks, team_of,
backfield_rows_for_team, team_change_flags, build_rows) on fixtures. The
egress path (nfl_data_py import_depth_charts/import_rosters) is untestable
without live data and is excluded from coverage in the module itself.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import rb_offseason_features as F  # noqa: E402


# ── depth_ranks ───────────────────────────────────────────────────────────

def test_depth_ranks_orders_by_depth_team_slot():
    rows = [{"gsis_id": "b", "depth_team": 2}, {"gsis_id": "a", "depth_team": 1},
            {"gsis_id": "c", "depth_team": 3}]
    assert F.depth_ranks(rows) == {"a": 1, "b": 2, "c": 3}


def test_depth_ranks_drops_rows_with_no_gsis_id():
    rows = [{"gsis_id": "a", "depth_team": 1}, {"gsis_id": None, "depth_team": 2}]
    assert F.depth_ranks(rows) == {"a": 1}


def test_depth_ranks_unparsable_slot_sorts_last():
    rows = [{"gsis_id": "a", "depth_team": "starter"}, {"gsis_id": "b", "depth_team": 1}]
    ranks = F.depth_ranks(rows)
    assert ranks["b"] == 1 and ranks["a"] == 2


# ── team_of ───────────────────────────────────────────────────────────────

def test_team_of_last_row_wins_on_duplicate_gsis_id():
    rows = [{"gsis_id": "a", "team": "OLD"}, {"gsis_id": "a", "team": "NEW"}]
    assert F.team_of(rows) == {"a": "NEW"}


# ── backfield_rows_for_team ──────────────────────────────────────────────

def test_backfield_rows_counts_depth_n_and_rank():
    cur = [{"gsis_id": "a", "depth_team": 1}, {"gsis_id": "b", "depth_team": 2}]
    out = F.backfield_rows_for_team(cur, prior_depth=None)
    assert out["a"]["backfield_depth_n"] == 2
    assert out["a"]["player_depth_rank"] == 1
    assert out["b"]["player_depth_rank"] == 2


def test_backfield_rows_no_prior_season_leaves_arrivals_departures_null():
    cur = [{"gsis_id": "a", "depth_team": 1}]
    out = F.backfield_rows_for_team(cur, prior_depth=None)
    assert out["a"]["notable_arrivals"] is None
    assert out["a"]["notable_departures"] is None


def test_backfield_rows_arrivals_and_departures_measured_against_prior():
    cur = [{"gsis_id": "a", "depth_team": 1}, {"gsis_id": "new", "depth_team": 2}]
    prior = [{"gsis_id": "a", "depth_team": 1}, {"gsis_id": "gone", "depth_team": 2}]
    out = F.backfield_rows_for_team(cur, prior)
    # arrivals/departures are a per-team scalar, identical for every row
    assert out["a"]["notable_arrivals"] == 1  # "new" wasn't on last year's chart
    assert out["a"]["notable_departures"] == 1  # "gone" isn't on this year's
    assert out["new"]["notable_arrivals"] == 1


# ── team_change_flags ─────────────────────────────────────────────────────

def test_team_change_flags_none_when_no_prior_roster_at_all():
    cur = {"a": "KC"}
    assert F.team_change_flags(cur, prior_team=None) == {"a": None}


def test_team_change_flags_none_for_a_player_absent_from_prior_roster():
    cur = {"a": "KC", "rookie": "SF"}
    prior = {"a": "KC"}
    out = F.team_change_flags(cur, prior)
    assert out["a"] is False
    assert out["rookie"] is None  # never on a prior roster -- unknown, not False


def test_team_change_flags_true_when_team_differs():
    cur = {"a": "SF"}
    prior = {"a": "KC"}
    assert F.team_change_flags(cur, prior) == {"a": True}


# ── build_rows (full assembly) ────────────────────────────────────────────

def test_build_rows_end_to_end_one_team_one_season():
    depth = {"KC": [{"gsis_id": "g1", "depth_team": 1}, {"gsis_id": "g2", "depth_team": 2}]}
    prior_depth = {"KC": [{"gsis_id": "g1", "depth_team": 1}]}
    roster = {"KC": [{"gsis_id": "g1", "team": "KC"}, {"gsis_id": "g2", "team": "KC"}]}
    prior_roster = {"KC": [{"gsis_id": "g1", "team": "KC"}]}
    crosswalk = {"g1": "s1", "g2": "s2"}
    rows = F.build_rows(depth, prior_depth, roster, prior_roster, crosswalk,
                        season=2025, as_of="season 2025 week 1 depth chart")
    by_pid = {r["player_id"]: r for r in rows}
    assert set(by_pid) == {"s1", "s2"}
    assert by_pid["s1"]["player_depth_rank"] == 1
    assert by_pid["s1"]["backfield_depth_n"] == 2
    assert by_pid["s2"]["notable_arrivals"] == 1  # g2 is new vs. prior chart
    assert by_pid["s1"]["team_change"] is False
    assert by_pid["s2"]["team_change"] is None  # g2 has no prior-season roster row
    assert by_pid["s1"]["source"] == "nfl_data_py import_depth_charts + import_seasonal_rosters"
    assert by_pid["s1"]["as_of"] == "season 2025 week 1 depth chart"
    assert by_pid["s1"]["position"] == "RB"


def test_build_rows_drops_an_unmapped_gsis_id_rather_than_guessing():
    depth = {"KC": [{"gsis_id": "unmapped", "depth_team": 1}]}
    roster = {"KC": [{"gsis_id": "unmapped", "team": "KC"}]}
    rows = F.build_rows(depth, {}, roster, {}, crosswalk={}, season=2025, as_of="x")
    assert rows == []


def test_build_rows_multiple_teams_are_independent():
    depth = {"KC": [{"gsis_id": "g1", "depth_team": 1}],
             "SF": [{"gsis_id": "g2", "depth_team": 1}]}
    roster = {"KC": [{"gsis_id": "g1", "team": "KC"}],
              "SF": [{"gsis_id": "g2", "team": "SF"}]}
    crosswalk = {"g1": "s1", "g2": "s2"}
    rows = F.build_rows(depth, {}, roster, {}, crosswalk, season=2025, as_of="x")
    teams = {r["player_id"]: r["team"] for r in rows}
    assert teams == {"s1": "KC", "s2": "SF"}


# ── definitions travel with the artifact ──────────────────────────────────

def test_every_computed_field_has_a_definition():
    computed = {"backfield_depth_n", "player_depth_rank", "notable_arrivals",
               "notable_departures", "team_change"}
    assert computed <= set(F.DEFINITIONS)
    for field in computed:
        assert F.DEFINITIONS[field], field  # non-empty prose, not a placeholder

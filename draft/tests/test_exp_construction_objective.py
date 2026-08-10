"""Construction-objective pure core — no egress. Run:
python -m pytest draft/tests/test_exp_construction_objective.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_construction_objective as E  # noqa: E402


def test_series_pools_prior_weeks():
    tables = [{1: {"a": 10, "b": 5}, 2: {"a": 20}}, {5: {"a": 0, "b": 8}}]
    s = E.player_weekly_series(tables)
    assert sorted(s["a"]) == [0.0, 10.0, 20.0]     # 3 weeks pooled across both seasons
    assert sorted(s["b"]) == [5.0, 8.0]


def test_attrs_ceiling_above_floor_and_thin_is_honest():
    # 8 weeks: boom/bust profile has ceiling well above floor
    s = {"boom": [30, 28, 2, 1, 26, 3, 24, 0], "thin": [15, 16]}
    a = E.attrs_from_series(s, min_weeks=4)
    assert a["boom"]["ceiling"] > a["boom"]["floor"]        # top quartile beats bottom
    assert a["thin"]["ceiling"] is None and a["thin"]["floor"] is None   # too few weeks -> no opinion
    assert a["thin"]["games"] == 2


def test_availability_scales_with_games_and_omits_unknown():
    av = E.availability({"iron": 17, "hurt": 8}, full=16)
    assert av["iron"] == 1.0                                # capped at 1.0
    assert 0.4 < av["hurt"] < 0.6                           # 8/16
    assert "rookie" not in av                               # no prior row -> omitted (no penalty)


def test_zscores_are_within_position():
    attrs = {"rb1": {"ceiling": 30}, "rb2": {"ceiling": 10},
             "qb1": {"ceiling": 30}, "qb2": {"ceiling": 10}}
    pos = {"rb1": "RB", "rb2": "RB", "qb1": "QB", "qb2": "QB"}
    z = E.zscores_within_position(attrs, "ceiling", pos)
    # top of each position is +1 sd, bottom -1 sd — RB and QB standardized separately
    assert z["rb1"] > 0 > z["rb2"] and z["qb1"] > 0 > z["qb2"]
    assert abs(z["rb1"] - z["qb1"]) < 1e-9                  # same relative standing -> same z


def test_objectives_diverge_only_where_evidence_exists():
    proj = {"boom": 200.0, "steady": 200.0, "blank": 200.0}
    ceiling_z = {"boom": 2.0, "steady": -2.0}              # blank has no risk data
    floor_z = {"boom": -2.0, "steady": 2.0}
    avail = {"boom": 0.0, "steady": 1.0}                   # boom missed last year
    sc = E.objective_scores(proj, ceiling_z, floor_z, avail, beta=0.15)
    # POINTS is the projection untouched
    assert sc["points"] == {"boom": 200.0, "steady": 200.0, "blank": 200.0}
    # CEILING lifts the boom player above the steady one
    assert sc["ceiling"]["boom"] > sc["ceiling"]["steady"]
    # FLOOR lifts the steady/available player above the boom-but-injured one
    assert sc["floor"]["steady"] > sc["floor"]["boom"]
    # a player with no risk data scores identically under all three objectives
    assert sc["ceiling"]["blank"] == sc["floor"]["blank"] == sc["points"]["blank"] == 200.0


def test_availability_discount_is_bounded_at_15pct():
    proj = {"x": 100.0}
    sc = E.objective_scores(proj, {}, {}, {"x": 0.0}, beta=0.15)   # played 0 games last yr
    assert sc["floor"]["x"] == 85.0                        # exactly -15%, never worse


def test_objective_scores_produce_a_different_pick():
    # the whole point: at equal projection, the objectives pick different players
    import exp34_dollars as XD
    proj = {"boom": 100.0, "steady": 100.0}
    sc = E.objective_scores(proj, {"boom": 2.0, "steady": -2.0},
                            {"boom": -2.0, "steady": 2.0}, {}, beta=0.15)
    avail_pool = {"boom", "steady"}
    assert XD.our_pick_fn(sc["ceiling"])(avail_pool) == "boom"
    assert XD.our_pick_fn(sc["floor"])(avail_pool) == "steady"

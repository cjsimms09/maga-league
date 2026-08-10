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


# ── finer proxy ───────────────────────────────────────────────────────
def test_week_win_prob_is_smooth_not_knife_edge():
    # losing the high by a hair is NOT 0 — that is the whole point of the smoothing
    p_hair = E.week_win_prob(99.5, [100.0], sigma=20.0)
    assert 0.35 < p_hair < 0.5                              # close loss -> nearly a coin flip
    p_clear = E.week_win_prob(160.0, [100.0], sigma=20.0)
    assert p_clear > 0.98                                   # 3 sigma ahead -> near-certain
    # a hard tie with no noise splits
    assert E.week_win_prob(100.0, [100.0], sigma=0.0) == 0.5


def test_week_win_prob_beats_more_opponents_is_harder():
    one = E.week_win_prob(120.0, [100.0], sigma=20.0)
    many = E.week_win_prob(120.0, [100.0, 110.0, 115.0], sigma=20.0)
    assert many < one                                       # more rivals -> lower win prob


def test_residual_sigma_removes_team_means():
    # two teams, one always ~100 one always ~150, each with +/-10 weekly swing
    field = {1: {"a": 90, "b": 140}, 2: {"a": 110, "b": 160}}
    sig = E.residual_weekly_sigma(field, [1, 2])
    assert 8.0 < sig < 12.0            # ~10 (within-team swing), NOT ~30 (cross-team spread)


def test_grade_proxies_reads_rank_and_playoff_window():
    # my seat (rid 1) beats the field in wk1, loses wk2; playoff wk15 counted from my_weekly
    field = {1: {1: 120, 2: 100, 3: 80}, 2: {1: 90, 2: 130, 3: 110}, 15: {1: 0, 2: 0, 3: 0}}
    my_weekly = {1: 120.0, 2: 90.0, 15: 145.0}
    out = E.grade_policy_proxies(field, my_weekly, roster_id=1,
                                 rs_weeks=[1, 2], po_weeks=[15], sigma=15.0)
    assert out["exact_weekly_high_wins"] == 1.0            # won wk1 only
    assert out["mean_weekly_rank"] == 2.0                  # rank 1 then rank 3 -> mean 2
    assert out["playoff_window_points"] == 145.0           # from my_weekly, not the zeroed field
    assert 0.0 < out["exp_weekly_high_wins"] < 2.0         # smoothed, between the two weeks

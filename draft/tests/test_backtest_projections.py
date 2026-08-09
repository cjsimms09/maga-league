"""Walk-forward projections must not smuggle the future in.

The subtle failures here are not crashes. They are a projection that is
secretly "last season again" (which would hand the backtest a fake edge over a
market that already regresses), or one fitted on the very season it is
projecting.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from backtest.lab_projections import (walk_forward, sanity_check, adp_implied,
                                  spearman, CFG)

POS = {"a": "RB", "b": "RB", "c": "WR", "d": "WR"}
GAMES = {2022: {"a": 16, "b": 16, "c": 16, "d": 16},
         2023: {"a": 16, "b": 16, "c": 16, "d": 16}}
PTS = {2022: {"a": 320.0, "b": 160.0, "c": 300.0, "d": 150.0},
       2023: {"a": 300.0, "b": 170.0, "c": 280.0, "d": 160.0}}


def test_only_prior_seasons_are_used():
    """Passing the replayed season's own points must change nothing."""
    clean = walk_forward(2024, PTS, GAMES, POS)
    poisoned = dict(PTS); poisoned[2024] = {"a": 9999.0, "b": 9999.0, "c": 9999.0, "d": 9999.0}
    games2 = dict(GAMES); games2[2024] = {"a": 17, "b": 17, "c": 17, "d": 17}
    assert walk_forward(2024, poisoned, games2, POS) == clean


def test_a_projection_is_not_just_last_year_again():
    """SPEC: REGRESSION_WEIGHT exists because last season's points are a biased
    estimate — the top of the list is disproportionately players who got lucky.
    A projection equal to last year would overvalue exactly those players, and
    beat ADP for a reason that will not repeat."""
    out = walk_forward(2024, PTS, GAMES, POS)
    top_rate = 0.7 * (300.0 / 16) + 0.3 * (320.0 / 16)
    unregressed = top_rate * CFG["EXPECTED_GAMES"]
    assert out["a"] < unregressed, "the leader must be pulled toward the mean"
    assert out["b"] > (0.7 * (170.0 / 16) + 0.3 * (160.0 / 16)) * CFG["EXPECTED_GAMES"] * 0.9, \
        "and the laggard pulled up, not just everyone scaled down"


def test_ordering_survives_regression():
    out = walk_forward(2024, PTS, GAMES, POS)
    assert out["a"] > out["b"] and out["c"] > out["d"]


def test_small_samples_are_priced_near_the_positional_baseline():
    pts = dict(PTS); games = {y: dict(g) for y, g in GAMES.items()}
    pts[2023] = dict(pts[2023]); pts[2023]["rookie"] = 60.0
    games[2023]["rookie"] = 2                       # two games, huge rate
    pos = dict(POS); pos["rookie"] = "RB"
    out = walk_forward(2024, pts, games, pos)
    assert out["rookie"] < out["a"], "a 2-game hot streak must not outrank a proven RB1"


def test_age_penalises_running_backs_hardest():
    young = walk_forward(2024, PTS, GAMES, POS, ages={"a": 24})
    old = walk_forward(2024, PTS, GAMES, POS, ages={"a": 31})
    assert old["a"] < young["a"]
    wr_young = walk_forward(2024, PTS, GAMES, POS, ages={"c": 24})["c"]
    wr_old = walk_forward(2024, PTS, GAMES, POS, ages={"c": 31})["c"]
    rb_drop = 1 - old["a"] / young["a"]
    wr_drop = 1 - wr_old / wr_young
    assert rb_drop > wr_drop, "the RB cliff is the best-documented ageing effect"


def test_sanity_check_fails_noise_and_says_what_it_measured():
    adp = {"a": 1, "b": 2, "c": 3, "d": 4}
    good = sanity_check({"a": 300, "b": 250, "c": 200, "d": 150}, adp)
    assert good["correlated_with_market"]
    noise = sanity_check({"a": 10, "b": 300, "c": 20, "d": 290}, adp)
    assert not noise["passes"]
    assert not noise["enough_players"], "a 4-player board is not draftable either"
    assert noise["thresholds"]["min_spearman"] == CFG["SANITY_MIN_SPEARMAN"]


def test_spearman_is_rank_based_not_value_based():
    assert spearman([1, 2, 3], [10, 100, 1000]) > 0.99
    assert spearman([1, 2, 3], [3, 2, 1]) < -0.99


def test_adp_implied_interpolates_and_stays_flat_outside_the_curve():
    curve = [(1, 300.0), (50, 150.0), (100, 60.0)]
    out = adp_implied({"x": 1, "y": 25.5, "z": 400}, curve)
    assert out["x"] == 300.0
    assert 150.0 < out["y"] < 300.0
    assert out["z"] == 60.0, "beyond the fitted range it must flatten, not extrapolate"

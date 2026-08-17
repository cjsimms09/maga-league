# TERRITORY: A
"""PLAYER-WEEK PROJECTION SKILL — mechanics of the offline validation.

The strictly-prior property is proved STRUCTURALLY (perturbing week w must not
move any week-w projection — exp_weekly_env's own mechanics test, applied to
this construction), the blend arithmetic is pinned to the shipped JS module's
numbers, and the committed results file is checked against its cross-check
target so a silent store/protocol divergence cannot ship as "known skill".
"""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"

spec = importlib.util.spec_from_file_location(
    "pwps", BT / "player_week_projection_skill.py")
pwps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pwps)


def test_appearances_strictly_prior():
    weeks = {1: {"p": 10.0}, 2: {"p": 14.0}, 3: {"p": 99.0}}
    assert pwps.appearances_before(weeks, "p", 3, include_zero=False) == [10.0, 14.0]
    # perturb week 3: the week-3 features must not move
    weeks2 = {1: {"p": 10.0}, 2: {"p": 14.0}, 3: {"p": 0.5}}
    assert (pwps.appearances_before(weeks, "p", 3, include_zero=False)
            == pwps.appearances_before(weeks2, "p", 3, include_zero=False))


def test_zero_week_semantics_both_ways():
    weeks = {1: {"p": 0.0}, 2: {"p": 10.0}}
    assert pwps.appearances_before(weeks, "p", 3, include_zero=True) == [0.0, 10.0]
    assert pwps.appearances_before(weeks, "p", 3, include_zero=False) == [10.0]


def test_blend_matches_shipped_arithmetic():
    # prior 10/wk, realized [20,20,20] -> (3*10+60)/6 = 15, the JS test's pin
    assert pwps.blend(10.0, [20.0, 20.0, 20.0]) == 15.0
    assert pwps.blend(10.0, []) == 10.0                       # week 1 = the prior
    assert pwps.blend(None, [8.0, 10.0, 12.0]) == 10.0        # realized-only >= 3
    assert pwps.blend(None, [22.0, 30.0]) is None             # refusal, not a number


def test_eligibility_filter():
    positions = {"a": "RB", "b": "RB", "c": "K"}
    weeks = {w: {"a": 10.0, "b": 1.0, "c": 9.0} for w in range(1, 7)}
    rows = pwps.eval_running_mean(weeks, positions, include_zero=True)
    pids = {("a" if p == 10.0 else "b") for p, _, _, _ in rows}
    # b (mean 1.0) fails the relevance floor; c is not an eval position
    assert pids == {"a"}


def test_spearman_known_values():
    assert abs(pwps.spearman([1, 2, 3, 4], [1, 2, 3, 4]) - 1.0) < 1e-9
    assert abs(pwps.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1.0) < 1e-9
    assert pwps.spearman([1, 2], [2, 1]) is None              # too thin to rank


def test_season_prior_is_regressed_and_discounted():
    prior_weeks = {w: {"star": 20.0, "scrub": 4.0} for w in range(1, 18)}
    positions = {"star": "RB", "scrub": "RB"}
    pri = pwps.season_prior(prior_weeks, positions)
    # positional mean is 12; star regresses DOWN toward it, scrub UP, and both
    # carry the 15.5/17 availability discount — a prior above last year's rate
    # would mean the regression ran backwards.
    assert pri["star"] < 20.0 * (15.5 / 17)
    assert pri["scrub"] > 4.0 * (15.5 / 17) - 1e-9


def test_committed_results_pass_their_cross_check():
    res = json.loads((BT / "player_week_projection_skill.json").read_text())
    assert res["_territory"].startswith("TERRITORY: A")
    for yr in ("2023", "2024"):
        got = res["seasons"][yr]["running_mean_parity"]["overall"]
        target = res["cross_check_target"][yr]
        # same protocol, different pipeline: within 0.1 MAE and 10% of n, or
        # the stores and the experiment disagree about reality.
        assert abs(got["mae"] - target["mae"]) < 0.1, (yr, got, target)
        assert abs(got["n"] - target["n"]) / target["n"] < 0.10
    blend = res["seasons"]["2024"]["shipped_blend_on_baseline_set"]["overall"]
    base = res["seasons"]["2024"]["running_mean_zero_excluded"]["overall"]
    # the shipped construction must not be WORSE than the running mean on the
    # identical population — that is its reason to exist.
    assert blend["mae"] <= base["mae"], (blend, base)
    assert res["k_sweep_2024"]["declared_k"] == pwps.PRIOR_PSEUDO_WEEKS

# TERRITORY: A
"""SLEEPER-VS-FP three-way grade mechanics, tested OFFLINE before the CI run.

The things that would quietly corrupt this study are not exotic: a top-N
precision that reports a top-30 under the name top-48; a shared population that
scores an absent player as zero; a "winner" declared on a margin smaller than
noise; a cross-fit that fits weights on the players it grades. Each has its own
test, and the blend arms are checked in BOTH directions — a fixture where
averaging helps and one where it hurts — because a mechanism check that has
only ever seen one answer has not been checked.

Run: python3 -m pytest draft/tests/test_sleeper_vs_fp_grade.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import sleeper_vs_fp_grade as G  # noqa: E402

N = 80


def _pid(i):
    return str(5000 + i)


def _actual(n=N):
    return {_pid(i): round(20.0 + (n - i) * 3.0, 2) for i in range(n)}


def _positions(n=N, pos="WR"):
    return {_pid(i): pos for i in range(n)}


def _noisy(actual, amplitude, seed=999):
    out = {}
    for pid, a in sorted(actual.items()):
        seed = (1103515245 * seed + 12345) % (2 ** 31)
        u = (seed / (2 ** 31)) * 2 - 1
        out[pid] = round(max(1.0, a + amplitude * u), 2)
    return out


# ── top-N precision ──────────────────────────────────────────────────────────
def test_top_n_refuses_a_cell_smaller_than_n():
    """A 30-player cell has no top-48 and must NOT report a top-30 under that
    name — the number would be incomparable across positions and would flatter
    the shallow ones."""
    a = _actual(30)
    assert G.precision_at(a, a, list(a), 48) is None
    assert G.precision_at(a, a, list(a), 24) == 1.0


def test_top_n_is_an_intersection_not_a_rank_correlation():
    a = _actual(40)
    pids = list(a)
    # reverse the top 12 among themselves: same membership, different order
    top = sorted(pids, key=lambda p: -a[p])[:12]
    proj = dict(a)
    vals = [a[p] for p in top]
    for p, v in zip(top, reversed(vals)):
        proj[p] = v
    assert G.precision_at(proj, a, pids, 12) == 1.0     # membership unchanged


# ── population: absent is not zero ───────────────────────────────────────────
def test_a_player_missing_from_one_arm_is_excluded_and_counted():
    arms = {"sleeper": {"1": 100.0, "2": 90.0},
            "fantasypros": {"1": 110.0},
            "own_v6": {"1": 95.0, "2": 80.0}}
    pop = G.build_shared(arms, {"1": 120.0, "2": 70.0}, {"1": "WR", "2": "WR"})
    assert pop["exclusions"]["excluded_not_in_all_arms"] == 1
    assert pop["pids_by_pos"]["WR"] == ["1"]


def test_no_position_and_no_weekly_row_are_separately_counted():
    arms = {"a": {"1": 1.0, "2": 1.0, "3": 1.0}}
    pop = G.build_shared(arms, {"1": 10.0, "2": 10.0},
                         {"1": "WR", "2": "K", "3": "RB"})
    assert pop["exclusions"]["excluded_no_position"] == 1     # pid 2, a kicker
    assert pop["exclusions"]["excluded_no_weekly_row"] == 1   # pid 3, never played
    assert pop["shared_total"] == 1


def test_a_thin_cell_is_unmeasurable_not_omitted():
    a = _actual(MIN := G.MIN_N - 1)
    c = G.cell(a, a, list(a))
    assert c["status"] == "unmeasurable" and c["n"] == MIN
    assert "spearman" not in c


# ── the winner rule ──────────────────────────────────────────────────────────
def test_a_margin_inside_the_tie_band_is_declared_tied_not_won():
    """A ranking decided by 0.004 rho is not a finding. The prereg fixes the
    band at 0.01 and forbids breaking a tie with a metric picked afterwards."""
    cells = {"sleeper": {"WR": {"status": "measured", "spearman": 0.7700}},
             "fantasypros": {"WR": {"status": "measured", "spearman": 0.7660}},
             "own_v6": {"WR": {"status": "measured", "spearman": 0.7000}}}
    w = G.winner_at(cells, "WR")
    assert w["status"] == "TIED"
    assert w["winner"] is None
    assert set(w["tied"]) == {"sleeper", "fantasypros"}


def test_a_clear_margin_names_a_winner():
    cells = {"sleeper": {"WR": {"status": "measured", "spearman": 0.7700}},
             "fantasypros": {"WR": {"status": "measured", "spearman": 0.7000}}}
    w = G.winner_at(cells, "WR")
    assert w["status"] == "clear" and w["winner"] == "sleeper"
    assert w["margin_over_runner_up"] == 0.07


def test_an_unmeasurable_position_names_no_winner():
    assert G.winner_at({"a": {"WR": {"status": "unmeasurable"}}},
                       "WR")["winner"] is None


# ── the mechanism: blends, both directions ───────────────────────────────────
def _three_arms(actual, amps=(60.0, 60.0, 60.0), seeds=(1, 2, 3)):
    return {"sleeper": _noisy(actual, amps[0], seeds[0]),
            "fantasypros": _noisy(actual, amps[1], seeds[1]),
            "own_v6": _noisy(actual, amps[2], seeds[2])}


def test_independent_errors_let_the_blend_beat_the_better_parent():
    """The mechanism working. Three arms with INDEPENDENT noise — averaging
    cancels error and the blend should clear the best single source."""
    actual = _actual()
    arms = _three_arms(actual)
    res = G.grade(arms, actual, _positions())
    corr = res["error_correlation"]["WR"]
    assert all(abs(v) < 0.4 for v in corr.values()), corr
    assert res["blend_vs_better_parent"]["WR"]["blend_equal"]["beats_better_parent"]


def test_correlated_errors_stop_the_blend_beating_the_better_parent():
    """The regime the shipped sources actually sit in (`proj_mean_blend` §5:
    median error correlation 0.9439). One arm is a near-copy of another and one
    is far worse — averaging drags the good forecast toward the bad one."""
    actual = _actual()
    good = _noisy(actual, 25.0, 7)
    arms = {"sleeper": good,
            "fantasypros": {p: v + 0.5 for p, v in good.items()},
            "own_v6": _noisy(actual, 160.0, 11)}
    res = G.grade(arms, actual, _positions())
    corr = res["error_correlation"]["WR"]
    assert corr["sleeper|fantasypros"] > 0.95
    assert not res["blend_vs_better_parent"]["WR"]["blend_equal"]["beats_better_parent"]


def test_the_blend_must_beat_the_BETTER_parent_not_the_average_of_them():
    """The rule that decides whether a blend 'wins'. A blend sitting between
    the parents beats the mean of the parents and is still a loss."""
    actual = _actual()
    good = _noisy(actual, 20.0, 3)
    bad = _noisy(actual, 200.0, 4)
    res = G.grade({"sleeper": good, "fantasypros": bad,
                   "own_v6": {p: (good[p] + bad[p]) / 2 for p in good}},
                  actual, _positions())
    m = res["blend_vs_better_parent"]["WR"]
    assert m["better_parent"] == res["cells"]["sleeper"]["WR"]["spearman"]
    assert m["blend_equal"]["delta"] < 0
    assert not m["blend_equal"]["beats_better_parent"]


# ── the cross-fit ────────────────────────────────────────────────────────────
def test_no_player_is_graded_under_a_weight_his_own_error_helped_choose():
    actual = _actual()
    arms = _three_arms(actual)
    pids = list(actual)
    cf = G.cross_fit_weights(arms, actual, pids)
    assert cf["status"] == "fitted"
    assert len(cf["weights"]) == 2 and cf["weights"][0] != cf["weights"][1]
    # every player got a value, and it came from the fold he was NOT in
    assert set(cf["blended"]) == set(pids)
    even = [p for p in pids if int(p[-1]) % 2 == 0]
    w_from_odd_fit = cf["weights"][1]
    p = even[0]
    expect = sum(w_from_odd_fit[a] * arms[a][p] for a in G.SINGLE_ARMS)
    # The REPORTED weights are rounded to 4dp for the record; the blend uses
    # the unrounded ones. That is the whole of the residual here — the tolerance
    # is 4dp of a ~250-point projection, not a modelling slop allowance.
    assert abs(cf["blended"][p] - expect) < 0.05
    w_from_even_fit = cf["weights"][0]
    wrong = sum(w_from_even_fit[a] * arms[a][p] for a in G.SINGLE_ARMS)
    assert abs(cf["blended"][p] - wrong) > 0.05      # NOT his own fold's weights


def test_the_weights_favour_the_more_accurate_arm():
    actual = _actual()
    arms = {"sleeper": _noisy(actual, 15.0, 5),
            "fantasypros": _noisy(actual, 150.0, 6),
            "own_v6": _noisy(actual, 150.0, 8)}
    cf = G.cross_fit_weights(arms, actual, list(actual))
    for fold in cf["weights"]:
        assert fold["sleeper"] > fold["fantasypros"]
        assert fold["sleeper"] > fold["own_v6"]


def test_a_thin_fold_refuses_rather_than_fitting_on_nothing():
    actual = _actual(6)
    arms = _three_arms(actual)
    assert G.cross_fit_weights(arms, actual, list(actual))["status"] == "fold_too_thin"


# ── a missing arm is absent, never substituted ───────────────────────────────
def test_a_missing_arm_grades_the_rest_and_builds_no_blend():
    """If the FantasyPros re-fetch fails, the two survivors are graded and NO
    blend is invented from them under the three-way name."""
    actual = _actual()
    arms = {"sleeper": _noisy(actual, 40.0, 1), "own_v6": _noisy(actual, 40.0, 2)}
    res = G.grade(arms, actual, _positions())
    assert set(res["cells"]) == {"sleeper", "own_v6"}
    assert res["blend_vs_better_parent"]["WR"]["blend_equal"] is None


def test_the_thresholds_match_the_preregistration():
    text = (HERE.parent / "backtest" / "SLEEPER-VS-FP-PREREG.md").read_text()
    for token in ("`MIN_N = 10`", "top-12 / top-24 / top-48", "0.01"):
        assert token in text, f"prereg does not state {token}"
    assert G.MIN_N == 10 and G.TOP_N == (12, 24, 48) and G.TIE_RHO == 0.01
    assert G.SEASON == 2025 and G.SINGLE_ARMS == ("sleeper", "fantasypros", "own_v6")

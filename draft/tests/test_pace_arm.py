# TERRITORY: A
"""§5's guards.

The load-bearing one is `test_the_tilt_applied_OUTSIDE_v5_equals_the_tilt
_applied_INSIDE_it`. The whole non-invasive approach — grading a modified arm
without editing `own_model_v5.py` — is valid only if that identity holds, and
"it obviously commutes" is exactly the kind of claim that is wrong once and
then silently wrong forever.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "backtest"))

import pace_arm as A  # noqa: E402


# ── the tilt ─────────────────────────────────────────────────────────────────

def test_the_tilt_applied_OUTSIDE_v5_equals_the_tilt_applied_INSIDE_it():
    """v5 ends `v = age*rate*eg; if vg: v *= 1+...; out[pid] = max(0.0, v)`.
    An extra non-negative multiplier applied AFTER that clamp equals one
    applied before it, because the quantity is non-negative. Pinned rather
    than assumed — this identity is the licence for not editing v5."""
    positions = {"a": "RB", "b": "WR", "c": "TE", "d": "QB"}
    teams = {"a": "KC", "b": "TB", "c": "KC", "d": "TB"}
    pace = {"KC": 30.0, "TB": 36.0}          # mean 33.0
    comp = {"a": 100.0, "b": 50.0, "c": 20.0, "d": 400.0}
    k = 0.5
    got = A.pace_tilt(comp, teams, pace, positions, k)
    mean = 33.0
    for pid in comp:
        inside = comp[pid]
        if positions[pid] in A.TILTED:
            inside = max(0.0, comp[pid] * (1 + k * (mean - pace[teams[pid]]) / mean))
        assert got[pid] == pytest.approx(inside), pid


def test_the_sign_is_the_one_registered_before_grading():
    """AMENDMENT 1: fewer seconds per play = faster = more snaps ⇒ POSITIVE
    tilt. A sign flip discovered after the fact would be a second free look."""
    positions = {"fast": "RB", "slow": "RB"}
    teams = {"fast": "KC", "slow": "TB"}
    pace = {"KC": 30.0, "TB": 36.0}
    out = A.pace_tilt({"fast": 100.0, "slow": 100.0}, teams, pace, positions, 0.5)
    assert out["fast"] > 100.0
    assert out["slow"] < 100.0


def test_QB_is_never_tilted():
    positions = {"q": "QB"}
    out = A.pace_tilt({"q": 300.0}, {"q": "KC"}, {"KC": 30.0, "TB": 36.0},
                      positions, 1.0)
    assert out["q"] == 300.0
    assert "QB" not in A.TILTED


def test_a_team_with_no_measured_tempo_is_left_UNTILTED_not_zeroed():
    """Absent is not zero. A zeroed tilt would read as 'this offence played at
    exactly league-average tempo', which is a claim."""
    positions = {"x": "RB"}
    out = A.pace_tilt({"x": 100.0}, {"x": "XXX"}, {"KC": 30.0, "TB": 36.0},
                      positions, 1.0)
    assert out["x"] == 100.0


def test_an_empty_pace_map_returns_the_opinion_untouched_rather_than_crashing():
    comp = {"x": 100.0}
    assert A.pace_tilt(comp, {"x": "KC"}, {}, {"x": "RB"}, 1.0) == comp


def test_the_tilt_never_produces_a_negative_projection():
    positions = {"x": "RB"}
    out = A.pace_tilt({"x": 100.0}, {"x": "TB"}, {"KC": 10.0, "TB": 100.0},
                      positions, 5.0)
    assert out["x"] == 0.0


def test_the_positive_control_uses_the_UNINVERTED_vegas_direction():
    """More implied points is already the good direction; inverting it too
    would make the control test the opposite of the thing it controls for."""
    positions = {"good": "RB", "bad": "RB"}
    out = A.vegas_tilt_control({"good": 100.0, "bad": 100.0},
                               {"good": "KC", "bad": "CAR"},
                               {"KC": 26.0, "CAR": 18.0}, positions, 0.5)
    assert out["good"] > 100.0 > out["bad"]


# ── the selection and the bar ────────────────────────────────────────────────

def _h2h(**per_pos):
    out = {}
    for pos, arms in per_pos.items():
        row = {"status": "measured", "n": 50}
        row.update(arms)
        out[pos] = row
    return out


def test_the_bar_needs_two_improvements_AND_no_degradation_anywhere():
    good = {"mae": 10.0, "spearman": 0.80}
    base = {"mae": 11.0, "spearman": 0.79}
    same = {"mae": 11.0, "spearman": 0.79}
    h = _h2h(RB={"own_v6": base, "c": good},
             WR={"own_v6": base, "c": good},
             TE={"own_v6": base, "c": same})
    assert A.verdict(h, "c")["clears"] is True

    worse_rho = {"mae": 10.0, "spearman": 0.78}
    h2 = _h2h(RB={"own_v6": base, "c": good},
              WR={"own_v6": base, "c": good},
              TE={"own_v6": base, "c": worse_rho})
    v = A.verdict(h2, "c")
    assert v["clears"] is False and "TE Spearman" in v["degraded"]

    h3 = _h2h(RB={"own_v6": base, "c": good},
              WR={"own_v6": base, "c": same},
              TE={"own_v6": base, "c": same})
    assert A.verdict(h3, "c")["clears"] is False


def test_the_negative_control_is_never_an_eligible_candidate():
    """It is a check, not a candidate. Letting it win the grid would turn a
    void result into a 'finding' with the sign quietly reversed."""
    assert A.K_NEGATIVE_CONTROL not in A.K_GRID
    h = _h2h()
    for pos in A.TILTED:
        h[pos] = {"status": "measured", "n": 50, "own_v6": {"mae": 10, "spearman": .8}}
        for k in list(A.K_GRID) + [A.K_NEGATIVE_CONTROL]:
            h[pos][f"own_v6_pace{k:+.2f}"] = {
                "mae": 1.0 if k == A.K_NEGATIVE_CONTROL else 10.0,
                "spearman": 0.99 if k == A.K_NEGATIVE_CONTROL else 0.8}
    chosen = A.select_k(h)
    assert chosen["chosen_k"] in A.K_GRID
    assert chosen["chosen_k"] != A.K_NEGATIVE_CONTROL


def test_selection_prefers_lower_summed_MAE_then_higher_mean_spearman():
    h = _h2h()
    for pos in A.TILTED:
        h[pos] = {"status": "measured", "n": 50, "own_v6": {"mae": 10, "spearman": .8}}
        for i, k in enumerate(A.K_GRID):
            h[pos][f"own_v6_pace{k:+.2f}"] = {"mae": 10.0 - i, "spearman": 0.5}
    assert A.select_k(h)["chosen_k"] == A.K_GRID[-1]


# ── the committed artifact ───────────────────────────────────────────────────

@pytest.fixture(scope="module")
def arm():
    if not A.OUT.exists():
        pytest.skip("pace arm artifact not committed")
    return json.loads(A.OUT.read_text())


def test_the_arm_says_out_loud_that_its_k_is_NOT_leak_free(arm):
    """The registered selection fold does not exist. An artifact that let the
    in-sample optimum read as a selected constant would be claiming a
    leak-free win it does not have."""
    lp = arm["leak_protocol"]
    assert lp["registered_selection_fold"]["status"] == "UNAVAILABLE"
    assert "IN-SAMPLE" in lp["k_IS_NOT_leak_free"]
    assert "nflverse_weekly_points_2022.json" in lp["registered_selection_fold"]["why"]


def test_the_FEATURES_are_leak_free_even_though_k_is_not(arm):
    assert arm["test_fold"]["graded_season"] == 2025
    assert arm["test_fold"]["prior_seasons"] == [2023, 2024]
    assert arm["test_fold"]["pace_from"] == 2024
    assert arm["test_fold"]["pace_from"] < arm["test_fold"]["graded_season"]


def test_the_bar_was_not_cleared_and_the_degradations_are_named(arm):
    """If this ever goes green the verdict document is stale and must be
    re-run before anything is quoted from it."""
    assert arm["verdict"]["clears"] is False
    assert arm["verdict"]["degraded"]


def test_the_best_case_k_really_was_the_best_of_the_declared_grid(arm):
    cands = arm["k_selection"]["candidates"]
    assert {c["k"] for c in cands} == set(A.K_GRID)
    assert cands[0]["mae_sum"] == min(c["mae_sum"] for c in cands)
    assert arm["k_selection"]["chosen_k"] == cands[0]["k"]


def test_the_positive_control_moved_the_cells(arm):
    """SESSION-A 13f: a null is worth nothing until the instrument is shown
    capable of producing something else."""
    assert arm["controls"]["positive_control_moved_the_cells"] is True


def test_the_positive_control_admits_it_is_a_DOUBLED_tilt_at_RB_and_WR(arm):
    """v5 already carries vg=0.50 there. A control described as 'adding a
    known-good signal' when it is really doubling one overstates itself."""
    lim = arm["controls"]["positive_control_limitation"]
    assert "DOUBLED" in lim and "vg=0.00" in lim


def test_the_negative_control_result_is_recorded_not_quietly_dropped(arm):
    key = "negative_control_beats_own_v6_on_both_metrics_at"
    assert key in arm["controls"]
    assert isinstance(arm["controls"][key], list)


def test_ordering_is_reported_separately_from_MAE(arm):
    """The start/sit work found MAE and decision quality can rank arms
    differently, and ordering is what a draft board consumes."""
    chosen = arm["k_selection"]["chosen"]
    o = arm["test_fold"]["ordering"][chosen]
    for pos in A.TILTED:
        assert o[pos]["status"] == "measured"
        assert o[pos]["spearman_top"] is not None
        assert o[pos]["spearman_top_base"] is not None
        assert o[pos]["adjacent_pairs_flipped_vs_own_v6"] >= 0


def test_the_movers_are_draftable_players_not_only_deep_bench(arm):
    """A pace effect that only reorders players nobody drafts is not useful.
    This pins the opposite: it moves the top of the board materially and
    still does not pay."""
    for pos in A.TILTED:
        m = arm["movers"][pos]
        assert abs(m["max_abs_delta"]) > 1.0, pos
        assert m["players_changing_rank_within_top_n"] > 0, pos
        assert any(r["rank_own_v6"] <= 25 for r in m["largest_movers"]), pos


def test_the_artifact_prices_its_own_multiplicity(arm):
    assert "eight pace metrics" in arm["multiplicity"]
    assert "fourth read" in arm["multiplicity"]


def test_the_artifact_names_its_preregistration_and_the_amendment(arm):
    assert "pace_of_play_prereg_2026-08-16.md" in arm["preregistration"]
    assert "AMENDMENT 1" in arm["preregistration"]
    assert (HERE / "audit" / "pace_of_play_prereg_2026-08-16.md").exists()


def test_the_metric_graded_is_the_one_that_PASSED_the_gate(arm):
    assert arm["pace_metric"] == "neutral_sec_per_play"
    study = json.loads((HERE / "backtest" / "pace_study.json").read_text())
    assert study["persistence"][arm["pace_metric"]]["verdict"] == "PERSISTENT"

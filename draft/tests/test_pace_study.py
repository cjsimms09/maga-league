# TERRITORY: A
"""The pace study's own guards.

The statistics here are hand-written (no scipy in this environment), so they
are pinned against values computable by hand. A correlation routine that is
quietly wrong produces a study whose every number looks reasonable.
"""
import json
import math
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "backtest"))

import pace_study as S  # noqa: E402


# ── the statistics ───────────────────────────────────────────────────────────

def test_pearson_is_exact_on_a_perfect_line():
    assert S.pearson([1, 2, 3, 4], [2, 4, 6, 8]) == pytest.approx(1.0)
    assert S.pearson([1, 2, 3, 4], [8, 6, 4, 2]) == pytest.approx(-1.0)


def test_pearson_refuses_rather_than_dividing_by_zero_variance():
    assert S.pearson([1, 1, 1, 1], [1, 2, 3, 4]) is None
    assert S.pearson([1, 2], [3, 4]) is None


def test_spearman_sees_monotone_structure_pearson_understates():
    xs = [1, 2, 3, 4, 5]
    ys = [1, 4, 9, 16, 25]
    assert S.spearman(xs, ys) == pytest.approx(1.0)
    assert S.pearson(xs, ys) < 0.99


def test_ties_share_an_average_rank():
    assert S._ranks([10, 20, 20, 30]) == [1.0, 2.5, 2.5, 4.0]
    assert S._ranks([5, 5, 5]) == [2.0, 2.0, 2.0]


def test_spearman_equals_pearson_on_ranks_which_is_what_the_tie_rule_buys():
    xs = [3, 1, 4, 1, 5, 9, 2, 6]
    ys = [2, 7, 1, 8, 2, 8, 1, 8]
    assert S.spearman(xs, ys) == pytest.approx(S.pearson(S._ranks(xs), S._ranks(ys)))


def test_fisher_ci_brackets_the_estimate_and_widens_as_n_shrinks():
    lo, hi = S.fisher_ci(0.5, 32)
    assert lo < 0.5 < hi
    lo2, hi2 = S.fisher_ci(0.5, 12)
    assert (hi2 - lo2) > (hi - lo)
    assert S.fisher_ci(1.0, 32) is None
    assert S.fisher_ci(0.5, 3) is None


# ── the bootstrap ────────────────────────────────────────────────────────────

def _units(n, slope, noise=0.0, seed=1):
    import random
    rng = random.Random(seed)
    out = {}
    for i in range(n):
        x = rng.gauss(0, 1)
        y = slope * x + noise * rng.gauss(0, 1)
        out[f"T{i}"] = [("t1", x, y)]
    return out


def test_the_bootstrap_resamples_UNITS_not_observations():
    """A franchise contributes up to four transitions; treating those as
    independent narrows the CI on a sample that is really 32 wide, not 128."""
    one = {f"T{i}": [("t1", float(i), float(i))] for i in range(20)}
    four = {f"T{i}": [(f"t{k}", float(i), float(i)) for k in range(4)]
            for i in range(20)}
    a = S.cluster_bootstrap(one, S._pooled_stat("pearson"), draws=400, seed=7)
    b = S.cluster_bootstrap(four, S._pooled_stat("pearson"), draws=400, seed=7)
    assert a["units"] == b["units"] == 20
    assert (a["ci95"][1] - a["ci95"][0]) == pytest.approx(
        b["ci95"][1] - b["ci95"][0], abs=0.05)


def test_the_bootstrap_ci_excludes_zero_on_real_signal_and_includes_it_on_noise():
    """The instrument must be able to say BOTH things, or neither answer is
    evidence (SESSION-A 13f)."""
    sig = S.cluster_bootstrap(_units(32, 1.0, 0.3, seed=3),
                              S._pooled_stat("pearson"), draws=800, seed=11)
    assert sig["ci95"][0] > 0
    noise = S.cluster_bootstrap(_units(32, 0.0, 1.0, seed=4),
                                S._pooled_stat("pearson"), draws=800, seed=11)
    assert noise["ci95"][0] < 0 < noise["ci95"][1]


def test_the_bootstrap_is_deterministic_for_a_fixed_seed():
    u = _units(24, 0.6, 0.5, seed=5)
    a = S.cluster_bootstrap(u, S._pooled_stat("pearson"), draws=300, seed=42)
    b = S.cluster_bootstrap(u, S._pooled_stat("pearson"), draws=300, seed=42)
    assert a == b


def test_the_pooled_estimator_averages_fisher_z_per_transition():
    """Pooling raw r's instead would weight a transition by nothing in
    particular, and is not what the prereg registered."""
    sample = [("a", 1, 1), ("a", 2, 2), ("a", 3, 3), ("a", 4, 4),
              ("b", 1, 4), ("b", 2, 3), ("b", 3, 2), ("b", 4, 1)]
    assert S._pooled_stat("pearson")(sample) == pytest.approx(0.0, abs=1e-9)


# ── the committed artifact ───────────────────────────────────────────────────

@pytest.fixture(scope="module")
def study():
    if not S.OUT.exists():
        pytest.skip("pace study artifact not committed")
    return json.loads(S.OUT.read_text())


def test_the_instrument_control_is_present_and_positive(study):
    """SESSION-A 13f's trigger: when a result is an ABSENCE, state what the
    instrument would have shown if the thing were present. The volume nulls
    below are worth nothing unless this row is clearly positive."""
    key = [k for k in study["persistence"] if "CONTROL" in k]
    assert len(key) == 1
    ctrl = study["persistence"][key[0]]
    assert ctrl["verdict"] == "PERSISTENT"
    assert ctrl["pooled_spearman"]["ci95"][0] > 0


def test_the_control_is_not_smuggled_into_the_pace_family(study):
    """It is the estimator's calibration, never a pace metric — an artifact
    that let it rank among the findings would be quoting the market's opinion
    of a team as a measurement of tempo."""
    assert all("CONTROL" not in m for m in S.METRICS)
    assert all("CONTROL" not in m for m in study["orthogonality"])


def test_the_gate_verdicts_follow_the_preregistered_bands(study):
    for m, r in study["persistence"].items():
        p = r["pooled_spearman"]
        lo, hi = p["ci95"]
        if lo <= 0 <= hi:
            assert r["verdict"] == "NOT PERSISTENT", m
        elif abs(p["point"]) < S.PERSISTENCE_FLOOR:
            assert r["verdict"] == "WEAKLY PERSISTENT", m
        else:
            assert r["verdict"] == "PERSISTENT", m


def test_the_preregistered_volume_feature_really_did_fail_the_gate(study):
    """The whole shape of the finding: what everyone means by 'pace' — plays
    per game — does not carry year to year. If this ever goes green the
    verdict document is stale and must be re-run."""
    assert study["persistence"]["neutral_plays_per_game"]["verdict"] == "NOT PERSISTENT"
    assert study["persistence"]["plays_per_game"]["verdict"] == "NOT PERSISTENT"


def test_tempo_passed_the_gate_and_is_orthogonal_to_the_tilt_we_already_have(study):
    assert study["persistence"]["neutral_sec_per_play"]["verdict"] == "PERSISTENT"
    o = study["orthogonality"]["neutral_sec_per_play"]
    assert o["band"] == "SUBSTANTIALLY ORTHOGONAL"
    assert abs(o["pooled_pearson"]["point"]) < S.OVERLAP_BAND


def test_the_mechanism_chain_is_signed_correctly_and_breaks_going_forward(study):
    """Tempo buys plays inside a season and cannot be resolved from zero
    across one. That break is the finding, not a missing measurement."""
    m = study["mechanism"]["plays_per_game"]
    assert m["same_season"]["ci95"][1] < 0
    lo, hi = m["next_season"]["ci95"]
    assert lo < 0 < hi


def test_every_correlation_reported_carries_an_interval(study):
    for section in ("persistence", "orthogonality"):
        for metric, r in study[section].items():
            for row in r.get("per_transition") or r.get("per_season"):
                assert row["n"] >= 30, (metric, row)
            pooled = r.get("pooled_spearman") or r.get("pooled_pearson")
            assert pooled and len(pooled["ci95"]) == 2, metric


def test_the_artifact_names_its_preregistration(study):
    assert study["preregistration"].endswith("pace_of_play_prereg_2026-08-16.md")
    assert (HERE / "audit" / "pace_of_play_prereg_2026-08-16.md").exists()


def test_no_transition_reads_a_season_at_or_after_the_one_it_predicts(study):
    for m, r in study["persistence"].items():
        for row in r["per_transition"]:
            y0, y1 = row["transition"].split("->")
            assert int(y0) < int(y1), m
    for m, r in study["orthogonality"].items():
        for row in r["per_season"]:
            assert row["pace_from"] < row["target_season"], m


@pytest.mark.repo_parity
def test_the_committed_study_equals_a_regeneration_from_the_committed_store(study):
    """repo_parity: the anti-hand-edit guard. Both inputs (the pace store and
    the vegas store) are committed, so this must reproduce exactly."""
    assert S.persistence(metrics=("neutral_sec_per_play",)) == {
        "neutral_sec_per_play": study["persistence"]["neutral_sec_per_play"]}
    assert S.orthogonality(metrics=("neutral_sec_per_play",)) == {
        "neutral_sec_per_play": study["orthogonality"]["neutral_sec_per_play"]}


def test_math_import_is_used_for_a_real_transform_not_decoration():
    assert S._atanh(0.0) == 0.0
    assert S._atanh(0.5) == pytest.approx(math.atanh(0.5))
    assert abs(S._atanh(1.0)) < 10          # clamped, never inf

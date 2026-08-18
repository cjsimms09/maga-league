# TERRITORY: D
"""THE COLLINEARITY CHECK — proven on synthetic cases and on the real artifact.

The tool encodes the question that decided three graded studies on 2026-08-17
(registers 13, 14, 30). A rule nobody can falsify is folklore, so both steps are
exercised against cases where the right answer is known, and the load-bearing
claim — that step 1 alone does NOT settle it — is reproduced from the committed
weekly_volatility.json rather than asserted.

Run: python -m pytest draft/tests/test_collinearity_check.py -q
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import collinearity_check as C  # noqa: E402

VOLATILITY = ROOT / "draft" / "backtest" / "weekly_volatility.json"


def test_step1_detects_a_rescaled_copy_and_clears_an_independent_one():
    """KNOWN-POSITIVE both ways. A metric that IS the level must be flagged; one
    independent of it must not. Without the second half, "redundant" could be a
    verdict the tool returns for everything."""
    rng = random.Random(0)
    level = [float(i) for i in range(200)]

    copy = [v * 3.0 + 1.0 for v in level]          # a rescaled copy
    assert C.redundancy(copy, level)["redundant"] is True

    independent = [rng.gauss(0, 1) for _ in level]  # unrelated
    r = C.redundancy(independent, level)
    assert r["redundant"] is False, r


def test_step2_separates_an_inherited_persistence_from_a_real_one():
    """The decisive step, judged ACROSS SEEDS rather than on one draw.

    With zero true trait the partial is unbiased (mean -0.001 over 40 seeds at
    n=300) but spreads about +/-0.13, so a single fixture can easily draw a
    1-in-20 high value — this test did exactly that on its first run and briefly
    looked like a bias in the statistic. Judging a rule on one sample is the
    error the rule itself exists to catch, so the inherited case is required to
    be rejected in the LARGE MAJORITY of seeds, not every one.
    """
    n = 300
    level = [float(i) for i in range(n)]

    # INHERITED: both the metric and its future are just the level plus
    # independent noise. There is no trait, so step 2 should almost always say so.
    flagged = 0
    trials = 20
    for seed in range(trials):
        rng = random.Random(seed)
        m = [v + rng.gauss(0, 80) for v in level]
        nxt = [v + rng.gauss(0, 80) for v in level]
        if C.survives_control(nxt, m, level, permutations=200)["inherited"]:
            flagged += 1
    assert flagged >= int(trials * 0.8), (
        f"only {flagged}/{trials} zero-trait cases were flagged inherited — "
        "step 2 is passing metrics that carry no independent signal")

    # REAL: a persistent per-player component orthogonal to the level. This must
    # survive in every seed, or the step cannot detect what it exists to find.
    for seed in range(5):
        rng = random.Random(100 + seed)
        trait = [rng.gauss(0, 1) for _ in range(n)]
        m = [t + rng.gauss(0, 0.3) for t in trait]
        nxt = [t + rng.gauss(0, 0.3) for t in trait]
        got = C.survives_control(nxt, m, level, permutations=200)
        assert got["survives"] is True, (seed, got)


def test_the_real_artifact_reproduces_the_sd_vs_cv_split():
    """THE LOAD-BEARING CLAIM, reproduced rather than asserted: step 1 alone does
    not settle it. weekly_sd and weekly_cv sit at nearly the same |rho| to the
    mean and reach OPPOSITE verdicts at step 2 — sd's persistence is inherited,
    cv's is not. If this stops holding, the tool's own calibration is wrong."""
    pp = json.loads(VOLATILITY.read_text())["per_player"]
    a, b = pp["2024"], pp["2025"]
    ids = sorted(a.keys() & b.keys())
    assert len(ids) > 100, f"only {len(ids)} shared players"

    mean = [a[i]["mean"] for i in ids]
    sd, sd_next = [a[i]["sd"] for i in ids], [b[i]["sd"] for i in ids]
    cv, cv_next = [a[i]["cv"] for i in ids], [b[i]["cv"] for i in ids]

    # step 1: both are strongly related to the mean, in opposite directions
    r_sd, r_cv = C.redundancy(sd, mean), C.redundancy(cv, mean)
    assert r_sd["rho"] > 0.75, r_sd
    assert r_cv["rho"] < -0.60, r_cv

    # step 2: and they SPLIT — which is the whole reason step 2 exists
    assert C.survives_control(sd_next, sd, mean)["inherited"] is True
    assert C.survives_control(cv_next, cv, mean)["inherited"] is False


def test_the_calibration_table_matches_the_registers_it_cites():
    """The comparables are the tool's only claim to authority. Each must name a
    register row and a verdict, and the two that failed must be marked failed —
    a calibration that drifted from its own evidence is worse than none."""
    for name, c in C.CALIBRATION.items():
        assert isinstance(c["register"], int), name
        assert c["verdict"], name
    assert C.CALIBRATION["tprr_vs_targets"]["survives"] is False
    assert C.CALIBRATION["snap_share_vs_prior_points"]["survives"] is False
    assert C.CALIBRATION["weekly_sd_vs_mean"]["survives"] is False
    assert C.CALIBRATION["weekly_cv_vs_mean"]["survives"] is True


def test_the_noise_floor_is_n_aware_and_monotone():
    """DEFECT GUARDED: reading every study against one sample size.

    The first version of this calibration was stated at n=300 only, and three
    studies running at n=136-362 were read against it. The floor at n=150 is
    nearly double the floor at n=400, so a single figure mischaracterised folds
    in both directions — it called snap share's +0.140 (n=354, floor +0.086) a
    noise draw when it clears comfortably.
    """
    floors = [C.noise_floor(n) for n in (100, 150, 200, 300, 400)]
    assert floors == sorted(floors, reverse=True), floors
    assert C.noise_floor(100) > C.noise_floor(400) * 1.8, floors

    # interpolates between measured sizes rather than snapping to one
    mid = C.noise_floor(250)
    assert C.noise_floor(300) < mid < C.noise_floor(200), mid

    # and is defined outside the measured range rather than raising
    assert C.noise_floor(50) == C.noise_floor(100)
    assert C.noise_floor(5000) == C.noise_floor(400)


def test_the_published_folds_are_read_against_their_own_n():
    """The three graded studies re-read: each fold's partial against the floor
    for ITS sample size. Pins the corrected reading so it cannot drift back to a
    single-n comparison."""
    snap = json.loads((ROOT / "draft" / "backtest" / "snap_share_arm.json").read_text())
    for fold, v in snap["folds"].items():
        n = v["population"]["also_in_points_y1"]
        assert 300 < n < 400, (fold, n)
        assert C.noise_floor(n) < 0.10, (fold, n)   # not the n=300 figure

    routes = json.loads((ROOT / "draft" / "backtest" / "routes_tprr_study.json").read_text())
    for fold, v in routes["e2_increment"].items():
        n = v["population"]["also_present_in_points_store"]
        assert C.noise_floor(n) > 0.12, (fold, n)   # a much higher bar at n~150

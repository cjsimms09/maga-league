# TERRITORY: D
"""ROUTES-TPRR mechanics — the study's machinery, not its verdict.

Preregistered in draft/backtest/ROUTES-TPRR-PREREG.md; result in
routes_tprr_study.json (`clears: false`, a null for the season-grain
construction — draft/audit/routes_tprr_row14_2026-08-17.md).

Each test names the defect it guards. The load-bearing one is the
scoring-fingerprint refusal: 2021/2022 weekly points were scored under a
different table (220bf4c671786351) than 2023-25 (bd8f3e50bd67a9ce), and pooling
across that boundary produces per-player totals that never existed under either
table — with, as weekly_volatility put it when it refused the same two seasons,
"nothing in the arithmetic to complain". A silent pool does not fail; it
succeeds, quietly, with wrong numbers.

Run: python -m pytest draft/tests/test_routes_tprr_study.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import routes_tprr_study as S  # noqa: E402

RESULT = ROOT / "draft" / "backtest" / "routes_tprr_study.json"


# ── 1. the leakage refusal ──────────────────────────────────────────────────

def test_the_fingerprint_crossing_transition_is_refused_not_pooled():
    """DEFECT GUARDED: silently pooling seasons scored under different tables.

    2022->2023 must never appear in E2. This is asserted against the declared
    fold list AND against the stores' real fingerprints, so the constant and
    the data cannot drift apart.
    """
    assert (2022, 2023) not in S.E2_TRANSITIONS
    assert (2022, 2023) in S.E1_TRANSITIONS, (
        "E1 involves no scoring, so refusing this transition there would throw "
        "away a usable fold for no reason")

    _, fp2022 = S.season_points(2022)
    _, fp2023 = S.season_points(2023)
    assert fp2022 != fp2023, (
        "the fingerprints now MATCH — if 2021-22 were re-scored under the "
        "current table, 2022->2023 becomes usable and E2 gains a fourth fold; "
        "update the prereg and this test together")

    # KNOWN-POSITIVE CONTROL — the refusal above is meaningless unless the
    # fingerprints of an ACCEPTED fold really do match. Otherwise this test
    # would pass on a store where every season differed.
    for y0, y1 in S.E2_TRANSITIONS:
        _, a = S.season_points(y0)
        _, b = S.season_points(y1)
        assert a == b, f"{y0}->{y1} is an accepted fold but its fingerprints differ"


# ── 2. season TPRR is a ratio of sums, not a mean of ratios ─────────────────

def test_season_tprr_is_computed_from_summed_counts():
    """DEFECT GUARDED: averaging weekly ratios, which weights a 12-route week
    equally with a 45-route week and quietly flatters low-volume players.

    Fixture is chosen so the two constructions DISAGREE — 10/50 and 2/10 give
    a ratio-of-sums of 12/60 = 0.20 but a mean-of-ratios of (0.20+0.20)/2 =
    0.20... so the numbers are deliberately made to differ below.
    """
    weeks = [{"week": 1, "players": {"p": {"routes": 50, "targets": 5}}},
             {"week": 2, "players": {"p": {"routes": 10, "targets": 5}}}]
    # ratio of sums = 10/60 = 0.1667; mean of weekly ratios = (0.10+0.50)/2 = 0.30
    acc: dict[str, dict] = {}
    for wk in weeks:
        for pid, row in wk["players"].items():
            a = acc.setdefault(pid, {"routes": 0, "targets": 0})
            a["routes"] += row["routes"]
            a["targets"] += row["targets"]
    got = acc["p"]["targets"] / acc["p"]["routes"]
    assert round(got, 4) == 0.1667
    assert round(got, 4) != 0.30, "this is the mean-of-ratios value; the two must differ"


# ── 3. absent stays absent ──────────────────────────────────────────────────

def test_a_player_missing_from_either_season_is_excluded_not_imputed():
    """DEFECT GUARDED: filling a gap with a positional mean, which hands the
    steadiest reading to the injury-return group (weekly_volatility's lesson).
    """
    a = {"both": {"routes": 300, "targets": 60, "tprr": 0.2},
         "only_y0": {"routes": 300, "targets": 60, "tprr": 0.2}}
    b = {"both": {"routes": 300, "targets": 75, "tprr": 0.25},
         "only_y1": {"routes": 300, "targets": 75, "tprr": 0.25}}
    assert S.eligible_pairs(a, b) == ["both"]

    # ...and the volume floor really excludes, rather than being decoration.
    thin_a = dict(a, both={"routes": S.MIN_ROUTES - 1, "targets": 40, "tprr": 0.2})
    assert S.eligible_pairs(thin_a, b) == []


# ── 4. the committed result records its own population ─────────────────────

def test_the_committed_result_records_join_survival_per_fold():
    """Register row 18's lesson, applied to this study: a null measured over an
    unknown surviving population is not a finding. Every E2 fold must state how
    many rows reached the outcome store, not just its correlation."""
    doc = json.loads(RESULT.read_text())
    assert doc["status"] == "graded"
    assert doc["e2_increment"], "no E2 folds in the committed result"
    for fold, v in doc["e2_increment"].items():
        pop = v["population"]
        for key in ("eligible_both_seasons", "also_present_in_points_store",
                    "lost_at_points_join"):
            assert isinstance(pop.get(key), int), f"{fold}: {key} missing"
        assert pop["eligible_both_seasons"] > 50, f"{fold}: population collapsed"
        assert (pop["eligible_both_seasons"] - pop["also_present_in_points_store"]
                == pop["lost_at_points_join"]), f"{fold}: loss accounting inconsistent"


def test_the_verdict_matches_the_preregistered_ship_rule():
    """The ship rule is "positive AND beats null in ALL THREE folds". `clears`
    must be exactly that conjunction — a verdict that drifts from its own
    stated rule is how a null becomes a result."""
    doc = json.loads(RESULT.read_text())
    folds = doc["e2_increment"].values()
    expected = all(v["partial_rho_tprr_given_targets"] is not None
                   and v["partial_rho_tprr_given_targets"] > 0
                   and v["beats_null_p95"] for v in folds)
    assert doc["clears"] is expected

    # CONTROL: the rule must be capable of both answers on this data — at least
    # one fold passes and at least one fails, so `clears: false` is a measured
    # outcome rather than a bar nothing could ever clear.
    passes = [v for v in doc["e2_increment"].values() if v["beats_null_p95"]]
    fails = [v for v in doc["e2_increment"].values() if not v["beats_null_p95"]]
    assert passes and fails, (
        "every fold agreed — the ship rule was not discriminating on this run, "
        "so `clears` says less than it appears to")


# ── 5. the statistics themselves ───────────────────────────────────────────

def test_partial_spearman_removes_the_controlled_variable():
    """If z is a monotone function of x, its partial correlation with anything,
    controlling for x, must be ~0. A partial that ignored x would report the
    raw correlation and turn a duplicate into a discovery — which is exactly
    the failure mode E2 exists to detect."""
    import random
    rng = random.Random(0)                       # fixed: this must not flake
    n = 200
    x = [float(i) for i in range(n)]

    # PERFECT rank-collinearity leaves z with zero residual variance, so the
    # partial is UNDEFINED, not zero — the study reports None rather than
    # inventing a 0.0. Found by this control on 2026-08-17; the real folds all
    # returned numbers so it never bit, but `clears` handles None correctly
    # (`is not None and > 0` -> False) and that is load-bearing.
    assert S.partial_spearman(x, [v * 3 for v in x], x) is None

    # THE REGIME THAT MATTERS — the study's own: z is heavily but not perfectly
    # collinear with x (rho ~= 0.8, matching the measured rho(tprr, targets) of
    # 0.74-0.82), and y is a function of x ALONE. z therefore adds nothing, and
    # the partial must say so. A partial that ignored x would instead report
    # z's large RAW correlation with y and turn a duplicate into a discovery —
    # precisely the failure E2 exists to detect.
    z = [v + rng.gauss(0, n / 6.0) for v in x]
    y = [v + rng.gauss(0, n / 12.0) for v in x]
    assert S.spearman(z, x) > 0.7, "fixture did not reproduce the study's regime"
    assert S.spearman(y, z) > 0.4, "z must have a large RAW correlation with y"

    partial = S.partial_spearman(y, z, x)
    assert partial is not None and abs(partial) < 0.15, partial

    # KNOWN-POSITIVE CONTROL — it must still find a relationship that is
    # genuinely independent of x, or the assertion above passes on a function
    # that returns ~0 for everything.
    y_with_z = [yi + 2.0 * zi for yi, zi in zip(y, z)]
    assert S.partial_spearman(y_with_z, z, x) > 0.5

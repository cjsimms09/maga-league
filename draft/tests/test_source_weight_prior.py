# TERRITORY: A
"""Gates for the source-weight prior (SOURCE-WEIGHT-PRIOR-PREREG.md).

Every gate is two-armed: a fixture that passes AND a fixture that must fail —
a gate that cannot fail is a rubber stamp. Plus: the committed artifact equals
regeneration (the verdict cannot drift from the code), the shipped verdict is
the preregistered one (failed-gate on G3, RB/2023 — pinned so a quiet
re-run cannot flip the negative without a code change showing up in review),
and G5's both arms on the posterior combine (prior-absent regression;
measured dominance at January n).
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BACKTEST = HERE.parent / "backtest"
sys.path.insert(0, str(BACKTEST))

import source_weight_prior as SWP  # noqa: E402


# ── fixtures ────────────────────────────────────────────────────────────────

def _cells(bias_qb=20.0, mae_2023_rb=36.0):
    """Three-year fp_cells fixture, tunable to flip each gate."""
    base = {
        "2023": {"QB": {"n": 75, "mae": 46.0, "bias": bias_qb},
                 "RB": {"n": 121, "mae": mae_2023_rb, "bias": 1.5},
                 "WR": {"n": 180, "mae": 23.0, "bias": -9.0},
                 "TE": {"n": 96, "mae": 17.0, "bias": -9.0}},
        "2024": {"QB": {"n": 69, "mae": 57.0, "bias": 14.0},
                 "RB": {"n": 111, "mae": 39.0, "bias": 0.1},
                 "WR": {"n": 177, "mae": 30.0, "bias": -3.5},
                 "TE": {"n": 87, "mae": 24.0, "bias": -9.0}},
        "2025": {"QB": {"n": 71, "mae": 64.0, "bias": 15.0},
                 "RB": {"n": 115, "mae": 38.0, "bias": -0.7},
                 "WR": {"n": 178, "mae": 31.0, "bias": -4.0},
                 "TE": {"n": 100, "mae": 22.5, "bias": -12.5}},
    }
    return base


def _h2h(fp_beats=True):
    fp_mae = 40.0 if fp_beats else 50.0
    cell = {"status": "measured",
            "fantasypros": {"mae": fp_mae, "bias": 0.0, "spearman": 0.8},
            "naive_prev": {"mae": 45.0, "bias": 0.0, "spearman": 0.7}}
    return {"2024": {p: dict(cell) for p in SWP.POSITIONS},
            "2025": {p: dict(cell) for p in SWP.POSITIONS}}


# ── G1 both arms ────────────────────────────────────────────────────────────

def test_g1_passes_when_fp_beats_every_baseline():
    assert SWP.gate1_skill_sign(_h2h(fp_beats=True))["pass"] is True


def test_g1_fails_on_a_single_losing_cell():
    h = _h2h(fp_beats=True)
    h["2025"]["TE"] = {"status": "measured",
                       "fantasypros": {"mae": 46.0},
                       "naive_prev": {"mae": 45.0}}
    assert SWP.gate1_skill_sign(h)["pass"] is False


# ── G2 both arms ────────────────────────────────────────────────────────────

def test_g2_passes_on_persistent_signs_and_exempts_small_bias():
    res = SWP.gate2_bias_sign(_cells())
    assert res["pass"] is True
    rb = [f for f in res["folds"] if f["pos"] == "RB"]
    assert rb and all(f["claim"] is False for f in rb), \
        "RB's tiny bias must be an exemption, not a claim"


def test_g2_fails_on_a_sign_flip():
    cells = _cells()
    cells["2023"]["QB"]["bias"] = -20.0   # flips against the 2024+2025 fit
    assert SWP.gate2_bias_sign(cells)["pass"] is False


# ── G3 both arms ────────────────────────────────────────────────────────────

def test_g3_passes_inside_the_band():
    assert SWP.gate3_scale_transfer(_cells())["pass"] is True


def test_g3_fails_outside_the_band():
    cells = _cells(mae_2023_rb=25.9)   # the real shape: fit 38.5 vs held 25.9
    res = SWP.gate3_scale_transfer(cells)
    assert res["pass"] is False
    bad = [f for f in res["folds"] if not f.get("ok")]
    assert bad and bad[0]["pos"] == "RB" and bad[0]["held_out"] == "2023"


# ── G4 degrades, never fails ────────────────────────────────────────────────

def test_g4_unhealthy_position_zeroes_the_gap_but_still_builds():
    div = {"status": "measured", "date_spread_days": 0,
           "by_position": {"QB": {"n": 30, "median_gap": 5.0},
                           "RB": {"n": 30, "median_gap": 2.0},
                           "WR": {"n": 30, "median_gap": 29.0},
                           "TE": {"n": 3, "median_gap": 30.0}}}   # TE too thin
    g4 = SWP.gate4_divergence_health(div)
    assert g4["per_position"]["TE"]["healthy"] is False
    assert g4["per_position"]["WR"]["healthy"] is True
    prior = SWP.build_prior(_cells(), div, g4)
    assert prior["TE"]["bias_prior"]["gap_used"] is False
    assert prior["TE"]["bias_prior"]["sleeper"] == prior["TE"]["bias_prior"]["fantasypros"]
    assert prior["WR"]["bias_prior"]["gap_used"] is True


# ── G5 both arms: a prior, not a verdict ────────────────────────────────────

def _prior_cell():
    div = {"status": "measured", "date_spread_days": 0,
           "by_position": {p: {"n": 40, "median_gap": 25.0}
                           for p in SWP.POSITIONS}}
    g4 = SWP.gate4_divergence_health(div)
    return SWP.build_prior(_cells(), div, g4)["WR"]


def test_g5_no_prior_means_no_claim():
    res = SWP.combine_with_measured(None, {"fantasypros": {"mse": 900, "n": 100}})
    assert res["status"] == "no_prior" and res["weights"] is None


def test_g5_dominance_bar_vs_n0_rule_the_recorded_inconsistency():
    """G5(b) as preregistered is NOT satisfied by the preregistered n0 rule —
    PINNED as a second honest negative, not patched.

    The prereg fixed two clauses that conflict at high-n positions: §2.5 sets
    n0 = t²·mean_n (45 at WR), and G5(b) demands posterior weights within
    0.05 of pure measured at January n. With n=120 and a maximally-opposed
    prior, the prior still carries n0/(n0+n) ≈ 27% of the MSE combine and the
    weight deviates by ~0.06. Resolving n0 vs the bar is a NEW preregistration
    decision (smaller t, or a looser bar) — recorded here so any future prior
    attempt must face it, never quietly tuned after the fact.
    """
    cell = _prior_cell()
    measured = {"fantasypros": {"mse": 1600.0, "n": 120},
                "sleeper": {"mse": 900.0, "n": 120}}
    post = SWP.combine_with_measured(cell, measured)["weights"]
    inv_f, inv_s = 1 / 1600.0, 1 / 900.0
    pure = {"fantasypros": inv_f / (inv_f + inv_s),
            "sleeper": inv_s / (inv_f + inv_s)}
    dev = max(abs(post[s] - pure[s]) for s in pure)
    assert 0.05 < dev < 0.10, (
        f"the recorded G5 inconsistency moved (deviation now {dev:.4f}) — "
        "if machinery changed, the negative needs re-deriving, not deleting")


def test_g5_prior_only_when_nothing_measured():
    cell = _prior_cell()
    res = SWP.combine_with_measured(cell, None)
    assert res["status"] == "prior_only"
    assert res["weights"] == cell["weights"]


# ── the shipped verdict is the preregistered one, and it cannot drift ───────

# NOTE (2026-08-16, artifact-freshness infra): the committed-artifact ==
# regeneration pin that used to live here (`test_artifact_equals_
# regeneration`, @pytest.mark.repo_parity) is now covered by draft/data/
# artifact_registry.json + `draft/tools/check_artifact_freshness.py` (entry
# "source_weight_prior") instead of a bespoke pytest function — see
# draft/audit/artifact_freshness_infra_2026-08-16.md. That check runs
# `SWP.build_artifact()` and diffs it against source_weight_prior.json
# exactly as this test did; it is informational (FRESH/STALE), never a
# pytest gate item, because the mismatch it reports is "the board moved on"
# (proj_series.json's snapshot_dates advancing), not a code defect. The
# VERDICT itself stays gate-checked date-free by the unmarked test below.


def test_shipped_verdict_is_the_honest_negative():
    doc = json.loads((BACKTEST / "source_weight_prior.json").read_text())
    assert doc["status"] == "failed-gate"
    assert doc["prior"] is None, "a failed gate must wire nothing"
    g3 = doc["gates"]["G3_scale_transfer"]
    assert g3["pass"] is False
    bad = [f for f in g3["folds"] if not f.get("ok")]
    assert [(f["pos"], f["held_out"]) for f in bad] == [("RB", "2023")], \
        "the negative's shape moved — a re-run flipped cells without review"
    # the passing gates stay recorded: the negative is specific, not global
    assert doc["gates"]["G1_skill_sign"]["pass"] is True
    assert doc["gates"]["G2_bias_sign"]["pass"] is True

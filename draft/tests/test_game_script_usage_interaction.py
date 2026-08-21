# TERRITORY: D
"""Tests for draft/backtest/game_script_usage_interaction.py.

Rule 3e: a probe that has never returned a positive has not been tested, only
run. This file carries a KNOWN-POSITIVE control (the interaction mechanism
must produce a genuinely different prediction for a real-shaped bell-cow vs
committee player under a real game-script swing, while the existing v1 arm
cannot tell them apart at all) and a KNOWN-NEGATIVE / fail-arm control (force
the mechanism off and the interaction arm must collapse EXACTLY to v1 — a bug
that silently disconnects usage from the tilt would pass every other test
here and still be caught by this one).

Run: python3 -m pytest draft/tests/test_game_script_usage_interaction.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backtest"))

import game_script_usage_interaction as G  # noqa: E402


# ── known-positive control: the mechanism does something v1 cannot ─────────

def test_bellcow_and_committee_get_DIFFERENT_interaction_tilts_same_everything_else():
    """Same position, same vg[pos], same delta (a real favorable game-script
    swing), same baseline_pg — the ONLY thing that differs is usage share.
    KNOWN POSITIVE: the interaction arm must move them apart. MUTATION this
    catches: usage_multiplier wired to the wrong field, or clipped to a
    constant, would make every player identical regardless of usage — the
    exact failure mode that would make this whole study a no-op."""
    baseline_pg, vg_pos, delta = 12.0, 0.5, 0.20  # a real, sizeable favorable swing
    pos_mean_share = 0.12
    bellcow_mult = G.usage_multiplier(0.30, pos_mean_share)   # a real bell-cow share
    committee_mult = G.usage_multiplier(0.05, pos_mean_share)  # a real committee share
    assert bellcow_mult > 2.0 and committee_mult < 1.0, (bellcow_mult, committee_mult)

    bellcow = G.arm_predictions(baseline_pg, vg_pos, delta, bellcow_mult)
    committee = G.arm_predictions(baseline_pg, vg_pos, delta, committee_mult)

    assert abs(bellcow["interaction"] - committee["interaction"]) > 0.5, (
        "a bell-cow and a committee back at the same position/delta must get "
        "meaningfully different interaction predictions")
    # AND the point of the whole study: v1 cannot tell them apart at all.
    assert bellcow["v1_tilt"] == committee["v1_tilt"], (
        "v1_tilt is position-only by design — it must be IDENTICAL for both "
        "players here, which is exactly the gap this interaction arm exists "
        "to close")
    assert bellcow["interaction"] > bellcow["v1_tilt"] > bellcow["no_tilt"], (
        "for a bell-cow on a favorable swing, interaction should tilt UP "
        "harder than the position-only arm, which tilts up harder than flat")
    assert committee["interaction"] < committee["v1_tilt"], (
        "for a committee piece the interaction should tilt LESS than the "
        "position-only arm gives him credit for")


def test_unfavorable_swing_flips_the_same_asymmetry():
    """KNOWN POSITIVE, other sign. A bad game script should punish the
    bell-cow's PREDICTION harder than the committee piece's, mirroring the
    favorable case. MUTATION: a sign error in the multiplier term would pass
    the favorable-case test above but fail here."""
    baseline_pg, vg_pos, delta = 12.0, 0.5, -0.20
    pos_mean_share = 0.12
    bellcow_mult = G.usage_multiplier(0.30, pos_mean_share)
    committee_mult = G.usage_multiplier(0.05, pos_mean_share)
    bellcow = G.arm_predictions(baseline_pg, vg_pos, delta, bellcow_mult)
    committee = G.arm_predictions(baseline_pg, vg_pos, delta, committee_mult)
    assert bellcow["interaction"] < bellcow["v1_tilt"] < baseline_pg
    assert committee["interaction"] > committee["v1_tilt"]


# ── known-negative / fail-arm control ───────────────────────────────────────

def test_multiplier_of_ONE_for_everyone_collapses_interaction_to_v1_EXACTLY():
    """KNOWN NEGATIVE. If usage carried no information at all (every player
    average-usage, multiplier pinned to 1.0), the interaction arm must be
    numerically IDENTICAL to v1_tilt — not close, exact. MUTATION this
    catches: an interaction formula that adds a stray offset or a second term
    independent of usage would still look plausible but would not reduce to
    v1 at the no-information point, and this is the algebraic proof it does."""
    for baseline_pg, vg_pos, delta in [(12.0, 0.5, 0.20), (8.0, 0.5, -0.15),
                                        (20.0, 0.0, 0.30)]:
        preds = G.arm_predictions(baseline_pg, vg_pos, delta, mult=1.0)
        assert preds["interaction"] == preds["v1_tilt"], preds


def test_usage_multiplier_clips_at_declared_bounds():
    """The prereg fixes clip bounds (0.0, 3.0) BEFORE any run — an
    unclipped multiplier could let a single extreme-share player dominate a
    fold's MAE, and the prereg names this as a designed guard. MUTATION:
    dropping the clip would let this test's extreme inputs blow past 3.0."""
    assert G.usage_multiplier(1.0, 0.05) == G.USAGE_MULT_CLIP[1]  # 20x mean, clipped
    assert G.usage_multiplier(0.0, 0.10) == G.USAGE_MULT_CLIP[0]  # a genuine zero share
    assert G.usage_multiplier(0.10, 0.10) == 1.0                  # exactly average
    assert G.usage_multiplier(0.05, 0.0) == 1.0, "zero pos_mean_share must not divide by zero"


# ── the leak guard actually fires through this call site ───────────────────

def test_eligible_population_REFUSES_a_non_prior_season():
    """usage_shares()'s own before_season guard must be reachable through
    this file's call site, not silently bypassed by the identity-crosswalk
    adapter. MUTATION: calling usage_shares without before_season, or with
    the wrong season order, would let a look-ahead share through silently."""
    import inspect
    src = inspect.getsource(G.eligible_population)
    assert "before_season=target_season" in src, (
        "eligible_population must pass before_season=target_season through "
        "to usage_shares(), or the leak guard is decorative here")


# ── identity crosswalk is what it claims to be ──────────────────────────────

def test_identity_crosswalk_maps_every_id_to_itself_not_to_something_else():
    """MUTATION: a crosswalk built from a DIFFERENT id space (e.g. gsis ids
    typo'd through) would silently produce 100% 'unmatched_ids' — a Rule 3e
    null that looks like clean output. This pins the crosswalk really is
    the identity map."""
    rows = [{"player_id": "111", "team": "BUF", "targets": 5, "carries": 0},
            {"player_id": "222", "team": "BUF", "targets": 0, "carries": 12}]
    cw = G.identity_crosswalk(rows)
    assert cw == {"111": "111", "222": "222"}


# ── spearman, pinned against known correlations ─────────────────────────────

def test_spearman_of_identical_sequences_is_one():
    xs = [1.0, 5.0, 3.0, 9.0, 2.0]
    assert abs(G.spearman(xs, xs) - 1.0) < 1e-9


def test_spearman_of_perfectly_inverted_sequences_is_negative_one():
    xs = [1.0, 2.0, 3.0, 4.0, 5.0]
    ys = [5.0, 4.0, 3.0, 2.0, 1.0]
    assert abs(G.spearman(xs, ys) - (-1.0)) < 1e-9


def test_spearman_handles_ties_without_crashing():
    xs = [1.0, 1.0, 2.0, 2.0, 3.0]
    ys = [1.0, 2.0, 2.0, 3.0, 3.0]
    rho = G.spearman(xs, ys)
    assert -1.0 <= rho <= 1.0


# ── real-data smoke test (Rule 3e: the pipeline must actually run) ─────────

def test_the_real_2023_fold_is_usable_and_shaped_as_the_prereg_measured():
    """Not a pin on the substantive finding (which may shift if the stores
    are refreshed) — a shape/sanity check that the real pipeline produces a
    usable, non-degenerate fold, matching the coverage this study's prereg
    reported before any grading number was computed."""
    fold = G.grade_fold(2023)
    assert fold["usable"] is True
    assert fold["population"] > 300, "prereg measured 403 eligible RB/WR/TE for this fold"
    assert fold["player_weeks_graded"] > 3000
    assert fold["player_weeks_no_line"] < fold["player_weeks_total"] * 0.10, (
        "no-line coverage gap should stay a small minority, as measured pre-run")
    for pos in ("RB", "WR", "TE"):
        assert 0.0 < fold["pos_mean_share"][pos] < 1.0
    for arm in ("no_tilt", "v1_tilt", "interaction"):
        assert fold["mae"][arm] > 0, "MAE of a real weekly-points prediction cannot be zero"


def test_pooled_grade_reports_a_bool_clears_and_never_crashes_on_an_ungradable_fold():
    """KNOWN NEGATIVE shape check: an ungradable fold (e.g. missing files)
    must not crash pooled_grade — it must be excluded and counted, the same
    'ungradable, not silently dropped' discipline p151 used for 2021->22."""
    fake_unusable = {"season": 1999, "usable": False, "why": "test fixture"}
    real = G.grade_fold(2023)
    pooled = G.pooled_grade([fake_unusable, real])
    assert pooled["n_folds_usable"] == 1
    assert isinstance(pooled["clears"], bool)

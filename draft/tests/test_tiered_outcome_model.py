# TERRITORY: C
"""The tiered outcome model must not be able to cheat, and its tiers must not
be able to drift from the preregistration.

The failures worth catching here are not crashes. They are (a) a tier boundary
that quietly stops matching TIERED-OUTCOME-PREREG.md, (b) a fit that can see
its own graded season, (c) a "pooled" late-round number that ranks three
seasons in one list — a decision no drafter makes — and (d) a probability model
that looks fine because the arithmetic is wrong in a way that flatters it.

The store-dependent tests SKIP when the A-lane component/advanced stores are
not on the tree, which is the normal case for a lane that may not commit them.
"""
import json
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backtest'))

import numpy as np  # noqa: E402

from backtest import tiered_outcome_model as TOM  # noqa: E402


# ── the preregistered tier boundaries ───────────────────────────────────────

def _tier_of_rank(r: int, k: int) -> int:
    if r <= math.ceil(k / 2):
        return 3
    if r <= k:
        return 2
    if r <= 2 * k:
        return 1
    return 0


def test_k_slots_are_the_preregistered_ones():
    """PREREG § 2: K is the league's own starting-slot count, flex split taken
    from vorp.py's measured 2026 board (RB+1 / WR+9 / TE+0)."""
    assert TOM.K_SLOTS == {"QB": 10, "RB": 21, "WR": 29, "TE": 10}
    assert TOM.K_SLOTS_DEDICATED_ONLY == {"QB": 10, "RB": 20, "WR": 20, "TE": 10}
    assert TOM.TIERS == ("BUST", "REPLACEMENT", "STARTER", "LEAGUE-WINNER")
    assert TOM.LEAGUE_WINNER == 3
    assert TOM.LATE_ROUND_FIRST_PICK == 61          # 10 teams => rounds 7-15


def test_tier_boundaries_sit_exactly_where_the_prereg_puts_them():
    for pos, k in TOM.K_SLOTS.items():
        cut = math.ceil(k / 2)
        assert _tier_of_rank(cut, k) == 3, pos
        assert _tier_of_rank(cut + 1, k) == 2, pos
        assert _tier_of_rank(k, k) == 2, pos
        assert _tier_of_rank(k + 1, k) == 1, pos
        assert _tier_of_rank(2 * k, k) == 1, pos
        assert _tier_of_rank(2 * k + 1, k) == 0, pos


def test_the_starter_boundary_is_replacement_level_by_construction():
    """vorp.py: 'The Nth-ranked player at each position is replacement level.'
    The STARTER/REPLACEMENT boundary must therefore be exactly rank K, not
    K-1 or K+1 — otherwise the tiers stop meaning what the prereg says."""
    for pos, k in TOM.K_SLOTS.items():
        assert _tier_of_rank(k, k) == 2 and _tier_of_rank(k + 1, k) == 1, pos


# ── leak refusal ────────────────────────────────────────────────────────────

def test_a_fit_that_can_see_its_own_season_is_refused():
    TOM.assert_walk_forward([2022, 2023], 2024)          # fine
    with pytest.raises(AssertionError):
        TOM.assert_walk_forward([2022, 2024], 2024)
    with pytest.raises(AssertionError):
        TOM.assert_walk_forward([2025], 2024)


def test_a_feature_drawn_from_the_graded_season_is_refused():
    TOM.assert_feature_seasons((2023, 2022), 2024)
    with pytest.raises(AssertionError):
        TOM.assert_feature_seasons((2024,), 2024)


def test_the_walk_forward_schedule_never_trains_on_the_test_season():
    for y in TOM.TEST_SEASONS:
        train = [t for t in (2022, 2023, 2024) if t < y]
        TOM.assert_walk_forward(train, y)
        assert train, f"season {y} would have no training data"


# ── the ordinal model itself ────────────────────────────────────────────────

def test_cutpoints_are_ordered_for_any_parameters():
    rng = np.random.default_rng(7)
    for _ in range(200):
        raw = rng.normal(0, 3, 3)
        cuts = TOM._unpack(raw)
        assert cuts[0] < cuts[1] < cuts[2]


def test_probabilities_are_a_distribution():
    rng = np.random.default_rng(11)
    x = rng.normal(size=(50, 4))
    params = np.concatenate([np.array([-1.0, 0.0, 0.0]), rng.normal(size=4)])
    p = TOM.predict_proba(params, x)
    assert p.shape == (50, 4)
    assert np.allclose(p.sum(axis=1), 1.0)
    assert (p > 0).all()


def test_the_fit_recovers_a_signal_it_was_given():
    """Synthetic ordinal data with one informative feature: the fitted
    coefficient must have the right sign and P(top tier) must rise with it."""
    rng = np.random.default_rng(3)
    n = 1200
    x = rng.normal(size=(n, 2))
    eta = 1.5 * x[:, 0]                       # feature 1 is pure noise
    cuts = np.array([-1.5, 0.0, 1.2])
    u = rng.random(n)
    s = 1.0 / (1.0 + np.exp(-(cuts[None, :] - eta[:, None])))
    y = (u > s[:, 0]).astype(int) + (u > s[:, 1]).astype(int) + (u > s[:, 2]).astype(int)
    params = TOM.fit_ordinal(x, y, n_penalized=2)
    beta = params[3:]
    assert beta[0] > 0.5, beta
    assert abs(beta[1]) < 0.3, beta
    lo = TOM.predict_proba(params, np.array([[-2.0, 0.0]]))[0, 3]
    hi = TOM.predict_proba(params, np.array([[2.0, 0.0]]))[0, 3]
    assert hi > lo * 5


def test_a_model_fitted_on_shuffled_labels_learns_nothing():
    """NEGATIVE CONTROL. If this ever passes with a strong coefficient, the
    features are reaching the labels through something other than the fit."""
    rng = np.random.default_rng(5)
    n = 800
    x = rng.normal(size=(n, 2))
    y = rng.integers(0, 4, n)
    params = TOM.fit_ordinal(x, y, n_penalized=2)
    assert np.abs(params[3:]).max() < 0.25, params[3:]


def test_fitting_is_deterministic():
    rng = np.random.default_rng(9)
    x = rng.normal(size=(300, 3))
    y = rng.integers(0, 4, 300)
    a = TOM.fit_ordinal(x, y, n_penalized=3)
    b = TOM.fit_ordinal(x, y, n_penalized=3)
    assert np.array_equal(a, b)


# ── feature scaling ─────────────────────────────────────────────────────────

def test_z_scoring_is_within_position_and_survives_a_constant_column():
    rows = [{f: 0.0 for f in TOM.FEATURES} for _ in range(6)]
    for i, r in enumerate(rows):
        r["pos"] = "QB" if i < 3 else "WR"
        r["pts_y1"] = [100.0, 200.0, 300.0, 10.0, 20.0, 30.0][i]
        r["games_y1"] = 17.0                       # constant everywhere
    z = TOM.zscore_within_position(rows)
    col = TOM.FEATURES.index("pts_y1")
    # each position block is centred on its own mean, not a global one
    assert abs(z[:3, col].mean()) < 1e-9 and abs(z[3:, col].mean()) < 1e-9
    assert z[0, col] < 0 < z[2, col] and z[3, col] < 0 < z[5, col]
    # a constant column is exactly zero, never NaN or inf
    g = TOM.FEATURES.index("games_y1")
    assert np.isfinite(z[:, g]).all() and np.abs(z[:, g]).max() == 0.0


def test_position_dummies_use_qb_as_the_base_level():
    rows = [{"pos": p} for p in ("QB", "RB", "WR", "TE")]
    d = TOM.position_dummies(rows)
    assert d[0].sum() == 0.0
    assert list(d[1]) == [1.0, 0.0, 0.0]
    assert list(d[2]) == [0.0, 1.0, 0.0]
    assert list(d[3]) == [0.0, 0.0, 1.0]


# ── the late-round arithmetic ───────────────────────────────────────────────

def test_hits_at_k_takes_the_top_k_by_score():
    scores = [5.0, 1.0, 4.0, 2.0, 3.0]
    winners = [False, True, True, True, False]
    assert TOM._hits_at(scores, winners, 2) == 1        # picks 5.0 and 4.0
    assert TOM._hits_at(scores, winners, 4) == 2        # adds 3.0 and 2.0


def test_pooling_seasons_into_one_list_is_not_the_same_as_summing_them():
    """THE CORRECTION THIS PINS: a single ranking across three seasons lets one
    season's scale eat the whole top-k. A drafter drafts once a year, so the
    verdict is taken on the per-season sum, and this test exists so nobody
    silently swaps them back."""
    by_season = {
        2023: {"is_winner": [True, False, False], "scores": {"m": [9.0, 8.0, 7.0]}},
        2024: {"is_winner": [True, False, False], "scores": {"m": [1.0, 0.9, 0.8]}},
    }
    summed = TOM._hits_summed(by_season, "m", 1)
    # the one-list ranking never reaches 2024 at all: its scores are on a
    # smaller scale, so 2023 owns the whole top-k
    one_list = TOM._hits_at([9.0, 8.0, 7.0, 1.0, 0.9, 0.8],
                            [True, False, False, True, False, False], 1)
    assert summed == 2 and one_list == 1


def test_a_model_with_no_forecast_for_a_season_only_sums_the_seasons_it_has():
    by_season = {
        2023: {"is_winner": [True, False], "scores": {"a": [2.0, 1.0]}},
        2024: {"is_winner": [True, False], "scores": {"a": [2.0, 1.0], "b": [2.0, 1.0]}},
    }
    assert TOM._hits_summed(by_season, "a", 1) == 2
    assert TOM._hits_summed(by_season, "b", 1) == 1     # own_v6's shape


def test_the_bootstrap_is_reproducible_and_finds_a_real_gap():
    by_season = {
        2023: {"is_winner": [True] * 5 + [False] * 25,
               "scores": {"good": list(range(30))[::-1],
                          "bad": [0.0] * 30}},
    }
    for i in range(5):
        by_season[2023]["scores"]["good"][i] = 100 - i     # winners on top
    a = TOM._bootstrap_diff_summed(by_season, "good", "bad", 5, draws=200)
    b = TOM._bootstrap_diff_summed(by_season, "good", "bad", 5, draws=200)
    assert a == b
    assert a["mean_diff"] > 0 and a["excludes_zero"] is True


# ── small stats helpers (no scipy in this repo) ─────────────────────────────

def test_spearman_averages_ties_and_hits_the_endpoints():
    assert TOM.spearman([1, 2, 3, 4], [1, 2, 3, 4]) == pytest.approx(1.0)
    assert TOM.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == pytest.approx(-1.0)
    # a fully tied vector has no ordering to correlate with
    assert math.isnan(TOM.spearman([1, 1, 1, 1], [1, 2, 3, 4]))
    # ties are averaged, not broken by input order
    a = TOM.spearman([1, 1, 2, 3], [1, 2, 3, 4])
    b = TOM.spearman([1, 1, 2, 3][::-1], [1, 2, 3, 4][::-1])
    assert a == pytest.approx(b)


def test_wilson_interval_brackets_the_rate_and_widens_with_less_data():
    lo, hi = TOM.wilson(5, 100)
    assert lo < 0.05 < hi
    lo2, hi2 = TOM.wilson(1, 20)
    assert (hi2 - lo2) > (hi - lo)
    assert TOM.wilson(0, 0) == (0.0, 1.0)


def test_precision_at_n_is_the_overlap_with_the_realized_top_n():
    pred = [10.0, 9.0, 8.0, 7.0]
    truth = [10.0, 1.0, 9.0, 8.0]
    assert TOM._precision_at(pred, truth, 2) == pytest.approx(0.5)
    assert TOM._precision_at(pred, truth, 4) == pytest.approx(1.0)


def test_the_verdict_applies_the_preregistered_bar_and_nothing_else():
    late = {
        "tiered_p_league_winner": {"hits_at_10": 9, "seasons_contributing": [1, 2, 3]},
        "recency_blend": {"hits_at_10": 4, "seasons_contributing": [1, 2, 3]},
        "market": {"hits_at_10": 5, "seasons_contributing": [1, 2, 3]},
        "bootstrap_p_lw_minus_best_mean": {"k10": {"excludes_zero": True,
                                                   "mean_diff": 4.0}},
    }
    redundant_free = {"recency_blend": {"pooled_mean": 0.80}}
    v = TOM._verdict(late, redundant_free, 0)
    assert v["headline"] == "CONFIRMED" and v["cory_thesis_confirmed"] is True
    # a miscalibrated model leads with that, whatever it wins
    assert TOM._verdict(late, redundant_free, 2)["headline"] == "MISCALIBRATED"
    # redundancy outranks a null but not a confirmation
    late_null = dict(late)
    late_null["tiered_p_league_winner"] = {"hits_at_10": 1,
                                           "seasons_contributing": [1, 2, 3]}
    assert TOM._verdict(late_null, {"m": {"pooled_mean": 0.97}}, 0)["headline"] == "REDUNDANT"
    assert TOM._verdict(late_null, {"m": {"pooled_mean": 0.10}}, 0)["headline"] == "NULL"


# ── store-dependent: skipped where the A-lane stores are not on the tree ────

def _stores_present() -> bool:
    d = TOM.store_dir()
    return all((d / f"{n}_{y}.json").exists()
               for n in ("component_stats", "advanced_stats")
               for y in (2021, 2022, 2023, 2024, 2025))


needs_stores = pytest.mark.skipif(
    not _stores_present(),
    reason="component/advanced stat stores are A-lane files not on this tree")


@needs_stores
def test_the_derivation_gate_still_passes():
    """PREREG § 1: 2022 labels are admitted ONLY because re-scoring
    component_stats reproduces the committed weekly-points store exactly."""
    rep = TOM.verify_derivation()
    assert rep["gate"] == "pass"
    for season in (2023, 2024):
        assert rep[season]["max_abs_difference"] == 0.0
        assert rep[season]["player_weeks_compared"] > 4000


@needs_stores
def test_no_tier_is_degenerate_in_any_graded_season():
    for y in TOM.TEST_SEASONS:
        labels, _diag = TOM.tier_labels(y)
        counts = {t: sum(1 for v in labels.values() if v == t) for t in range(4)}
        assert min(counts.values()) >= 20, (y, counts)


@needs_stores
def test_features_are_blind_to_the_graded_season():
    """POSITIVE CONTROL for the leak rule: every feature must come out of
    seasons strictly before the target, so the same target computed twice from
    the same stores is identical and the diagnostics name only prior seasons."""
    feats, diag = TOM.features_for(2025)
    assert diag["feature_season"] == 2024 and diag["second_prior_season"] == 2023
    again, _ = TOM.features_for(2025)
    assert feats == again


@needs_stores
def test_the_committed_artifact_matches_a_fresh_run():
    """The artifact on disk must be reproducible from the committed stores."""
    path = TOM.OUT
    if not path.exists():
        pytest.skip("no artifact committed yet")
    on_disk = json.loads(path.read_text())
    fresh = json.loads(json.dumps(TOM.run()))     # int keys become strings
    assert on_disk["pooled"]["verdict"] == fresh["pooled"]["verdict"]
    assert on_disk["derivation_gate"] == fresh["derivation_gate"]
    assert on_disk["pooled"]["late_round_cell"] == fresh["pooled"]["late_round_cell"]

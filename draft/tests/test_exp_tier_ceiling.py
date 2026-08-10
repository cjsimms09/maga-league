"""Tier-graduated ceiling blend — pure core. Run:
python -m pytest draft/tests/test_exp_tier_ceiling.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_tier_ceiling as T  # noqa: E402


def test_gap_tiers_opens_a_new_tier_on_a_big_drop():
    # a cliff after the top two: 300,290, [big gap] 200,195,190
    proj = {"a": 300, "b": 290, "c": 200, "d": 195, "e": 190}
    pos = {k: "RB" for k in proj}
    tiers = T.gap_tiers(proj, pos)
    assert tiers["a"] == 1 and tiers["b"] == 1          # elite band
    assert tiers["c"] > 1                                # across the cliff
    assert tiers["c"] == tiers["d"] == tiers["e"]        # the flat band is one tier


def test_gap_tiers_are_within_position():
    proj = {"qb1": 400, "qb2": 390, "rb1": 300, "rb2": 100}
    pos = {"qb1": "QB", "qb2": "QB", "rb1": "RB", "rb2": "RB"}
    t = T.gap_tiers(proj, pos)
    assert t["qb1"] == 1 and t["rb1"] == 1              # each position starts at tier 1


def test_cv_is_clamped_and_zero_when_thin_or_flat():
    cv = T.cv_by_id({"boom": [30, 2, 28, 1, 26, 3], "flat": [10, 10, 10, 10],
                     "thin": [12, 14]}, cap=1.0)
    assert cv["boom"] > 0.5                              # high weekly swing
    assert cv["flat"] == 0.0                             # no variance
    assert cv["thin"] == 0.0                             # too few weeks -> no claim


def test_w_ceiling_ramps_from_zero_and_caps():
    assert T.w_ceiling(1, 0.2) == 0.0                    # tier 1 is pure mean
    assert abs(T.w_ceiling(2, 0.2) - 0.2) < 1e-9        # +step per tier
    assert abs(T.w_ceiling(3, 0.2) - 0.4) < 1e-9
    assert T.w_ceiling(10, 0.2) == T.W_CAP              # capped deep


def test_blend_is_pure_mean_at_step_zero_and_tips_deeper_tiers():
    proj = {"elite": 300, "flier": 100}
    cv = {"elite": 0.2, "flier": 0.8}
    tiers = {"elite": 1, "flier": 4}
    base = T.blended_scores(proj, cv, tiers, 0.0)
    assert base == {"elite": 300.0, "flier": 100.0}     # step 0 = untouched mean
    tipped = T.blended_scores(proj, cv, tiers, 0.2)
    assert tipped["elite"] == 300.0                      # tier 1 never tips
    assert tipped["flier"] > 100.0                       # deep + volatile -> boosted


def test_blend_can_reorder_a_deep_tier_toward_the_volatile_player():
    # two equal-mean deep-tier fliers; the volatile one should outrank at step>0
    proj = {"steady": 120, "boom": 120}
    cv = {"steady": 0.1, "boom": 0.9}
    tiers = {"steady": 3, "boom": 3}
    s = T.blended_scores(proj, cv, tiers, 0.3)
    assert s["boom"] > s["steady"]

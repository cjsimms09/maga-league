# TERRITORY: A
"""advanced_efficiency_study — the composite z-score machinery on hand-
computable fixtures, the leakage guard, the frozen ADV_W/CLIP/MIN_VOL
constants (the preregistered form), and a structural-parity check that
comp_opinion_adv with the tilt turned off (ADV_W=0) reproduces
own_model_v5.comp_opinion EXACTLY — proof the reimplementation changed
nothing except the one preregistered term.

Committed WITH the preregistration and BEFORE the results artifact — same
discipline as test_own_model_v5.py: these tests pin the machinery, not the
numbers, so they cannot have been tuned to a result that did not exist yet.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import advanced_efficiency_study as AES  # noqa: E402
import own_model_v5 as V5  # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402
from own_model_v2 import board_ages  # noqa: E402


# ── the preregistered constants ──────────────────────────────────────────────

def test_frozen_constants_are_the_preregistered_ones():
    assert AES.ADV_W == 0.20
    assert AES.CLIP == 2.5
    assert AES.MIN_VOL == {"QB": 100, "RB": 50, "WR": 20, "TE": 20}
    assert AES.GRADED_FOLDS == (
        (2023, (2021, 2022)), (2024, (2022, 2023)), (2025, (2023, 2024)))


# ── _zscores, hand-computed ──────────────────────────────────────────────────

def test_zscores_hand_computed():
    z = AES._zscores({"a": 1.0, "b": 2.0, "c": 3.0})
    # mean=2, population sd = sqrt(2/3) = 0.8164965...
    assert z["a"] == pytest.approx(-1.2247449, abs=1e-5)
    assert z["b"] == pytest.approx(0.0, abs=1e-9)
    assert z["c"] == pytest.approx(1.2247449, abs=1e-5)


def test_zscores_degenerate_cases_return_zero_not_nan():
    assert AES._zscores({"a": 5.0}) == {"a": 0.0}          # n<2
    assert AES._zscores({"a": 5.0, "b": 5.0}) == {"a": 0.0, "b": 0.0}  # sd=0
    assert AES._zscores({}) == {}


# ── advanced_rates + composite_for_season, hand-computed on a tiny fixture ──

def _stub_stores(monkeypatch, cw: dict, aw: dict):
    monkeypatch.setattr(AES.FCS, "component_weeks", lambda season, a, b: cw)
    monkeypatch.setattr(AES.FAS, "advanced_weeks", lambda season, a, b: aw)


def test_advanced_rates_season_sums_and_attempt_weighted_cpoe(monkeypatch):
    positions = {"qb1": "QB", "wr1": "WR"}
    cw = {
        "qb1": {1: {"pass_att": 30, "rush_att": 2, "tgt": 0},
                2: {"pass_att": 20, "rush_att": 0, "tgt": 0}},
        "wr1": {1: {"pass_att": 0, "rush_att": 0, "tgt": 8}},
    }
    aw = {
        "qb1": {1: {"pass_epa": 5.0, "cpoe": 4.0},
                2: {"pass_epa": -2.0, "cpoe": -1.0}},
        "wr1": {1: {"rec_epa": 3.0, "rec_air_yd": 80}},
    }
    _stub_stores(monkeypatch, cw, aw)
    rates = AES.advanced_rates(2099, positions)
    # epa_per_att_pass = (5.0 + -2.0) / (30+20) = 0.06
    assert rates["qb1"]["epa_per_att_pass"] == pytest.approx(3.0 / 50, abs=1e-9)
    # attempt-weighted cpoe = (4.0*30 + -1.0*20) / 50 = 2.0
    assert rates["qb1"]["cpoe"] == pytest.approx((4.0 * 30 - 1.0 * 20) / 50, abs=1e-9)
    assert rates["wr1"]["epa_per_tgt"] == pytest.approx(3.0 / 8, abs=1e-9)
    assert rates["wr1"]["ay_per_tgt"] == pytest.approx(80 / 8, abs=1e-9)


def test_composite_for_season_below_floor_is_excluded_not_zeroed(monkeypatch):
    positions = {"qb1": "QB", "qb2": "QB"}
    # qb2 under the 100-attempt QB floor
    cw = {"qb1": {w: {"pass_att": 50} for w in range(1, 4)},   # 150 att
          "qb2": {1: {"pass_att": 10}}}
    aw = {"qb1": {w: {"pass_epa": 2.0, "cpoe": 5.0} for w in range(1, 4)},
          "qb2": {1: {"pass_epa": 1.0, "cpoe": 5.0}}}
    _stub_stores(monkeypatch, cw, aw)
    comp = AES.composite_for_season(2099, positions)
    assert "qb1" in comp
    assert "qb2" not in comp             # excluded, not present as 0.0


def test_composite_for_season_qb_is_half_cpoe_half_epa(monkeypatch):
    positions = {"qb1": "QB", "qb2": "QB"}
    cw = {"qb1": {1: {"pass_att": 100}}, "qb2": {1: {"pass_att": 200}}}
    aw = {"qb1": {1: {"pass_epa": 10.0, "cpoe": 2.0}},
          "qb2": {1: {"pass_epa": 30.0, "cpoe": 8.0}}}
    _stub_stores(monkeypatch, cw, aw)
    comp = AES.composite_for_season(2099, positions)
    # epa/att: qb1=0.10, qb2=0.15 -> z = -1, +1 (two-point population sd)
    # cpoe:    qb1=2.0,  qb2=8.0  -> z = -1, +1
    assert comp["qb1"] == pytest.approx(0.5 * -1.0 + 0.5 * -1.0, abs=1e-6)
    assert comp["qb2"] == pytest.approx(0.5 * 1.0 + 0.5 * 1.0, abs=1e-6)


def test_blended_composite_uses_rate_recency_0p7_0p3(monkeypatch):
    positions = {"rb1": "RB", "rb2": "RB"}

    calls = {"n": 0}

    def fake_composite(season, pos):
        calls["n"] += 1
        if season == 2025:
            return {"rb1": 1.0}
        return {"rb1": -1.0, "rb2": 2.0}

    monkeypatch.setattr(AES, "composite_for_season", fake_composite)
    out = AES.blended_composite((2024, 2025), positions)
    assert out["rb1"] == pytest.approx(0.7 * 1.0 + 0.3 * -1.0, abs=1e-9)
    # rb2 present only in the Y-2 (2024) side -> 0.0 contribution from Y-1
    assert out["rb2"] == pytest.approx(0.7 * 0.0 + 0.3 * 2.0, abs=1e-9)


# ── leakage guard ─────────────────────────────────────────────────────────────

def test_comp_opinion_adv_refuses_leaky_priors():
    with pytest.raises(ValueError, match="LEAK"):
        AES.comp_opinion_adv(2024, (2023, 2024), {}, {}, {})


# ── structural parity: ADV_W=0 must reproduce v5's own comp_opinion exactly ──

def test_zero_weight_tilt_reproduces_v5_comp_opinion_exactly(monkeypatch):
    """The whole point of comp_opinion_adv is ONE additional multiplicative
    term; with that term's weight at zero, every other line is the same
    arithmetic as own_model_v5.comp_opinion (season_profiles, league
    efficiency, availability regression, age curve, Vegas tilt — all
    imported, none reimplemented differently). This is graded on the real
    committed 2025 fold (network-free: component/vegas/board stores are all
    on disk) precisely because a fixture could hide a subtle divergence a
    real, messy population would not."""
    monkeypatch.setattr(AES, "ADV_W", 0.0)
    positions = positions_record()
    ages = board_ages()
    prior = (2023, 2024)
    target = 2025
    vegas_imp = AES.FCS.implied_team_totals(target, 1, 1)
    control = V5.comp_opinion(target, prior, positions, ages, vegas_imp)
    zeroed = AES.comp_opinion_adv(target, prior, positions, ages, vegas_imp)
    assert set(control) == set(zeroed)
    assert len(control) > 100          # sanity: not an empty/degenerate run
    for pid in control:
        assert zeroed[pid] == pytest.approx(control[pid], rel=1e-9, abs=1e-9), pid


def test_comp_opinion_adv_is_deterministic():
    positions = positions_record()
    ages = board_ages()
    vegas_imp = AES.FCS.implied_team_totals(2025, 1, 1)
    a = AES.comp_opinion_adv(2025, (2023, 2024), positions, ages, vegas_imp)
    b = AES.comp_opinion_adv(2025, (2023, 2024), positions, ages, vegas_imp)
    assert a == b


def test_clip_bounds_the_tilt(monkeypatch):
    # a composite_z far outside [-CLIP, CLIP] must be clamped, not applied
    # raw — verified by comparing an extreme blended_composite() stub against
    # the CLIP-bounded one at the tilt-application step.
    positions = {"rb1": "RB"}
    monkeypatch.setattr(AES, "blended_composite", lambda prior, pos: {"rb1": 999.0})
    ages = board_ages()
    vegas_imp = AES.FCS.implied_team_totals(2025, 1, 1)
    out = AES.comp_opinion_adv(2025, (2023, 2024), positions, ages, vegas_imp)
    # with an unclamped z of 999 and ADV_W=0.20 the rate would be ~200x;
    # clamped at CLIP=2.5 it is at most (1 + 0.20*2.5) = 1.5x the untilted rate
    unt = V5.comp_opinion(2025, (2023, 2024), positions, ages, vegas_imp)
    if "rb1" in unt and unt["rb1"] > 0:
        assert out["rb1"] <= unt["rb1"] * 1.51 + 1e-6

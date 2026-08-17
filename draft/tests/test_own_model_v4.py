# TERRITORY: A
"""own_model_v4 — the QB availability layer on hand-computable fixtures, the
inheritance contract (RB/WR/TE are v3's predictions untouched), the REC-3 bar
for the own_v4 candidate, and the artifact contract: bit-for-bit agreement of
every non-v4 cell with model_accuracy_v3.json (protocol identity) AND of
own_v4's RB/WR/TE cells with own_v3's (arm identity).

Committed WITH the preregistration and BEFORE the results artifact — the tests
pin the machinery, not the numbers, so they cannot have been tuned to a result
that did not exist yet.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import own_model_v4 as V4  # noqa: E402


# ── the frozen configuration is the preregistered one ────────────────────────

def test_qb_config_is_the_preregistered_frozen_one():
    assert (V4.QB_TAU, V4.QB_LAM, V4.QB_THETA) == (8.0, 0.7, 0.75)
    assert (V4.QB_MIN_ACT, V4.QB_MU_MIN_ACT, V4.QB_RATIO_CAP) == (2, 4, 2.0)


# ── the availability layer, hand-computed ────────────────────────────────────

def test_qb_active_games_counts_only_weeks_at_or_over_tau():
    wk = {"qb": {1: 20.0, 2: 8.0, 3: 7.9, 4: 0.0}, "rb": {1: 15.0}}
    pos = {"qb": "QB", "rb": "RB"}
    acts = V4.qb_active_games(wk, pos)
    assert acts == {"qb": 2}  # 20.0 and 8.0 count; 7.9 and 0.0 do not; RB never


def test_availability_correction_hand_computed_both_directions():
    # mu_g over actives (>= 4): (16 + 6) / 2 = 11
    acts = {"full": 16, "short": 6, "bench": 1}
    corr, mu_g = V4.qb_availability_correction(acts)
    assert mu_g == pytest.approx(11.0)
    # full 16-game season regresses DOWN: E[G] = .7*16 + .3*11 = 14.5
    assert corr["full"] == pytest.approx((14.5 / 16) ** 0.75, abs=1e-9)
    # injury-shortened season regresses UP: E[G] = .7*6 + .3*11 = 7.5
    assert corr["short"] == pytest.approx((7.5 / 6) ** 0.75, abs=1e-9)
    # bench profile (act < MIN_ACT) is never inflated
    assert corr["bench"] == 1.0


def test_availability_correction_caps_the_ratio():
    # act=2, mu_g=(16+16)/2=16 -> E[G] = 1.4 + 4.8 = 6.2, ratio 3.1 caps at 2.0
    acts = {"a": 16, "b": 16, "tiny": 2}
    corr, _ = V4.qb_availability_correction(acts)
    assert corr["tiny"] == pytest.approx(2.0 ** 0.75, abs=1e-9)


def test_availability_correction_degenerates_declared_when_no_active_qbs():
    corr, mu_g = V4.qb_availability_correction({"a": 2, "b": 3})
    assert mu_g is None and corr == {"a": 1.0, "b": 1.0}


# ── build_v4: QB replaced, everything else byte-identical to v3 ─────────────

def test_build_v4_overrides_qb_with_blend_times_corr_and_keeps_the_rest():
    pos = {"qb1": "QB", "qb2": "QB", "rb1": "RB", "te1": "TE"}
    v3p = {"qb1": 250.0, "qb2": 90.0, "rb1": 180.55, "te1": 77.31}
    blend = {"qb1": 300.0, "qb2": 100.0, "rb1": 170.0, "te1": 70.0}
    corr = {"qb1": 1.1, "qb2": 0.9}
    out = V4.build_v4(v3p, blend, corr, pos)
    assert out["qb1"] == pytest.approx(330.0, abs=0.01)   # 300 * 1.1
    assert out["qb2"] == pytest.approx(90.0, abs=0.01)    # 100 * 0.9
    assert out["rb1"] == 180.55 and out["te1"] == 77.31   # v3, untouched
    assert set(out) == set(v3p)                           # coverage identity


def test_build_v4_declared_fallbacks_and_zero_clamp():
    pos = {"q": "QB"}
    # missing corr entry -> 1.0; missing blend entry -> v3 prediction
    out = V4.build_v4({"q": 42.0}, {}, {}, pos)
    assert out["q"] == pytest.approx(42.0, abs=0.01)
    out2 = V4.build_v4({"q": 0.0}, {"q": 0.0}, {"q": 2.0}, pos)
    assert out2["q"] == 0.0


# ── the bar (REC-3), computed for own_v4 through v3's imported verdict ──────

def _row(c_mae, c_sp, base_mae, base_sp):
    return {"status": "measured", "n": 50,
            "own_v4": {"mae": c_mae, "spearman": c_sp},
            "naive_prev": {"mae": base_mae, "spearman": base_sp},
            "recency_blend": {"mae": base_mae + 1, "spearman": base_sp - 0.01}}


def test_promotion_verdict_for_own_v4_requires_all_four_strictly():
    from own_model_v3 import promotion_verdict
    h2h = {"QB": _row(70, 0.75, 74, 0.72), "RB": _row(40, 0.78, 42, 0.75),
           "WR": _row(35, 0.74, 36, 0.73), "TE": _row(23, 0.78, 24, 0.78)}
    v = promotion_verdict(h2h, candidate="own_v4")
    assert v["candidate"] == "own_v4"
    assert v["clears"] is False  # TE Spearman TIES — ties lose
    h2h["TE"] = _row(23, 0.80, 24, 0.78)
    assert promotion_verdict(h2h, candidate="own_v4")["clears"] is True


# ── the artifact contract ────────────────────────────────────────────────────

# NOTE (2026-08-16, artifact-freshness infra): this used to be one test,
# `test_artifact_matches_regeneration_and_reproduces_v3_bit_for_bit`, marked
# @pytest.mark.repo_parity as a whole because it compared the committed
# artifact to a fresh V4.run() (board/positions-sensitive). That comparison
# is now covered by draft/data/artifact_registry.json + `draft/tools/
# check_artifact_freshness.py` (entry "own_model_v4") instead of a bespoke
# pytest function — see draft/audit/artifact_freshness_infra_2026-08-16.md.
# The REST — static shape checks on the committed artifact alone, and the
# protocol/arm-identity cross-checks against model_accuracy_v3.json (both are
# COMMITTED, static files; this never depends on the board and was never the
# repo_parity concern) — is preserved below as an unmarked, always-green test.
def test_artifact_shape_and_protocol_and_arm_identity_with_v3():
    art_path = BT / "model_accuracy_v4.json"
    if not art_path.exists():
        pytest.skip("prereg stage: results artifact not generated yet (commit order is the proof)")
    art = json.loads(art_path.read_text())
    assert next(iter(art)) == "_territory"
    if art["status"] != "graded":
        assert art["status"] == "no_markers"  # refusal is the artifact
        return
    assert art["promotion_bar"]["candidate"] == "own_v4"
    assert art["marker_gate"]["status"] == "ok" and art["marker_gate"]["markers"]
    # the tuning years are named absences, never numbers
    assert "in-sample" in art["arm_2024"]
    # the named-absence record stays honest: usage/TDs are still not on disk
    for k in ("fp_archive_per_player", "usage_trends", "td_rate_regression",
              "team_change_flags", "pre_2023_stores"):
        assert k in art["features_unavailable_named"]
    # the data-audit finding that triggered v4 is carried as evidence — the
    # CORRECTED invariant (the prereg commit's version wrongly asserted zero
    # lh-only player-weeks; the truth is zero lh-only PLAYERS, and every
    # lh-only player-week is a 0.0 rostered-did-not-play entry, i.e. no
    # information beyond what nflverse row-absence already encodes):
    lha = art["league_history_weekly_audit"]["seasons"]
    for season in ("2023", "2024"):
        cell = lha[season]
        assert cell["qb_players"]["league_history_only"] == 0
        assert (cell["league_history_only_player_weeks"]
                == cell["rostered_did_not_play_weeks"])
    # the decomposition block covers every season the program touches
    assert set(art["qb_variance_decomposition"]) == {"2023", "2024", "2025"}
    for cell in art["qb_variance_decomposition"].values():
        assert 0.0 < cell["availability_share"] < 1.0

    # PROTOCOL identity with the v3 artifact
    v3_art = json.loads((BT / "model_accuracy_v3.json").read_text())
    v3_h2h = v3_art["arm_2025"]["head_to_head_shared_population"]
    v4_h2h = art["arm_2025"]["head_to_head_shared_population"]
    for pos in ("QB", "RB", "WR", "TE"):
        assert v4_h2h[pos]["n"] == v3_h2h[pos]["n"], pos
        for shared_model in ("own_v3", "own_v2", "walk_forward_v1",
                             "naive_prev", "recency_blend"):
            assert v4_h2h[pos][shared_model] == v3_h2h[pos][shared_model], \
                (pos, shared_model)
    # ARM identity: the inherited positions reproduce v3's candidate cells
    for pos in ("RB", "WR", "TE"):
        assert v4_h2h[pos]["own_v4"] == v3_h2h[pos]["own_v3"], pos
    # and QB must differ (the replaced arm) — identical cells would mean the
    # override never ran
    assert v4_h2h["QB"]["own_v4"] != v3_h2h["QB"]["own_v3"]

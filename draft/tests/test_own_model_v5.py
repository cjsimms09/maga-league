# TERRITORY: A
"""own_model_v5 — the frozen configuration, the component-opinion machinery on
hand-computable fixtures, the ensemble contract (coverage identity with v3,
declared fallbacks, the marker-gated market arm), the REC-3 bar for the
own_v5 candidate, and the artifact contract: bit-for-bit agreement of every
non-v5 cell with model_accuracy_v4.json, own_v5 differing from own_v4 at
every position (all four arms are new constructions).

Committed WITH the preregistration and BEFORE the results artifact — the
tests pin the machinery, not the numbers, so they cannot have been tuned to a
result that did not exist yet.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import own_model_v5 as V5  # noqa: E402


# ── the frozen configuration is the preregistered one ────────────────────────

def test_v5_config_is_the_preregistered_frozen_one():
    assert set(V5.V5_CONFIG) == {"QB", "RB", "WR", "TE"}
    assert V5.V5_CONFIG["QB"] == {"beta": 0.00, "glam": 0.50, "volume": "raw",
                                  "pace_lam": None, "vg": 0.50,
                                  "weights": (0.75, 0.25, 0.00),
                                  "anchor": "blend_x_v4corr"}
    assert V5.V5_CONFIG["RB"] == {"beta": 0.50, "glam": 0.50, "volume": "raw",
                                  "pace_lam": None, "vg": 0.50,
                                  "weights": (0.50, 0.00, 0.50),
                                  "anchor": "blend"}
    assert V5.V5_CONFIG["WR"] == {"beta": 0.50, "glam": 0.70, "volume": "share",
                                  "pace_lam": 1.00, "vg": 0.50,
                                  "weights": (0.75, 0.00, 0.25),
                                  "anchor": "blend"}
    assert V5.V5_CONFIG["TE"] == {"beta": 0.25, "glam": 0.70, "volume": "share",
                                  "pace_lam": 0.50, "vg": 0.00,
                                  "weights": (0.25, 0.25, 0.50),
                                  "anchor": "blend"}
    assert (V5.MU_MIN_GAMES, V5.QB_MIN_G) == (4, 2)
    assert V5.RATE_RECENCY == (0.7, 0.3)
    # every weight row is convex — the ensemble never manufactures points
    for pos, c in V5.V5_CONFIG.items():
        assert abs(sum(c["weights"]) - 1.0) < 1e-9, pos
    # the QB market stays REMOVED (v3's standing negative honored)
    assert V5.V5_CONFIG["QB"]["weights"][2] == 0.0


# ── component sub-points, hand-computed ──────────────────────────────────────

def test_sub_pts_hand_computed():
    cfg = {"pass_yd": 0.04, "pass_td": 6.0, "pass_int": -2.0, "pass_2pt": 2.0,
           "rush_yd": 0.1, "rush_td": 6.0, "rush_2pt": 2.0,
           "rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "rec_2pt": 2.0,
           "fum_lost": -2.0}
    line = {"pass_yd": 250, "pass_td": 2, "pass_int": 1,
            "rush_yd": 30, "rush_td": 1,
            "rec": 2, "rec_yd": 15, "fum_lost": 1}
    p, r, c, f = V5._sub_pts(line, cfg)
    assert p == pytest.approx(250 * 0.04 + 12 - 2)     # 20.0
    assert r == pytest.approx(3 + 6)                   # 9.0
    assert c == pytest.approx(1 + 1.5)                 # 2.5
    assert f == pytest.approx(-2.0)


# ── availability regression, hand-computed ───────────────────────────────────

def test_expected_games_regresses_toward_mu_and_caps():
    # WR glam 0.7: E[G] = .7*10 + .3*14 = 11.2
    assert V5.expected_games("WR", 10, 14.0) == pytest.approx(11.2)
    # cap at 17: RB glam .5 with mu 20 (fixture): .5*17+.5*20 = 18.5 -> 17
    assert V5.expected_games("RB", 17, 20.0) == 17.0
    # QB bench guard: games < QB_MIN_G keeps games — never inflated
    assert V5.expected_games("QB", 1, 14.0) == 1.0
    # QB at/above the guard regresses: .5*8 + .5*14 = 11
    assert V5.expected_games("QB", 8, 14.0) == pytest.approx(11.0)


def test_availability_mean_uses_min_games_floor():
    profiles = {"a": {"games": 16}, "b": {"games": 4}, "c": {"games": 2},
                "d": {"games": 17}}
    positions = {"a": "QB", "b": "QB", "c": "QB", "d": "RB"}
    mu = V5._availability_mean(profiles, positions)
    assert mu["QB"] == pytest.approx((16 + 4) / 2)   # c is under the floor
    assert mu["RB"] == pytest.approx(17.0)
    assert mu["WR"] == V5.MU_G_FALLBACK              # nobody: declared fallback


# ── the ensemble on fixtures ─────────────────────────────────────────────────

def _fixture():
    positions = {"qb1": "QB", "rb1": "RB", "rb2": "RB", "te1": "TE"}
    coverage = {"qb1": 250.0, "rb1": 180.0, "rb2": 120.0, "te1": 90.0}
    comp = {"qb1": 300.0, "rb1": 200.0, "rb2": 100.0, "te1": 80.0}
    blend = {"qb1": 280.0, "rb1": 190.0, "rb2": 110.0, "te1": 85.0}
    corr = {"qb1": 0.9}
    mrank = {"rb1": ("RB", 1), "te1": ("TE", 1)}
    curve = {"QB": [400.0], "RB": [250.0], "WR": [200.0], "TE": [150.0]}
    return positions, coverage, comp, blend, corr, mrank, curve


def test_build_v5_qb_uses_corr_anchored_blend():
    positions, coverage, comp, blend, corr, mrank, curve = _fixture()
    out = V5.build_v5(coverage, comp, blend, corr, mrank, curve, positions)
    # QB: 0.75*comp + 0.25*(blend*corr) = 225 + 63 = 288
    assert out["qb1"] == pytest.approx(0.75 * 300 + 0.25 * (280 * 0.9), abs=0.01)


def test_build_v5_market_arm_and_undrafted_renormalization():
    positions, coverage, comp, blend, corr, mrank, curve = _fixture()
    out = V5.build_v5(coverage, comp, blend, corr, mrank, curve, positions)
    # drafted RB: 0.5*comp + 0*blend + 0.5*market(RB rank 1 = 250)
    assert out["rb1"] == pytest.approx(0.5 * 200 + 0.5 * 250, abs=0.01)
    # undrafted RB: w_b is 0 -> pure comp
    assert out["rb2"] == pytest.approx(100.0, abs=0.01)
    # drafted TE: .25*comp + .25*blend + .5*market(150)
    assert out["te1"] == pytest.approx(0.25 * 80 + 0.25 * 85 + 0.5 * 150, abs=0.01)


def test_build_v5_declared_fallbacks_and_coverage_identity():
    positions, coverage, comp, blend, corr, mrank, curve = _fixture()
    # a pid without a component profile prices through the anchor
    comp2 = dict(comp)
    del comp2["qb1"]
    out = V5.build_v5(coverage, comp2, blend, corr, mrank, curve, positions)
    assert out["qb1"] == pytest.approx(280 * 0.9, abs=0.01)
    # coverage identity: exactly the coverage keys, nothing more or less
    assert set(out) == set(coverage)
    # a drafted pid missing comp renormalizes anchor+market
    comp3 = dict(comp)
    del comp3["te1"]
    out3 = V5.build_v5(coverage, comp3, blend, corr, mrank, curve, positions)
    assert out3["te1"] == pytest.approx((0.25 * 85 + 0.5 * 150) / 0.75, abs=0.01)


def test_build_v5_zero_clamp():
    positions = {"rb1": "RB"}
    out = V5.build_v5({"rb1": 10.0}, {"rb1": 0.0}, {"rb1": 0.0}, {}, {}, {},
                      positions)
    assert out["rb1"] == 0.0


# ── leak guard ───────────────────────────────────────────────────────────────

def test_comp_opinion_refuses_leaky_priors():
    with pytest.raises(ValueError, match="LEAK"):
        V5.comp_opinion(2024, (2023, 2024), {}, {}, {})


# ── the bar (REC-3), computed for own_v5 through v3's imported verdict ──────

def _row(c_mae, c_sp, base_mae, base_sp):
    return {"status": "measured", "n": 50,
            "own_v5": {"mae": c_mae, "spearman": c_sp},
            "naive_prev": {"mae": base_mae, "spearman": base_sp},
            "recency_blend": {"mae": base_mae + 1, "spearman": base_sp - 0.01}}


def test_promotion_verdict_for_own_v5_requires_all_four_strictly():
    from own_model_v3 import promotion_verdict
    h2h = {"QB": _row(70, 0.75, 74, 0.72), "RB": _row(40, 0.78, 42, 0.75),
           "WR": _row(35, 0.74, 36, 0.73), "TE": _row(24, 0.80, 24, 0.78)}
    v = promotion_verdict(h2h, candidate="own_v5")
    assert v["candidate"] == "own_v5"
    assert v["clears"] is False  # TE MAE TIES — ties lose
    h2h["TE"] = _row(23, 0.80, 24, 0.78)
    assert promotion_verdict(h2h, candidate="own_v5")["clears"] is True


# ── the artifact contract ────────────────────────────────────────────────────

# NOTE (2026-08-16, artifact-freshness infra): this used to be one test,
# `test_artifact_matches_regeneration_and_reproduces_v4_bit_for_bit`, marked
# @pytest.mark.repo_parity as a whole because it compared the committed
# artifact to a fresh V5.run() (board/positions-sensitive). That comparison
# is now covered by draft/data/artifact_registry.json + `draft/tools/
# check_artifact_freshness.py` (entry "own_model_v5") instead of a bespoke
# pytest function — see draft/audit/artifact_freshness_infra_2026-08-16.md.
# The REST — static shape checks on the committed artifact alone, and the
# protocol-identity cross-check against model_accuracy_v4.json (both are
# COMMITTED, static files; this never depends on the board and was never the
# repo_parity concern) — is preserved below as an unmarked, always-green test.
def test_artifact_shape_and_protocol_identity_with_v4():
    art_path = BT / "model_accuracy_v5.json"
    if not art_path.exists():
        pytest.skip("prereg stage: results artifact not generated yet "
                    "(commit order is the proof)")
    art = json.loads(art_path.read_text())
    assert next(iter(art)) == "_territory"
    if art["status"] != "graded":
        assert art["status"] == "no_markers"  # refusal is the artifact
        return
    assert art["promotion_bar"]["candidate"] == "own_v5"
    assert art["marker_gate"]["status"] == "ok" and art["marker_gate"]["markers"]
    # coverage identity with v3 (the shared denominator of every artifact)
    assert art["coverage"]["identical_to_v3"] is True
    assert art["coverage"]["component_profile_missing"] == []
    # the artifact's frozen config is the module's frozen config
    for pos in ("QB", "RB", "WR", "TE"):
        cfgm = dict(V5.V5_CONFIG[pos], weights=list(V5.V5_CONFIG[pos]["weights"]))
        assert art["v5_config"][pos] == cfgm, pos
    # the tuning folds are named absences, never numbers
    assert "in-sample" in art["arms_2023_2024"]
    # the FP bar block carries the population caveat, not a false comparison
    assert "DIFFERENT" in art["fp_bar"]["caveat"] or "OWN shared population" in art["fp_bar"]["caveat"]
    for pos in ("QB", "RB", "WR", "TE"):
        assert art["fp_bar"]["fp_2025_cells"][pos]["status"] == "measured"
    # Arm B stays named, not faked
    ab = art["arm_b_provider_history"]
    assert ab["proj_series"]["seasons_covered"] == "2026 only"
    assert "January 2027" in ab["consequence"]
    # the short-season QB block exists and prices both models
    assert isinstance(art["short_season_qb_2024"], list)
    for row in art["short_season_qb_2024"]:
        assert row["games_2024"] <= 10 and row["pts_per_game_2024"] >= 15.0

    # PROTOCOL identity with the v4 artifact
    v4_art = json.loads((BT / "model_accuracy_v4.json").read_text())
    v4_h2h = v4_art["arm_2025"]["head_to_head_shared_population"]
    v5_h2h = art["arm_2025"]["head_to_head_shared_population"]
    for pos in ("QB", "RB", "WR", "TE"):
        assert v5_h2h[pos]["n"] == v4_h2h[pos]["n"], pos
        for shared_model in ("own_v4", "own_v3", "own_v2", "walk_forward_v1",
                             "naive_prev", "recency_blend"):
            assert v5_h2h[pos][shared_model] == v4_h2h[pos][shared_model], \
                (pos, shared_model)
        # own_v5 must DIFFER from own_v4 everywhere — all four arms are new
        assert v5_h2h[pos]["own_v5"] != v5_h2h[pos]["own_v4"], pos

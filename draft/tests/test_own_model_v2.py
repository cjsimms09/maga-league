# TERRITORY: A
"""own_model_v2 — the leak guard's fail arm, the declared degradation ladder,
the fitting arithmetic on hand-computable fixtures, and the artifact contract.

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

import own_model_v2 as V2  # noqa: E402


def test_FAIL_ARM_touching_the_graded_season_raises():
    """THE LEAK GUARD. Features for 2025 built from a set containing 2025 (or
    anything later) must refuse loudly — a forecast that has seen the season it
    grades is exp33's defect, and refusal is construction, not convention."""
    with pytest.raises(ValueError, match="LEAK"):
        V2._assert_no_leak((2024, 2025), 2025)
    with pytest.raises(ValueError, match="LEAK"):
        V2._assert_no_leak((2026,), 2025)
    V2._assert_no_leak((2023, 2024), 2025)   # strictly prior: fine


def test_ols_recovers_a_hand_built_line():
    """y = 2 + 3x exactly, so the solver must return it exactly (to fp noise)."""
    rows = [(1.0, 5.0), (2.0, 8.0), (3.0, 11.0), (4.0, 14.0)]
    beta = V2._ols(rows)
    assert beta is not None
    assert beta[0] == pytest.approx(2.0, abs=1e-6)
    assert beta[1] == pytest.approx(3.0, abs=1e-6)


def test_ols_refuses_a_singular_system():
    rows = [(1.0, 1.0, 5.0), (2.0, 2.0, 8.0), (3.0, 3.0, 11.0)]  # x == t
    assert V2._ols(rows) is None


def test_degradation_ladder_is_the_declared_one():
    """n < FIT_MIN_AFFINE ⇒ identity; the thin-cell rule is a refusal to fit,
    not a smaller fit."""
    feats = {f"p{i}": {"pos": "QB", "x": 100.0 + i, "t": 90.0 + 2 * i, "g": 10.0,
                       "age_known": False} for i in range(5)}
    outcome = {f"p{i}": 110.0 + i for i in range(5)}
    fits = V2.fit_transition(feats, outcome)
    assert fits["QB"]["mode"] == "identity" and fits["QB"]["coef"] is None
    # identity mode predicts x itself, clamped at zero
    pred = V2.predict(feats, fits)
    assert pred["p0"] == pytest.approx(100.0, abs=0.01)


def test_fit_and_predict_reproduce_a_planted_relationship():
    """Plant outcome = 10 + 0.8·x + 0.1·t + 0.5·g over enough players; the
    full-mode fit must recover it and predict a held-out player correctly."""
    feats = {}
    outcome = {}
    for i in range(40):
        x, t, g = 100.0 + 7 * i, 80.0 + 5 * ((i * 3) % 11), 8.0 + (i % 9)
        feats[f"p{i}"] = {"pos": "RB", "x": x, "t": t, "g": g, "age_known": False}
        outcome[f"p{i}"] = 10.0 + 0.8 * x + 0.1 * t + 0.5 * g
    fits = V2.fit_transition(feats, outcome)
    assert fits["RB"]["mode"] == "full", fits["RB"]
    c = fits["RB"]["coef"]
    assert c["b"] == pytest.approx(0.8, abs=1e-3)
    held = {"h": {"pos": "RB", "x": 500.0, "t": 120.0, "g": 12.0, "age_known": False}}
    pred = V2.predict(held, fits)
    assert pred["h"] == pytest.approx(10 + 0.8 * 500 + 0.1 * 120 + 0.5 * 12, abs=0.5)


def test_declared_skeleton_uses_the_declared_mix_and_clamps():
    feats = {"a": {"pos": "WR", "x": 200.0, "t": 100.0, "g": 10.0, "age_known": False},
             "z": {"pos": "WR", "x": 0.0, "t": 0.0, "g": 1.0, "age_known": False}}
    out = V2.declared_skeleton(feats)
    assert out["a"] == pytest.approx(0.5 * 200 + 0.5 * 100, abs=0.01)
    assert out["z"] == 0.0


def test_promotion_verdict_requires_all_four_on_both_metrics():
    """Hand-built h2h where v2 wins MAE everywhere but ties Spearman at TE —
    the bar must NOT clear. Beating 'both baselines' means strictly better."""
    def row(v2_mae, v2_sp, base_mae, base_sp):
        return {"status": "measured", "n": 50,
                "own_v2": {"mae": v2_mae, "spearman": v2_sp},
                "naive_prev": {"mae": base_mae, "spearman": base_sp},
                "recency_blend": {"mae": base_mae + 1, "spearman": base_sp - 0.01}}
    h2h = {"QB": row(70, 0.75, 74, 0.72), "RB": row(40, 0.78, 42, 0.75),
           "WR": row(35, 0.74, 36, 0.73), "TE": row(23, 0.78, 24, 0.78)}
    v = V2.promotion_verdict(h2h)
    assert v["clears"] is False
    assert v["per_position"]["TE"]["spearman_beats_both"] is False
    # and the all-wins case clears
    h2h["TE"] = row(23, 0.80, 24, 0.78)
    assert V2.promotion_verdict(h2h)["clears"] is True


def test_unmeasurable_position_blocks_the_bar():
    h2h = {p: {"status": "measured", "n": 50,
               "own_v2": {"mae": 1, "spearman": 0.9},
               "naive_prev": {"mae": 2, "spearman": 0.5},
               "recency_blend": {"mae": 2, "spearman": 0.5}} for p in ("QB", "RB", "WR")}
    h2h["TE"] = {"status": "unmeasurable", "n": 3}
    assert V2.promotion_verdict(h2h)["clears"] is False


@pytest.mark.repo_parity
def test_artifact_matches_regeneration_and_names_what_is_missing():
    """Once the results artifact exists it must equal a fresh run (same stores,
    same code ⇒ same numbers) and carry the named-unavailable features. Skipped
    while the prereg commit stands alone — the artifact lands in a LATER commit
    by design.

    repo_parity: "same stores" includes public/draft_data.json (board_ages)
    and player_positions.json, which the nightly workflow REBUILDS before its
    publication gate runs — so there the regeneration moves with the fresh
    board and this fails by construction against the committed artifact
    (run 31926152660). The gate deselects it via `-m "not repo_parity"`;
    every normal pytest run keeps it as the anti-hand-edit guard."""
    art_path = BT / "model_accuracy_v2.json"
    if not art_path.exists():
        pytest.skip("prereg stage: results artifact not generated yet (commit order is the proof)")
    art = json.loads(art_path.read_text())
    fresh = V2.run()
    assert art["arm_2025"] == fresh["arm_2025"]
    assert art["arm_2024"] == fresh["arm_2024"]
    assert art["promotion_bar"] == fresh["promotion_bar"]
    assert next(iter(art)) == "_territory"
    for k in ("usage_trends", "td_rate_regression", "team_change_flags",
              "blend_weight_refit"):
        assert k in art["features_unavailable_named"]
    # the 2024 arm must never masquerade as fitted v2
    assert "declared-skeleton" in art["arm_2024"]["mode"]
    assert art["arm_2024"]["recency_blend_degenerate"] is True

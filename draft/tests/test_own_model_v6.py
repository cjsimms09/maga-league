# TERRITORY: A
"""own_model_v6 — the composition contract (QB from v4, RB/WR/TE from v5,
byte for byte, nothing tuned), the REC-3 bar for the own_v6 candidate, and
the artifact contract: bit-for-bit agreement of every non-v6 cell with
model_accuracy_v5.json, own_v6's QB cell equal to own_v4's, its RB/WR/TE
cells equal to own_v5's.

Committed WITH the preregistration and BEFORE the results artifact — commit
order is the proof, same as v2-v5.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import own_model_v6 as V6  # noqa: E402


# ── the composition, on fixtures ─────────────────────────────────────────────

def test_build_v6_takes_qb_from_v4_and_the_rest_from_v5():
    positions = {"qb1": "QB", "rb1": "RB", "wr1": "WR", "te1": "TE", "x": "K"}
    v4p = {"qb1": 250.0, "rb1": 111.11, "wr1": 222.22, "te1": 90.0, "x": 5.0}
    v5p = {"qb1": 199.0, "rb1": 180.55, "wr1": 210.4, "te1": 77.31, "x": 6.0}
    out = V6.build_v6(v4p, v5p, positions)
    assert out == {"qb1": 250.0, "rb1": 180.55, "wr1": 210.4, "te1": 77.31}


def test_build_v6_has_no_tunable_constants():
    # the module must not define its own model constants — composition only.
    forbidden = [n for n in dir(V6)
                 if n.startswith(("QB_", "V5_", "BETA", "GLAM", "W_"))]
    assert forbidden == []


# ── the bar, through v3's imported verdict ───────────────────────────────────

def test_promotion_verdict_for_own_v6_requires_all_four_strictly():
    from own_model_v3 import promotion_verdict
    def row(mae, sp, bmae, bsp):
        return {"status": "measured", "n": 50,
                "own_v6": {"mae": mae, "spearman": sp},
                "naive_prev": {"mae": bmae, "spearman": bsp},
                "recency_blend": {"mae": bmae + 1, "spearman": bsp - 0.01}}
    h2h = {"QB": row(70, 0.75, 74, 0.72), "RB": row(40, 0.78, 42, 0.75),
           "WR": row(35, 0.74, 36, 0.73), "TE": row(23, 0.78, 24, 0.78)}
    v = promotion_verdict(h2h, candidate="own_v6")
    assert v["candidate"] == "own_v6" and v["clears"] is False  # TE rho ties
    h2h["TE"] = row(23, 0.80, 24, 0.78)
    assert promotion_verdict(h2h, candidate="own_v6")["clears"] is True


# ── the artifact contract ────────────────────────────────────────────────────

def test_artifact_matches_regeneration_and_reproduces_both_parents():
    """Once the results artifact exists it must equal a fresh run and prove
    the composition: every non-v6 cell equals model_accuracy_v5.json bit for
    bit (protocol identity), own_v6's QB cell equals own_v4's and its
    RB/WR/TE cells equal own_v5's (arm identity — the whole point of v6).
    Skipped while the prereg commit stands alone."""
    art_path = BT / "model_accuracy_v6.json"
    if not art_path.exists():
        pytest.skip("prereg stage: results artifact not generated yet "
                    "(commit order is the proof)")
    art = json.loads(art_path.read_text())
    assert next(iter(art)) == "_territory"
    fresh = V6.run()
    assert art["status"] == fresh["status"]
    if art["status"] != "graded":
        assert art["status"] == "no_markers"
        return
    assert art["arm_2025"] == fresh["arm_2025"]
    assert art["promotion_bar"] == fresh["promotion_bar"]
    assert art["promotion_bar"]["candidate"] == "own_v6"
    assert art["marker_gate"]["status"] == "ok" and art["marker_gate"]["markers"]
    # multiple-shot honesty travels with the artifact
    assert "three times" in art["multiple_shot_honesty"]

    v5_art = json.loads((BT / "model_accuracy_v5.json").read_text())
    v5_h2h = v5_art["arm_2025"]["head_to_head_shared_population"]
    v6_h2h = art["arm_2025"]["head_to_head_shared_population"]
    for pos in ("QB", "RB", "WR", "TE"):
        assert v6_h2h[pos]["n"] == v5_h2h[pos]["n"], pos
        for shared_model in ("own_v5", "own_v4", "own_v3", "own_v2",
                             "walk_forward_v1", "naive_prev", "recency_blend"):
            assert v6_h2h[pos][shared_model] == v5_h2h[pos][shared_model], \
                (pos, shared_model)
    # ARM identity — the composition claim itself
    assert v6_h2h["QB"]["own_v6"] == v6_h2h["QB"]["own_v4"]
    for pos in ("RB", "WR", "TE"):
        assert v6_h2h[pos]["own_v6"] == v6_h2h[pos]["own_v5"], pos

# TERRITORY: A
"""own_model_v3 — the market machinery on hand-computable fixtures, the marker
gate's BOTH arms, the ensemble arithmetic, the REC-3 bar, and the artifact
contract (including bit-for-bit baseline agreement with model_accuracy_v2.json,
which proves the shared-population protocol was reused, not re-implemented).

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

import own_model_v3 as V3  # noqa: E402


# ── weights: the prereg'd table is convex and position-complete ──────────────

def test_ensemble_weights_are_convex_rows_over_all_four_positions():
    assert set(V3.ENSEMBLE_WEIGHTS) == {"QB", "RB", "WR", "TE"}
    for pos, (wv, wb, wm) in V3.ENSEMBLE_WEIGHTS.items():
        assert wv > 0 and wb > 0 and wm > 0, pos
        assert wv + wb + wm == pytest.approx(1.0, abs=1e-9), pos


# ── the market input ─────────────────────────────────────────────────────────

def test_league_draft_picks_takes_the_completed_draft_with_most_picks(tmp_path):
    """2023's real shape: a 30-pick partial beside the 150-pick draft — the
    bigger completed one wins; an incomplete season refuses."""
    doc = {"seasons": [
        {"season": "2023", "drafts": [
            {"status": "complete", "picks": [{"player_id": "a", "pick_no": 1}]},
            {"status": "complete", "picks": [{"player_id": "a", "pick_no": 1},
                                             {"player_id": "b", "pick_no": 2}]},
        ]},
        {"season": "2026", "drafts": [{"status": "pre_draft", "picks": []}]},
    ]}
    p = tmp_path / "lh.json"
    p.write_text(json.dumps(doc))
    picks = V3.league_draft_picks(2023, history_path=p)
    assert picks == {"a": 1, "b": 2}
    with pytest.raises(ValueError, match="no completed league draft"):
        V3.league_draft_picks(2026, history_path=p)
    with pytest.raises(ValueError, match="no completed league draft"):
        V3.league_draft_picks(1999, history_path=p)


def test_market_ranks_are_within_position_by_pick_order():
    picks = {"qb2": 40, "qb1": 3, "rb1": 5, "wr1": 1, "kicker": 2}
    pos = {"qb1": "QB", "qb2": "QB", "rb1": "RB", "wr1": "WR", "kicker": "K"}
    mr = V3.market_ranks(picks, pos)
    assert mr["qb1"] == ("QB", 1) and mr["qb2"] == ("QB", 2)
    assert mr["rb1"] == ("RB", 1) and mr["wr1"] == ("WR", 1)
    assert "kicker" not in mr  # K/DEF never enter the market layer


def test_market_points_reads_the_curve_and_clamps_past_the_tail():
    curve = {"TE": [200.0, 150.0, 90.0]}
    assert V3.market_points(curve, "TE", 1) == 200.0
    assert V3.market_points(curve, "TE", 3) == 90.0
    assert V3.market_points(curve, "TE", 50) == 90.0  # tail clamp, never zero


# ── the marker gate, BOTH arms ───────────────────────────────────────────────

def test_marker_gate_passes_on_a_dead_high_pick_and_refuses_without_one():
    pos = {"star": "RB", "dead": "RB", "late": "WR"}
    picks = {"star": 1, "dead": 25, "late": 140}
    # genuine preseason draft: pick 25's season died (realized 21.1)
    realized = {"star": 280.0, "dead": 21.1, "late": 5.0}
    gate = V3.draft_marker_gate(picks, realized, pos)
    assert gate["status"] == "ok"
    assert gate["markers"][0]["player_id"] == "dead"
    # post-hoc-looking draft: every high pick scored big → refuse
    realized_posthoc = {"star": 280.0, "dead": 200.0, "late": 5.0}
    gate2 = V3.draft_marker_gate(picks, realized_posthoc, pos)
    assert gate2["status"] == "no_markers" and gate2["markers"] == []
    # the late pick's dead season is NOT a marker (pick_no > threshold)
    assert all(m["pick_no"] <= V3.MARKER_MAX_PICK for m in gate["markers"])


# ── the ensemble arithmetic, hand-computed ───────────────────────────────────

def test_build_v3_blends_drafted_players_and_renormalizes_undrafted():
    pos = {"q_drafted": "QB", "q_undrafted": "QB", "z_kicker": "K"}
    v2p = {"q_drafted": 300.0, "q_undrafted": 100.0, "z_kicker": 120.0}
    blend = {"q_drafted": 280.0, "q_undrafted": 140.0}
    curve = {"QB": [400.0, 350.0]}
    mrank = {"q_drafted": ("QB", 2)}
    out = V3.build_v3(v2p, blend, mrank, curve, pos)
    wv, wb, wm = V3.ENSEMBLE_WEIGHTS["QB"]
    assert out["q_drafted"] == pytest.approx(
        wv * 300.0 + wb * 280.0 + wm * 350.0, abs=0.01)
    assert out["q_undrafted"] == pytest.approx(
        (wv * 100.0 + wb * 140.0) / (wv + wb), abs=0.01)
    assert "z_kicker" not in out  # coverage is QB/RB/WR/TE only


def test_build_v3_clamps_at_zero_and_falls_back_to_v2_when_blend_is_absent():
    pos = {"a": "WR"}
    out = V3.build_v3({"a": 50.0}, {}, {}, {"WR": [100.0]}, pos)
    assert out["a"] == pytest.approx(50.0, abs=0.01)  # blend falls back to v2
    out2 = V3.build_v3({"a": 0.0}, {"a": 0.0}, {}, {"WR": [100.0]}, pos)
    assert out2["a"] == 0.0


def test_build_v3_coverage_is_exactly_v2_coverage():
    """The shared-population identity with model_accuracy_v2.json depends on
    v3 predicting exactly v2's players — no more, no fewer."""
    pos = {"a": "RB", "b": "TE"}
    v2p = {"a": 90.0, "b": 60.0}
    out = V3.build_v3(v2p, {"a": 80.0, "b": 55.0}, {}, {"RB": [1.0], "TE": [1.0]}, pos)
    assert set(out) == set(v2p)


# ── the bar (REC-3) ──────────────────────────────────────────────────────────

def _row(c_mae, c_sp, base_mae, base_sp):
    return {"status": "measured", "n": 50,
            "own_v3": {"mae": c_mae, "spearman": c_sp},
            "naive_prev": {"mae": base_mae, "spearman": base_sp},
            "recency_blend": {"mae": base_mae + 1, "spearman": base_sp - 0.01}}


def test_promotion_verdict_requires_all_four_on_both_metrics_strictly():
    h2h = {"QB": _row(70, 0.75, 74, 0.72), "RB": _row(40, 0.78, 42, 0.75),
           "WR": _row(35, 0.74, 36, 0.73), "TE": _row(23, 0.78, 24, 0.78)}
    v = V3.promotion_verdict(h2h)
    assert v["clears"] is False  # TE Spearman TIES — ties lose
    assert v["per_position"]["TE"]["spearman_beats_both"] is False
    h2h["TE"] = _row(23, 0.80, 24, 0.78)
    assert V3.promotion_verdict(h2h)["clears"] is True


def test_unmeasurable_position_blocks_the_bar():
    h2h = {p: _row(1, 0.9, 2, 0.5) for p in ("QB", "RB", "WR")}
    h2h["TE"] = {"status": "unmeasurable", "n": 3}
    assert V3.promotion_verdict(h2h)["clears"] is False


# ── the artifact contract ────────────────────────────────────────────────────

@pytest.mark.repo_parity
def test_artifact_matches_regeneration_and_reproduces_v2_baselines():
    """repo_parity: regeneration reads the tree's board/positions rows, which
    the nightly workflow rewrites before its publication gate — deselected
    there (`-m "not repo_parity"`, see conftest.py), kept in every normal run.

    Once the results artifact exists it must equal a fresh run, name its
    information set and absences, carry the marker gate's evidence, and — the
    protocol-identity proof — its naive_prev / recency_blend / walk_forward_v1
    / own_v2 shared-population cells must equal model_accuracy_v2.json's
    bit for bit (same denominator, same metrics, same code path). Skipped
    while the prereg commit stands alone — the artifact lands in a LATER
    commit by design."""
    art_path = BT / "model_accuracy_v3.json"
    if not art_path.exists():
        pytest.skip("prereg stage: results artifact not generated yet (commit order is the proof)")
    art = json.loads(art_path.read_text())
    assert next(iter(art)) == "_territory"
    fresh = V3.run()
    assert art["status"] == fresh["status"]
    if art["status"] != "graded":
        assert art["status"] == "no_markers"  # refusal is the artifact
        return
    assert art["arm_2025"] == fresh["arm_2025"]
    assert art["promotion_bar"] == fresh["promotion_bar"]
    assert art["marker_gate"]["status"] == "ok" and art["marker_gate"]["markers"]
    for k in ("fp_archive_per_player", "usage_trends", "td_rate_regression",
              "team_change_flags", "pre_2023_stores"):
        assert k in art["features_unavailable_named"]
    # the 2024 arm must be a named absence, never a number
    assert "in-sample" in art["arm_2024"]
    # protocol identity with the v2 artifact
    v2_art = json.loads((BT / "model_accuracy_v2.json").read_text())
    v2_h2h = v2_art["arm_2025"]["head_to_head_shared_population"]
    v3_h2h = art["arm_2025"]["head_to_head_shared_population"]
    for pos in ("QB", "RB", "WR", "TE"):
        assert v3_h2h[pos]["n"] == v2_h2h[pos]["n"], pos
        for shared_model, v2_name in (("naive_prev", "naive_prev"),
                                      ("recency_blend", "recency_blend"),
                                      ("walk_forward_v1", "walk_forward_v1"),
                                      ("own_v2", "own_v2")):
            assert v3_h2h[pos][shared_model] == v2_h2h[pos][v2_name], (pos, shared_model)

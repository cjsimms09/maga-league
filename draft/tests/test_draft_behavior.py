# TERRITORY: A
"""draft_behavior.py — pure core, offline (no egress, no live board reads here).

The one data trap everything else inherits: 2023's keepers carry NO is_keeper
flags in the main draft — they live in a parallel 30-pick keeper draft. Every
test of the keeper join is a test of the 377-decision count the whole
measurement stands on.

Run: python -m pytest draft/tests/test_draft_behavior.py -q
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import draft_behavior as DB  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


# ── synthetic history: the 2023 keeper-trap shape, in miniature ─────────────

def _history():
    """Two-team league. 2023: main draft with UNFLAGGED keepers at the top plus
    a parallel all-keeper draft naming the same pairs. 2024: flags inline."""
    return {"seasons": [
        {"season": "2023",
         "owners": {"1": {"display_name": "handleA"}, "2": {"display_name": "handleB"}},
         "drafts": [
             # main: >100 picks so build_rows takes it; keepers unflagged
             {"picks": ([{"round": 1, "pick_no": 1, "roster_id": 1, "player_id": "k1",
                          "is_keeper": False},
                         {"round": 1, "pick_no": 2, "roster_id": 2, "player_id": "k2",
                          "is_keeper": False}]
                        + [{"round": (i // 2) + 2, "pick_no": i + 3,
                            "roster_id": (i % 2) + 1, "player_id": f"p{i}",
                            "is_keeper": False} for i in range(100)])},
             # the parallel keeper draft: short, all flagged
             {"picks": [{"round": 1, "pick_no": 1, "roster_id": 1, "player_id": "k1",
                         "is_keeper": True},
                        {"round": 1, "pick_no": 2, "roster_id": 2, "player_id": "k2",
                         "is_keeper": True}]},
         ]},
        {"season": "2024",
         "owners": {"1": {"display_name": "handleA"}, "2": {"display_name": "handleB"}},
         "drafts": [
             {"picks": ([{"round": 1, "pick_no": 1, "roster_id": 1, "player_id": "k1",
                          "is_keeper": True}]
                        + [{"round": (i // 2) + 1, "pick_no": i + 2,
                            "roster_id": (i % 2) + 1, "player_id": f"p{i}",
                            "is_keeper": False} for i in range(100)])}]},
    ]}


def _positions(n=100):
    pos = {"k1": "RB", "k2": "WR"}
    cyc = ("RB", "WR", "QB", "TE", "K", "DEF")
    for i in range(n):
        pos[f"p{i}"] = cyc[i % len(cyc)]
    return pos


def test_2023_keeper_trap_joined_not_flag_filtered():
    rows, _ = DB.build_rows(_history(), _positions())
    r23 = [r for r in rows if r["season"] == "2023"]
    keepers = [r for r in r23 if r["is_keeper"]]
    # the two unflagged main-draft placements are marked via the parallel draft
    assert {r["player_id"] for r in keepers} == {"k1", "k2"}
    assert len(DB.decisions(rows, ("2023",))) == 100


def test_decision_index_skips_keepers():
    rows, _ = DB.build_rows(_history(), _positions())
    d23 = sorted(DB.decisions(rows, ("2023",)), key=lambda r: r["pick_no"])
    # first decision is board pick 3, but decision index 1 — the liveIndexOf scale
    assert d23[0]["pick_no"] == 3 and d23[0]["decision_index"] == 1
    assert d23[-1]["decision_index"] == 100


def test_owner_names_resolve_via_first_name_table():
    rows, _ = DB.build_rows(_history(), _positions(), {"handleA": "Alice"})
    assert {r["owner"] for r in rows} == {"Alice", "handleB"}


def test_room_proxy_is_mean_decision_index_over_prior_seasons():
    rows, _ = DB.build_rows(_history(), _positions())
    proxy = DB.room_proxy(rows, ("2023", "2024"))
    # p0: decision_index 1 in 2023 (pick 3) and 1 in 2024 (pick 2)
    assert proxy["p0"] == 1.0
    assert "k1" not in proxy                     # keepers are never decisions


def test_unresolved_positions_are_counted_not_dropped_silently():
    pos = _positions()
    del pos["p0"]
    rows, unresolved = DB.build_rows(_history(), pos)
    assert {u["player_id"] for u in unresolved} == {"p0"}
    assert {u["season"] for u in unresolved} == {"2023", "2024"}


# ── the engine-formula mirror ───────────────────────────────────────────────

def test_adp_sd_mirrors_survival_js_clamps():
    assert DB.adp_sd(1) == 3.0            # floor
    assert DB.adp_sd(60) == 9.0           # 0.15 * 60
    assert DB.adp_sd(200) == 15.0         # cap


def test_normal_cdf_sane():
    assert abs(DB.normal_cdf(0, 0, 1) - 0.5) < 1e-12
    assert DB.normal_cdf(10, 0, 0) == 1.0  # degenerate sigma refuses to pretend


def test_round_bucket_matches_live_code():
    assert DB.round_bucket(3) == "early"
    assert DB.round_bucket(9) == "mid"     # the artifact's boundary (<=9)
    assert DB.round_bucket(10) == "late"


# ── behavior measures ───────────────────────────────────────────────────────

def test_run_rule_two_consecutive_same_position():
    rows = [{"season": "s", "round": 4, "pick_no": i, "roster_id": 1,
             "owner": "A", "player_id": str(i), "position": p,
             "is_keeper": False, "decision_index": i}
            for i, p in enumerate(["RB", "RB", "RB", "WR"], start=1)]
    ev = DB.run_events(rows, "s")
    # t=3 faces an RB run and follows; t=4 faces an RB run and breaks it
    assert ev == [("A", "RB", True), ("A", "RB", False)]


def test_need_positions_and_kdef_only_late():
    assert DB.need_positions({"QB": 1, "RB": 2, "WR": 2, "TE": 1, "K": 1, "DEF": 1}) == set()
    assert "RB" in DB.need_positions({"RB": 1})
    rows, _ = DB.build_rows(_history(), _positions())
    rate, n = DB.need_fill_rate(rows, ("2023",))
    assert n > 0 and 0.0 <= rate <= 1.0


def test_within_weights_conserve_mass():
    head, tail_w = DB._within_weights(20)
    total = sum(head) + tail_w * (20 - len(head))
    assert abs(total - 1.0) < 1e-9
    head_small, tail_small = DB._within_weights(3)   # pool smaller than the cap
    assert tail_small == 0.0 and abs(sum(head_small) - 1.0) < 1e-9


def test_mix_blending_pseudocount():
    league = {"mid": {"RB": 50, "WR": 50}}
    # no owner evidence -> exactly the league share
    mix = DB._mix_for("X", "mid", {}, league)
    assert abs(mix["RB"] - 0.5) < 1e-9
    # heavy owner evidence dominates the pseudo-count
    owner = {"X": {"mid": {"RB": 92, "WR": 8}}}
    mix = DB._mix_for("X", "mid", owner, league)
    assert mix["RB"] > 0.85


def test_need_damp_renormalises():
    mix = {"RB": 0.5, "WR": 0.5, "QB": 0.0, "TE": 0.0, "K": 0.0, "DEF": 0.0}
    out = DB._need_damp(mix, {"RB": 2, "WR": 0})     # RB starters full
    assert out["WR"] > out["RB"]
    assert abs(sum(out.values()) - 1.0) < 1e-9


def test_spearman_known_values():
    assert abs(DB.spearman([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]) - 1.0) < 1e-9
    assert abs(DB.spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]) + 1.0) < 1e-9
    assert DB.spearman([1, 1, 1], [1, 2, 3]) is None  # degenerate refuses


# ── the forward test, structural properties on synthetic data ───────────────

def test_forward_test_runs_and_reports_structure():
    rows, _ = DB.build_rows(_history(), _positions())
    # target the 2024 season fit on 2023 — small but complete
    ft = DB.forward_test(rows, train_seasons=("2023",), target="2024")
    assert ft["survival_brier"]["model"]["pooled"] is not None
    assert ft["survival_brier"]["baseline"]["pooled"] is not None
    assert ft["next_pick_position"]["n"] > 0
    assert isinstance(ft["survival_brier"]["model_beats_baseline"], bool)


def test_forward_test_target_keepers_never_scored():
    rows, _ = DB.build_rows(_history(), _positions())
    ft = DB.forward_test(rows, train_seasons=("2023",), target="2024")
    # k1 is kept in 2024: it must not appear among scored picks (it is not a
    # decision) — 2024 has exactly 100 decisions
    assert ft["n_decisions_target"] == 100


# ── the committed artifact, held to its own rules ───────────────────────────

def test_committed_artifact_territory_first_and_prereg_named():
    art = json.loads((ROOT / "draft" / "data" / "draft_behavior.json").read_text())
    keys = list(art.keys())
    assert keys[0] == "_territory" and "TERRITORY: A" in art["_territory"]
    assert "draft_behavior_2026-08-15.md" in art["_prereg"]


def test_committed_artifact_decision_counts_are_the_corrected_ones():
    """377, not ~420 — the 2023 keeper join is what separates the two. If a
    re-harvest changes these, the audit doc's census is stale and must move
    with it deliberately."""
    art = json.loads((ROOT / "draft" / "data" / "draft_behavior.json").read_text())
    assert art["provenance"]["n_decisions"] == {"2023": 120, "2024": 127, "2025": 130}


def test_committed_artifact_carries_forward_test_and_stability():
    art = json.loads((ROOT / "draft" / "data" / "draft_behavior.json").read_text())
    assert "forward_test" in art and "stability" in art
    assert "league_bucket_mix" in art          # what the gated switch consumes
    for b in ("early", "mid", "late"):
        share = art["league_bucket_mix"][b]["share"]
        total = sum(v for v in share.values() if v is not None)
        assert abs(total - 1.0) < 0.01        # shares are a distribution (4dp rounding)

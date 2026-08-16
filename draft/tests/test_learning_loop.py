# TERRITORY: A
"""learning_loop — the leak guard on the source grade, the weight arithmetic,
and the artifact's untouched-defaults contract."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import learning_loop as LL  # noqa: E402


def _series(**overrides):
    base = [
        {"date": "2026-08-10", "source": "fantasypros", "proj": {"1": 300.0, "2": 200.0}},
        {"date": "2026-08-20", "source": "fantasypros", "proj": {"1": 310.0, "2": 205.0}},
        {"date": "2026-09-15", "source": "fantasypros", "proj": {"1": 400.0, "2": 100.0}},
    ]
    return base


def test_FAIL_ARM_a_post_draft_snapshot_is_never_selected():
    """THE LEAK GUARD. The 09-15 snapshot has seen two weeks of real football;
    grading it as a preseason forecast flatters the source. The selector must
    take the LAST pre-cutoff snapshot (08-20), never the freshest one."""
    snap = LL.pre_draft_snapshot(_series(), "fantasypros")
    assert snap["date"] == "2026-08-20", snap
    # a series holding ONLY post-cutoff snapshots yields nothing, not the
    # least-contaminated something
    late_only = [s for s in _series() if s["date"] > LL.DRAFT_DATE]
    assert LL.pre_draft_snapshot(late_only, "fantasypros") is None


def test_no_outcome_store_means_BLOCKED_with_the_date_it_unblocks():
    out = LL.grade_frozen_sources(_series(), {}, {"1": "QB", "2": "QB"})
    assert out["status"] == "blocked"
    assert "January 2027" in out["why"]


def test_the_weight_rule_is_the_arithmetic_it_declares():
    """Two sources, hand-computable MSEs -> hand-computable inverse-MSE weights."""
    positions = {f"p{i}": "QB" for i in range(10)}
    actual = {f"p{i}": 100.0 + 10 * i for i in range(10)}
    store = {"weeks": [{"week": 1, "points": actual}]}
    series = [
        # source A: always off by +10 -> MSE 100
        {"date": "2026-08-10", "source": "A",
         "proj": {pid: v + 10.0 for pid, v in actual.items()}},
        # source B: always off by +20 -> MSE 400
        {"date": "2026-08-10", "source": "B",
         "proj": {pid: v + 20.0 for pid, v in actual.items()}},
    ]
    out = LL.grade_frozen_sources(series, store, positions)
    assert out["status"] == "measured"
    qb = out["cells"]["QB"]
    assert qb["sources"]["A"]["mse"] == 100.0 and qb["sources"]["B"]["mse"] == 400.0
    # w_A = (1/100) / (1/100 + 1/400) = 0.8 ; w_B = 0.2
    assert qb["proposed_weights"] == {"A": 0.8, "B": 0.2}


def test_a_thin_source_gets_NO_weight_claim():
    """A source measurable on 3 players must not receive a weight — equal-by-
    default is a claim of evidence that does not exist."""
    positions = {f"p{i}": "RB" for i in range(12)}
    actual = {f"p{i}": 50.0 + 5 * i for i in range(12)}
    store = {"weeks": [{"week": 1, "points": actual}]}
    series = [
        {"date": "2026-08-10", "source": "full",
         "proj": {pid: v + 5.0 for pid, v in actual.items()}},
        {"date": "2026-08-10", "source": "thin",
         "proj": {pid: actual[pid] for pid in list(actual)[:3]}},
    ]
    out = LL.grade_frozen_sources(series, store, positions)
    rb = out["cells"]["RB"]
    assert rb["sources"]["thin"]["status"] == "unmeasurable"
    assert rb["proposed_weights"] == {"full": 1.0}


def test_the_COMMITTED_artifact_matches_regeneration_and_honours_the_ruling():
    art = json.loads((HERE.parent / "data" / "model_update_recommendations.json").read_text())
    fresh = LL.build_recommendations()
    assert art["recommendations"] == fresh["recommendations"], (
        "model_update_recommendations.json does not match learning_loop's output — "
        "regenerate it in the same change that moved an input")
    # Applied recommendations carry CORY'S RECORDED RULINGS, one each: REC-1
    # (2026-08-15, decision arm re-verified first) and REC-3 (2026-08-16,
    # "Yes on v4" — the first promotion-bar clear, proj_ownmodel's algorithm
    # swapped to own_v4 with the v1 core kept as rollback). Nothing else
    # moved a default.
    assert art["applied_under_ruling"] == [
        "REC-1-proj-sd-calibration", "REC-3-own-model-stays-display-only"]
    assert art["defaults_untouched_beyond_ruling"] is True
    assert next(iter(art)) == "_territory"


def test_every_recommendation_carries_an_acceptance_path():
    """A recommendation without a concrete acceptance path is a wish. Every row
    must say what the one reviewed change IS (or explicitly that it blocks one)."""
    art = json.loads((HERE.parent / "data" / "model_update_recommendations.json").read_text())
    for r in art["recommendations"]:
        assert r.get("acceptance"), f"{r['id']} has no acceptance path"
        assert r.get("status") in ("ready-for-ruling", "blocked-until-2027-01",
                                   "standing-negative", "wiring-gap",
                                   "applied-2026-08-15", "applied-2026-08-16",
                                   "wired-to-recommendation-artifact"), r["id"]


def test_REC2_unlock_is_machine_checked_not_remembered():
    """'Blocked until January' must be OBSERVED weekly: the artifact carries the
    graded-weeks count and names the runner that checks it every Tuesday."""
    art = json.loads((HERE.parent / "data" / "model_update_recommendations.json").read_text())
    rec2 = next(r for r in art["recommendations"] if r["id"] == "REC-2-source-weights")
    up = rec2["unlock_progress"]
    assert up["weeks_needed"] == 17
    assert "weekly_grade_runner" in up["checked_by"]
    assert f"{up['weeks_graded']}/17" in up["line"]
    store_exists = (BT / "nflverse_weekly_points_2026.json").exists()
    if not store_exists:
        assert up["weeks_graded"] == 0 and up["store_exists"] is False


def test_REC4_consumes_a_mirror_when_one_exists_era_stamp_and_all(monkeypatch):
    """The read side: a mirrored evidence_weights doc flips REC-4 from
    wiring-gap to wired-to-recommendation-artifact, carrying the rules_era so a
    snapshot graded under different money-bearing rules cannot steer unnoticed."""
    real_load = LL._load
    fake = {"fetched_at": "2026-09-01T13:30:00Z",
            "weights": {"updated_at": "2026-09-01T12:00:00Z", "season": 2026,
                        "graded_n": 14, "league_se": 0.11,
                        "combined": {"weights": {"league": 0.83, "external": 0.17}},
                        "rules_era": {"signature": "abc123", "season": 2026}}}

    def patched(path):
        if path.name == "evidence_weights_latest.json":
            return fake
        return real_load(path)

    monkeypatch.setattr(LL, "_load", patched)
    fresh = LL.build_recommendations()
    rec4 = next(r for r in fresh["recommendations"]
                if r["id"] == "REC-4-evidence-weights-have-no-reader")
    assert rec4["status"] == "wired-to-recommendation-artifact"
    assert rec4["consumed_evidence_weights"]["rules_era"]["signature"] == "abc123"
    assert rec4["consumed_evidence_weights"]["graded_n"] == 14

    # fail arm: a mirror with no weights dict is a named absence, not a claim
    fake2 = {"fetched_at": "x"}
    monkeypatch.setattr(LL, "_load",
                        lambda p: fake2 if p.name == "evidence_weights_latest.json"
                        else real_load(p))
    gap = LL.build_recommendations()
    rec4b = next(r for r in gap["recommendations"]
                 if r["id"] == "REC-4-evidence-weights-have-no-reader")
    assert rec4b["status"] == "wiring-gap"
    assert rec4b["consumed_evidence_weights"] is None


def test_REC3_carries_the_promotion_bar_and_reads_the_v2_artifact():
    """Cory's bar: beat BOTH baselines at ALL four positions on BOTH metrics,
    then a written decision — never an automatic flip. When the v2 artifact
    exists its verdict must appear as a candidate (one derivation, cited)."""
    art = json.loads((HERE.parent / "data" / "model_update_recommendations.json").read_text())
    rec3 = next(r for r in art["recommendations"]
                if r["id"] == "REC-3-own-model-stays-display-only")
    bar = rec3["promotion_bar"]
    for phrase in ("BOTH naive baselines", "ALL four positions", "BOTH metrics",
                   "never an automatic flip"):
        assert phrase in bar["rule"], phrase
    if (BT / "model_accuracy_v2.json").exists():
        assert "own_model_v2" in bar["candidates"], (
            "the v2 artifact exists but REC-3 does not carry its verdict — "
            "regenerate the recommendations")


def test_REC2_stays_blocked_until_the_2026_store_exists():
    """The recommendation that could move the composition must not claim to be
    measured while the outcome data does not exist on disk."""
    art = json.loads((HERE.parent / "data" / "model_update_recommendations.json").read_text())
    rec2 = next(r for r in art["recommendations"] if r["id"] == "REC-2-source-weights")
    store_exists = (BT / "nflverse_weekly_points_2026.json").exists()
    if not store_exists:
        assert rec2["status"] == "blocked-until-2027-01", (
            "no 2026 weekly store on disk, yet REC-2 claims measured evidence")
        assert rec2["grade"]["status"] == "blocked"
    else:
        assert rec2["status"] == "ready-for-ruling", (
            "the 2026 store exists — regenerate learning_loop so REC-2 grades it")

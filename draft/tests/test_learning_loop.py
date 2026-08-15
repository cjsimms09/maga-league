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


def test_the_COMMITTED_artifact_matches_regeneration_and_touches_nothing():
    art = json.loads((HERE.parent / "data" / "model_update_recommendations.json").read_text())
    fresh = LL.build_recommendations()
    assert art["recommendations"] == fresh["recommendations"], (
        "model_update_recommendations.json does not match learning_loop's output — "
        "regenerate it in the same change that moved an input")
    assert art["defaults_untouched"] is True
    assert next(iter(art)) == "_territory"


def test_every_recommendation_carries_an_acceptance_path():
    """A recommendation without a concrete acceptance path is a wish. Every row
    must say what the one reviewed change IS (or explicitly that it blocks one)."""
    art = json.loads((HERE.parent / "data" / "model_update_recommendations.json").read_text())
    for r in art["recommendations"]:
        assert r.get("acceptance"), f"{r['id']} has no acceptance path"
        assert r.get("status") in ("ready-for-ruling", "blocked-until-2027-01",
                                   "standing-negative", "wiring-gap"), r["id"]


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

"""The blend's DECISION RULE, tested offline — both arms.

Cory, 2026-08-17: "NEEDS DONE NOW AND NEEDS DONE RIGHT."

The fetch needs egress and runs in CI. The part that decides what the numbers
MEAN does not, and it is the part that has burned this project twice this week —
a verdict string that could not fail (exp_fp_board_coverage) and a best cell at
the edge of a grid reported as an optimum (exp_ceiling_replicate, exp_weekly_env).

So the rule is tested here, before any real number exists, with both outcomes
proven reachable. A decision function that can only say one thing is not a
decision function.
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
sys.path.insert(0, str(ROOT / "draft"))

import source_blend_2025 as SB  # noqa: E402


def cells(rho_by_pos):
    return {p: {"n": 100, "status": "measured", "spearman": r, "mae": 30.0, "bias": 0.0}
            for p, r in rho_by_pos.items()}


def arms_where(sleeper, fp, blend_by_w):
    a = {"SLEEPER": cells(sleeper), "FP": cells(fp)}
    for w, rho in blend_by_w.items():
        a[f"BLEND-{w:.2f}"] = cells(rho)
    return a


POS = ("QB", "RB", "WR", "TE")


def flat(v):
    return {p: v for p in POS}


def test_blend_arithmetic():
    assert SB.blend(10.0, 20.0, 0.5) == 15.0
    assert SB.blend(10.0, 20.0, 1.0) == 10.0   # w is the weight on SLEEPER
    assert SB.blend(10.0, 20.0, 0.0) == 20.0


def test_a_real_blend_win_is_reported_as_a_win():
    """FAIL ARM: the rule must be able to say the blend wins."""
    arms = arms_where(flat(0.70), flat(0.72), {0.25: flat(0.60), 0.50: flat(0.80), 0.75: flat(0.61)})
    d = SB.decide(arms)
    assert d["positions_beating_both"] == 4
    assert d["best_w"] == 0.50
    assert "BLEND WINS" in d["verdict"]
    assert d["edge_of_grid"] is False


def test_no_separation_is_reported_as_no_separation():
    """FAIL ARM: and it must be able to say the blend does NOT win."""
    arms = arms_where(flat(0.80), flat(0.79), {0.25: flat(0.60), 0.50: flat(0.61), 0.75: flat(0.62)})
    d = SB.decide(arms)
    assert d["positions_beating_both"] == 0
    assert "NO SEPARATION" in d["verdict"]
    assert "keeps its current source" in d["verdict"]


def test_two_of_four_positions_is_not_enough():
    """The prereg says 3 of 4. Two must lose — this is the threshold, tested."""
    sl, fp_ = flat(0.70), flat(0.70)
    bl = {"QB": 0.90, "RB": 0.90, "WR": 0.50, "TE": 0.50}
    arms = arms_where(sl, fp_, {0.25: flat(0.1), 0.50: bl, 0.75: flat(0.1)})
    d = SB.decide(arms)
    assert d["positions_beating_both"] == 2
    assert "NO SEPARATION" in d["verdict"]


def test_an_edge_of_grid_win_is_flagged_not_shipped():
    """The defect found twice on 08-17: a best cell at the boundary did not
    bracket the optimum, and was reported as one anyway."""
    arms = arms_where(flat(0.70), flat(0.71), {0.25: flat(0.60), 0.50: flat(0.72), 0.75: flat(0.85)})
    d = SB.decide(arms)
    assert d["best_w"] == 0.75, "best cell should be the top of the grid"
    assert d["edge_of_grid"] is True
    assert "EDGE OF THE GRID" in d["verdict"]
    assert "NOT established" in d["verdict"]


def test_the_shipping_cap_is_always_stated():
    """One season is one season, and the artifact must say so in every outcome."""
    for arms in (arms_where(flat(0.7), flat(0.7), {0.25: flat(0.9), 0.50: flat(0.9), 0.75: flat(0.9)}),
                 arms_where(flat(0.9), flat(0.9), {0.25: flat(0.1), 0.50: flat(0.1), 0.75: flat(0.1)})):
        d = SB.decide(arms)
        assert "NOTHING from this run ships during draft week" in d["shipping_cap"]


def test_insufficient_n_cells_are_excluded_not_counted_as_wins():
    arms = arms_where(flat(0.70), flat(0.70), {0.25: flat(0.1), 0.50: flat(0.9), 0.75: flat(0.1)})
    arms["BLEND-0.50"]["QB"] = {"n": 5, "status": "INSUFFICIENT-N"}
    d = SB.decide(arms)
    assert d["positions_beating_both"] == 3, "a thin cell must not count as a win"


def test_arm_metrics_refuses_thin_cells():
    out = SB.arm_metrics({"QB": [(1.0, 1.0)] * 5})
    assert out["QB"]["status"] == "INSUFFICIENT-N"


def test_arm_metrics_measures_a_real_cell():
    pairs = [(float(i), float(i) + 1.0) for i in range(40)]
    out = SB.arm_metrics({"WR": pairs})
    assert out["WR"]["status"] == "measured"
    assert out["WR"]["spearman"] == pytest.approx(1.0, abs=1e-6)
    assert out["WR"]["mae"] == pytest.approx(1.0, abs=1e-6)


def test_void_is_not_a_negative_result():
    """Egress failure must never read as 'the blend does not help'."""
    import inspect
    src = inspect.getsource(SB.void)
    assert "VOID is not a negative result" in src


# ── the store shape, checked rather than remembered ─────────────────────────

def test_season_totals_reads_the_real_store_shape():
    """REGRESSION. The first version read `weeks` as a dict keyed by week.

    It is a LIST of {season, week, points:{pid: pts}}. The dict version summed
    nothing, so the run would have produced an empty realized set and written
    VOID — which would have read as an egress failure and sent someone chasing
    the proxy. Found by measuring the store instead of trusting a memory of it.
    """
    store = json.loads((ROOT / "draft" / "backtest"
                        / "nflverse_weekly_points_2025.json").read_text())
    totals = SB.season_totals(store)
    assert len(totals) > 400, f"only {len(totals)} realized players — shape misread"
    # 5d: the rebuilt store legitimately carries zero-total players
    # (appearances that never scored) — presence is not positivity.
    assert all(v >= 0 for v in totals.values())
    assert sum(1 for v in totals.values() if v > 0) > 400


def test_season_totals_tolerates_the_other_shape():
    """Known-positive control on the tolerance branch, so it is not dead code."""
    as_dict = {"weeks": {"1": {"points": {"7": 10.0}}, "2": {"points": {"7": 5.0}}}}
    assert SB.season_totals(as_dict) == {"7": 15.0}


def test_season_totals_is_empty_on_an_empty_store():
    """Control: the function CAN return nothing, so a real total means something."""
    assert SB.season_totals({"weeks": []}) == {}

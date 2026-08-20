"""The Tuesday grader's Cory-bar wiring: NOT RUN while a provider column is
missing (never a fake verdict), computed the day both providers grade."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import weekly_own_grade as G  # noqa: E402
import start_sit_metric as M  # noqa: E402


def _week(with_fp):
    rows = {}
    for i in range(3):
        r = {"pos": "WR", "actual": 10.0 * (i + 1),
             "proj": {"v1": 5.0 * (i + 1)}, "sleeper": 4.0 * (i + 1)}
        if with_fp:
            r["fantasypros"] = 3.0 * (i + 1)
        rows[f"p{i}"] = r
    return {"champion_arm": "v1", "rows": rows}


def test_not_run_until_both_providers_grade():
    out = G.cory_bar_startsit({"1": _week(with_fp=False)})
    assert out.get("status", "").startswith("NOT RUN")
    assert "bar" not in out


def test_computes_when_both_providers_present():
    saved = M.MIN_PAIRS
    try:
        M.MIN_PAIRS = 1
        out = G.cory_bar_startsit({"1": _week(with_fp=True)})
        assert out["weeks_pooled"] == 1
        assert out["accuracy"]["sources"]["ours"]["WR"]["accuracy"] == 1.0
        assert "bar_met" in out["bar"]
    finally:
        M.MIN_PAIRS = saved

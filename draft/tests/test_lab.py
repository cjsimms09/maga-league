"""THE LAB — lock the registry runner end to end.

Proves the harness pipeline (roster_sim -> money_grade -> report) runs on the
real seasons and writes the artifacts the Sunday self-audit consumes.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import lab as LAB  # noqa: E402


def test_runner_produces_a_result_per_runnable_experiment(tmp_path):
    report = LAB.run_all(tmp_path)
    runnable = [e for e in LAB.EXPERIMENTS if e.get("runnable")]
    assert len(report["results"]) == len(runnable) >= 1
    assert (tmp_path / "lab-results.json").exists()
    assert (tmp_path / "LAB-REPORT.md").exists()


def test_lineup_ceiling_is_a_nonnegative_gain_every_season(tmp_path):
    report = LAB.run_all(tmp_path)
    exp = next(r for r in report["results"] if r["id"] == "L0-lineup-ceiling-money")
    assert exp["kind"] == "measurement"           # not read as a shipped edge
    assert len(exp["per_season"]) == 3
    for p in exp["per_season"]:
        # Optimal-in-hindsight lineups can only ADD weekly-high + RS money vs
        # realized play (a ceiling), so the mean delta is never negative.
        assert p["mean_dollars_left_on_table"] >= 0, p


def test_report_json_is_wellformed_and_labels_currency(tmp_path):
    LAB.run_all(tmp_path)
    data = json.loads((tmp_path / "lab-results.json").read_text())
    assert "E[$]" in data["grading_currency"]
    assert data["pending_gated_experiments"], "gated experiments must be listed as pending, honestly"
    # Every measurement result is explicitly kind-tagged (no silent gated claim).
    assert all(r["kind"] in ("measurement", "gated") for r in data["results"])

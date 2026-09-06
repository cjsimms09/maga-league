# TERRITORY: relay
"""Register 258's gate: no stored top-1 recommendation stream may have one
player parked at #1 for pick after pick, or one position holding most of the
#1 slots. A column with that shape cannot be graded, whatever its accuracy.

The 2026 pick log's `old_path_recommendation` IS the known positive — 58
consecutive picks of the Los Angeles Rams, DEF on 80% — so the gate is
tested by the defect it was written for rather than by a fixture. The
engine's own shadow ledger is the known negative: it must PASS, or the gate
is just always-red and would be switched off the first time it mattered.
"""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("top1", ROOT / "draft" / "tools" / "top1_concentration.py")
T = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(T)
COLUMNS = {c["field"]: c for c in T.report()["columns"]}


def test_known_positive_the_2026_pick_log_column_fails_and_names_both_reasons():
    c = COLUMNS["old_path_recommendation"]
    assert c["ok"] is False
    assert c["longest_run"] == 58 and c["longest_run_player"] == "Los Angeles Rams"
    assert c["top_position"] == "DEF" and c["top_position_share"] > 0.65
    assert any("58 consecutive" in r for r in c["reasons"])
    assert any("DEF holds" in r for r in c["reasons"])


def test_known_negative_the_shadow_ledger_passes_so_the_gate_is_not_always_red():
    c = COLUMNS["tool_recommendation"]
    assert c["ok"] is True, c["reasons"]
    assert c["live_picks"] == 127 and c["nulls"] == 0
    assert c["longest_run"] <= T.MAX_RUN
    assert c["top_position_share"] <= T.MAX_POSITION_SHARE
    # headroom: the bar is not sitting on top of the healthy artifact
    assert T.MAX_RUN > c["longest_run"]


def test_an_all_null_column_is_reported_as_ungradeable_rather_than_silently_clean():
    c = COLUMNS["new_path_recommendation"]
    assert c["ok"] is False
    assert c["nulls"] == c["live_picks"] == 127
    assert any("null on all" in r for r in c["reasons"])


def test_longest_run_counts_only_consecutive_and_ignores_gaps():
    assert T.longest_run(["a", "a", "a", "b", "a", "a"]) == (3, "a")
    assert T.longest_run(["a", None, "a"]) == (1, "a")
    assert T.longest_run([None, None]) == (0, None)
    assert T.longest_run([]) == (0, None)


def test_top1_reads_every_shape_the_artifacts_actually_store():
    assert T.top1([{"name": "X", "position": "RB"}, {"name": "Y"}]) == ("X", "RB")
    assert T.top1({"name": "Z", "position": "WR"}) == ("Z", "WR")
    assert T.top1(None) == (None, None)
    assert T.top1([]) == (None, None)


def test_the_control_arm_passes_on_the_committed_artifacts():
    """`--control` is what a future session runs before trusting a null."""
    broken, healthy = COLUMNS["old_path_recommendation"], COLUMNS["tool_recommendation"]
    assert broken["ok"] is False and healthy["ok"] is True

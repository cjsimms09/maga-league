# TERRITORY: A
"""weekly_props_arm.load_props_arm — the tiny reader weekly_own_grade.py
merges into its provider-study pathway.

The claims: a missing snapshot is a clean None (never an error); a malformed
or non-dict snapshot is the same clean None; a present snapshot returns
EXACTLY {pid: points} for players carrying a numeric `points` value and
silently skips a row with none (a props row with no scoreable market was
already excluded upstream by fetch_weekly_props.py — this reader does not
re-decide that, it just will not crash on one); an all-absent snapshot
(players: {}) returns None, matching "no arm this week" rather than an
empty-but-truthy dict a caller might mistake for coverage.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft"))

import weekly_props_arm as PA  # noqa: E402


def test_missing_snapshot_is_none(tmp_path):
    assert PA.load_props_arm(tmp_path, 2026, 1) is None


def test_malformed_json_is_none(tmp_path):
    (tmp_path / "weekly_props_2026_w1.json").write_text("{not json")
    assert PA.load_props_arm(tmp_path, 2026, 1) is None


def test_non_dict_players_is_none(tmp_path):
    (tmp_path / "weekly_props_2026_w1.json").write_text(json.dumps({"players": "nope"}))
    assert PA.load_props_arm(tmp_path, 2026, 1) is None


def test_valid_snapshot_returns_pid_to_points(tmp_path):
    doc = {"players": {
        "1": {"points": 18.5, "name": "A"},
        "2": {"points": 6.0, "name": "B"},
        "3": {"name": "C, no points key"},           # skipped, not crashed on
    }}
    (tmp_path / "weekly_props_2026_w1.json").write_text(json.dumps(doc))
    out = PA.load_props_arm(tmp_path, 2026, 1)
    assert out == {"1": 18.5, "2": 6.0}


def test_empty_players_is_none_not_empty_dict(tmp_path):
    (tmp_path / "weekly_props_2026_w1.json").write_text(json.dumps({"players": {}}))
    assert PA.load_props_arm(tmp_path, 2026, 1) is None


def test_snapshot_path_naming():
    p = PA.props_snapshot_path(Path("/x"), 2026, 3)
    assert p == Path("/x/weekly_props_2026_w3.json")


def test_arm_name_constant():
    assert PA.ARM_NAME == "props_weekly_v1"

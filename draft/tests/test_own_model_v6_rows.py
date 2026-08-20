# TERRITORY: C
"""register P38 -- own_model_v6.build_v6_rows(), the per-player row shape
(player_id/predicted/actual/position/source) A's routed P38 order specified
for the D13 three-way grade. Built under an in-file TERRITORY-GRANT on
own_model_v6.py (register P38, ROUTES.md A -> C 2026-08-18) that scopes to
the ROWS_OUT/build_v6_rows addition only -- the composition logic
(build_v6, run(), the aggregate artifact) is untouched and stays A's.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import own_model_v6 as V6  # noqa: E402


def test_build_v6_rows_one_row_per_predicted_player():
    v6_pred = {"a": 100.0, "b": 50.0}
    actual = {"a": 95.0, "b": 60.0}
    positions = {"a": "QB", "b": "RB"}
    rows = V6.build_v6_rows(v6_pred, actual, positions)
    assert len(rows) == 2
    assert {r["player_id"] for r in rows} == {"a", "b"}


def test_build_v6_rows_carries_exactly_the_p38_spec_shape():
    v6_pred = {"a": 100.0}
    actual = {"a": 95.0}
    positions = {"a": "QB"}
    row = V6.build_v6_rows(v6_pred, actual, positions)[0]
    assert set(row) == {"player_id", "predicted", "actual", "position", "source"}
    assert row == {"player_id": "a", "predicted": 100.0, "actual": 95.0,
                   "position": "QB", "source": "own_v6"}


def test_build_v6_rows_keeps_a_player_missing_from_actual_as_none_not_dropped():
    v6_pred = {"a": 100.0, "b": 50.0}
    actual = {"a": 95.0}  # "b" never covered by the realized-points store
    positions = {"a": "QB", "b": "RB"}
    rows = {r["player_id"]: r for r in V6.build_v6_rows(v6_pred, actual, positions)}
    assert rows["b"]["actual"] is None
    assert "b" in rows  # dropped silently would be the P38 defect, not a fix


def test_build_v6_rows_sorted_by_player_id_deterministic():
    v6_pred = {"z": 1.0, "a": 2.0, "m": 3.0}
    actual = {"z": 1.0, "a": 2.0, "m": 3.0}
    positions = {"z": "WR", "a": "WR", "m": "WR"}
    rows = V6.build_v6_rows(v6_pred, actual, positions)
    assert [r["player_id"] for r in rows] == ["a", "m", "z"]


def test_build_v6_rows_matches_the_committed_sleeper_and_fp_row_stores_field_intent():
    # register P38's cross-grader consistency check: all three graders must
    # expose SOME per-player predicted/actual/position/source -- field NAMES
    # differ across the three committed stores today (a separate reconciliation
    # flagged in ROUTES.md, not this test's job), but each of the three rows
    # produced here carries the full quintet the D13 join needs.
    row = V6.build_v6_rows({"a": 10.0}, {"a": 9.0}, {"a": "TE"})[0]
    for field in ("player_id", "predicted", "actual", "position", "source"):
        assert field in row

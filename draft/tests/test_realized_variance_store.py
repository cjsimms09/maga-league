# TERRITORY: C
"""realized_variance_store — rows_and_crosswalk_for_season and build_from
tested against SYNTHETIC fixtures shaped exactly like fetch_component_
stats.component_weeks()'s own output. weekly_variance() itself is
nflverse_variance.py's own tested function (rule 11, imported unmodified)
— this file tests the NEW glue: per-season separation (never pooled),
the gsis-exclusion crosswalk, and the final store shape.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import realized_variance_store as RVS  # noqa: E402

SCORING = {"rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0}


def _weeks_by_pid(entries):
    """entries: [(pid, week, line_dict), ...] -> component_weeks() shape."""
    out = {}
    for pid, wk, line in entries:
        out.setdefault(pid, {})[wk] = line
    return out


# ── rows_and_crosswalk_for_season ──────────────────────────────────────────

def test_rows_shaped_for_weekly_variance():
    weeks = _weeks_by_pid([("s1", 1, {"rec_yd": 80.0, "pos": "WR"})])
    rows, cw = RVS.rows_and_crosswalk_for_season(2024, weeks)
    assert rows == [{"player_id": "s1", "season": 2024, "week": 1,
                     "rec_yd": 80.0, "pos": "WR"}]


def test_identity_crosswalk_for_real_sleeper_ids():
    weeks = _weeks_by_pid([("s1", 1, {"rec_yd": 80.0}), ("s2", 1, {"rec_yd": 40.0})])
    _, cw = RVS.rows_and_crosswalk_for_season(2024, weeks)
    assert cw == {"s1": "s1", "s2": "s2"}


def test_gsis_only_pid_excluded_not_force_mapped():
    """A player the original fetch could not crosswalk has no sleeper_id
    -- this store is keyed for a sleeper_id join, so he has no place in
    it, rather than being force-mapped to his gsis key as if it were one."""
    weeks = _weeks_by_pid([("s1", 1, {"rec_yd": 80.0}),
                           ("gsis:00-1234567", 1, {"rec_yd": 20.0})])
    rows, cw = RVS.rows_and_crosswalk_for_season(2024, weeks)
    assert "gsis:00-1234567" not in cw
    assert all(r["player_id"] != "gsis:00-1234567" for r in rows)


def test_multiple_weeks_become_multiple_rows():
    weeks = _weeks_by_pid([("s1", 1, {"rec_yd": 80.0}), ("s1", 2, {"rec_yd": 40.0})])
    rows, _ = RVS.rows_and_crosswalk_for_season(2024, weeks)
    assert len(rows) == 2
    assert {r["week"] for r in rows} == {1, 2}


# ── build_from: per-season separation, never pooled ────────────────────────

def test_seasons_measured_separately_not_pooled():
    """The routing order's own words: 'per player PER SEASON'. A player
    with a big spread in 2023 and none in 2024 must show BOTH numbers,
    not one blended value that would hide the 2024 stability."""
    w2023 = _weeks_by_pid([("s1", w, {"rec_yd": (200.0 if w % 2 else 0.0), "pos": "WR"})
                           for w in range(1, 9)])
    w2024 = _weeks_by_pid([("s1", w, {"rec_yd": 100.0, "pos": "WR"})
                           for w in range(1, 9)])
    by_season = {
        2023: RVS.rows_and_crosswalk_for_season(2023, w2023),
        2024: RVS.rows_and_crosswalk_for_season(2024, w2024),
    }
    doc = RVS.build_from(by_season, SCORING)
    p = doc["players"]["s1"]
    assert p["2023"]["weekly_sd"] > 5
    assert p["2024"]["weekly_sd"] == pytest.approx(0.0, abs=1e-6)


def test_player_absent_a_season_is_simply_absent():
    w2023 = _weeks_by_pid([("s1", w, {"rec_yd": 100.0, "pos": "WR"}) for w in range(1, 9)])
    w2024 = _weeks_by_pid([])  # s1 did not play in 2024
    by_season = {
        2023: RVS.rows_and_crosswalk_for_season(2023, w2023),
        2024: RVS.rows_and_crosswalk_for_season(2024, w2024),
    }
    doc = RVS.build_from(by_season, SCORING)
    assert "2023" in doc["players"]["s1"]
    assert "2024" not in doc["players"]["s1"]


def test_store_shape_and_season_reports():
    weeks = _weeks_by_pid([("s1", w, {"rec_yd": 100.0, "pos": "WR"}) for w in range(1, 9)])
    by_season = {2024: RVS.rows_and_crosswalk_for_season(2024, weeks)}
    doc = RVS.build_from(by_season, SCORING)
    assert doc["seasons"] == [2024]
    assert doc["player_count"] == 1
    assert "2024" in doc["season_reports"]
    assert doc["season_reports"]["2024"]["measured"] == 1


def test_reuses_nflverse_variance_weekly_variance_not_reimplemented():
    # rule 11 pin -- must be the SAME function, not a copy
    import nflverse_variance as NV
    weeks = _weeks_by_pid([("s1", 1, {"rec_yd": 80.0})])
    by_season = {2024: RVS.rows_and_crosswalk_for_season(2024, weeks)}
    # a monkeypatch-free pin: call both paths and confirm identical output
    rows, cw = by_season[2024]
    direct, _ = NV.weekly_variance(rows, [2024], SCORING, cw)
    doc = RVS.build_from(by_season, SCORING)
    assert doc["players"]["s1"]["2024"] == direct["s1"]

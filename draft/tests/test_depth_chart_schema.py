"""The 2025 schema-break normalizer must FIRE on the new shape and must NOT
touch the old one — both arms, no network (rule 3e's live positive was run
against the real parquets on 08-18: 2025 -> 196 RB/120 QB rows, 2026 ->
148/90, where the unpatched path produced ZERO for both seasons)."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
from depth_chart_schema import (  # noqa: E402
    as_of_note, import_depth_charts_normalized)

OLD = pd.DataFrame({
    "season": [2024] * 4, "week": [1, 1, 2, 2],
    "club_code": ["ARI", "ARI", "ARI", "ATL"],
    "depth_team": ["1", "2", "1", "1"],
    "gsis_id": ["00-1", "00-2", "00-1", "00-3"],
    "position": ["RB", "RB", "RB", "QB"],
})
NEW = pd.DataFrame({
    "dt": ["2025-08-03T10:00:00Z"] * 3 + ["2025-09-01T10:00:00Z"] * 2,
    "team": ["ARI", "ARI", "ATL", "ARI", "ARI"],
    "pos_rank": [1, 2, 1, 1, 2],
    "gsis_id": ["00-1", "00-2", "00-3", "00-9", "00-8"],
    "pos_abb": ["RB", "RB", "QB", "RB", "RB"],
    "espn_id": [1, 2, 3, 4, 5],
})


class FakeNfl:
    """import_depth_charts stand-in serving the real two schemas by season."""
    def __init__(self, by_season):
        self.by_season = by_season

    def import_depth_charts(self, seasons):
        return self.by_season[seasons[0]].copy()


def test_old_schema_passes_through_untouched():
    df, snaps = import_depth_charts_normalized(FakeNfl({2024: OLD}), [2024])
    assert snaps == {}
    assert len(df) == 4 and set(df["week"]) == {1, 2}


def test_FAIL_ARM_new_schema_is_normalized_not_dropped():
    """The unpatched path: season filter on a frame with no season column
    -> zero rows, clean exit. The normalizer must yield tagged rows."""
    df, snaps = import_depth_charts_normalized(FakeNfl({2025: NEW}), [2025])
    assert 2025 in snaps and snaps[2025].startswith("2025-08-03")
    sub = df[df["season"] == 2025]
    assert len(sub) == 3, "new-schema season produced no old-schema rows"
    assert set(sub.columns) >= {"season", "week", "club_code", "depth_team",
                                "gsis_id", "position"}


def test_only_earliest_snapshot_is_kept():
    """Later dt snapshots are IN-season charts — keeping them would leak
    week-by-week information into an offseason feature."""
    df, _ = import_depth_charts_normalized(FakeNfl({2025: NEW}), [2025])
    assert "00-9" not in set(df["gsis_id"]), "a later-snapshot row leaked in"


def test_mixed_seasons_have_no_nan_season_rows():
    """The exact silent-empty shape C flagged: the raw concat carries NaN
    season on every 2025+ row."""
    df, _ = import_depth_charts_normalized(
        FakeNfl({2024: OLD, 2025: NEW}), [2024, 2025])
    assert df["season"].isna().sum() == 0
    assert set(df["season"]) == {2024, 2025}


def test_as_of_note_is_honest_about_snapshots():
    _, snaps = import_depth_charts_normalized(FakeNfl({2025: NEW}), [2025])
    assert "snapshot 2025-08-03" in as_of_note(2025, 1, snaps)
    assert "week 1 depth chart" in as_of_note(2024, 1, snaps)

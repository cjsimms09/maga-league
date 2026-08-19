"""nflverse depth-chart SCHEMA BREAK at 2025 — normalized in one place.

THE FINDING (C flagged the gap 08-18; A root-caused it with direct parquet
access the same night): `depth_charts_2025.parquet` and later are a NEW
format — datetime snapshots with columns (dt, gsis_id, pos_abb, pos_grp,
pos_rank, pos_slot, team, ...) and NO season/week/position/depth_team
columns at all. The releases EXIST (HTTP 200, 554k/446k rows); the schema
moved. nfl_data_py 0.3.x passes the new shape through raw, so a
multi-season concat carries NaN in every old-schema column for 2025+ rows
and a `season == year` filter silently drops those seasons — zero rows,
clean exit, no VOID. That is the fourth breakage layer in this dispatch
chain and the exact silent-empty shape rule 3e exists for.

THE MAP, verified against the real 2025 file (earliest snapshot
2025-08-03, all 32 teams, ranked rows with gsis_ids — a genuine offseason
chart): team → club_code · pos_rank → depth_team · pos_abb → position
(QB/RB/FB names carry over; wide corners/edges are side-specific like
LCB/RDE, so any future use beyond QB/RB must check pos_abb's vocabulary
first) · earliest dt snapshot → the "earliest available week" of the old
as-of mechanism, encoded as week 1.

Import per season so the season tag is KNOWN, never inferred from dt.
"""
from __future__ import annotations

NEW_SCHEMA_MARKERS = {"dt", "pos_abb", "pos_rank"}
OLD_SCHEMA_NEEDED = {"season", "week", "club_code", "depth_team", "gsis_id",
                     "position"}


def import_depth_charts_normalized(nfl, seasons):
    """(depth_all, snapshot_dt_by_season) with OLD-schema columns for every
    season. Old-schema seasons pass through untouched; new-schema (2025+)
    seasons are reduced to their EARLIEST dt snapshot and renamed. The
    snapshot dict lets callers write an honest as_of string — 'week 1' is a
    synthetic tag for these seasons, the dt is the truth."""
    import pandas as pd

    frames, snapshots = [], {}
    for season in seasons:
        df = nfl.import_depth_charts([season])
        if "season" not in df.columns and NEW_SCHEMA_MARKERS.issubset(df.columns):
            first_dt = df["dt"].min()
            snap = df[df["dt"] == first_dt]
            df = pd.DataFrame({
                "season": season,
                "week": 1,
                "club_code": snap["team"].values,
                "depth_team": snap["pos_rank"].values,
                "gsis_id": snap["gsis_id"].values,
                "position": snap["pos_abb"].values,
            })
            snapshots[season] = str(first_dt)
        frames.append(df)
    return pd.concat(frames, ignore_index=True), snapshots


def as_of_note(season, week, snapshots):
    if season in snapshots:
        return (f"season {season} offseason depth-chart snapshot "
                f"{snapshots[season]} (nflverse 2025+ dt-snapshot schema, "
                f"earliest snapshot)")
    return (f"season {season} week {week} depth chart "
            f"(nfl_data_py import_depth_charts, earliest available week)")

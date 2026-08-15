"""HISTORICAL BYE WEEKS, BY OUR OWN PLAYER_ID — for the lineup-edge backtest.

Built 2026-08-15. draft/tools/lineup_edge_backtest.js's first run showed the
tool's fallback projection losing badly to real human lineups (-16.43 pts/wk,
loses 81% of weeks) — but that comparison is unfair by construction: 17.2% of
all historical player-weeks score exactly 0.0 (almost certainly bye/inactive,
not a real played-and-scored-zero game), and a leak-free running-average
projection has no way to know a player is on bye THIS week, while the human
who actually set that lineup did. This produces that missing information —
NOT from performance data (which can't reveal a bye without leaking), but
from the real NFL schedule, which is public and known in advance and is
therefore fair to use.

METHOD: nfl_data_py's weekly data reports which NFL team each player suited
up for each week; a team's bye week (regular season only — weeks 15+ include
non-playoff teams whose season is simply over, which looks like a "bye" but
isn't one) is the one regular-season week where that team has zero rows.
GSIS ids are crosswalked to our Sleeper-based player_id via the same
crosswalk_gsis_to_sleeper() already used by own_projections.py.

COVERAGE: 2023 and 2024 only. 2025 is not published on nflverse yet (same
constraint own_projections.py's own fix hit) — the backtest must fall back to
its uncorrected behavior for 2025 and say so, not pretend to a fix it can't
make.

Run: python3 draft/backtest/build_historical_byes.py
Output: draft/backtest/historical_byes.json
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

REGULAR_SEASON_LAST_WEEK = 14  # matches this league's playoff_week_start=15 (weeks < 15)


def build(seasons=(2023, 2024)):
    import nfl_data_py as nfl
    from grade import crosswalk_gsis_to_sleeper

    out = {}
    for season in seasons:
        df = nfl.import_weekly_data([season])
        if df is None or df.empty:
            out[str(season)] = {"error": "unavailable"}
            continue
        idc = "player_id" if "player_id" in df.columns else "gsis_id"
        reg = df[df["week"] <= REGULAR_SEASON_LAST_WEEK]
        teams = sorted(t for t in reg["recent_team"].dropna().unique().tolist() if t)
        weeks_present = {t: set(reg[reg["recent_team"] == t]["week"].unique().tolist()) for t in teams}
        all_weeks = set(range(1, REGULAR_SEASON_LAST_WEEK + 1))
        bye_week_of_team = {}
        for t in teams:
            missing = sorted(all_weeks - weeks_present[t])
            # Exactly one missing regular-season week is a real bye. Zero or
            # >1 means this team's schedule doesn't fit the assumption
            # (expansion week, data gap) — skip rather than guess.
            if len(missing) == 1:
                bye_week_of_team[t] = missing[0]

        ids_df = nfl.import_ids()
        crosswalk = crosswalk_gsis_to_sleeper([], ids_df)  # gsis -> sleeper id

        # Each player's team for the season — the LAST team they appeared for,
        # a reasonable simplification for the (rare) in-season trade case.
        player_team = {}
        for row in reg.sort_values("week").to_dict("records"):
            gsis = str(row.get(idc))
            t = row.get("recent_team")
            if gsis and t:
                player_team[gsis] = t

        season_byes = {}
        for gsis, team in player_team.items():
            sid = crosswalk.get(gsis)
            if sid and team in bye_week_of_team:
                season_byes[sid] = bye_week_of_team[team]
        out[str(season)] = season_byes

    return out


if __name__ == "__main__":
    data = build()
    out_path = HERE / "historical_byes.json"
    out_path.write_text(json.dumps(data, indent=0))
    for season, byes in data.items():
        if isinstance(byes, dict) and "error" not in byes:
            print(f"{season}: {len(byes)} players mapped to a bye week")
        else:
            print(f"{season}: {byes}")
    print(f"wrote {out_path}")

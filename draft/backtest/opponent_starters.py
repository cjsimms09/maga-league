# TERRITORY: C
"""OPPONENT-STARTERS STORE — feeds E's P144 (due before their 09-03 grade).
Relay's 08-20 dispatch, ASK 1, `ROUTES.md` TO: C.

WHAT ALREADY EXISTS AND IS REUSED, NOT REBUILT (rule 11): `league_history.json`
already carries, per season, per week, per roster, exactly what this ask wants
— `starters` (slot-ordered player ids, DEF as a team code), `players` (full
roster including bench) and `starters_points`. Verified directly before
writing this file, not assumed from the dispatch's description: real 2025
week-1 roster 1 carries 9 starters (`['6770', '3198', ..., 'DET']`) and 15
total players; `roster_positions` for 2023-2025 all read
`['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN','BN','BN','BN','BN','BN']`
— 9 starter slots, 6 bench, matching exactly.

WHAT IS GENUINELY NEW: reshaping into a clean, purpose-built store — keyed
`season x week x roster_id`, bench derived as `players - starters` (a plain
set difference, not a second source), and the Rule 3e control the ask names:
every roster-week must carry the league's own starter-slot count or be
LISTED as short, never silently dropped.

MEASURED BEFORE SHIPPING THE CONTROL: every one of 540 real roster-weeks
(2023-2025, 3 seasons x 18 weeks x 10 rosters) carries exactly 9 starters —
zero real short weeks exist in this league's history. So the control's
known-positive is a synthetic fixture (a fail arm proven to fire), not a
real case; the real population is a clean known-negative (no roster-week
here is ever flagged), which the control also proves rather than assumes.

Run: python3 draft/backtest/opponent_starters.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent

LEAGUE_HISTORY = ROOT / "draft" / "data" / "league_history.json"
OUT = HERE / "opponent_starters.json"


def expected_slot_count(roster_positions: list) -> int:
    """Starter slots = every roster_positions entry that is not bench."""
    return sum(1 for p in (roster_positions or []) if p != "BN")


def build_season(season_doc: dict) -> dict:
    """{week: {roster_id: {starters, bench, starters_points, slot_count,
    expected_slot_count, short}}} for one season's already-committed weeks.

    `short` is computed, never assumed: a roster-week whose starters array
    is shorter than the season's own `roster_positions` count is LISTED
    with its real count, not dropped — the control the ask asked for."""
    expected = expected_slot_count(season_doc.get("roster_positions"))
    out: dict = {}
    for wk, rows in (season_doc.get("weeks") or {}).items():
        week_out = {}
        for row in rows:
            starters = list(row.get("starters") or [])
            players = list(row.get("players") or [])
            starter_set = set(starters)
            bench = [p for p in players if p not in starter_set]
            week_out[str(row["roster_id"])] = {
                "starters": starters,
                "bench": bench,
                "starters_points": list(row.get("starters_points") or []),
                "matchup_id": row.get("matchup_id"),
                "slot_count": len(starters),
                "expected_slot_count": expected,
                "short": len(starters) != expected,
            }
        out[str(wk)] = week_out
    return out


def build_store(history_doc: dict) -> dict:
    seasons_out: dict = {}
    short_weeks = []
    total_roster_weeks = 0
    for season_doc in history_doc.get("seasons") or []:
        season = season_doc.get("season")
        if season == "2026":
            continue  # no games played yet this season — nothing to extract
        season_weeks = build_season(season_doc)
        seasons_out[season] = season_weeks
        for wk, rosters in season_weeks.items():
            for rid, rec in rosters.items():
                total_roster_weeks += 1
                if rec["short"]:
                    short_weeks.append({"season": season, "week": wk,
                                        "roster_id": rid,
                                        "slot_count": rec["slot_count"],
                                        "expected_slot_count": rec["expected_slot_count"]})

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/opponent_starters.py",
        "_note": ("Starters + bench per season x week x roster_id, reshaped "
                 "from league_history.json's already-committed matchup rows "
                 "(starters, players, starters_points reused verbatim; bench "
                 "= players - starters, a plain set difference). Feeds E's "
                 "P144. A roster-week short of the league's own starter-slot "
                 "count is LISTED in short_weeks, never dropped."),
        "population": {
            "total_roster_weeks": total_roster_weeks,
            "short_weeks_count": len(short_weeks),
        },
        "short_weeks": short_weeks,
        "seasons": seasons_out,
    }
    return doc


def main() -> int:
    if not LEAGUE_HISTORY.exists():
        print("VOID -- league_history.json not found", file=sys.stderr)
        return 1
    history_doc = json.loads(LEAGUE_HISTORY.read_text())
    doc = build_store(history_doc)
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {doc['population']['total_roster_weeks']} "
         f"roster-weeks, {doc['population']['short_weeks_count']} short")
    return 0


if __name__ == "__main__":
    sys.exit(main())

# TERRITORY: C
"""PROPS CROSSWALK AT SCALE — the fuzzy name-match against the FULL-SEASON
props stores, run for all three graded years, not just 2025.

Routed A -> C, ROUTES.md 2026-08-18 ("THE PROPS ARM'S LAST MISSING JOIN —
run the fuzzy crosswalk against the FULL-SEASON props stores"). Named in
C's own residual-arm store-readiness table (`draft/audit/
residual_arm_store_readiness_2026-08-18.md`): `historical_props_{2023,
2024,2025}.json` are keyed by raw bookmaker NAME strings, and the fuzzy
crosswalk `props_season_projection.py` already built for 2025 has never
been run against 2023/2024, or written out as a standalone per-year store.

RULE 11 -- REUSE, NOT RE-DERIVATION. Every matching/aggregation function
below is IMPORTED from `props_season_projection.py` (TERRITORY: A, built
2026-08-16), unmodified: `normalize_name`, `match_player_name`,
`crosswalk_props_to_pid`, `season_implied_totals`, `line_to_points`,
`build_name_index`. This file adds nothing to the crosswalk logic itself --
it only runs that logic across all three seasons and writes the standalone
{sleeper_pid: points} artifact the routed ask specifies, instead of the
graded-vs-v6 comparison shape `props_season_projection.py` writes.

WHAT THIS BUILDS, per season in fetch_historical_props.SEASONS (2023, 2024,
2025): `draft/backtest/props_implied_points_{year}.json` --

    implied_points          {sleeper_pid: season-total implied fantasy
                             points}, summed under the frozen scoring
                             table, leak-free per week (a prop line closes
                             before its own week's game -- same rule
                             props_season_projection.py states)
    games_with_props_row    {sleeper_pid: weeks a props row existed for
                             that player} -- travels with every total so a
                             3-week partial season is never read as a full
                             one
    match_rate              matched vs total, BOTH at the unique-name level
                             and the player-week-row level (the two can
                             diverge -- a handful of high-volume names
                             account for many rows)
    unmatched_names         every name the crosswalk could not place,
                             listed in full, never silently dropped (the
                             routed ask's own words)

NOT DONE HERE, DELIBERATELY: grading this against own_v6 or anything else.
`props_season_projection.py` already owns that comparison for 2025; this
file's only job is the crosswalk-at-scale join the ask named, for all three
years. What uses these stores next (the V7 props residual arm) is D's/A's
call, same boundary as every other C-built feature store this session.

Run:  python3 draft/tools/props_implied_points.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/tools
DRAFT = HERE.parent
BT = DRAFT / "backtest"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BT))

import fetch_component_stats as FCS  # noqa: E402
import fetch_historical_props as FHP  # noqa: E402
from props_season_projection import (  # noqa: E402  -- rule 11, reused not re-derived
    build_name_index,
    crosswalk_props_to_pid,
    season_implied_totals,
)


# ── pure: one season's crosswalk + aggregation + match-rate report ────────

def build_season_doc(season: int, weeks: list, name_index: dict,
                     scoring_cfg: dict) -> dict:
    """weeks: the store's own `weeks` list (unrekeyed, odds-API names).
    name_index: {normalized_name: sleeper_id} (real crosswalk in
    production, a fixture in tests). Returns the full committed-artifact
    shape -- pure, fixture-testable, no I/O."""
    total_rows = sum(len(wk.get("players", {})) for wk in weeks)
    total_names = {name for wk in weeks for name in wk.get("players", {})}

    rekeyed, unmatched = crosswalk_props_to_pid(weeks, name_index)
    matched_rows = sum(len(wk.get("players", {})) for wk in rekeyed)

    implied_points, games = season_implied_totals(rekeyed, scoring_cfg)

    matched_names = len(total_names) - len(unmatched)
    return {
        "_territory": "TERRITORY: C -- produced by draft/tools/props_implied_points.py",
        "_note": ("Props-implied season-total points per sleeper_id, from "
                 "the full-season historical props store, crosswalked via "
                 "props_season_projection.py's own name-match (rule 11, "
                 "reused unmodified). Leak-free per week (a prop line "
                 "closes before its own week's game). Not graded here -- "
                 "the V7 props residual arm's own grading is A's/D's call."),
        "season": season,
        "scope": "full_season",
        "source_store": f"historical_props_{season}.json",
        "match_rate": {
            "unique_names": {
                "matched": matched_names,
                "total": len(total_names),
                "rate": (round(matched_names / len(total_names), 4)
                         if total_names else None),
            },
            "player_week_rows": {
                "matched": matched_rows,
                "total": total_rows,
                "rate": (round(matched_rows / total_rows, 4)
                         if total_rows else None),
            },
        },
        "unmatched_names": unmatched,
        "unmatched_count": len(unmatched),
        "implied_points": implied_points,
        "games_with_props_row": games,
        "player_count": len(implied_points),
    }


# ── I/O: real stores + real crosswalk (CI only -- sandbox proxy blocks
# nfl_data_py, same as every other real crosswalk build this repo runs) ────

def egress_main() -> dict:  # pragma: no cover  (egress; CI only)
    scoring_cfg = FCS.frozen_scoring_table()
    name_index = build_name_index()

    results = {}
    for season in FHP.SEASONS:
        store_path = FHP.store_path(season, scope="full_season")
        if not store_path.exists():
            results[season] = {"status": "VOID",
                                "reason": f"{store_path.name} does not exist"}
            continue
        store = json.loads(store_path.read_text())
        doc = build_season_doc(season, store["weeks"], name_index, scoring_cfg)
        out_path = BT / f"props_implied_points_{season}.json"
        out_path.write_text(json.dumps(doc, indent=1))
        results[season] = doc
    return results


def main() -> None:  # pragma: no cover  (egress; CI only)
    results = egress_main()
    for season, doc in results.items():
        if doc.get("status") == "VOID":
            print(f"{season}: VOID -- {doc['reason']}")
            continue
        mr = doc["match_rate"]
        print(f"{season}: wrote props_implied_points_{season}.json -- "
             f"{doc['player_count']} players, "
             f"name match {mr['unique_names']['matched']}/{mr['unique_names']['total']} "
             f"({mr['unique_names']['rate']}), "
             f"row match {mr['player_week_rows']['rate']}")


if __name__ == "__main__":
    main()

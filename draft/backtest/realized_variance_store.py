# TERRITORY: C
"""THE REALIZED-VARIANCE STORE — per player, PER SEASON, 2023-2025.

Routed A -> C, ROUTES.md 2026-08-19, item (3) of the multi-source-mean
dispatch ("Cory: 'C and B need work!!'" -- Cory has ruled he wants the
board to draw on a MULTI-SOURCE MEAN, not `proj_sleeper` alone).
Recommended FIRST of the three items, and for a stated reason: "it is
offline and unblocked right now." Its purpose, in the routing order's
own words: "cross-source spread measures how much FORECASTERS DISAGREE,
not how much a player actually VARIES. Those are not the same thing and
I will not assume they are... With it, 'does cross-source spread predict
realized variance better than our fitted band constants' becomes a
preregistered experiment with a control."

WHAT THIS DOES NOT DO: no new measurement. `nflverse_variance.py`'s
`weekly_variance()` already computes exactly "the sd of a player's
weekly fantasy points under OUR scoring, from committed weekly data,
never a provider's own points" -- unmodified here (rule 11). This
module's only job is to call it once PER SEASON, separately (2023,
2024, 2025 -- the ask's own words: "per player per season", not one
number pooled across three years), and persist the result.

THE ROWS COME FROM `component_stats_<season>.json` (fetch_component_
stats.py, already committed, real 2021-2025 weekly stat lines under our
own scoring vocabulary -- `nflverse_weekly_to_scoring()`'s "our-key
values pass through" path applies directly, no translation needed) via
its own `component_weeks()` reader. NO NEW CROSSWALK: those rows are
ALREADY keyed by sleeper_id (or `gsis:<id>` for a player the fetch could
not map) -- an identity crosswalk is enough, and a `gsis:`-only pid is
excluded rather than force-fit, since a store meant to join against the
board's sleeper_id population has no use for an id the board can never
match. NO NETWORK: every input is already on disk.

`before_season` is deliberately NOT used (unlike a live-draft-time
prior): this store is purely retrospective, one number per (player,
already-completed season), not a prediction input for a season still to
be drafted -- the leak-guard `weekly_variance()` offers for that other
use case does not apply here.

Run: python3 draft/backtest/realized_variance_store.py
Writes draft/backtest/realized_variance_store.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SEASONS = (2023, 2024, 2025)
OUT = HERE / "realized_variance_store.json"


def rows_and_crosswalk_for_season(season: int, weeks_by_pid: dict) -> tuple[list, dict]:
    """weeks_by_pid: fetch_component_stats.component_weeks(season)'s own
    output shape, {pid: {week: line}}. Pure -- fixture-testable without
    touching a real component_stats file. Returns (rows, crosswalk) for
    nflverse_variance.weekly_variance(): rows in the shape it expects
    ({player_id, season, week, **stat_line}), crosswalk identity-mapping
    every REAL sleeper_id (a `gsis:`-prefixed id has no sleeper_id and is
    excluded, not force-mapped to itself)."""
    rows = []
    crosswalk = {}
    for pid, by_week in weeks_by_pid.items():
        if pid.startswith("gsis:"):
            continue
        crosswalk[pid] = pid
        for wk, line in by_week.items():
            row = {"player_id": pid, "season": season, "week": wk}
            row.update(line)
            rows.append(row)
    return rows, crosswalk


def build() -> dict:  # pragma: no cover  (reads committed files; exercised via build_from)
    import fetch_component_stats as FCS
    scoring_cfg = FCS.frozen_scoring_table()
    by_season = {}
    for season in SEASONS:
        weeks_by_pid = FCS.component_weeks(season)
        by_season[season] = rows_and_crosswalk_for_season(season, weeks_by_pid)
    return build_from(by_season, scoring_cfg)


def build_from(by_season: dict, scoring_cfg: dict) -> dict:
    """by_season: {season: (rows, crosswalk)} -- pure, fixture-testable.
    The real committed-file I/O lives only in build()."""
    import nflverse_variance as NV

    players: dict[str, dict] = {}
    season_reports = {}
    for season, (rows, crosswalk) in by_season.items():
        measured, report = NV.weekly_variance(rows, [season], scoring_cfg, crosswalk)
        season_reports[str(season)] = report
        for pid, entry in measured.items():
            players.setdefault(pid, {})[str(season)] = entry

    return {
        "_territory": "TERRITORY: C — produced by draft/backtest/realized_variance_store.py",
        "_note": ("Per player, PER SEASON (2023/2024/2025 measured SEPARATELY, "
                 "never pooled), the realized sd of weekly fantasy points under "
                 "OUR scoring -- reuses nflverse_variance.weekly_variance() "
                 "unmodified (rule 11). status/basis travel with every entry: "
                 "'measured' (real spread), 'imputed' (too few games, a stated "
                 "position prior), or the player simply absent for that season "
                 "(no games that year -- missing, never a fabricated zero). "
                 "Answers the routing order's own question -- 'does cross-source "
                 "spread predict realized variance better than our fitted band "
                 "constants' -- with a real, gradeable control."),
        "seasons": sorted(by_season),
        "season_reports": season_reports,
        "player_count": len(players),
        "players": players,
    }


def main() -> None:  # pragma: no cover  (egress-adjacent; reads committed files)
    doc = build()
    OUT.write_text(json.dumps(doc, indent=1, sort_keys=True))
    print(f"wrote {OUT.name}: {doc['player_count']} players across "
         f"{len(doc['seasons'])} season(s)")
    for season, report in doc["season_reports"].items():
        sc = report.get("status_counts", {})
        print(f"  {season}: measured {sc.get('measured', 0)}, "
             f"imputed {sc.get('imputed', 0)}, "
             f"unmeasurable {sc.get('unmeasurable', 0)}")


if __name__ == "__main__":
    main()

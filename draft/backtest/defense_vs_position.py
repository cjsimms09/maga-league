# TERRITORY: C
"""DEFENSE-VS-POSITION ALLOWED — relay's 08-20 dispatch, ASK 2. Cory:
"testing everything we can to look for advantages in point predictions...
give them work!" `projection_breadth.js` measured this repo running only 1 of
8 known signal axes live; this is one of the seven missing ones, and the one
classic axis ("how many points does defense X give up to position Y") this
project has never built at all.

FULLY OFFLINE, NO EGRESS — every input is already committed:
  per-player weekly stat lines + team   component_stats_<season>.json
                                        (TERRITORY: C, this repo's own —
                                        component_weeks()/scored_weekly_points()
                                        reused, not re-derived — rule 11)
  who a team played each week           vegas_lines_2021_2026.json
                                        (TERRITORY: A, nflverse schedules —
                                        home/away per season/week, reused
                                        read-only for the join key only,
                                        no line data touched)
  scoring                               scoring.score_stat_line via
                                        fetch_component_stats.scored_weekly_points
                                        — OUR table, never a provider's points.

Team codes verified identical between the two sources before joining them
(both come from nflverse releases, both use "LA" for the Rams) rather than
assumed.

SCOPE: QB/RB/WR/TE only, matching component_stats' own population
(POSITION_GROUPS, deliberately not widened — see that module's own comment).
K/DEF-vs-position is a different, unbuilt question this file does not answer.

WEEKS 1-17: this league's own scoring boundary (playoffs don't count),
matched to every sibling store built this session, not the NFL's 18-week
calendar component_stats happens to carry through week 18.

A team with no matched opponent that week (bye, or a schedule-row gap) is
EXCLUDED from that week's accumulation, not counted as allowing zero — same
"absent is not zero" discipline as nflverse_weekly_store.

Run: python3 draft/backtest/defense_vs_position.py [season ...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(HERE))

import fetch_component_stats as FCS  # noqa: E402  (rule 11)

VEGAS = HERE / "vegas_lines_2021_2026.json"
OUT = HERE / "defense_vs_position.json"

DEFAULT_SEASONS = (2021, 2022, 2023, 2024, 2025)
POSITIONS = ("QB", "RB", "WR", "TE")
LAST_WEEK = 17  # this league's own last_scored_leg, not the NFL's week 18


def opponent_map(season: int) -> dict:
    """{(team, week): opponent_team} for one season, from the committed
    schedules store. A bye week or an unlined game simply has no entry."""
    vegas = json.loads(VEGAS.read_text())
    games = (vegas.get("seasons") or {}).get(str(season)) or []
    out = {}
    for g in games:
        wk = g["week"]
        out[(g["home"], wk)] = g["away"]
        out[(g["away"], wk)] = g["home"]
    return out


def build_season(season: int, last_week: int = LAST_WEEK) -> dict:
    """{(defense_team, week, position): {"sum": float, "n": int}} — points
    ALLOWED by `defense_team` in `week` to every player of `position` who
    played against them, under this league's own scoring."""
    scoring_cfg = FCS.frozen_scoring_table()
    weeks = FCS.component_weeks(season, 1, last_week)
    points = FCS.scored_weekly_points(season, scoring_cfg, last_week)
    opp = opponent_map(season)

    allowed: dict = {}
    for pid, rows in weeks.items():
        for wk, line in rows.items():
            team = line.get("team")
            pos = line.get("pos")
            if not team or pos not in POSITIONS:
                continue
            defense = opp.get((team, wk))
            if not defense:
                continue
            pts = (points.get(pid) or {}).get(wk)
            if pts is None:
                continue
            key = (defense, wk, pos)
            cell = allowed.setdefault(key, {"sum": 0.0, "n": 0})
            cell["sum"] = round(cell["sum"] + pts, 2)
            cell["n"] += 1
    return allowed


def aggregate(per_season: dict) -> dict:
    """{defense_team: {position: {"weeks": n, "mean_allowed": float,
    "total_allowed": float}}} pooled across every season passed in."""
    pooled: dict = {}
    for (defense, _wk, pos), cell in per_season.items():
        d = pooled.setdefault(defense, {}).setdefault(
            pos, {"weeks": 0, "total_allowed": 0.0})
        d["weeks"] += 1
        d["total_allowed"] = round(d["total_allowed"] + cell["sum"], 2)
    for defense, by_pos in pooled.items():
        for pos, d in by_pos.items():
            d["mean_allowed"] = round(d["total_allowed"] / d["weeks"], 2) if d["weeks"] else None
    return pooled


def build_store(seasons=DEFAULT_SEASONS) -> dict:
    all_cells: dict = {}
    per_season_counts = {}
    for season in seasons:
        cells = build_season(season)
        per_season_counts[str(season)] = len(cells)
        all_cells.update({(*k, season): v for k, v in cells.items()})

    pooled = aggregate({k[:3]: v for k, v in all_cells.items()})

    league_avg = {}
    for pos in POSITIONS:
        vals = [d[pos]["mean_allowed"] for d in pooled.values()
                if pos in d and d[pos]["mean_allowed"] is not None]
        league_avg[pos] = round(sum(vals) / len(vals), 2) if vals else None

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/defense_vs_position.py",
        "_note": "Weekly points ALLOWED by each defense to each position "
                 "(QB/RB/WR/TE), scored under this league's own table, weeks "
                 "1-17, pooled across every season in `seasons`. Fully "
                 "offline — component_stats_<season>.json (team/position, "
                 "TERRITORY C) joined to vegas_lines_2021_2026.json "
                 "(schedule, TERRITORY A, read-only) for the opponent key. "
                 "`by_defense[team][pos].mean_allowed` is the per-week "
                 "average; `league_avg[pos]` is the same pooled across all "
                 "32 teams as a comparison baseline.",
        "seasons": list(seasons),
        "weeks_per_season_measured": per_season_counts,
        "league_avg": league_avg,
        "by_defense": pooled,
    }
    return doc


def main(seasons=DEFAULT_SEASONS) -> int:
    doc = build_store(seasons)
    OUT.write_text(json.dumps(doc, indent=1))
    n_defenses = len(doc["by_defense"])
    print(f"wrote {OUT.relative_to(DRAFT.parent)}: {n_defenses} defenses, "
         f"seasons {doc['seasons']}, league_avg {doc['league_avg']}")
    return 0


if __name__ == "__main__":
    yrs = tuple(int(a) for a in sys.argv[1:]) or DEFAULT_SEASONS
    sys.exit(main(yrs))

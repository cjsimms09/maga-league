# TERRITORY: A
"""EXP-BENCH-MIX — what did BENCH draft picks actually deliver to starting
lineups in this league, 2023-2025, by position?

Feeds Mission A.3 of draft/audit/roster_construction_audit_2026-08-15.md:
the simulator says the shipped engine spends its ~6 bench picks roughly
RB 3.4 / WR 1.9 / QB 0.5 / TE 0.2 / K+DEF 0.0 per room
(draft/backtest/roster_room_audit.json). This measures the same quantity's
REALIZED side from the league's own history: which bench positions actually
reached starting lineups, how often, and for how many points.

PREREGISTRATION (written before results):
  Population: all 30 real team-drafts 2023-2025. Each team's drafted players
  are classified starter-pick vs bench-pick by draft order within position:
  dedicated slots (QB1 RB2 WR2 TE1 K1 DEF1) go to the earliest-drafted at
  each position (keepers count as drafted at their keeper round); ONE flex
  goes to the earliest-drafted remaining RB/WR/TE; everyone else drafted is
  a bench pick.
  Metrics per bench pick: (a) weeks started for the DRAFTING roster
  (league_history weekly `starters`, weeks 1-17); (b) league points scored
  in those started weeks (`players_points` — the league's own realized
  scoring, so K/DEF are measurable here). Aggregated by position: bench
  picks per team, mean starts, mean started-points.
  Verdict rule: the engine's simulated bench mix is SOUND if the positions
  it weights (RB/WR heavy, K/DEF zero) are the positions whose real bench
  picks delivered the most started points; a position the engine skips that
  delivered materially (>= 20 started pts per bench pick) is a finding
  against the bench rule, and vice versa.

HONEST LIMITS: starts credited only while the player starts for the roster
that DRAFTED him (a drop-and-elsewhere-start is the wire's value, not the
bench slot's); waiver-sourced starters are invisible here by design — that
side is measured by wire_level.js (research branch). Trades reassign credit
imperfectly; not corrected, stated.

Run: python3 draft/backtest/exp_bench_mix.py
Writes: draft/backtest/exp_bench_mix.json
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIST = ROOT / "draft" / "data" / "league_history.json"
POSFILE = ROOT / "draft" / "data" / "player_positions.json"
OUT = ROOT / "draft" / "backtest" / "exp_bench_mix.json"

SEASONS = ("2023", "2024", "2025")
DEDICATED = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "K": 1, "DEF": 1}
FLEX_ELIG = ("RB", "WR", "TE")
WEEK_CAP = 17


def season_entry(hist, season):
    return next(x for x in hist["seasons"] if x["season"] == season)


def main_draft_picks(s):
    drafts = s.get("drafts") or []
    return max(drafts, key=lambda d: len(d.get("picks") or [])).get("picks") or []


def classify(team_picks, positions):
    """-> (starter_pick_ids, bench_rows) by draft order within position."""
    by_pos: dict[str, list[dict]] = {}
    for p in sorted(team_picks, key=lambda x: x["pick_no"]):
        pos = positions.get(str(p["player_id"]))
        by_pos.setdefault(pos or "?", []).append(p)
    starters = set()
    for pos, need in DEDICATED.items():
        for p in (by_pos.get(pos) or [])[:need]:
            starters.add(str(p["player_id"]))
    flex_pool = []
    for pos in FLEX_ELIG:
        flex_pool.extend((by_pos.get(pos) or [])[DEDICATED[pos]:])
    flex_pool.sort(key=lambda x: x["pick_no"])
    if flex_pool:
        starters.add(str(flex_pool[0]["player_id"]))
    bench = [p for p in team_picks if str(p["player_id"]) not in starters]
    return starters, bench


def load_positions() -> dict[str, str]:
    """player_positions.json, overlaid with the live board's players AND
    kept_players. FOUND WHILE BUILDING THIS (2026-08-15): the file is missing
    the three current keepers (7564 Chase WR, 3198 Henry RB, 8151 Walker RB)
    — mechanism unresolved offline, see the data-defect section of
    draft/audit/roster_construction_audit_2026-08-15.md — and they are
    round-1..3 picks in every historical draft, so without the overlay each
    classifies as an unknown-position BENCH pick with 11-17 real starts,
    poisoning the bench table."""
    positions = dict(json.loads(POSFILE.read_text())["positions"])
    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    for key in ("players", "kept_players"):
        for p in board.get(key) or []:
            positions.setdefault(str(p["player_id"]), p.get("position"))
    return positions


def main():
    hist = json.loads(HIST.read_text())
    positions = load_positions()

    per_pos: dict[str, dict] = {}
    team_seasons = 0
    bench_total = 0
    unknown_pos = 0

    for yr in SEASONS:
        s = season_entry(hist, yr)
        picks = main_draft_picks(s)
        weeks = s.get("weeks") or {}
        # roster_id -> week -> (starter set, points map)
        started: dict[int, list[tuple[set, dict]]] = {}
        for wk, rows in weeks.items():
            if int(wk) > WEEK_CAP:
                continue
            for row in rows:
                started.setdefault(row["roster_id"], []).append(
                    (set(map(str, row.get("starters") or [])),
                     row.get("players_points") or {}))
        rosters = sorted({p["roster_id"] for p in picks})
        for rid in rosters:
            team_seasons += 1
            mine = [p for p in picks if p["roster_id"] == rid]
            _, bench = classify(mine, positions)
            for p in bench:
                pid = str(p["player_id"])
                pos = positions.get(pid)
                if pos is None:
                    unknown_pos += 1
                    pos = "?"
                bench_total += 1
                n_starts = 0
                pts = 0.0
                for sset, pmap in started.get(rid, []):
                    if pid in sset:
                        n_starts += 1
                        pts += float(pmap.get(pid) or 0.0)
                cell = per_pos.setdefault(pos, {"bench_picks": 0, "starts": [],
                                                "started_pts": []})
                cell["bench_picks"] += 1
                cell["starts"].append(n_starts)
                cell["started_pts"].append(round(pts, 1))

    table = {}
    for pos, cell in sorted(per_pos.items()):
        n = cell["bench_picks"]
        table[pos] = {
            "bench_picks_total": n,
            "bench_picks_per_team_season": round(n / team_seasons, 2),
            "mean_starts_per_pick": round(statistics.mean(cell["starts"]), 2),
            "pct_never_started": round(
                100 * sum(1 for x in cell["starts"] if x == 0) / n, 1),
            "mean_started_pts_per_pick": round(
                statistics.mean(cell["started_pts"]), 1),
            "total_started_pts": round(sum(cell["started_pts"]), 1),
        }

    out = {
        "_territory": "TERRITORY: A — research artifact, no production reader",
        "experiment": "EXP-BENCH-MIX — realized starting-lineup yield of bench draft picks by position, 2023-2025",
        "prereg": "header of draft/backtest/exp_bench_mix.py",
        "team_seasons": team_seasons,
        "bench_picks_total": bench_total,
        "unknown_position_rows": unknown_pos,
        "by_position": table,
        "scoring_note": "started points are the league's own realized weekly points (players_points), weeks 1-17",
    }
    OUT.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))
    print("wrote", OUT)
    return out


if __name__ == "__main__":
    main()

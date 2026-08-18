# TERRITORY: D
"""VEGAS TEAM-LEVEL ARM — register 18's trigger, and the join counter its
predecessor never recorded.

Preregistered in VEGAS-TEAM-ARM-PREREG.md, committed first. Result:
vegas_team_arm.json.

WHY: the "+0.23 weekly MAE" stamped on vegas_lines_2021_2026.json came from a
GAME-total oracle handed to BOTH teams (208/208 games share one multiplier), so
it bounds a team-blind channel rather than the team-level implied total the
store exists to provide. And exp_weekly_env records no join counter for any arm,
so register 18's question 2 — did the input reach the rows — has no answer.

NO EGRESS. player->team from component_stats_*, outcomes from
nflverse_weekly_points_*, lines from the Vegas store. All committed.

ABSENT STAYS ABSENT: a player-week with no line is EXCLUDED, never given
m = 1.0. That silent-neutral default is precisely what made the original
unanswerable, and reproducing it here would repeat the defect.

Run: python3 draft/backtest/vegas_team_arm.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SEASONS = (2023, 2024)
LAMBDAS = (0.15, 0.25, 0.35, 0.50, 1.00)
FIRST_WEEK, LAST_WEEK = 5, 18
MIN_PRIOR, RELEVANCE_FLOOR = 3, 5.0
MIN_SURVIVAL = 0.90          # declared: below this the fold is invalid


def implied_by_team_week(season: int) -> dict:
    """{(week, team): implied points}. The store's own formula:
    implied_home = total/2 + spread/2; away takes the remainder."""
    games = json.loads((HERE / "vegas_lines_2021_2026.json").read_text())["seasons"]
    out = {}
    for g in games[str(season)]:
        home = g["total_line"] / 2.0 + g["spread_line"] / 2.0
        out[(g["week"], g["home"])] = home
        out[(g["week"], g["away"])] = g["total_line"] - home
    return out


def player_team_week(season: int) -> dict:
    """{(week, pid): team} from the committed component stats."""
    doc = json.loads((HERE / f"component_stats_{season}.json").read_text())
    out = {}
    for wk in doc["weeks"]:
        for pid, row in (wk.get("players") or {}).items():
            if row.get("team"):
                out[(wk["week"], str(pid))] = row["team"]
    return out


def player_week_points(season: int) -> dict:
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    return {(wk["week"], str(pid)): float(p)
            for wk in doc["weeks"] for pid, p in wk["points"].items()}


def eligible_rows(points: dict) -> list:
    """Strictly-prior running mean per player, then exp_weekly_env's declared
    eligibility: weeks 5-18, >=3 prior appearances, prior mean >= 5.0."""
    by_player: dict[str, list] = {}
    for (week, pid), pts in points.items():
        by_player.setdefault(pid, []).append((week, pts))
    rows = []
    for pid, seq in by_player.items():
        seq.sort()
        total, n = 0.0, 0
        for week, pts in seq:
            if (FIRST_WEEK <= week <= LAST_WEEK and n >= MIN_PRIOR
                    and total / n >= RELEVANCE_FLOOR):
                rows.append({"pid": pid, "week": week,
                             "baseline": total / n, "actual": pts})
            total += pts
            n += 1
    return rows


def mae(pairs) -> float:
    return sum(abs(p - a) for p, a in pairs) / len(pairs)


def run_season(season: int) -> dict:
    implied = implied_by_team_week(season)
    teams = player_team_week(season)
    rows = eligible_rows(player_week_points(season))

    # THE COUNTER. Absent stays absent: a row with no team or no line is
    # excluded from the arm's population, never defaulted to m = 1.0.
    joined, no_team, no_line = [], 0, 0
    for r in rows:
        team = teams.get((r["week"], r["pid"]))
        if not team:
            no_team += 1
            continue
        if (r["week"], team) not in implied:
            no_line += 1
            continue
        joined.append(dict(r, team=team))

    survival = round(len(joined) / max(len(rows), 1), 4)
    by_week: dict[int, list] = {}
    for r in joined:
        by_week.setdefault(r["week"], []).append(r)

    base = mae([(r["baseline"], r["actual"]) for r in joined])
    arms = {}
    for lam in LAMBDAS:
        preds = []
        for week, group in by_week.items():
            vals = [implied[(week, r["team"])] for r in group]
            mean_implied = sum(vals) / len(vals)
            for r, v in zip(group, vals):
                m = v / mean_implied
                preds.append((r["baseline"] * (1.0 + lam * (m - 1.0)), r["actual"]))
        arms[f"lambda={lam}"] = {"mae": round(mae(preds), 4),
                                 "delta_mae": round(base - mae(preds), 4)}
    return {
        "population": {"eligible_rows": len(rows), "joined": len(joined),
                       "dropped_no_team": no_team, "dropped_no_line": no_line,
                       "join_survival": survival,
                       "fold_valid": survival >= MIN_SURVIVAL},
        "baseline_mae": round(base, 4),
        "arms": arms,
        "best_lambda": max(arms, key=lambda k: arms[k]["delta_mae"]),
    }


def main() -> dict:
    seasons = {str(s): run_season(s) for s in SEASONS}
    valid = [v for v in seasons.values() if v["population"]["fold_valid"]]
    best = {s: v["arms"][v["best_lambda"]]["delta_mae"] for s, v in seasons.items()}
    clears = bool(valid) and len(valid) == len(seasons) and all(d > 0 for d in best.values())
    out = {
        "_territory": "TERRITORY: D — produced by draft/backtest/vegas_team_arm.py",
        "preregistration": "draft/backtest/VEGAS-TEAM-ARM-PREREG.md",
        "status": "graded", "seasons": seasons, "clears": clears,
        "answers_register_18_q2": (
            "This arm records join survival per fold, which exp_weekly_env did "
            "not for any arm. Its predecessor defaulted a failed lookup to "
            "m = 1.0 and kept the row in the MAE denominator, so a diluted "
            "effect was indistinguishable from a real one."),
    }
    (HERE / "vegas_team_arm.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {HERE / 'vegas_team_arm.json'}")
    for s, v in seasons.items():
        p = v["population"]
        print(f"\n{s}: eligible={p['eligible_rows']} joined={p['joined']} "
              f"(no_team={p['dropped_no_team']} no_line={p['dropped_no_line']}) "
              f"survival={p['join_survival']:.1%} valid={p['fold_valid']}")
        print(f"    baseline MAE {v['baseline_mae']}")
        for k, a in v["arms"].items():
            print(f"    {k:14s} MAE {a['mae']:7.4f}  dMAE {a['delta_mae']:+.4f}")
    print(f"\nCLEARS: {clears}")
    return out


if __name__ == "__main__":
    main()

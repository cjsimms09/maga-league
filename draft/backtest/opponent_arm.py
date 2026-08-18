# TERRITORY: D
"""THE OPPONENT ARM (P57) — does a within-season defensive rating reduce error?

Preregistered in OPPONENT-ARM-PREREG.md, committed first. Result:
opponent_arm.json.

opponent_strength.py (relay) settled FEASIBILITY: verdict IN-SEASON ONLY, and
its pooled median hides RB. What it did not settle is whether an ARM built on
that rating improves a projection -- a rating that DESCRIBES the second half is
not a multiplier that REDUCES error.

Rating comes from weeks 1..W-1 of the CURRENT season only. Never last season's,
which is exactly what the draft-day column says does not carry.

NO EGRESS. Opponent map from vegas_lines_2021_2026.json (regular-season game
lines, which sidesteps the BDL playoff-numbering trap opponent_strength.py
documents); outcomes from nflverse_weekly_points_*; team and position from
component_stats_*. Join verified 100% on all three seasons before this file was
written.

ABSENT STAYS ABSENT: a defence with fewer than MIN_PRIOR_GAMES is EXCLUDED and
counted, never given m = 1.0.

Run: python3 draft/backtest/opponent_arm.py
"""
from __future__ import annotations

import json
import random
import statistics as st
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = Path(__file__).with_suffix(".json")

SEASONS = (2023, 2024, 2025)
POSITIONS = ("QB", "RB", "WR", "TE")
FIRST_WEEK, LAST_WEEK = 5, 17
MIN_PRIOR_GAMES = 3
MIN_PRIOR_APPEARANCES, RELEVANCE_FLOOR = 3, 5.0

GRID = (0.00, 0.15, 0.25, 0.35, 0.50, 0.65, 0.80, 1.00)

BAR_POOLED_GAIN = 0.010
BAR_SEASONS_POSITIVE = 3
BAR_PLACEBO_P = 0.05

PLACEBO_DRAWS = 60
PLACEBO_SEED = 20260818


def opponent_map(season: int) -> dict:
    games = json.loads((HERE / "vegas_lines_2021_2026.json").read_text())["seasons"]
    out = {}
    for g in games[str(season)]:
        out[(g["week"], g["home"])] = g["away"]
        out[(g["week"], g["away"])] = g["home"]
    return out


def player_rows(season: int) -> list:
    """[{week, pid, pos, team, points}] — position and team from components,
    points from the graded store."""
    comp = json.loads((HERE / f"component_stats_{season}.json").read_text())
    pts_doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    points = {(wk["week"], str(p)): float(v)
              for wk in pts_doc["weeks"] for p, v in wk["points"].items()}
    rows = []
    for wk in comp["weeks"]:
        week = wk["week"]
        for pid, r in (wk.get("players") or {}).items():
            if r.get("pos") not in POSITIONS or not r.get("team"):
                continue
            v = points.get((week, str(pid)))
            if v is None:
                continue
            rows.append({"week": week, "pid": str(pid), "pos": r["pos"],
                         "team": r["team"], "points": v})
    return rows


def baselines(rows: list) -> dict:
    """Strictly-prior running mean per player — the same baseline every other
    arm in this lane uses, so results compare like with like."""
    seq: dict[str, list] = {}
    for r in rows:
        seq.setdefault(r["pid"], []).append(r)
    out = {}
    for pid, rs in seq.items():
        rs.sort(key=lambda r: r["week"])
        total, n = 0.0, 0
        for r in rs:
            out[(pid, r["week"])] = (total / n if n else None, n)
            total += r["points"]
            n += 1
    return out


def ratings_before_week(rows: list, opp: dict, week: int) -> dict:
    """{(pos, defence): m} from weeks 1..week-1 of THIS season only.

    m is allowed-per-game divided by the league mean, so it is mean-normalised
    by construction — the property register DS3 found separates the six safe
    arms from the two that were not.
    """
    allowed: dict[tuple, list] = {}
    for r in rows:
        if r["week"] >= week:
            continue
        d = opp.get((r["week"], r["team"]))
        if not d:
            continue
        allowed.setdefault((r["pos"], d), []).append((r["week"], r["points"]))
    per_team = {}
    for key, vals in allowed.items():
        games = len({w for w, _ in vals})
        if games < MIN_PRIOR_GAMES:
            continue                      # absent stays absent
        per_team[key] = sum(v for _, v in vals) / games
    out = {}
    for pos in POSITIONS:
        vals = [v for (p, _), v in per_team.items() if p == pos]
        if not vals:
            continue
        mean = sum(vals) / len(vals)
        if not mean:
            continue
        for (p, d), v in per_team.items():
            if p == pos:
                out[(pos, d)] = v / mean
    return out


def prepare(season: int, shuffle_seed: int | None = None) -> tuple[dict, dict]:
    """{pos: [(baseline, actual, m)]} plus the population counter."""
    rows = player_rows(season)
    opp = opponent_map(season)
    base = baselines(rows)
    by_pos: dict[str, list] = {p: [] for p in POSITIONS}
    counts = {"eligible": 0, "no_opponent": 0, "no_rating": 0, "kept": 0}
    rng = random.Random(shuffle_seed) if shuffle_seed is not None else None

    for week in range(FIRST_WEEK, LAST_WEEK + 1):
        rate = ratings_before_week(rows, opp, week)
        if rng is not None:
            # PLACEBO: same ratings, reassigned among that week's defences.
            for pos in POSITIONS:
                keys = [k for k in rate if k[0] == pos]
                vals = [rate[k] for k in keys]
                rng.shuffle(vals)
                for k, v in zip(keys, vals):
                    rate[k] = v
        for r in rows:
            if r["week"] != week:
                continue
            b, n = base.get((r["pid"], week), (None, 0))
            if b is None or n < MIN_PRIOR_APPEARANCES or b < RELEVANCE_FLOOR:
                continue
            counts["eligible"] += 1
            d = opp.get((week, r["team"]))
            if not d:
                counts["no_opponent"] += 1
                continue
            m = rate.get((r["pos"], d))
            if m is None:
                counts["no_rating"] += 1      # counted, never defaulted to 1.0
                continue
            by_pos[r["pos"]].append((b, r["points"], m))
            counts["kept"] += 1
    return by_pos, counts


def _mae(pairs) -> float:
    return sum(abs(p - a) for p, a in pairs) / len(pairs)


def delta_mae(rows: list, lam: float) -> float:
    base = _mae([(b, a) for b, a, _ in rows])
    arm = _mae([(b * (1.0 + lam * (m - 1.0)), a) for b, a, m in rows])
    return base - arm


def leave_one_out(by_season: dict, seasons: tuple) -> dict:
    out = {}
    for s in seasons:
        others = tuple(x for x in seasons if x != s)
        best, best_val = None, None
        for lam in GRID:
            v = sum(delta_mae(by_season[o], lam) for o in others)
            if best_val is None or v > best_val:
                best, best_val = lam, v
        out[str(s)] = {"fitted_on": list(others), "lambda": best,
                       "delta_mae": round(delta_mae(by_season[s], best), 4)}
    return out


def judge(loo: dict, placebo_p: float | None) -> dict:
    deltas = [v["delta_mae"] for v in loo.values()]
    pooled = st.mean(deltas) if deltas else 0.0
    positive = sum(1 for d in deltas if d > 0)
    return {
        "pooled_delta_mae": round(pooled, 4),
        "seasons_positive": positive,
        "seasons": len(deltas),
        "placebo_p": placebo_p,
        "clears": (pooled >= BAR_POOLED_GAIN
                   and positive >= BAR_SEASONS_POSITIVE
                   and placebo_p is not None and placebo_p < BAR_PLACEBO_P),
    }


def main() -> dict:
    real, counts = {}, {}
    for s in SEASONS:
        real[s], counts[str(s)] = prepare(s)

    placebo_draws: dict[str, list] = {p: [] for p in POSITIONS}
    for i in range(PLACEBO_DRAWS):
        drawn = {s: prepare(s, shuffle_seed=PLACEBO_SEED + i)[0] for s in SEASONS}
        for pos in POSITIONS:
            loo = leave_one_out({s: drawn[s][pos] for s in SEASONS}, SEASONS)
            placebo_draws[pos].append(st.mean(v["delta_mae"] for v in loo.values()))

    positions = {}
    for pos in POSITIONS:
        loo = leave_one_out({s: real[s][pos] for s in SEASONS}, SEASONS)
        obs = st.mean(v["delta_mae"] for v in loo.values())
        draws = sorted(placebo_draws[pos])
        p = (sum(1 for d in draws if d >= obs) + 1) / (PLACEBO_DRAWS + 1)
        positions[pos] = {
            "n_rows": {str(s): len(real[s][pos]) for s in SEASONS},
            "leave_one_out": loo,
            "placebo": {"draws": PLACEBO_DRAWS, "mean": round(st.mean(draws), 4),
                        "p95": round(draws[int(0.95 * len(draws))], 4),
                        "p_value": round(p, 4),
                        "gain_net_of_placebo": round(obs - st.mean(draws), 4)},
            "verdict": judge(loo, round(p, 4)),
        }

    result = {
        "_territory": "TERRITORY: D — produced by draft/backtest/opponent_arm.py",
        "preregistration": "draft/backtest/OPPONENT-ARM-PREREG.md",
        "row": "in-season row 3 (P57)",
        "status": "graded",
        "population": counts,
        "positions": positions,
        "clears_any": [p for p, d in positions.items() if d["verdict"]["clears"]],
        "multiplicity": f"{len(POSITIONS)} positions tested, disclosed in the prereg",
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    return result


if __name__ == "__main__":
    r = main()
    print(f"{'pos':4s} {'pooled dMAE':>12s} {'seasons+':>9s} {'placebo p':>10s} "
          f"{'net':>8s}  {'clears':>6s}   per-season")
    for pos, d in r["positions"].items():
        v, pl = d["verdict"], d["placebo"]
        per = " ".join(f"{s}:{x['delta_mae']:+.3f}@{x['lambda']}"
                       for s, x in d["leave_one_out"].items())
        print(f"{pos:4s} {v['pooled_delta_mae']:+12.4f} {v['seasons_positive']:>7d}/3 "
              f"{pl['p_value']:>10.4f} {pl['gain_net_of_placebo']:>+8.4f}  "
              f"{str(v['clears']):>6s}   {per}")
    print(f"\nclears: {r['clears_any'] or 'NONE'}   ({r['multiplicity']})")
    print("population:", r["population"])

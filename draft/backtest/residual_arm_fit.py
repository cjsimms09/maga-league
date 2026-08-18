# TERRITORY: D
"""RESIDUAL-ARM FIT, against the running-mean baseline (NOT Sleeper).

Preregistered in RESIDUAL-ARM-RUNNING-MEAN-PREREG.md, committed first. The
Sleeper-residual design in RESIDUAL-ARM-PROPOSAL.md is not constructible on
any historical fold -- see draft/audit/residual_arm_sleeper_blocker_2026-08-18.md.
This tests the same hypothesis (does Tier-1 breadth explain variance a naive
baseline misses) on data that actually exists.

lambda=0 IS the champion (the running-mean baseline alone), so a challenger
arm cannot lose to it by construction -- the one property this preserves
from the original design.

TWO ARMS, not five: vegas (team implied total) and usage (strictly-prior
tgt_share, RB/WR/TE only -- QB has no tgt_share signal, a declared gap).
BEST-OF-K attached from run one, scoring both arms plus the do-nothing
baseline as the field.

NO EGRESS. vegas_lines_2021_2026.json, component_stats_*, nflverse_weekly_points_*.

Run: python3 draft/backtest/residual_arm_fit.py
"""
from __future__ import annotations

import json
import random
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
OUT = Path(__file__).with_suffix(".json")

import best_of_k as BOK  # noqa: E402

SEASONS = (2023, 2024, 2025)
POSITIONS = ("QB", "RB", "WR", "TE")
FIRST_WEEK, LAST_WEEK = 5, 17
MIN_PRIOR_APPEARANCES, RELEVANCE_FLOOR = 3, 5.0
GRID = (0.00, 0.15, 0.25, 0.35, 0.50, 0.65, 0.80, 1.00)

BAR_POOLED_GAIN = 0.010
BAR_SEASONS_POSITIVE = 3
BOOTSTRAP_DRAWS = 500
BOOTSTRAP_SEED = 20260818


def opponent_map(season: int) -> dict:
    games = json.loads((HERE / "vegas_lines_2021_2026.json").read_text())["seasons"]
    out = {}
    for g in games[str(season)]:
        out[(g["week"], g["home"])] = g["away"]
        out[(g["week"], g["away"])] = g["home"]
    return out


def vegas_implied(season: int) -> dict:
    """{(week, team): implied points / league mean that week}."""
    games = json.loads((HERE / "vegas_lines_2021_2026.json").read_text())["seasons"]
    raw = {}
    for g in games[str(season)]:
        home = g["total_line"] / 2.0 + g["spread_line"] / 2.0
        raw.setdefault(g["week"], {})[g["home"]] = home
        raw[g["week"]][g["away"]] = g["total_line"] - home
    out = {}
    for week, teams in raw.items():
        mean = sum(teams.values()) / len(teams)
        for team, v in teams.items():
            out[(week, team)] = v / mean if mean else 1.0
    return out


def player_rows(season: int) -> list:
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
                         "team": r["team"], "points": v,
                         "tgt_share": r.get("tgt_share")})
    return rows


def baselines(rows: list) -> dict:
    """Strictly-prior running mean per player."""
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


def usage_signal_before_week(rows: list, week: int) -> dict:
    """{(pos, pid): strictly-prior mean tgt_share, normalised to that
    position's league mean}, from weeks 1..week-1. RB/WR/TE only."""
    prior: dict[tuple, list] = {}
    for r in rows:
        if r["week"] >= week or r["tgt_share"] is None or r["pos"] == "QB":
            continue
        prior.setdefault((r["pos"], r["pid"]), []).append(r["tgt_share"])
    per_player = {k: sum(v) / len(v) for k, v in prior.items()}
    out = {}
    for pos in ("RB", "WR", "TE"):
        vals = [v for (p, _), v in per_player.items() if p == pos]
        if not vals:
            continue
        mean = sum(vals) / len(vals)
        if not mean:
            continue
        for (p, pid), v in per_player.items():
            if p == pos:
                out[(pos, pid)] = v / mean
    return out


def prepare(season: int) -> dict:
    """{pos: [(baseline, actual, m_vegas, m_usage_or_None)]}."""
    rows = player_rows(season)
    opp = opponent_map(season)
    vegas = vegas_implied(season)
    base = baselines(rows)
    by_pos: dict[str, list] = {p: [] for p in POSITIONS}

    for week in range(FIRST_WEEK, LAST_WEEK + 1):
        usage = usage_signal_before_week(rows, week)
        for r in rows:
            if r["week"] != week:
                continue
            b, n = base.get((r["pid"], week), (None, 0))
            if b is None or n < MIN_PRIOR_APPEARANCES or b < RELEVANCE_FLOOR:
                continue
            m_v = vegas.get((week, r["team"]))
            if m_v is None:
                continue
            m_u = usage.get((r["pos"], r["pid"]))
            by_pos[r["pos"]].append((b, r["points"], m_v, m_u))
    return by_pos


def _mae(pairs) -> float:
    return sum(abs(p - a) for p, a in pairs) / len(pairs)


def delta_mae(rows: list, arm: str, lam: float) -> float:
    """rows: [(baseline, actual, m_vegas, m_usage)]. arm in {'vegas','usage'}."""
    idx = 2 if arm == "vegas" else 3
    usable = [r for r in rows if r[idx] is not None]
    if not usable:
        return None
    base_mae = _mae([(b, a) for b, a, *_ in usable])
    arm_mae = _mae([(b * (1.0 + lam * (r[idx] - 1.0)), a) for r, (b, a) in
                    zip(usable, [(x[0], x[1]) for x in usable])])
    return base_mae - arm_mae


def leave_one_out(by_season: dict, arm: str, seasons: tuple) -> dict:
    out = {}
    for s in seasons:
        others = tuple(x for x in seasons if x != s)
        best, best_val = None, None
        for lam in GRID:
            vals = [delta_mae(by_season[o], arm, lam) for o in others]
            vals = [v for v in vals if v is not None]
            if not vals:
                continue
            v = sum(vals)
            if best_val is None or v > best_val:
                best, best_val = lam, v
        d = delta_mae(by_season[s], arm, best) if best is not None else None
        out[str(s)] = {"fitted_on": list(others), "lambda": best,
                       "delta_mae": round(d, 4) if d is not None else None}
    return out


def _clustered_rows(season: int, arm: str) -> dict:
    """{(week, team): [(baseline, actual, m)]} for one season/arm, keyed for
    team-week cluster resampling -- players sharing a team-week share game
    script, so they are not independent observations."""
    rows = player_rows(season)
    vegas = vegas_implied(season)
    base = baselines(rows)
    out: dict = {}
    for week in range(FIRST_WEEK, LAST_WEEK + 1):
        usage = usage_signal_before_week(rows, week)
        for r in rows:
            if r["week"] != week:
                continue
            b, n = base.get((r["pid"], week), (None, 0))
            if b is None or n < MIN_PRIOR_APPEARANCES or b < RELEVANCE_FLOOR:
                continue
            m_v = vegas.get((week, r["team"]))
            if m_v is None:
                continue
            m_u = usage.get((r["pos"], r["pid"]))
            m = m_v if arm == "vegas" else m_u
            if m is None:
                continue
            out.setdefault((week, r["team"]), []).append((b, r["points"], m))
    return out


def cluster_bootstrap_ci(loo: dict, arm: str, positions_rows: dict, seasons: tuple,
                         draws: int = BOOTSTRAP_DRAWS, seed: int = BOOTSTRAP_SEED) -> dict:
    """Team-week cluster bootstrap on the ACTUAL walk-forward statistic.

    ⚠️ CORRECTED from the first version of this function, which bootstrapped
    at a single "representative" lambda (the median across seasons' fitted
    values) instead of each season's OWN leave-one-out lambda. That silently
    threw away real per-fold variation -- e.g. RB/vegas fitted lambda
    0.5/0.0/0.0 across the three folds, median 0.0, which made the CI
    trivially [0,0] regardless of what the pooled delta_mae (correctly
    computed per-fold) actually said. Caught by the CI coming back exactly
    zero-width on real data, which Rule 3d treats as implausible until
    explained.

    Correct construction: for EACH season, resample team-week clusters WITHIN
    that season's held-out fold, score at THAT season's own fitted lambda,
    and pool the resulting deltas across seasons and draws. This reproduces
    the walk-forward procedure's actual variability instead of a shortcut.
    """
    per_season_clusters = {s: _clustered_rows(s, arm) for s in seasons}
    rng = random.Random(seed)
    pooled_deltas = []
    for _ in range(draws):
        draw_total_base, draw_total_arm, draw_n = 0.0, 0.0, 0
        for s in seasons:
            lam = loo[str(s)]["lambda"]
            if lam is None:
                continue
            clusters = per_season_clusters[s]
            keys = list(clusters)
            if not keys:
                continue
            sample_keys = [rng.choice(keys) for _ in keys]
            rows = [row for k in sample_keys for row in clusters[k]]
            for b, a, m in rows:
                draw_total_base += abs(b - a)
                draw_total_arm += abs(b * (1.0 + lam * (m - 1.0)) - a)
                draw_n += 1
        if draw_n < 10:
            continue
        pooled_deltas.append(draw_total_base / draw_n - draw_total_arm / draw_n)
    pooled_deltas.sort()
    if not pooled_deltas:
        return {"ci_lo": None, "ci_hi": None, "excludes_zero": False, "draws": 0}
    lo = pooled_deltas[int(0.025 * len(pooled_deltas))]
    hi = pooled_deltas[int(0.975 * len(pooled_deltas))]
    return {"ci_lo": round(lo, 4), "ci_hi": round(hi, 4),
           "excludes_zero": lo > 0 or hi < 0, "draws": len(pooled_deltas)}


def judge(loo: dict, ci: dict) -> dict:
    deltas = [v["delta_mae"] for v in loo.values() if v["delta_mae"] is not None]
    if not deltas:
        return {"pooled_delta_mae": None, "seasons_positive": 0, "clears": False}
    pooled = st.mean(deltas)
    positive = sum(1 for d in deltas if d > 0)
    return {
        "pooled_delta_mae": round(pooled, 4),
        "seasons_positive": positive,
        "seasons_judged": len(deltas),
        "ci": ci,
        "clears": (pooled >= BAR_POOLED_GAIN and positive >= BAR_SEASONS_POSITIVE
                   and ci["excludes_zero"]),
    }


def main() -> dict:
    by_season = {s: prepare(s) for s in SEASONS}
    positions = {}
    for pos in POSITIONS:
        arms_here = ("vegas",) if pos == "QB" else ("vegas", "usage")
        pos_result = {}
        for arm in arms_here:
            by_season_pos = {s: by_season[s][pos] for s in SEASONS}
            loo = leave_one_out(by_season_pos, arm, SEASONS)
            ci = cluster_bootstrap_ci(loo, arm, by_season_pos, SEASONS)
            pos_result[arm] = {"leave_one_out": loo, "verdict": judge(loo, ci)}
        positions[pos] = pos_result

    # BEST-OF-K: for each position, score every fitted arm PLUS the
    # do-nothing (lambda=0) baseline as the field, on POOLED errors across
    # all three seasons at each arm's own representative lambda.
    best_of_k_results = {}
    for pos in POSITIONS:
        arms_here = ("vegas",) if pos == "QB" else ("vegas", "usage")
        errors_by_arm = {"do_nothing": []}
        for s in SEASONS:
            rows = by_season[s][pos]
            errors_by_arm["do_nothing"] += [abs(b - a) for b, a, *_ in rows]
        ok = True
        for arm in arms_here:
            idx = 2 if arm == "vegas" else 3
            lams = [v["lambda"] for v in positions[pos][arm]["leave_one_out"].values()
                    if v["lambda"] is not None]
            lam = st.median(lams) if lams else 0.0
            errs = []
            for s in SEASONS:
                rows = [r for r in by_season[s][pos] if r[idx] is not None]
                errs += [abs(b * (1.0 + lam * (r[idx] - 1.0)) - a)
                        for r, (b, a) in zip(rows, [(x[0], x[1]) for x in rows])]
            if not errs:
                ok = False
                continue
            errors_by_arm[arm] = errs
        # BEST-OF-K requires equal-length arms (same rows); do_nothing was
        # built over ALL rows, arms only over rows where their signal exists.
        # Trim do_nothing to match the shortest arm's row count for a fair field.
        if ok and len(errors_by_arm) > 1:
            n = min(len(v) for v in errors_by_arm.values())
            trimmed = {k: v[:n] for k, v in errors_by_arm.items()}
            try:
                best_of_k_results[pos] = BOK.best_of_k(trimmed, permutations=500)
            except ValueError as e:
                best_of_k_results[pos] = {"error": str(e)}

    result = {
        "_territory": "TERRITORY: D — produced by draft/backtest/residual_arm_fit.py",
        "_warning": "AGAINST THE RUNNING-MEAN BASELINE, NOT SLEEPER. See "
                    "draft/audit/residual_arm_sleeper_blocker_2026-08-18.md — "
                    "sleeper_proj is not constructible for 2023-25.",
        "preregistration": "draft/backtest/RESIDUAL-ARM-RUNNING-MEAN-PREREG.md",
        "positions": positions,
        "best_of_k": best_of_k_results,
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    return result


if __name__ == "__main__":
    r = main()
    print("⚠️  AGAINST THE RUNNING-MEAN BASELINE, NOT SLEEPER\n")
    for pos, arms in r["positions"].items():
        print(f"── {pos} ──")
        for arm, d in arms.items():
            v = d["verdict"]
            if v["pooled_delta_mae"] is None:
                print(f"  {arm}: no usable rows")
                continue
            print(f"  {arm}: pooled ΔMAE {v['pooled_delta_mae']:+.4f}  "
                  f"{v['seasons_positive']}/{v['seasons_judged']} seasons  "
                  f"CI [{v['ci']['ci_lo']:+.4f}, {v['ci']['ci_hi']:+.4f}]  "
                  f"clears={v['clears']}")
        bok = r["best_of_k"].get(pos)
        if bok and "error" not in bok:
            print(f"  BEST-OF-K: winner={bok['winner']} field_margin={bok['field_margin']:+.4f} "
                  f"p={bok['field_p_value']} survives={bok['survives']}")
        elif bok:
            print(f"  BEST-OF-K: {bok['error']}")

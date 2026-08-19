# TERRITORY: D
"""Q17 — how much weekly production is INVISIBLE to a prior-season model?

Preregistered in EMERGENT-COVERAGE-PREREG.md, committed first. Result:
emergent_coverage.json.

own_weekly_v1 prices from proj_ownmodel, which own_v6 builds strictly from
prior-season production. Sleeper and FantasyPros project the week-6 breakout
the day he breaks out. If a large share of weekly production comes from players
a prior-season model cannot see, the 09-15 three-way grade measures our
UNIVERSE rather than our model.

NO EGRESS. nflverse_weekly_points_* for outcomes, component_stats_* for
position. Join verified 100% before the prereg was written.

Run: python3 draft/backtest/emergent_coverage.py
"""
from __future__ import annotations

import json
import random
import statistics as st
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = Path(__file__).with_suffix(".json")

SEASONS = (2023, 2024, 2025)
FIRST_WEEK, LAST_WEEK = 1, 17

#: This league's starters plus flex depth. Fixed in the prereg before any
#: number existed.
STARTERS = {"QB": 12, "RB": 24, "WR": 24, "TE": 12}

#: prior_20's threshold, preregistered.
PRIOR_POINTS_FLOOR = 20.0

#: DEVIATION, declared: the prereg's metric 3 is "week 17 minus week 1". That
#: is a two-point comparison of two NOISY weeks -- the weekly series ranges
#: 5.6%-23.6% with no visible trend -- and reporting it as a trajectory is
#: exactly the error this lane keeps flagging elsewhere. The delta is still
#: emitted because it was preregistered; a LEAST-SQUARES SLOPE with a shuffle
#: null is emitted beside it, and the verdict reads the slope.
TREND_PERMUTATIONS = 400
TREND_SEED = 20260818


def positions(season: int) -> dict:
    doc = json.loads((HERE / f"component_stats_{season}.json").read_text())
    return {
        str(pid): row["pos"]
        for wk in doc["weeks"]
        for pid, row in (wk.get("players") or {}).items()
        if row.get("pos")
    }


def weekly_points(season: int) -> dict:
    """{week: {pid: points}}."""
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    return {wk["week"]: {str(p): float(v) for p, v in wk["points"].items()}
            for wk in doc["weeks"]}


def season_totals(season: int) -> dict:
    out: dict[str, float] = {}
    for week, pts in weekly_points(season).items():
        for pid, v in pts.items():
            out[pid] = out.get(pid, 0.0) + v
    return out


def visible_sets(season: int) -> dict:
    """The two preregistered definitions, plus the VOIDING control."""
    prior = season_totals(season - 1)
    same = season_totals(season)          # perfect foresight — the control
    return {
        "any_prior": set(prior),
        "prior_20": {p for p, v in prior.items() if v >= PRIOR_POINTS_FLOOR},
        "CONTROL_perfect_foresight": set(same),
    }


def _slope(ys: list) -> float | None:
    """Least-squares slope in percentage points per week."""
    if len(ys) < 3:
        return None
    xs = list(range(len(ys)))
    mx, my = st.mean(xs), st.mean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    if not den:
        return None
    return round(100 * sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den, 3)


def _slope_with_null(ys: list, seed: int) -> dict:
    """Is the trend distinguishable from noise? Shuffle the week labels."""
    obs = _slope(ys)
    if obs is None:
        return {"slope_pp_per_week": None, "p_value": None, "beats_null": None}
    rng = random.Random(seed)
    shuffled = list(ys)
    hits = 0
    for _ in range(TREND_PERMUTATIONS):
        rng.shuffle(shuffled)
        if abs(_slope(shuffled)) >= abs(obs):
            hits += 1
    p = (hits + 1) / (TREND_PERMUTATIONS + 1)
    return {"slope_pp_per_week": obs, "p_value": round(p, 4), "beats_null": p < 0.05}


def measure_season(season: int) -> dict:
    pos = positions(season)
    weeks = weekly_points(season)
    vis = visible_sets(season)

    per_arm: dict[str, dict] = {}
    for arm, visible in vis.items():
        by_week = {}
        for week in range(FIRST_WEEK, LAST_WEEK + 1):
            pts = weeks.get(week) or {}
            if not pts:
                continue
            rows = [(p, v, pos.get(p)) for p, v in pts.items() if pos.get(p)]

            # PRIMARY — the startable set, per position.
            start_tot, start_inv = 0, 0
            per_pos = {}
            for position, n in STARTERS.items():
                grp = sorted((r for r in rows if r[2] == position),
                             key=lambda r: -r[1])[:n]
                inv = [r for r in grp if r[0] not in visible]
                per_pos[position] = {
                    "n": len(grp), "invisible": len(inv),
                    "share": round(len(inv) / len(grp), 4) if grp else None,
                }
                start_tot += len(grp)
                start_inv += len(inv)

            # SECONDARY — share of ALL points. Only positive points count: a
            # negative row would otherwise shrink the denominator and inflate
            # the share, which is a different quantity than "production".
            total = sum(v for _, v, _ in rows if v > 0)
            inv_pts = sum(v for p, v, _ in rows if v > 0 and p not in visible)

            by_week[week] = {
                "startable": {
                    "n": start_tot, "invisible": start_inv,
                    "share": round(start_inv / start_tot, 4) if start_tot else None,
                    "by_position": per_pos,
                },
                "all_points": {
                    "total": round(total, 1),
                    "invisible": round(inv_pts, 1),
                    "share": round(inv_pts / total, 4) if total else None,
                },
            }

        starts = [w["startable"]["share"] for w in by_week.values()]
        trend = _slope_with_null(starts, TREND_SEED)
        pts_sh = [w["all_points"]["share"] for w in by_week.values()]
        pooled_pos = {}
        for position in STARTERS:
            tot = sum(w["startable"]["by_position"][position]["n"] for w in by_week.values())
            inv = sum(w["startable"]["by_position"][position]["invisible"] for w in by_week.values())
            pooled_pos[position] = round(inv / tot, 4) if tot else None
        per_arm[arm] = {
            "by_week": by_week,
            "pooled": {
                "startable_share": round(st.mean(starts), 4) if starts else None,
                "all_points_share": round(st.mean(pts_sh), 4) if pts_sh else None,
                "startable_by_position": pooled_pos,
            },
            "trajectory": {
                # preregistered, and NOT the verdict -- see _slope_with_null
                "week_1_startable": starts[0] if starts else None,
                "week_17_startable": starts[-1] if starts else None,
                "delta": round(starts[-1] - starts[0], 4) if len(starts) > 1 else None,
                "_delta_caveat": "two noisy weeks; the slope below is the read",
                "slope_pp_per_week": trend["slope_pp_per_week"],
                "slope_p_value": trend["p_value"],
                "slope_beats_null": trend["beats_null"],
                # week 17 is elevated in every season, which is also what
                # late-season resting looks like. Re-fit without 16-17.
                "slope_pp_per_week_weeks_1_15": _slope(starts[:15]),
            },
            "visible_players": len(vis[arm]),
        }
    return per_arm


def main() -> dict:
    seasons = {str(s): measure_season(s) for s in SEASONS}

    # THE GATE, declared as VOIDING: under perfect foresight nobody is
    # invisible. Anything else means the join lost rows.
    bad = []
    for s, arms in seasons.items():
        for week, w in arms["CONTROL_perfect_foresight"]["by_week"].items():
            if w["startable"]["share"] or w["all_points"]["share"]:
                bad.append({"season": s, "week": week,
                            "startable": w["startable"]["share"],
                            "all_points": w["all_points"]["share"]})
    control = {
        "what": "re-run with season Y's OWN production as the prior; invisible "
                "share must be 0.000 everywhere or the join is broken",
        "violations": bad[:10],
        "n_violations": len(bad),
        "passed": not bad,
    }

    def pooled(arm, key):
        vals = [seasons[s][arm]["pooled"][key] for s in seasons
                if seasons[s][arm]["pooled"][key] is not None]
        return round(st.mean(vals), 4) if vals else None

    primary = pooled("any_prior", "startable_share")
    band = (None if primary is None else
            "SMALL — formula work is the right lane" if primary < 0.05 else
            "MATERIAL — the grade is partly measuring our universe" if primary <= 0.15 else
            "STRUCTURAL — own_weekly_v1 needs an in-season universe refresh")

    trends = [seasons[s]["any_prior"]["trajectory"] for s in seasons]
    n_sig = sum(1 for x in trends if x["slope_beats_null"])
    trend_verdict = (
        f"NOT ESTABLISHED — the slope beats its shuffle null in {n_sig} of "
        f"{len(trends)} seasons; the preregistered week-17-minus-week-1 delta "
        f"is a two-point comparison of noisy weeks and is NOT the read"
        if n_sig < 2 else
        f"the blind spot GROWS within a season — slope beats null in {n_sig} of {len(trends)}"
    )

    result = {
        "_territory": "TERRITORY: D — produced by draft/backtest/emergent_coverage.py",
        "preregistration": "draft/backtest/EMERGENT-COVERAGE-PREREG.md",
        "question": "Q17",
        "status": "graded" if control["passed"] else "VOID",
        "gate_control": control,
        "headline": {
            "trend_verdict": trend_verdict,
            "primary_metric": "invisible share of STARTABLE production, arm any_prior",
            "pooled_across_seasons": primary,
            "band": band,
            "all_points_share": pooled("any_prior", "all_points_share"),
            "sensitivity_prior_20_startable": pooled("prior_20", "startable_share"),
        },
        "seasons": seasons,
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    return result


if __name__ == "__main__":
    r = main()
    c = r["gate_control"]
    print("GATE (perfect-foresight control):", "PASS" if c["passed"] else f"FAIL — {c['n_violations']} violations")
    h = r["headline"]
    print(f"\nPRIMARY — invisible share of startable production (any_prior): {h['pooled_across_seasons']:.1%}")
    print(f"  BAND: {h['band']}")
    print(f"  share of ALL points: {h['all_points_share']:.1%}")
    print(f"  sensitivity (prior_20): {h['sensitivity_prior_20_startable']:.1%}")
    print()
    for s, arms in r["seasons"].items():
        a = arms["any_prior"]
        t = a["trajectory"]
        print(f"  {s}: startable {a['pooled']['startable_share']:.1%} "
              f"| by pos {({k: f'{v:.1%}' for k, v in a['pooled']['startable_by_position'].items()})} "
              f"| wk1 {t['week_1_startable']:.1%} -> wk17 {t['week_17_startable']:.1%} "
              f"(delta {t['delta']:+.1%})")

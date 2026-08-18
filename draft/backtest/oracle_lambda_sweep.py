# TERRITORY: D
"""ORACLE LAMBDA SWEEP — register 18b. Preregistered in ORACLE-LAMBDA-PREREG.md,
committed first. Result: oracle_lambda_sweep.json.

exp_weekly_env.py:50 is `DAMPENING = (1.0, 0.5)  # both reported, neither
tuned`. The game-total oracle scores +0.24/+0.21 at lambda=0.5 and only
+0.14/+0.12 at lambda=1.0 -- and 0.5 is the GRID MINIMUM, so the published
"+0.228 pooled ceiling" is a floor on the ceiling.

And an ORACLE that improves when shrunk toward no-op is not a weak signal, it
is a mis-specified form: perfect information about the week-w game total should
not need halving.

NO EGRESS. Realised team-game points from exp_weekly_env_features.json,
outcomes from nflverse_weekly_points_*.json, player->team from
component_stats_*.json. All committed.

TWO POPULATIONS, DELIBERATELY, AND THE DIFFERENCE IS THE POINT:

  reproduction  A's exact construction, INCLUDING its m = 1.0 default for a
                player whose team has no multiplier this week. Required to
                match the published numbers, or this run is VOID.
  strict        absent stays absent: a player-week with no team is EXCLUDED.
                D's standing rule. Reported alongside, never instead.

Run: python3 draft/backtest/oracle_lambda_sweep.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SEASONS = (2023, 2024)
FIRST_WEEK, LAST_WEEK = 5, 18
MIN_PRIOR, RELEVANCE_FLOOR = 3, 5.0

#: Preregistered grid. 0.00 is the baseline by construction (an arithmetic
#: self-check); >1 is included so "interior" is testable from both sides.
LAMBDAS = (0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45,
           0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.25, 1.50)

#: The VOIDING control, from exp_weekly_env.json. Not recomputed here -- read
#: from the published artifact below, so a drift in A's file fails loudly
#: rather than silently agreeing with a stale copy.
CONTROL_LAMBDAS = (1.0, 0.5)
CONTROL_TOL = 0.001
CONTROL_ROWS = {2023: 2179, 2024: 2259}


def published_oracle() -> dict:
    """{(season, lambda): delta_mae} as A's committed artifact reports them."""
    doc = json.loads((HERE / "exp_weekly_env.json").read_text())
    out = {}
    for yr, s in doc["seasons"].items():
        for key, entry in s["arms"].items():
            if key.startswith("oracle_total@"):
                out[(int(yr), float(key.split("@")[1]))] = entry["delta_mae"]
    return out


def realised_totals(season: int) -> dict:
    """{week: {team: game total}} and the league mean total for that week.

    A's construction exactly: mean_total is over EVERY team playing that week,
    not over the eligible sample.
    """
    doc = json.loads((HERE / "exp_weekly_env_features.json").read_text())
    by_week: dict[int, dict] = {}
    for g in doc["seasons"][str(season)]:
        if g.get("points_for") is None:
            continue
        by_week.setdefault(g["week"], {})[g["team"]] = (
            g["points_for"] + g["points_against"]
        )
    out = {}
    for week, totals in by_week.items():
        mean_total = sum(totals.values()) / len(totals)
        out[week] = {t: v / mean_total for t, v in totals.items()} if mean_total else {}
    return out


def player_team_week(season: int) -> dict:
    doc = json.loads((HERE / f"component_stats_{season}.json").read_text())
    return {
        (wk["week"], str(pid)): row["team"]
        for wk in doc["weeks"]
        for pid, row in (wk.get("players") or {}).items()
        if row.get("team")
    }


def eligible_rows(season: int) -> list:
    """exp_weekly_env's declared eligibility, reproduced in vegas_team_arm.py
    and already proven to land on A's exact row counts."""
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    points = {
        (wk["week"], str(pid)): float(p)
        for wk in doc["weeks"]
        for pid, p in wk["points"].items()
    }
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


def curve(rows: list, mult: dict, teams: dict, strict: bool) -> dict:
    """delta_mae at every preregistered lambda, plus the above/below-1 split."""
    prepared, dropped = [], 0
    for r in rows:
        team = teams.get((r["week"], r["pid"]))
        m = mult.get(r["week"], {}).get(team) if team else None
        if m is None:
            if strict:
                dropped += 1
                continue
            m = 1.0                      # A's declared default, reproduced
        prepared.append((r["baseline"], r["actual"], m))

    base = mae([(b, a) for b, a, _ in prepared])
    out = {"n": len(prepared), "dropped": dropped, "baseline_mae": round(base, 4),
           "delta_mae": {}, "asymmetry": {}}
    for lam in LAMBDAS:
        preds = [(b * (1.0 + lam * (m - 1.0)), a) for b, a, m in prepared]
        out["delta_mae"][f"{lam:.2f}"] = round(base - mae(preds), 4)

    # THE MECHANISM DIAGNOSTIC, declared in the prereg before this ran: does
    # damping help on the blowup side, the dud side, or both?
    for label, keep in (("m_above_1", lambda m: m > 1.0),
                        ("m_below_1", lambda m: m <= 1.0)):
        side = [(b, a, m) for b, a, m in prepared if keep(m)]
        if not side:
            continue
        sbase = mae([(b, a) for b, a, _ in side])
        deltas = {
            f"{lam:.2f}": round(
                sbase - mae([(b * (1.0 + lam * (m - 1.0)), a) for b, a, m in side]), 4
            )
            for lam in LAMBDAS
        }
        out["asymmetry"][label] = {
            "n": len(side),
            "baseline_mae": round(sbase, 4),
            "delta_mae": deltas,
            "best_lambda": max(deltas, key=lambda k: deltas[k]),
        }
    out["best_lambda"] = max(out["delta_mae"], key=lambda k: out["delta_mae"][k])
    return out


def main() -> dict:
    pub = published_oracle()
    seasons, control = {}, {"passed": True, "checks": []}

    for yr in SEASONS:
        rows = eligible_rows(yr)
        mult = realised_totals(yr)
        teams = player_team_week(yr)
        repro = curve(rows, mult, teams, strict=False)
        strict = curve(rows, mult, teams, strict=True)
        seasons[str(yr)] = {"reproduction": repro, "strict": strict}

        control["checks"].append({
            "what": f"{yr} eligible rows",
            "expected": CONTROL_ROWS[yr], "got": repro["n"],
            "ok": repro["n"] == CONTROL_ROWS[yr],
        })
        for lam in CONTROL_LAMBDAS:
            got = repro["delta_mae"][f"{lam:.2f}"]
            want = pub[(yr, lam)]
            control["checks"].append({
                "what": f"{yr} delta_mae @ lambda={lam}",
                "expected": want, "got": got,
                "ok": abs(got - want) <= CONTROL_TOL,
            })
    control["passed"] = all(c["ok"] for c in control["checks"])

    # VERDICT, by the prereg's table. Read only if the control passed.
    bests = {yr: seasons[str(yr)]["reproduction"]["best_lambda"] for yr in SEASONS}
    if not control["passed"]:
        verdict = "VOID"
    elif len(set(bests.values())) > 1:
        verdict = "DISAGREE"
    else:
        lam = float(next(iter(bests.values())))
        verdict = ("MONOTONE-TO-ZERO" if lam <= 0.05
                   else "AT-OR-ABOVE-1" if lam >= 1.0
                   else "INTERIOR")

    pooled = {
        f"{lam:.2f}": round(
            sum(seasons[str(y)]["reproduction"]["delta_mae"][f"{lam:.2f}"]
                for y in SEASONS), 4
        )
        for lam in LAMBDAS
    }
    result = {
        "_territory": "TERRITORY: D — produced by draft/backtest/oracle_lambda_sweep.py",
        "preregistration": "draft/backtest/ORACLE-LAMBDA-PREREG.md",
        "register": "18b",
        "status": "graded",
        "reproduction_control": control,
        "verdict": verdict,
        "best_lambda_by_season": bests,
        "pooled_delta_mae": pooled,
        "pooled_best_lambda": max(pooled, key=lambda k: pooled[k]),
        "published_pooled_at_0.5": round(sum(pub[(y, 0.5)] for y in SEASONS), 4),
        "seasons": seasons,
    }
    (HERE / "oracle_lambda_sweep.json").write_text(json.dumps(result, indent=1) + "\n")
    return result


if __name__ == "__main__":
    r = main()
    c = r["reproduction_control"]
    print("REPRODUCTION CONTROL:", "PASS" if c["passed"] else "FAIL")
    for chk in c["checks"]:
        print(f"  {'ok ' if chk['ok'] else 'FAIL'} {chk['what']}: "
              f"expected {chk['expected']}, got {chk['got']}")
    print()
    print(f"{'lambda':>7s} {'2023':>9s} {'2024':>9s} {'pooled':>9s}")
    for lam in LAMBDAS:
        k = f"{lam:.2f}"
        print(f"{k:>7s} "
              f"{r['seasons']['2023']['reproduction']['delta_mae'][k]:9.4f} "
              f"{r['seasons']['2024']['reproduction']['delta_mae'][k]:9.4f} "
              f"{r['pooled_delta_mae'][k]:9.4f}")
    print()
    print("VERDICT:", r["verdict"], "| best lambda by season:", r["best_lambda_by_season"])
    for yr in ("2023", "2024"):
        a = r["seasons"][yr]["reproduction"]["asymmetry"]
        for side, d in a.items():
            print(f"  {yr} {side:9s} n={d['n']:5d} best lambda={d['best_lambda']} "
                  f"delta={d['delta_mae'][d['best_lambda']]:+.4f}")

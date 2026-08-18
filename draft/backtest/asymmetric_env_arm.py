# TERRITORY: D
"""ASYMMETRIC ENVIRONMENT ARM — register 18b's design instruction, applied to a
FORECASTABLE signal. Preregistered in ASYMMETRIC-ENV-PREREG.md, committed
first. Result: asymmetric_env_arm.json.

18b measured, on a perfect game-total oracle, that a DUD game is worth 5-10x a
shootout and wants twice the damping. A single lambda is a compromise between
two regimes. This tests whether the two-sided form helps on a signal we could
actually ship: the Vegas line.

NO EGRESS. Lines from vegas_lines_2021_2026.json, outcomes from
nflverse_weekly_points_*, player->team from component_stats_*, and (control
only) realised totals from exp_weekly_env_features.json. All committed.

THE LEAK PROTOCOL IS THE DESIGN. A 64-cell grid on 5 seasons will find an
asymmetry whether or not one exists, so every quotable number here is
leave-one-season-out: the pair is fitted on the OTHER seasons and evaluated on
the held-out one. The symmetric baseline runs the identical protocol.

ABSENT STAYS ABSENT: a player-week with no team or no line is excluded and
counted, never given m = 1.0.

Run: python3 draft/backtest/asymmetric_env_arm.py
"""
from __future__ import annotations

import json
import random
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

PRIMARY = (2023, 2024, 2025)
SECONDARY = (2021, 2022)            # float32 fingerprint artifact; rebuilt_offline
ALL_SEASONS = SECONDARY + PRIMARY
ORACLE_SEASONS = (2023, 2024)       # what exp_weekly_env_features.json holds

FIRST_WEEK, LAST_WEEK = 5, 18
MIN_PRIOR, RELEVANCE_FLOOR = 3, 5.0
MIN_SURVIVAL = 0.90

GRID = (0.00, 0.15, 0.25, 0.35, 0.50, 0.65, 0.80, 1.00)

#: The preregistered bar, with a magnitude -- register 18's had none.
BAR_POOLED_GAIN = 0.010
BAR_MIN_POSITIVE_SEASONS = 4

#: THE PLACEBO, ADDED AFTER THE FIRST RUN AND DECLARED AS A DEVIATION.
#:
#: The prereg carried a known-positive gate (the oracle) and NO negative
#: control, and the first run came back large and positive against a stated
#: prior of "null", with lambda pinned to the grid CORNER (low=1.0, high=0.0)
#: in every fold and the symmetric baseline at exactly 0.0000.
#:
#: The mechanism that would produce exactly that without any information: the
#: baseline is a running mean of a right-skewed quantity, so it is biased HIGH,
#: and ANY rule that shrinks a subset of rows improves MAE. lambda_high = 0
#: says the arm ignores the signal whenever it points up -- which is what a
#: pure shrink rule looks like, not what an environment signal looks like.
#:
#: So: permute the team -> m assignment WITHIN each week. Same m distribution,
#: same shrink opportunity, zero information about which team. Anything the
#: real arm cannot beat here is bias correction wearing a signal's clothes.
PLACEBO_DRAWS = 60
PLACEBO_SEED = 20260818


# ── inputs ──────────────────────────────────────────────────────────────────

def _lines(season: int) -> list:
    doc = json.loads((HERE / "vegas_lines_2021_2026.json").read_text())
    return doc["seasons"][str(season)]


def multipliers(season: int, arm: str) -> dict:
    """{week: {team: m}} for a forecastable arm, normalised to that week's mean."""
    raw: dict[int, dict] = {}
    for g in _lines(season):
        wk = g["week"]
        if arm == "game_total":
            raw.setdefault(wk, {})[g["home"]] = g["total_line"]
            raw[wk][g["away"]] = g["total_line"]
        elif arm == "team_implied":
            home = g["total_line"] / 2.0 + g["spread_line"] / 2.0
            raw.setdefault(wk, {})[g["home"]] = home
            raw[wk][g["away"]] = g["total_line"] - home
        else:
            raise ValueError(arm)
    out = {}
    for wk, teams in raw.items():
        mean = sum(teams.values()) / len(teams)
        out[wk] = {t: v / mean for t, v in teams.items()} if mean else {}
    return out


def oracle_multipliers(season: int) -> dict:
    """CONTROL ONLY — realised game totals, the 18b construction."""
    doc = json.loads((HERE / "exp_weekly_env_features.json").read_text())
    raw: dict[int, dict] = {}
    for g in doc["seasons"][str(season)]:
        if g.get("points_for") is None:
            continue
        raw.setdefault(g["week"], {})[g["team"]] = g["points_for"] + g["points_against"]
    out = {}
    for wk, teams in raw.items():
        mean = sum(teams.values()) / len(teams)
        out[wk] = {t: v / mean for t, v in teams.items()} if mean else {}
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
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    points = {
        (wk["week"], str(pid)): float(p)
        for wk in doc["weeks"] for pid, p in wk["points"].items()
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


# ── evaluation ──────────────────────────────────────────────────────────────

def prepare(season: int, mult: dict) -> tuple[list, dict]:
    """[(baseline, actual, m)] with the join counted. Absent stays absent."""
    teams = player_team_week(season)
    rows = eligible_rows(season)
    kept, no_team, no_line = [], 0, 0
    for r in rows:
        team = teams.get((r["week"], r["pid"]))
        if not team:
            no_team += 1
            continue
        m = mult.get(r["week"], {}).get(team)
        if m is None:
            no_line += 1
            continue
        kept.append((r["baseline"], r["actual"], m))
    survival = round(len(kept) / max(len(rows), 1), 4)
    return kept, {
        "eligible_rows": len(rows), "joined": len(kept),
        "dropped_no_team": no_team, "dropped_no_line": no_line,
        "join_survival": survival, "fold_valid": survival >= MIN_SURVIVAL,
    }


def _mae(pairs) -> float:
    return sum(abs(p - a) for p, a in pairs) / len(pairs)


def delta_mae(prepared: list, lo: float, hi: float) -> float:
    """Baseline MAE minus the arm's, at a two-sided lambda."""
    base = _mae([(b, a) for b, a, _ in prepared])
    arm = _mae([(b * (1.0 + (lo if m <= 1.0 else hi) * (m - 1.0)), a)
                for b, a, m in prepared])
    return base - arm


def fit(prepared_by_season: dict, seasons, symmetric: bool) -> tuple:
    """argmax pooled delta over `seasons`. Symmetric = the diagonal only."""
    pairs = [(x, x) for x in GRID] if symmetric else [
        (lo, hi) for lo in GRID for hi in GRID
    ]
    best, best_val = None, None
    for lo, hi in pairs:
        val = sum(delta_mae(prepared_by_season[s], lo, hi) for s in seasons)
        if best_val is None or val > best_val:
            best, best_val = (lo, hi), val
    return best


def leave_one_out(prepared_by_season: dict, seasons: tuple) -> dict:
    """THE ONLY QUOTABLE NUMBERS. Fit on the others, evaluate on the held-out."""
    out = {}
    for s in seasons:
        others = tuple(x for x in seasons if x != s)
        if not others:
            continue
        a_lo, a_hi = fit(prepared_by_season, others, symmetric=False)
        s_lo, s_hi = fit(prepared_by_season, others, symmetric=True)
        asym = delta_mae(prepared_by_season[s], a_lo, a_hi)
        symm = delta_mae(prepared_by_season[s], s_lo, s_hi)
        out[str(s)] = {
            "fitted_on": list(others),
            "asymmetric_lambda": {"low": a_lo, "high": a_hi},
            "symmetric_lambda": s_lo,
            "delta_mae_asymmetric": round(asym, 4),
            "delta_mae_symmetric": round(symm, 4),
            "gain": round(asym - symm, 4),
        }
    return out


def judge(loo: dict) -> dict:
    gains = [v["gain"] for v in loo.values()]
    pooled = sum(gains) / len(gains) if gains else 0.0
    positive = sum(1 for g in gains if g > 0)
    return {
        "pooled_gain": round(pooled, 4),
        "seasons_positive": positive,
        "seasons_judged": len(gains),
        "bar_pooled_gain": BAR_POOLED_GAIN,
        "bar_min_positive": BAR_MIN_POSITIVE_SEASONS,
        "clears": pooled >= BAR_POOLED_GAIN and positive >= BAR_MIN_POSITIVE_SEASONS,
    }


def shuffled(mult: dict, rng: random.Random) -> dict:
    """Same multipliers, reassigned at random among that week's teams."""
    out = {}
    for wk, teams in mult.items():
        keys = list(teams)
        vals = [teams[k] for k in keys]
        rng.shuffle(vals)
        out[wk] = dict(zip(keys, vals))
    return out


def placebo(arm: str, seasons: tuple, real_gain: float) -> dict:
    """The negative control. Full LOO fit per draw -- a placebo that skips the
    fitting would be easier to beat than the real arm and prove nothing."""
    draws = []
    for i in range(PLACEBO_DRAWS):
        rng = random.Random(PLACEBO_SEED + i)
        prepared = {
            s: prepare(s, shuffled(multipliers(s, arm), rng))[0] for s in seasons
        }
        draws.append(judge(leave_one_out(prepared, seasons))["pooled_gain"])
    draws.sort()
    n_ge = sum(1 for d in draws if d >= real_gain)
    return {
        "draws": PLACEBO_DRAWS,
        "mean": round(st.mean(draws), 4),
        "sd": round(st.pstdev(draws), 4),
        "p95": round(draws[int(0.95 * len(draws))], 4),
        "max": round(max(draws), 4),
        "real_gain": round(real_gain, 4),
        "p_value": round((n_ge + 1) / (PLACEBO_DRAWS + 1), 4),
        "beats_p95": real_gain > draws[int(0.95 * len(draws))],
        # What the signal is actually worth once the shrink is priced out.
        "gain_net_of_placebo": round(real_gain - st.mean(draws), 4),
    }


def main() -> dict:
    # ── THE GATE: the oracle must show the asymmetry 18b already measured ──
    oracle_prepared = {s: prepare(s, oracle_multipliers(s))[0] for s in ORACLE_SEASONS}
    oracle_loo = leave_one_out(oracle_prepared, ORACLE_SEASONS)
    lo_gt_hi = all(v["asymmetric_lambda"]["low"] > v["asymmetric_lambda"]["high"]
                   for v in oracle_loo.values())
    beats = all(v["gain"] > 0 for v in oracle_loo.values())
    control = {
        "what": "identical machinery on the oracle signal; must fit low>high AND beat symmetric out of sample",
        "seasons": oracle_loo,
        "fits_low_above_high": lo_gt_hi,
        "beats_symmetric_out_of_sample": beats,
        "passed": lo_gt_hi and beats,
    }

    arms = {}
    for arm in ("game_total", "team_implied"):
        prepared, population = {}, {}
        for s in ALL_SEASONS:
            prepared[s], population[str(s)] = prepare(s, multipliers(s, arm))
        valid_primary = tuple(s for s in PRIMARY if population[str(s)]["fold_valid"])
        valid_all = tuple(s for s in ALL_SEASONS if population[str(s)]["fold_valid"])

        primary_loo = leave_one_out(prepared, valid_primary)
        all_loo = leave_one_out(prepared, valid_all)
        all_verdict = judge(all_loo)
        arms[arm] = {
            "population": population,
            "placebo": placebo(arm, valid_all, all_verdict["pooled_gain"]),
            "primary_2023_25": {"leave_one_out": primary_loo, "verdict": judge(primary_loo)},
            "all_five_seasons": {"leave_one_out": all_loo, "verdict": all_verdict},
            # emitted for inspection only; the prereg forbids any verdict reading it
            "in_sample": {
                "fitted_on_everything": fit(prepared, valid_all, symmetric=False),
                "note": "in_sample: true — NOT quotable, see ASYMMETRIC-ENV-PREREG.md",
            },
        }

    result = {
        "_territory": "TERRITORY: D — produced by draft/backtest/asymmetric_env_arm.py",
        "preregistration": "draft/backtest/ASYMMETRIC-ENV-PREREG.md",
        "register": "18b (design instruction), 18 (the store)",
        "status": "graded" if control["passed"] else "VOID",
        "gate_control": control,
        "arms": arms,
        "prior_stated_before_the_run": "I expect a null (ASYMMETRIC-ENV-PREREG.md)",
    }
    (HERE / "asymmetric_env_arm.json").write_text(json.dumps(result, indent=1) + "\n")
    return result


if __name__ == "__main__":
    r = main()
    c = r["gate_control"]
    print("GATE (oracle known-positive):", "PASS" if c["passed"] else "FAIL")
    for s, v in c["seasons"].items():
        print(f"   {s}: fitted low={v['asymmetric_lambda']['low']} "
              f"high={v['asymmetric_lambda']['high']} | asym {v['delta_mae_asymmetric']:+.4f} "
              f"vs sym {v['delta_mae_symmetric']:+.4f} (lambda={v['symmetric_lambda']}) "
              f"-> gain {v['gain']:+.4f}")
    print()
    for arm, d in r["arms"].items():
        print(f"── {arm} ──")
        for label in ("primary_2023_25", "all_five_seasons"):
            blk = d[label]
            print(f"  {label}:")
            for s, v in blk["leave_one_out"].items():
                print(f"    {s}: low={v['asymmetric_lambda']['low']} "
                      f"high={v['asymmetric_lambda']['high']} | asym {v['delta_mae_asymmetric']:+.4f} "
                      f"sym {v['delta_mae_symmetric']:+.4f} gain {v['gain']:+.4f}")
            ver = blk["verdict"]
            print(f"    prereg bar: clears={ver['clears']} pooled_gain={ver['pooled_gain']:+.4f} "
                  f"positive={ver['seasons_positive']}/{ver['seasons_judged']}")
        pl = d["placebo"]
        print(f"  PLACEBO ({pl['draws']} draws): mean {pl['mean']:+.4f} sd {pl['sd']:.4f} "
              f"p95 {pl['p95']:+.4f} max {pl['max']:+.4f}")
        print(f"  >> real {pl['real_gain']:+.4f}  p={pl['p_value']}  "
              f"beats_p95={pl['beats_p95']}  NET OF PLACEBO {pl['gain_net_of_placebo']:+.4f}")
    print()
    for arm, d in r["arms"].items():
        for s, p in d["population"].items():
            if not p["fold_valid"] or p["join_survival"] < 0.99:
                print(f"  join {arm} {s}: survival {p['join_survival']} "
                      f"(no_team {p['dropped_no_team']}, no_line {p['dropped_no_line']}) "
                      f"valid={p['fold_valid']}")

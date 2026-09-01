#!/usr/bin/env python3
# TERRITORY: D
"""WHICH PLAYERS CAN THE SOURCE GRADE ACTUALLY SPEAK ABOUT, OVER WHICH DAYS.

── WHY THIS EXISTS ────────────────────────────────────────────────────────────

`proj_series.json` is frozen so that in January 2027 we can ask which projection
source was closest, on this league's scoring, on the same players. The obvious
way to write that grade is to intersect the players present on every day in the
window — which is correct, and which is also how a systematic hole becomes
invisible: the intersection just gets smaller and nothing says why.

It has already happened once. `build.py:_update_proj_series` read
`artifact["players"]` alone, and the keeper lock MOVES a player into
`kept_players`, so from 2026-08-22 the archive carried NO row for the
twenty-three best players in the league — on BOTH sources, since `fp_by_id` was
built from the same list. Eight capture-days: 08-22, 08-25, 08-26, 08-27, 08-28,
08-29, 08-30, 08-31. Register 444; fixed 08-31, and 09-01 archives them again.

THE FIX DOES NOT UNDO THOSE EIGHT DAYS. A preseason projection is observable only
before the season and a retroactive fetch leaks (exp33), so a grade over that
window is scored on whatever is left — and what is left is the TAIL, because the
missing cohort is the highest-projection players there are. That is the worst
direction a sampling bias can point, and a grader who simply intersects will
never see it.

So: measure the hole, do not remember it. Nothing here hardcodes a date or a
name. Hand it a cohort and it reports the contiguous runs of days on which NONE
of that cohort appears, plus what the exclusion does to the population's shape.

    python3 draft/tools/proj_series_gradeable.py           # report + controls
    python3 draft/tools/proj_series_gradeable.py --json

    from proj_series_gradeable import gradeable, systematic_absences
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SERIES = ROOT / "draft" / "data" / "proj_series.json"
BOARD = ROOT / "public" / "draft_data.json"


def population_by_day(series, source) -> dict[str, set[str]]:
    return {r["date"]: set(r["proj"]) for r in series if r["source"] == source}


def proj_by_day(series, source) -> dict[str, dict[str, float]]:
    return {r["date"]: r["proj"] for r in series if r["source"] == source}


def gradeable(series, source, start=None, end=None) -> set[str]:
    """The players a grade over [start, end] can honestly speak about: present
    on EVERY captured day in the window. Returns the empty set for an empty
    window rather than raising — a grade over no days grades nobody."""
    days = {d: p for d, p in population_by_day(series, source).items()
            if (start is None or d >= start) and (end is None or d <= end)}
    if not days:
        return set()
    out = None
    for pop in days.values():
        out = pop if out is None else (out & pop)
    return out or set()


def systematic_absences(series, source, cohort: set[str]):
    """Contiguous runs of captured days on which NOT ONE member of `cohort`
    appears. A run, not a count: one missing day is churn, and eight in a row is
    a writer that stopped looking at a whole population."""
    days = sorted(population_by_day(series, source).items())
    runs, cur = [], []
    for date, pop in days:
        if cohort and not (cohort & pop):
            cur.append(date)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return runs


def shape_of_exclusion(series, source, window_days, cohort):
    """What does losing the cohort do to the population being graded? Reported
    as the projection distribution, because 'we lost 23 of 700' and 'we lost the
    top 23 of 700' are the same count and not remotely the same bias.

    ⚠️ THE COHORT'S OWN NUMBERS CANNOT COME FROM THE WINDOW — that is the whole
    problem: over a blind window the archive holds nothing for them, so the
    first version of this function reported `excluded_cohort n=0` and quantified
    precisely nothing. They are read instead from the NEAREST captured day that
    does carry them, which is stated in the output rather than smuggled: it is a
    fair estimate of what was lost, not a measurement of the lost rows
    themselves, and those rows are unrecoverable by construction (exp33).
    """
    pbd = proj_by_day(series, source)
    graded = [v for d in window_days
              for pid, v in (pbd.get(d) or {}).items() if pid not in cohort]

    nearest, cohort_vals = None, []
    for d in sorted(pbd, reverse=True):
        vals = [v for pid, v in pbd[d].items() if pid in cohort]
        if vals:
            nearest, cohort_vals = d, vals
            break

    def stat(xs):
        return {"n": len(xs), "mean": round(sum(xs) / len(xs), 2) if xs else None,
                "max": round(max(xs), 2) if xs else None}
    return {"graded": stat(graded),
            "excluded_cohort": stat(cohort_vals),
            "cohort_priced_from": nearest,
            "cohort_rows_actually_in_window": 0}


def board_keepers() -> set[str]:
    if not BOARD.exists():
        return set()
    b = json.loads(BOARD.read_text())
    return {p["player_id"] for p in b.get("kept_players", []) if p.get("player_id")}


def controls(series, keepers) -> tuple[bool, list[str]]:
    lines, ok = [], True

    def chk(label, cond, detail=""):
        nonlocal ok
        lines.append(f"  {'PASS' if cond else 'FAIL'}  {label}"
                     + (f" — {detail}" if detail and not cond else ""))
        ok = ok and bool(cond)

    chk("C0 the board still has a keeper slate, or every arm below is vacuous",
        len(keepers) >= 2, f"{len(keepers)} keepers")
    if len(keepers) < 2:
        return ok, lines

    # C1 KNOWN-POSITIVE — register 444, MEASURED rather than remembered. If the
    # writer bug ever returns, this run grows and the tool says so.
    runs = systematic_absences(series, "sleeper", keepers)
    flat = [d for r in runs for d in r]
    chk("C1 the register-444 keeper-blind run is found on sleeper",
        any(len(r) >= 5 for r in runs), f"runs: {runs}")
    chk("C1 it starts on the keeper-lock date, 2026-08-22",
        flat and flat[0] == "2026-08-22", f"first blind day {flat[:1]}")
    chk("C1 and it has ENDED — the fix landed, so the newest day is not blind",
        sorted(population_by_day(series, "sleeper"))[-1] not in flat,
        f"latest day {sorted(population_by_day(series, 'sleeper'))[-1]} still blind")

    # C2 THE SAME HOLE ON THE SECOND SOURCE. The 2027 grade compares sources on
    # the SAME players, so a hole present on only one of them would be a
    # different and much smaller problem. It is on both.
    fp_runs = systematic_absences(series, "fantasypros", keepers)
    chk("C2 the hole is on FantasyPros too, which is why the grade loses the "
        "comparison and not just one arm",
        any(len(r) >= 5 for r in fp_runs), f"runs: {fp_runs}")

    # C3 KNOWN-NEGATIVE, and it cannot be cherry-picked: a cohort built FROM the
    # newest day's own population must never look systematically absent.
    days = population_by_day(series, "sleeper")
    newest = days[sorted(days)[-1]]
    always = set(list(gradeable(series, "sleeper"))[:5]) or set(list(newest)[:5])
    chk("C3 a cohort present on every day shows no absence run at all",
        systematic_absences(series, "sleeper", always) == [],
        str(systematic_absences(series, "sleeper", always)))

    # C4 THE MECHANISM THE GRADE WOULD MISS: intersecting silently drops them.
    if flat:
        win = gradeable(series, "sleeper", flat[0], flat[-1])
        chk("C4 a grade over the blind window excludes every keeper WITHOUT "
            "anything saying so — which is the bias this tool exists to surface",
            not (win & keepers), f"{len(win & keepers)} keepers survived")
    return ok, lines


def main(argv) -> int:
    series = json.loads(SERIES.read_text())["series"]
    keepers = board_keepers()
    ok, control_lines = controls(series, keepers)

    runs = systematic_absences(series, "sleeper", keepers)
    flat = [d for r in runs for d in r]
    report = {
        "_territory": "TERRITORY: D — proj_series_gradeable.py",
        "_what": "Which players a source grade over a date window can honestly "
                 "speak about, and which cohorts are systematically absent.",
        "controls_all_passed": ok,
        "keeper_blind_runs": {"sleeper": runs,
                              "fantasypros": systematic_absences(series, "fantasypros", keepers)},
        "shape_over_the_blind_window": shape_of_exclusion(series, "sleeper", flat, keepers) if flat else None,
    }
    if "--json" in argv:
        print(json.dumps(report, indent=1))
    else:
        print(f"■ KEEPER-BLIND RUNS ({len(keepers)} keepers on the board)")
        for src, rs in report["keeper_blind_runs"].items():
            for r in rs:
                print(f"  {src:12} {len(r):2} captured days blind: {r[0]} .. {r[-1]}")
            if not rs:
                print(f"  {src:12} none")
        if flat:
            sh = report["shape_over_the_blind_window"]
            print(f"\n■ WHAT A GRADE OVER {flat[0]}..{flat[-1]} WOULD ACTUALLY SCORE")
            g, x = sh["graded"], sh["excluded_cohort"]
            print(f"  graded            n={g['n']:6}  mean {g['mean']:>7}  max {g['max']}")
            print(f"  excluded cohort   n={x['n']:6}  mean {x['mean']:>7}  max {x['max']}"
                  f"   (priced from {sh['cohort_priced_from']} — they have NO rows in the window)")
            if g["mean"] and x["mean"]:
                print(f"  ⚠️  the excluded cohort projects {x['mean'] / g['mean']:.1f}x the graded mean. "
                      "A grade over this window is scored on the tail — say so, or exclude the window.")
        print("\nCONTROLS")
        for l in control_lines:
            print(l)
        print("  " + ("ALL PASS" if ok else "FAILED — the report above is not trustworthy"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

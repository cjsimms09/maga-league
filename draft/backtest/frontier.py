#!/usr/bin/env python3
"""EXPERIMENT 21 — THE MEAN-VARIANCE FRONTIER POINT (+ exp 2's phase-shape slice).

The money-term sweep with real install potential: build the efficient frontier
(projected points vs roster variance) and locate where E[$] peaks on it under
OUR payouts. Pre-registered hypothesis: the optimum sits meaningfully toward
the HIGH-VARIANCE corner vs the low-variance point standard leagues favor —
because $1,500/season rides on weekly highs, which floors never win.

Subsumes the ceiling dose-response (exp 7) and carries exp 2's §5 phase-shape
slice: the same ceiling tilt swept FLAT vs LATE-RAMP vs EARLY-RAMP, racing the
hypothesis that late-round boom-chasing is where variance pays.

Machinery: the 19b paired-room race, re-aimed. Candidates differ ONLY in the
pick rule's ceiling tilt λ (score = vorp + λ·(ceiling−mean), per phase shape);
candidate + control share every room AND every week's luck, so deltas isolate
the variance posture. Same v1 money proxy, same caveats, same September
quantile re-run pre-registration. INSTALL RULE UNTOUCHED: a winning λ is
reported with its CI; it enters the engine only through the pre-registered
gates (and the engine's ceiling term is a WEIGHT, so an install is a slider
change through the normal cited-constant path, not new code).

Run: python draft/backtest/frontier.py  → FRONTIER.{md,json}
"""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path

import cory_conditional as CC

HERE = Path(__file__).resolve().parent
SEED = CC.SEED


def verdict_for(lo: float, hi: float, mean: float) -> str:
    """THE LABEL MUST MATCH THE INTERVAL — same fix as cory_conditional.py:517.

    This read `lo <= 0`, which is true of ANY negative lower bound — so a
    candidate sitting ENTIRELY below zero was reported as "CI includes $0",
    i.e. as inconclusive. The shipped frontier.json carried exactly that:
    flat_l2.0 at [-109.33, -25.5] and flat_l3.0 at [-134.83, -44.5], both
    confident LOSSES filed as "we could not tell" — the one reading that keeps
    them on the table. Zero is inside [lo, hi] only when lo <= 0 <= hi.
    """
    if lo > 0 and mean > CC.EVEN_MONEY_BAND:
        return "WINNER — install via the gates (slider change, cited)"
    if hi < 0:
        return "LOSER — significantly worse than the control"
    if lo <= 0 <= hi:
        return "parked: CI includes $0"
    return f"parked: inside the ${CC.EVEN_MONEY_BAND} band"


def make_candidates():
    """{name: chooser(board, liveIdx, roster)} — ceiling tilt × phase shape."""
    def tilt(lam, phase):
        def ramp(i):
            if phase == "flat":
                return lam
            if phase == "late":                    # §5 H1: boom-chase late
                return lam * (0.0 if i <= 4 else 1.0)
            return lam * (1.0 if i <= 4 else 0.0)  # early: boom-chase early
        def chooser(board, i, roster):
            # draft_room contract: a chooser returns the ALLOWED BOARD and the
            # room takes max-VORP from it — so a re-scoring chooser returns a
            # one-element board holding its λ-tilted argmax.
            l = ramp(i)
            best = max(board, key=lambda p: p["vorp"] + l * (p["proj_ceiling"] - p["proj_mean"]))
            return [best]
        return chooser
    cands = {"control_l0": tilt(0.0, "flat")}
    for lam in (0.25, 0.5, 1.0, 2.0, 3.0):
        cands[f"flat_l{lam}"] = tilt(lam, "flat")
    cands["late_l1.0"] = tilt(1.0, "late")
    cands["early_l1.0"] = tilt(1.0, "early")
    return cands


def race(n_rooms=200, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    cands = make_candidates()
    per_seed = {k: [] for k in cands}
    frontier = {k: [] for k in cands}     # (weekly mean, weekly sd) of my roster
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        rosters_by = {}
        for k, chooser in cands.items():
            r = random.Random(); r.setstate(opp_state)
            rosters_by[k] = CC.draft_room(pool, my_keepers, opp_keepers, my_picks,
                                          lambda b, i, ro, ch=chooser: ch(b, i, ro), r)
        grade_state = random.Random(seed * 7 + s).getstate()
        for k, rosters in rosters_by.items():
            g = random.Random(); g.setstate(grade_state)
            per_seed[k].append(CC.grade_room(rosters, g)["total"])
            frontier[k].append(CC.team_week_params(rosters[0]))
    return per_seed, frontier


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rooms", type=int, default=200)
    ap.add_argument("--out", default=str(HERE / "frontier.json"))
    ap.add_argument("--report", default=str(HERE / "FRONTIER.md"))
    args = ap.parse_args()
    per_seed, frontier = race(args.rooms)
    ctrl = per_seed["control_l0"]
    rng = random.Random(SEED + 7)
    rows = []
    for k in per_seed:
        if k == "control_l0":
            continue
        deltas = [a - b for a, b in zip(per_seed[k], ctrl)]
        mean = sum(deltas) / len(deltas)
        lo, hi = CC.bootstrap_ci(deltas, rng)
        fm = sum(f[0] for f in frontier[k]) / len(frontier[k])
        fs = sum(f[1] for f in frontier[k]) / len(frontier[k])
        rows.append({"candidate": k, "mean_edge": round(mean, 2),
                     "ci95": [round(lo, 2), round(hi, 2)],
                     "weekly_mean": round(fm, 1), "weekly_sd": round(fs, 1),
                     "verdict": verdict_for(lo, hi, mean)})
    rows.sort(key=lambda r: -r["mean_edge"])
    f0m = sum(f[0] for f in frontier["control_l0"]) / len(frontier["control_l0"])
    f0s = sum(f[1] for f in frontier["control_l0"]) / len(frontier["control_l0"])
    peak = rows[0] if rows else None
    high_var = bool(peak and peak["weekly_sd"] > f0s and peak["mean_edge"] > 0)
    result = {"experiment": "21 mean-variance frontier point (+ exp 2 phase-shape slice)",
              "rooms": args.rooms, "seed": SEED,
              "control": {"weekly_mean": round(f0m, 1), "weekly_sd": round(f0s, 1)},
              "leaderboard": rows,
              "h1_high_variance_corner": high_var,
              "caveats": CC and [
                  "v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded)",
                  "predicted opponent slates; paired rooms + paired weekly luck",
                  "September quantile re-run pre-registered; install only via the gates",
              ]}
    Path(args.out).write_text(json.dumps(result, indent=1))
    L = ["# EXPERIMENT 21 — MEAN-VARIANCE FRONTIER (+ phase-shape slice of exp 2)", "",
         f"_control λ=0: weekly mean {f0m:.1f}, sd {f0s:.1f} · {args.rooms} paired rooms · "
         f"**H1 (optimum toward the high-variance corner): {'SUPPORTED' if high_var else 'NOT SUPPORTED'}**_",
         "", "| candidate | edge $ | 95% CI | weekly mean | weekly sd | verdict |", "|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['candidate']} | {r['mean_edge']:+.2f} | [{r['ci95'][0]}, {r['ci95'][1]}] "
                 f"| {r['weekly_mean']} | {r['weekly_sd']} | {r['verdict']} |")
    L += ["", "**Caveats:** " + " · ".join(result["caveats"]), ""]
    Path(args.report).write_text("\n".join(L))
    for r in rows:
        print(f"{r['candidate']:12s} {r['mean_edge']:+8.2f} CI[{r['ci95'][0]:>7},{r['ci95'][1]:>7}] "
              f"sd {r['weekly_sd']:>5}  {r['verdict']}")
    print(f"H1 high-variance corner: {'SUPPORTED' if high_var else 'NOT SUPPORTED'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

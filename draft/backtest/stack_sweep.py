#!/usr/bin/env python3
"""EXPERIMENT 6 — STACK / CORRELATION DOSE-RESPONSE (LAB-REGISTRY exp 6).

Pre-registered question: sweep the stack bonus 0→3× and find where the
high-pool gain stops paying for the floor cost. Correlated starters raise the
CEILING of a weekly score (they boom together) while raising its variance —
which is exactly the trade the weekly-high pool pays for and the H2H record
punishes. So the answer is a dose, not a direction.

Runnable the moment the room carried team codes; fired 2026-08-08 under the
standing auto-fire rule. Same paired rooms as 19b/21/2 — candidate and control
share every room AND every week's luck — so deltas isolate the stack bonus.

Money grade adds the correlation the bonus is BUYING: teammates' weekly scores
share a team-level shock (rho applied through a common factor), so a stacked
roster genuinely booms and busts together rather than being scored as if
independent — otherwise the sweep would price a benefit it never simulated.

Run: python draft/backtest/stack_sweep.py → STACK-SWEEP.{md,json}
"""
from __future__ import annotations
import argparse
import json
import math
import random
from pathlib import Path

import cory_conditional as CC

HERE = Path(__file__).resolve().parent
SEED = CC.SEED
RHO = 0.35          # within-team weekly correlation (the shared game script)
DOSES = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0]


def verdict_for(lo: float, hi: float, mean: float) -> str:
    """THE LABEL MUST MATCH THE INTERVAL — the third instance of this bug.

    `frontier.py` and `cory_conditional.py` were both fixed for saying
    "CI includes $0" about intervals that do not include zero. This file had the
    same defect from the OTHER side and was missed by both fixes: it carried only
    THREE branches, so the fall-through read

        WINNER if lo > 0 and mean > BAND
        else HARMFUL if hi < 0
        else "parked: CI includes $0"

    and a dose with `lo > 0` but a mean inside the even-money band lands on that
    last branch. Its interval is entirely ABOVE zero. The label says zero is
    inside it. Same false claim as the frontier bug, reached by walking off the
    positive end instead of the negative one — which is why grepping for the
    fixed predicate `lo <= 0 <= hi` did not find it: the predicate here was
    missing, not wrong.

    LATENT, NOT MANIFEST, and worth saying so: all five rows of the shipped
    `stack-sweep.json` are decisive winners (CIs from +266 to +540), so this
    branch has never fired on real output. It is a correctness fix, not a
    correction to a published number.

    Four branches, matching frontier.verdict_for. Zero is inside [lo, hi] only
    when lo <= 0 <= hi; everything else is a real verdict.
    """
    if lo > 0 and mean > CC.EVEN_MONEY_BAND:
        return "WINNER — dose pays"
    if hi < 0:
        return "HARMFUL — CI excludes 0 below"
    if lo <= 0 <= hi:
        return "parked: CI includes $0"
    return f"parked: inside the ${CC.EVEN_MONEY_BAND} even-money band"


def stack_chooser(dose):
    """VORP + dose × (stack bonus): a candidate sharing a team with someone I
    already roster is worth more, scaled by the dose under test."""
    def chooser(board, i, roster):
        mine = {}
        for p in roster:
            mine[p.get("team") or "FA"] = mine.get(p.get("team") or "FA", 0) + 1
        def sc(p):
            t = p.get("team") or "FA"
            bonus = 0.0
            if t != "FA" and mine.get(t):
                # the bonus is a fraction of the player's own ceiling spread —
                # correlation is worth more on boomy players, which is the point
                bonus = dose * 0.35 * (p["proj_ceiling"] - p["proj_mean"]) * min(mine[t], 2)
            return p["vorp"] + bonus
        return [max(board, key=sc)]
    return chooser


def team_params_correlated(roster):
    """Best lineup + its team composition, for correlated weekly simulation."""
    mean, sd = CC.team_week_params(roster)
    by_team = {}
    for p in roster:
        by_team[p.get("team") or "FA"] = by_team.get(p.get("team") or "FA", 0) + 1
    # Effective sd rises with concentration: independent sum vs correlated sum.
    n = max(1, len(roster))
    conc = sum(c * (c - 1) for c in by_team.values()) / (n * max(1, n - 1))
    eff = sd * math.sqrt(1 + RHO * conc * (n - 1))
    return mean, eff


def grade_room_corr(rosters, rng):
    params = {t: team_params_correlated(r) for t, r in rosters.items()}
    totals = {t: 0.0 for t in rosters}
    my_wk = 0
    for _ in range(CC.WEEKS):
        scores = {t: rng.gauss(m, sd) for t, (m, sd) in params.items()}
        if max(scores, key=lambda t: scores[t]) == 0:
            my_wk += CC.WEEKLY_HIGH
        for t in totals:
            totals[t] += scores[t]
    # Same postseason as every other room grader — playoff $ is 53% of the pot,
    # and a stack's whole thesis is correlated upside, which is exactly what a
    # two-week single-elimination bracket pays for. Grading it without the
    # bracket measured stacking on the half of the money least suited to it.
    rs, po, _place = CC.postseason_dollars(params, totals, rng)
    return my_wk + rs + po


def race(n_rooms, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    grades = {d: [] for d in DOSES}
    stacked = {d: [] for d in DOSES}
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        grade_state = random.Random(seed * 7 + s).getstate()
        for d in DOSES:
            r = random.Random(); r.setstate(opp_state)
            rosters = CC.draft_room(pool, my_keepers, opp_keepers, my_picks,
                                    stack_chooser(d), r)
            g = random.Random(); g.setstate(grade_state)
            grades[d].append(grade_room_corr(rosters, g))
            by_team = {}
            for p in rosters[0]:
                by_team[p.get("team") or "FA"] = by_team.get(p.get("team") or "FA", 0) + 1
            stacked[d].append(max(by_team.values()) if by_team else 0)
    return grades, stacked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rooms", type=int, default=150)
    ap.add_argument("--out", default=str(HERE / "stack-sweep.json"))
    ap.add_argument("--report", default=str(HERE / "STACK-SWEEP.md"))
    args = ap.parse_args()
    grades, stacked = race(args.rooms)
    rng = random.Random(SEED + 21)
    ctrl = grades[0.0]
    rows = []
    for d in DOSES:
        if d == 0.0:
            continue
        deltas = [a - b for a, b in zip(grades[d], ctrl)]
        mean = sum(deltas) / len(deltas)
        lo, hi = CC.bootstrap_ci(deltas, rng)
        rows.append({"dose": d, "edge": round(mean, 2), "ci95": [round(lo, 2), round(hi, 2)],
                     "max_same_team": round(sum(stacked[d]) / len(stacked[d]), 2),
                     "verdict": verdict_for(lo, hi, mean)})
    best = max(rows, key=lambda r: r["edge"]) if rows else None
    pays = [r for r in rows if r["verdict"].startswith("WINNER")]
    result = {"experiment": "6 — stack/correlation dose-response", "rooms": args.rooms,
              "rho_within_team": RHO, "control_dose": 0.0, "leaderboard": rows,
              "where_it_stops_paying": (max(r["dose"] for r in pays) if pays else None),
              "caveats": ["v1 money proxy + a modeled within-team correlation (rho=0.35) —"
                          " the sweep prices a benefit it actually simulates",
                          "paired rooms + paired weekly luck; predicted opponent slates",
                          "September quantile re-run pre-registered; nothing installs itself"]}
    Path(args.out).write_text(json.dumps(result, indent=1))
    L = ["# EXPERIMENT 6 — STACK / CORRELATION DOSE-RESPONSE", "",
         f"_{args.rooms} paired rooms · within-team weekly correlation rho={RHO} · control = no stack bonus_",
         "", "| dose | edge $ | 95% CI | max same-team | verdict |", "|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['dose']}× | {r['edge']:+.2f} | [{r['ci95'][0]}, {r['ci95'][1]}] "
                 f"| {r['max_same_team']} | {r['verdict']} |")
    L += ["", f"**Where the high-pool gain stops paying:** "
          + (f"dose {result['where_it_stops_paying']}× is the largest that clears; beyond it the floor cost wins."
             if pays else "NO dose cleared the paired CI + even-money band — the stack bonus does not pay in this economy at this rho."),
          "", "**Caveats:** " + " · ".join(result["caveats"])]
    Path(args.report).write_text("\n".join(L))
    for r in rows:
        print(f"dose {r['dose']}x {r['edge']:+8.2f} CI[{r['ci95'][0]:>7},{r['ci95'][1]:>7}] "
              f"maxteam {r['max_same_team']:<5} {r['verdict']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

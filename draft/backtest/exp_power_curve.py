#!/usr/bin/env python3
# TERRITORY: A
"""THE SHAPE OF OUR BLINDNESS — what size of edge can this design actually detect?

THE QUESTION (Cory, 2026-08-11). The 7.8-points-per-week figure is a minimum
detectable effect for ONE comparison. A curve tells us something different and
more useful: it separates two findings that currently look identical in every
report — "these strategies are probably genuinely similar" and "our experiment
lacks the power to tell". Those are different sentences and we have been writing
one of them for both.

THE CIRCULARITY TRAP, WHICH IS THE WHOLE RISK. If the outcome model is built
from the same measurements a strategy encodes, the power curve measures our own
priors reflecting back — the fixture-derived-from-the-thing-under-test problem,
raised from a test to an experiment. So the generator is the league's OWN
REALIZED starter-week scores (4,860 of them, 2023-25: mean 12.16, sd 8.57).
Those are what happened. They embed the league's scoring rules and roster shape,
which is required, and they embed no projection, no weight vector, and no
strategy. The injected edge is a free parameter, not a fitted one.

WHAT IS SIMULATED. A season of 14 weeks, 9 starters. Two strategies that agree
on most slots and differ on some; where they differ, A's man is drawn with a
true advantage of `d` points and B's without it. Everything else is shared, so
the shared part cancels exactly as it does in reality.

FOUR EVALUATION ARCHITECTURES, because the question is not only "how big must
the edge be" but "does a better design see more":

  season_total   one number per strategy per season. What a naive report does.
  paired_weekly  the 14 weekly differences, INCLUDING the zeros from weeks they
                 agreed. This is what the 7.8 figure came from.
  paired_decision only the decisions where they differed. Cory's route 2/3.
  decision_iid   the same decisions treated as INDEPENDENT samples. Included
                 precisely because it is WRONG, so the false precision it buys
                 can be measured rather than argued about.

Run: python3 draft/backtest/exp_power_curve.py [--trials 4000]
"""
from __future__ import annotations

import json
import math
import os
import random
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

WEEKS = 14
STARTERS = 9
ALPHA = 0.05


def empirical_starter_pool():
    """Every realized starter-week in the league's history. NOT a fitted curve:
    resampling the actual scores keeps the real skew (a 40-point week is rare and
    a 2-point week is not) that a normal would smooth away, and smoothing it away
    would flatter every design tested here."""
    p = os.path.join(ROOT, "draft", "data", "league_history.json")
    with open(p, encoding="utf-8") as fh:
        d = json.load(fh)
    out = []
    for s in d.get("seasons") or []:
        for _wk, rows in (s.get("weeks") or {}).items():
            if not isinstance(rows, list):
                continue
            for r in rows:
                for x in (r.get("starters_points") or []):
                    if x is not None:
                        out.append(float(x))
    return out


def simulate_season(pool, rng, d, p_differ, rho=0.0):
    """rho > 0 injects the DEPENDENCE route 3 warns about.

    THE FIRST VERSION OF THIS FILE COULD NOT ANSWER ROUTE 3 AT ALL, and said it
    could. It drew every decision independently, so `paired_decision` held a ~5%
    false-positive rate BY CONSTRUCTION — the simulation had assumed away the
    exact thing the route is dangerous for. A design that cannot fail the test it
    is running is the fixture-derived-from-the-thing-under-test problem wearing a
    different hat.

    So a shared per-week shock is added: every decision in a week moves together
    by `rho` of a common draw (a slate, a weather day, an opponent's defence, a
    Sunday where everyone's RBs disappoint). That is the correlation that makes N
    decisions worth fewer than N samples, and with it the iid t-test can be
    measured rather than argued about."""
    """One season. Returns (weekly_diffs, decision_diffs).

    weekly_diffs  : 14 numbers, zero on weeks the strategies agreed
    decision_diffs: one number per DECISION they disagreed about
    """
    weekly, decisions = [], []
    mu = st.mean(pool)
    for _w in range(WEEKS):
        wk = 0.0
        # The week's common shock, in the same units as a player's score.
        shock = (rng.choice(pool) - mu) if rho else 0.0
        for _s in range(STARTERS):
            if rng.random() >= p_differ:
                continue                     # same man: contributes exactly 0
            a = rng.choice(pool) + d         # A's pick carries the true edge
            b = rng.choice(pool)
            # THE SHOCK HITS EVERY DECISION IN THE WEEK IN THE SAME DIRECTION.
            # That is what correlation MEANS, and the first version of this line
            # multiplied it by a random +/-1 PER DECISION — which makes it
            # independent noise, not a shared shock. Decisions never moved
            # together, so the false-positive rate stayed flat at ~5% across
            # every rho and read exactly like "correlation does not inflate
            # anything". A probe that cannot detect the thing it was built to
            # detect, reporting a null that was its own construction. Fifth
            # instance of that shape today and the third that was mine.
            diff = (a - b) + rho * shock
            wk += diff
            decisions.append(diff)
        weekly.append(wk)
    return weekly, decisions


def t_detect(xs, alpha=ALPHA):
    """One-sample t against 0, two-sided. True when the design would REPORT an
    effect. Small-n t critical values rather than 1.96 — at n=8 the difference is
    the whole answer."""
    n = len(xs)
    if n < 2:
        return False
    m, sd = st.mean(xs), st.pstdev(xs) * math.sqrt(n / (n - 1)) if n > 1 else 0.0
    if sd == 0:
        return m != 0
    t = m / (sd / math.sqrt(n))
    return abs(t) > _tcrit(n - 1, alpha)


_TCRIT = {1: 12.71, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
          8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 13: 2.160, 15: 2.131,
          20: 2.086, 30: 2.042, 60: 2.000, 120: 1.980}


def _tcrit(df, alpha=ALPHA):
    if df <= 0:
        return 1e9
    ks = sorted(_TCRIT)
    for k in ks:
        if df <= k:
            return _TCRIT[k]
    return 1.96


def block_bootstrap_detect(weekly, rng, reps=400, alpha=ALPHA):
    """Resample WEEKS, not decisions. The honest handling of the dependence route
    3 warns about: decisions inside a week share an opponent, a slate and a set of
    injuries, so the week is the independent unit. Detection = the CI excluding 0."""
    n = len(weekly)
    if n < 2:
        return False
    means = []
    for _ in range(reps):
        means.append(st.mean([weekly[rng.randrange(n)] for _ in range(n)]))
    means.sort()
    lo = means[int(reps * alpha / 2)]
    hi = means[int(reps * (1 - alpha / 2)) - 1]
    return not (lo <= 0 <= hi)


def power(pool, d, p_differ, trials, seed=12345, rho=0.0):
    rng = random.Random(seed)
    hit = {"paired_weekly": 0, "paired_decision": 0, "block_boot": 0}
    ndec = []
    for _ in range(trials):
        weekly, decisions = simulate_season(pool, rng, d, p_differ, rho=rho)
        ndec.append(len(decisions))
        if t_detect(weekly):
            hit["paired_weekly"] += 1
        if t_detect(decisions):
            hit["paired_decision"] += 1
        if block_bootstrap_detect(weekly, rng, reps=200):
            hit["block_boot"] += 1
    return {k: v / trials for k, v in hit.items()}, (st.mean(ndec) if ndec else 0)


def main() -> int:
    trials = 2000
    for i, a in enumerate(sys.argv):
        if a == "--trials" and i + 1 < len(sys.argv):
            trials = int(sys.argv[i + 1])
    pool = empirical_starter_pool()
    print("=" * 78)
    print("POWER CURVE — what edge can this design detect?")
    print("=" * 78)
    print(f"generator: {len(pool)} REALIZED starter-weeks (2023-25), "
          f"mean {st.mean(pool):.2f} sd {st.pstdev(pool):.2f}")
    print(f"season: {WEEKS} weeks x {STARTERS} starters · {trials} simulated seasons per cell")
    print("edge d = extra points per DISAGREED slot for strategy A")
    print()

    # Disagreement rates spanning the plausible range. 0.7% is the measured
    # opponent-dossier flip; 5% and 20% are generous.
    for p_differ in (0.007, 0.05, 0.20):
        print(f"── strategies differ on {p_differ*100:.1f}% of slots "
              + "─" * 34)
        print("   d/slot   d/week    paired_weekly   paired_decision   block_boot   n_dec")
        for d in (0.5, 1.0, 2.0, 4.0, 8.0, 16.0):
            pw, ndec = power(pool, d, p_differ, trials)
            per_week = d * p_differ * STARTERS
            print("   %6.1f  %7.2f    %11.0f%%   %13.0f%%   %9.0f%%   %5.1f"
                  % (d, per_week, pw["paired_weekly"] * 100,
                     pw["paired_decision"] * 100, pw["block_boot"] * 100, ndec))
        print()

    # FALSE POSITIVE RATE — the number that decides whether a route is honest.
    print("── FALSE POSITIVES at a TRUE edge of zero " + "─" * 33)
    print("   (anything above ~5% is a design that manufactures findings)")
    for p_differ in (0.007, 0.05, 0.20):
        pw, ndec = power(pool, 0.0, p_differ, trials)
        print("   differ %5.1f%%   paired_weekly %4.1f%%   paired_decision %4.1f%%   "
              "block_boot %4.1f%%   n_dec %.1f"
              % (p_differ * 100, pw["paired_weekly"] * 100,
                 pw["paired_decision"] * 100, pw["block_boot"] * 100, ndec))
    # ── ROUTE 3, MEASURED RATHER THAN ARGUED ────────────────────────────────
    print()
    print("── THE CORRELATION ROUTE 3 WARNS ABOUT, at a TRUE edge of ZERO " + "─" * 12)
    print("   decisions inside a week share a slate. rho is how much of a common")
    print("   shock rides on each decision. Any FPR above ~5% is manufactured.")
    print("   rho   n_dec   paired_decision(iid)   paired_weekly   block_boot")
    for rho in (0.0, 0.3, 0.6, 1.0):
        pw, ndec = power(pool, 0.0, 0.20, trials, rho=rho)
        print("   %.1f   %5.1f   %17.1f%%   %13.1f%%   %10.1f%%"
              % (rho, ndec, pw["paired_decision"] * 100,
                 pw["paired_weekly"] * 100, pw["block_boot"] * 100))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

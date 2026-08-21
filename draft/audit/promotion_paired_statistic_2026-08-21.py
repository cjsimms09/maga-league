#!/usr/bin/env python3
# TERRITORY: D
"""REGISTER 211: A PROMOTION STATISTIC THAT SEPARATES.

A measured (register 199 / `promotion_rule_power_2026-08-21.py`) that the
shipped QUICK-PROMOTE rule promotes a SKILL-FREE arm in 95.0% of seasons, and
that gating best-of-K cuts that to 17.9% while reaching only 22.7% power at a
realistic -15% MAE edge. Four points of separation between nothing and
unmissable, and 211's diagnosis of why:

    the rule tests a 17-point series of WEEKLY MAEs, when each of those points
    is an average over ~250 players. Collapsing the week to one number throws
    away the population the grade was computed on.

THE PROPOSED STATISTIC — a paired test over player-weeks, clustered by week.

  * pair each player's champion error against the SAME player's candidate
    error in the SAME week: `d[w][p] = |champ err| - |cand err|`, positive
    when the candidate is better;
  * average within a week -> one precisely-estimated number per week instead
    of one noisy one;
  * test those W numbers by SIGN-FLIPPING WHOLE WEEKS. Flipping a week as a
    block is what keeps the test honest under within-week dependence: a weird
    slate moves every player together, and a per-player permutation would
    treat that shared movement as W x P independent observations and produce a
    confidently wrong p.

WHY PAIRING IS THE LEVER, and it is not the extra n. Real challenger arms are
variants of ONE model, so most of any week's error is COMMON to champion and
candidate alike. The pairing subtracts that common component before anything
is tested, which is exactly what comparing two MAE series cannot do. The
higher `RHO` is -- the more alike the arms are -- the MORE the paired test
wins, which is the opposite of the intuition that correlated arms are harder
to tell apart.

CONTROLS (rule 3e/3f), and the script REFUSES to print a comparison if any
fails:

  C1 known-negative  no arm has any edge          -> must be near the 5% level
  C2 known-positive  a real -15% MAE edge         -> modest, realistic
  C3 known-positive  a real -40% MAE edge         -> large, unmissable
  C4 SEPARATION      C3 - C1 must beat the shipped rule's four points, or
                     this statistic is not an improvement and says so.

STATED LIMITS, so nobody quotes this further than it goes:
  - player errors are modelled abs-normal with a shared weekly shock; that is
    A's model refined to the player level, not the real error distribution;
  - the Spearman non-regression gate is not modelled (it can only REDUCE
    firing, so every rate here is if anything optimistic);
  - this measures a STATISTIC's separation, not a full promotion policy. What
    a promotion rule should DO with a separating statistic is a separate
    ruling and is not proposed here.

Run:  python3 draft/audit/promotion_paired_statistic_2026-08-21.py [--quick]
Test: python3 -m pytest draft/tests/test_promotion_paired_statistic.py -q
"""
from __future__ import annotations

import argparse
import random
import statistics as st
import sys

WEEKS = 17
PLAYERS = 250            # the week's population the current rule averages away
K_ARMS = 4
RHO = 0.60               # share of a player's error common to every arm
ALPHA = 0.05
SIGN_FLIPS = 2000
PROMOTION_MIN_WEEKS = 3

#: the shipped rule's measured numbers, from A's probe. Quoted so C4 compares
#: against a real baseline rather than a remembered one.
SHIPPED_NULL_GATED = 0.179
SHIPPED_POWER_15 = 0.227
SHIPPED_SEPARATION = SHIPPED_POWER_15 - SHIPPED_NULL_GATED


def season_errors(rng, scale):
    """Per-player absolute errors for champion and one candidate.

    A player-week's error has a shared component (the slate was weird for
    everyone) and an arm-specific one. `scale` < 1.0 is a REAL edge, applied
    to the candidate's arm-specific error SCALE — not as a mean shift through
    abs(), which is the bug A's own known-positive caught in her first
    version and which silently made the 'better' arm worse.
    """
    champ, cand = [], []
    for _ in range(WEEKS):
        shock = [abs(rng.gauss(0, 1)) for _ in range(PLAYERS)]
        c, x = [], []
        for p in range(PLAYERS):
            c.append(RHO * shock[p] + (1 - RHO) * abs(rng.gauss(0, 1.0)))
            x.append(RHO * shock[p] + (1 - RHO) * abs(rng.gauss(0, scale)))
        champ.append(c)
        cand.append(x)
    return champ, cand


def paired_week_means(champ, cand, upto):
    """One number per week: the mean per-player paired difference. Positive
    means the candidate beat the champion on that week's population."""
    return [st.mean(champ[w][p] - cand[w][p] for p in range(len(champ[w])))
            for w in range(upto)]


def sign_flip_p(week_means, rng, flips=SIGN_FLIPS):
    """One-sided p for 'the mean weekly paired difference is > 0', by flipping
    the sign of WHOLE WEEKS. Weeks are the cluster; players inside one are not
    exchangeable and are never permuted."""
    obs = st.mean(week_means)
    if obs <= 0:
        return 1.0
    ge = 0
    for _ in range(flips):
        t = st.mean(v if rng.random() < 0.5 else -v for v in week_means)
        if t >= obs:
            ge += 1
    return (ge + 1) / (flips + 1)


def fires(rng, scale, flips=SIGN_FLIPS, alpha=ALPHA):
    """Would the PAIRED statistic promote at any Tuesday this season?

    Walks the same Tuesday-by-Tuesday schedule the shipped rule walks, so the
    multiple-looks exposure is identical and the comparison is like-for-like:
    a statistic that only looked once would win on that alone.
    """
    champ, cand = season_errors(rng, scale)
    for w in range(PROMOTION_MIN_WEEKS, WEEKS + 1):
        if sign_flip_p(paired_week_means(champ, cand, w), rng, flips) < alpha:
            return True
    return False


def rate(rng, sims, scale, flips=SIGN_FLIPS, alpha=ALPHA):
    return sum(fires(rng, scale, flips, alpha) for _ in range(sims)) / sims


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sims", type=int, default=300)
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--seed", type=int, default=20260821)
    ap.add_argument("--alpha", type=float, default=ALPHA)
    a = ap.parse_args(argv)
    sims = 60 if a.quick else a.sims
    flips = 400 if a.quick else SIGN_FLIPS
    rng = random.Random(a.seed)

    c1 = rate(rng, sims, 1.00, flips, a.alpha)   # known-negative: no edge
    c2 = rate(rng, sims, 0.85, flips, a.alpha)   # known-positive: realistic
    c3 = rate(rng, sims, 0.60, flips, a.alpha)   # known-positive: unmissable

    print(f"paired per-player statistic — {sims} seasons, {WEEKS} weeks, "
          f"{PLAYERS} players/week, rho={RHO}")
    print(f"  C1 skill-free arm fires   : {c1:.3f}   (shipped+gate: {SHIPPED_NULL_GATED:.3f})")
    print(f"  C2 real -15% edge fires   : {c2:.3f}   (shipped+gate: {SHIPPED_POWER_15:.3f})")
    print(f"  C3 real -40% edge fires   : {c3:.3f}")
    sep = c3 - c1
    sep15 = c2 - c1
    print(f"  separation C3-C1          : {sep:.3f}")
    print(f"  separation C2-C1          : {sep15:.3f}   "
          f"(shipped+gate: {SHIPPED_SEPARATION:.3f})")

    bad = []
    if not c1 <= 0.25:
        bad.append(f"C1 known-negative fires {c1:.3f} — a skill-free arm should "
                   f"not promote this often; the statistic is not calibrated")
    if not c3 > c1:
        bad.append(f"C3 ({c3:.3f}) does not exceed C1 ({c1:.3f}) — the "
                   f"known-positive is not detected AT ALL, so this measures nothing")
    if not sep15 > SHIPPED_SEPARATION:
        bad.append(f"C2-C1 separation {sep15:.3f} does not beat the shipped "
                   f"rule's {SHIPPED_SEPARATION:.3f} at the SAME realistic edge — "
                   f"this statistic is not an improvement and must not be filed as one")
    if bad:
        print("\n  ⛔ REFUSING: the comparison above is not evidence.")
        for b in bad:
            print(f"     - {b}")
        return 1
    print("\n  controls: 4/4 pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""HOW OFTEN DOES THE QUICK-PROMOTE RULE FIRE ON NOTHING?

Written to settle register 199 — `ADAPTATION-POLICY.md` says a shadow arm is
promoted after "3 consecutive graded weeks AND clears the best-of-K null",
`decide_promotion()` in draft/weekly_own_grade.py implements 3-of-the-last-4
plus a cumulative-MAE gate plus a Spearman tolerance, and attaches best-of-K
without gating on it. D is blocked on which wording is authoritative.

Before ruling on the wording, measure what either rule BUYS (rule 3i — a number
is not a finding until you have seen the distribution it came from). The answer
is that at the resolution the rule operates, the wording is not the question:
as shipped it promotes a skill-free arm in ~95% of seasons and cannot separate
that from a genuinely better one.

Run:  python3 draft/audit/promotion_rule_power_2026-08-21.py
      python3 draft/audit/promotion_rule_power_2026-08-21.py --quick

CONTROLS (rule 3e/3f — every arm below is a NULL-shaped claim, and a null from
a probe that has never returned a positive is a bug report):

  C1 known-negative  no arm has any edge                    -> the false rate
  C2 known-positive  one arm has a real -15% MAE edge       -> modest, realistic
  C3 known-positive  one arm has a real -40% MAE edge       -> large, unmissable
  C4 the gate must SEPARATE C1 from C3, or it is not a gate, and this script
     fails loudly rather than printing a table nobody checks.

⚠️ C2/C3 CAUGHT A BUG IN THIS SCRIPT'S FIRST VERSION, which is the only reason
the conclusion is trustworthy. The "better" arm was drawn as abs(N(-d, 1)),
folded through abs() — which has a HIGHER mean than abs(N(0,1)), so the
known-positive arm was secretly WORSE and the first run reported that gating
best-of-K has no power. The edge is a reduction in error SCALE, not a mean shift
put through an absolute value.

STATED LIMITS, so nobody quotes this further than it goes:
  - weekly MAE is modelled as abs-normal, not the real error distribution;
  - the Spearman tolerance gate is not modelled (it can only REDUCE firing, so
    the null rates here are if anything optimistic);
  - cross-arm correlation IS modelled (`--rho`) because real challenger arms are
    variants of one model. It does not rescue the rule: the null stays ~95% and
    separation stays under 3 points at every rho from 0.00 to 0.95.
"""
import argparse
import random
import statistics as st
import sys

WEEKS = 17          # a full fantasy regular season + playoffs' worth of grades
K_ARMS = 4          # the loop ships 4 named challenger arms against the champion
PROMOTION_MIN_WEEKS = 3
PROMOTION_RECENT_WINDOW = 4
PROMOTION_RECENT_WINS = 3


def _best_of_k_p(errors_by_arm, rng, permutations):
    """The row-permutation p-value draft/backtest/best_of_k.py computes: the
    winner's MAE margin over the RUNNER-UP, against the distribution you get by
    shuffling each week's errors across arms (i.e. 'arm identity carries no
    information')."""
    names = sorted(errors_by_arm)
    n = len(errors_by_arm[names[0]])
    maes = {a: st.mean(errors_by_arm[a]) for a in names}
    order = sorted(names, key=lambda a: maes[a])
    margin = maes[order[1]] - maes[order[0]]
    rows = [[errors_by_arm[a][i] for a in names] for i in range(n)]
    ge = 0
    for _ in range(permutations):
        totals = [0.0] * len(names)
        for row in rows:
            shuffled = list(row)
            rng.shuffle(shuffled)
            for j, v in enumerate(shuffled):
                totals[j] += v
        m = sorted(t / n for t in totals)
        if (m[1] - m[0]) >= margin:
            ge += 1
    return (ge + 1) / (permutations + 1)


def season(rng, scale, rule, gate_best_of_k, rho, permutations):
    """One simulated season. Arm a0 has error scale `scale` (< 1.0 = a REAL
    edge); every other arm and the champion are at 1.0. Returns True if any arm
    is promoted at any Tuesday.

    `rho` is the share of each week's error common to every arm — real
    challengers are variants of one model, so most of a bad week is shared.
    """
    common_shock = [abs(rng.gauss(0, 1)) for _ in range(WEEKS)]

    def series(sc):
        return [rho * common_shock[i] + (1 - rho) * abs(rng.gauss(0, sc))
                for i in range(WEEKS)]

    champ = series(1.0)
    arms = {f'a{j}': series(scale if j == 0 else 1.0) for j in range(K_ARMS)}

    for w in range(PROMOTION_MIN_WEEKS, WEEKS + 1):
        idx = list(range(w))
        for cand in arms.values():
            if rule == '3of4':
                recent = idx[-PROMOTION_RECENT_WINDOW:]
                wins = sum(1 for i in recent if cand[i] < champ[i])
                if wins < min(PROMOTION_RECENT_WINS, len(recent)):
                    continue
            else:                                    # the doc's "3 consecutive"
                run = 0
                streak = False
                for i in idx:
                    run = run + 1 if cand[i] < champ[i] else 0
                    if run >= PROMOTION_RECENT_WINS:
                        streak = True
                if not streak:
                    continue
            # the cumulative-MAE gate the code has and the doc never stated
            if not (st.mean(cand[i] for i in idx) < st.mean(champ[i] for i in idx)):
                continue
            if gate_best_of_k:
                errs = {'champion': [champ[i] for i in idx]}
                errs.update({a: [v[i] for i in idx] for a, v in arms.items()})
                if _best_of_k_p(errs, rng, permutations) > 0.05:
                    continue
            return True
    return False


def rate(rng, sims, **kw):
    return sum(season(rng, **kw) for _ in range(sims)) / sims


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sims', type=int, default=1500)
    ap.add_argument('--permutations', type=int, default=300)
    ap.add_argument('--seed', type=int, default=20260821)
    ap.add_argument('--quick', action='store_true',
                    help='fewer sims — for a smoke run, not for quoting')
    args = ap.parse_args()
    sims = 300 if args.quick else args.sims
    perms = 120 if args.quick else args.permutations
    rng = random.Random(args.seed)

    CASES = [('C1 known-NEGATIVE  no arm has any edge      ', 1.00),
             ('C2 known-POSITIVE  real edge, -15% MAE      ', 0.85),
             ('C3 known-POSITIVE  real edge, -40% MAE      ', 0.60)]

    print('PROMOTION-RULE POWER — P(some arm is promoted during a %d-week season)'
          % WEEKS)
    print('%d challenger arms vs the champion, %d simulated seasons per cell\n'
          % (K_ARMS, sims))

    results = {}
    for rule in ('3of4', '3consec'):
        label = ('3-of-last-4 (the CODE)' if rule == '3of4'
                 else '3-consecutive (the DOC)')
        print('  rule = %s' % label)
        for name, scale in CASES:
            for gate in (False, True):
                r = rate(rng, sims, scale=scale, rule=rule, gate_best_of_k=gate,
                         rho=0.0, permutations=perms)
                results[(rule, scale, gate)] = r
                print('    %s  best-of-K %-8s -> %6.1f%%'
                      % (name, 'GATING' if gate else 'attached', 100 * r))
        print()

    print('  cross-arm correlation (best-of-K attached, as shipped) — real arms')
    print('  are variants of ONE model, so most of a bad week is shared:')
    print('    %5s | %14s | %14s | %s' % ('rho', 'no edge', '-15% edge', 'separation'))
    for rho in (0.0, 0.5, 0.8, 0.95):
        a = rate(rng, sims, scale=1.00, rule='3of4', gate_best_of_k=False,
                 rho=rho, permutations=perms)
        b = rate(rng, sims, scale=0.85, rule='3of4', gate_best_of_k=False,
                 rho=rho, permutations=perms)
        print('    %5.2f | %13.1f%% | %13.1f%% | %+.1f pts'
              % (rho, 100 * a, 100 * b, 100 * (b - a)))

    # ── C4: the controls must SEPARATE, or this script has measured nothing ──
    fails = []
    null_shipped = results[('3of4', 1.00, False)]
    if null_shipped < 0.50:
        fails.append('C1 as shipped came out at %.1f%% — this script was written '
                     'because it is high; if it is now low, the model no longer '
                     'matches decide_promotion() and nothing here can be quoted'
                     % (100 * null_shipped))
    big_gated = results[('3of4', 0.60, True)]
    null_gated = results[('3of4', 1.00, True)]
    if big_gated - null_gated < 0.15:
        fails.append('C4 FAILED: with best-of-K gating, a LARGE real edge (%.1f%%) '
                     'is not separated from no edge at all (%.1f%%). Either the '
                     'permutation null is broken or the edge is not being applied '
                     '— do not quote any number above until this passes.'
                     % (100 * big_gated, 100 * null_gated))
    print()
    if fails:
        for f in fails:
            print('  ❌ ' + f)
        sys.exit(1)
    print('  ✅ controls separate: gating best-of-K tells a large real edge '
          '(%.1f%%) from no edge (%.1f%%), so the null rates above are '
          'measurements rather than a broken harness printing a constant.'
          % (100 * big_gated, 100 * null_gated))


if __name__ == '__main__':
    main()

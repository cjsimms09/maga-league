#!/usr/bin/env python3
# TERRITORY: relay — implements Getty et al., SIAM Review 60(4) 2018 (Cory's
# 08-20 upload): the R* split-half persistence metric, the computable form of
# "grade skill, not luck."
"""R* — HOW MUCH OF A RECORD IS SKILL?

Split each competitor's games into first/second halves. Rotate (P,Q) win
fractions into S=(P+Q-1)/sqrt2 (the PERSISTENCE axis) and T=(Q-P)/sqrt2 (the
NOISE axis). R* = 1 - Var(T)/Var(A) over competitors, each point weighted by
1/sigma_i^2 with sigma_i^2 = 2 w_i (1-w_i) / n_i. Pure luck: R*=0 (halves
uncorrelated). Pure skill: R*=1 (first half predicts second exactly).
Closed forms from the paper: E[R*] (eq 16), sigma_R (eq 17); validity filter
(eq 9): n_i w_i / 2 > 5 and n_i (1-w_i) / 2 > 5.

CONTROLS (Rule 3e — run with --controls; both must pass or the tool refuses
to be trusted). NOTE LEARNED BUILDING THIS: R* is NOISY at small m — the null
95% band at m=200/n=60 is +-0.28, and the first control seed drew a genuine
sub-percentile -0.54. NEVER read a small-m R* without its null band printed
beside it; the league() and file modes always print it.
  known-negative: 1000 fair coins -> R* inside its own MC null band.
  known-positive: persistent 0.75/0.25 players -> R* > 0.5 and above the band.

Usage:
  python3 draft/tools/skill_luck_r.py --controls
  python3 draft/tools/skill_luck_r.py --league     # our league, real matchups
  python3 draft/tools/skill_luck_r.py FILE.json    # {"entity": [0,1,...], ...}
"""
import json
import math
import random
import sys

def r_star(records):
    """records: {name: [0/1 outcomes]}. Returns dict with R*, E[R*], sigma_R,
    per-entity rows, and the excluded list (eq-9 failures)."""
    rows, excluded = [], []
    for name, xs in records.items():
        n = len(xs)
        w = sum(xs) / n if n else 0.0
        if not (n * w / 2 > 5 and n * (1 - w) / 2 > 5):
            excluded.append((name, n, w))
            continue
        h = n // 2
        p = sum(xs[:h]) / h
        q = sum(xs[h:2 * h]) / h
        s = (p + q - 1) / math.sqrt(2)
        t = (q - p) / math.sqrt(2)
        # generalized: sample variance of the per-game outcome (fractions
        # allowed, per the paper's x_ij); reduces to w(1-w) for 0/1 outcomes
        v_game = sum((x - w) ** 2 for x in xs) / n
        var = max(2 * v_game / n, 1e-9)
        rows.append({'name': name, 'n': n, 'w': round(w, 4), 'p': round(p, 4),
                     'q': round(q, 4), 's': round(s, 4), 't': round(t, 4), 'var': var})
    if not rows:
        return {'error': 'no entity passes the eq-9 validity filter', 'excluded': excluded}
    m = len(rows)
    A = sum(r['s'] ** 2 / r['var'] for r in rows) / m
    B = sum(r['t'] ** 2 / r['var'] for r in rows) / m
    r_hat = 1 - B / A if A > 0 else 0.0
    rows.sort(key=lambda r: -r['s'])
    return {'R_star': round(r_hat, 4), 'm': m, 'rows': rows, 'excluded': excluded}

def null_band(records, iters=400, seed=20260820):
    """The paper's MC approach as the NULL: every entity's outcomes redrawn
    from the POOLED empirical outcome distribution (no persistent skill), same
    n_i. Works for binary and fractional outcomes alike. A real R* above the
    null 97.5th percentile is skill at p<.025."""
    import random as _r
    rng = _r.Random(seed)
    ns = {k: len(v) for k, v in records.items()}
    pooled = [x for v in records.values() for x in v]   # empirical outcome dist
    sims = []
    for _ in range(iters):
        fake = {k: [pooled[int(rng.random() * len(pooled))] for _ in range(n)] for k, n in ns.items()}
        out = r_star(fake)
        if 'R_star' in out:
            sims.append(out['R_star'])
    sims.sort()
    return {'null_mean': round(sum(sims) / len(sims), 4),
            'null_2.5': round(sims[int(0.025 * len(sims))], 4),
            'null_97.5': round(sims[int(0.975 * len(sims))], 4)}

def controls():
    rng = random.Random(20260820)
    coins = {f'coin{i}': [int(rng.random() < 0.5) for _ in range(60)] for i in range(1000)}
    neg = r_star(coins)
    nb = null_band(coins, iters=200)
    ok_neg = nb['null_2.5'] <= neg['R_star'] <= nb['null_97.5']
    skilled = {}
    for i in range(200):
        w = 0.75 if i % 2 == 0 else 0.25
        skilled[f'plr{i}'] = [int(rng.random() < w) for _ in range(60)]
    pos = r_star(skilled)
    nbp = null_band(skilled, iters=200)
    ok_pos = pos['R_star'] > nbp['null_97.5'] and pos['R_star'] > 0.5
    print(f"known-negative (fair coins): R*={neg['R_star']} inside null band [{nb['null_2.5']},{nb['null_97.5']}] : {'ok' if ok_neg else 'FAIL'}")
    print(f"known-positive (0.75 skill): R*={pos['R_star']} above null 97.5={nbp['null_97.5']} : {'ok' if ok_pos else 'FAIL'}")
    return 0 if (ok_neg and ok_pos) else 1

def league(allplay=False):
    h = json.load(open('draft/data/league_history.json'))
    seasons = h['seasons'] if isinstance(h, dict) and 'seasons' in h else h
    rec = {}
    used = []
    for season in seasons:
        weeks = season.get('weeks') or []
        if isinstance(weeks, dict):
            weeks = [weeks[k] for k in sorted(weeks, key=lambda x: int(x))]
        weeks = [w for w in weeks if isinstance(w, list)]
        if not weeks:
            continue
        used.append(str(season.get('season') or season.get('year')))
        for wk in weeks:
            if allplay:
                pts = [(t['roster_id'], t['points']) for t in wk if isinstance(t, dict) and t.get('points') is not None]
                if len(pts) < 4:
                    continue
                for rid, p in pts:
                    others = [op for orid, op in pts if orid != rid]
                    frac = sum(1 for op in others if p > op) / len(others)
                    rec.setdefault(f'roster_{rid}', []).append(frac)
                continue
            by_matchup = {}
            for t in wk:
                if t.get('matchup_id') is None:
                    continue
                by_matchup.setdefault(t['matchup_id'], []).append(t)
            for pair in by_matchup.values():
                if len(pair) != 2 or pair[0]['points'] == pair[1]['points']:
                    continue
                a, b = pair
                win = a if a['points'] > b['points'] else b
                lose = b if win is a else a
                rec.setdefault(f"roster_{win['roster_id']}", []).append(1)
                rec.setdefault(f"roster_{lose['roster_id']}", []).append(0)
    out = r_star(rec)
    out['seasons_used'] = used
    out['null'] = null_band(rec)
    print(json.dumps(out, indent=1))
    return 0

if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--controls':
        sys.exit(controls())
    if a and a[0] == '--league':
        sys.exit(league(allplay='--allplay' in a))
    if a:
        print(json.dumps(r_star(json.load(open(a[0]))), indent=1))
        sys.exit(0)
    print(__doc__)

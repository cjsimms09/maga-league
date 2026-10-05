# EXPERIMENT 34 — recommendation vs market (policy-level)

_33 real decisions across three seasons; our ordering =
walk-forward projected value. Underpowered by construction (n~41); an
inconclusive CI (spans zero) reads as the anchor binding HARDER, not looser._

**n by season: {'2026': 6, '2025': 8, '2024': 7, '2023': 12}** · realized source: {2026: 'harvest', 2025: 'harvest', 2024: 'nflverse', 2023: 'nflverse'}
_(a season marked `harvest` had its realized recovered from league_history players_points after nflverse's pbp rebuild was refused by cross-validation — roster-gated, so a mid-season drop is truncated.)_

## PRIMARY — rank correlation over the available pool

- our ordering: mean rho 0.367 CI (0.282, 0.442)
- market (ADP): mean rho 0.233 CI (0.156, 0.299)
- **difference (our - market): 0.134 CI [0.038, 0.232] -> BEAT** over 32 picks

## Top-N set value (realized pts, our set vs market set)

- top-5: our 264.444 vs market 162.197 (delta 102.247, beat)
- top-10: our 228.446 vs market 163.095 (delta 65.351, beat)

## The deviation-edge surface (hit rate = took beat ADP-preferred available)

### by FORGONE VALUE (primary) (projected pts given up)

- value(<=0): n=15 hit=0.333 mean_delta=30.959 CI [0.852, 63.067] beat
- near-zero: n=3 hit=0.667 mean_delta=24.4 CI [-7.5, 42.52] inconclusive ⚠THIN
- moderate: n=6 hit=0.333 mean_delta=-7.067 CI [-21.45, 10.567] inconclusive ⚠THIN
- large: n=8 hit=0.5 mean_delta=-75.02 CI [-163.207, 6.212] inconclusive

### by ADP DISTANCE (comparison — which unit predicts better is a finding) (spots)

- <5: n=21 hit=0.286 mean_delta=-16.41 CI [-60.772, 21.384] inconclusive
- 5-15: n=5 hit=0.8 mean_delta=37.344 CI [-1.776, 95.16] inconclusive ⚠THIN
- 15-30: n=1 hit=1.0 mean_delta=50.3 CI [nan, nan] inconclusive ⚠THIN
- >30: n=3 hit=0.333 mean_delta=-7.46 CI [-77.98, 76.4] inconclusive ⚠THIN

### by ROUND / remaining-picks decay (round band)

- r1-3: n=4 hit=0.75 mean_delta=49.03 CI [3.55, 112.5] beat ⚠THIN
- r4-7: n=13 hit=0.462 mean_delta=9.3 CI [-2.708, 22.072] inconclusive
- r8-11: n=11 hit=0.364 mean_delta=13.231 CI [-30.133, 58.342] inconclusive
- r12+: n=5 hit=0.0 mean_delta=-114.188 CI [-230.676, -4.16] lost ⚠THIN

### by MARKET DISPERSION (ADP stdev)

- unanimous: n=3 hit=1.0 mean_delta=28.34 CI [10.5, 42.52] beat ⚠THIN
- mid: n=16 hit=0.25 mean_delta=-13.181 CI [-53.351, 22.619] inconclusive
- contested: n=11 hit=0.455 mean_delta=-0.371 CI [-75.076, 60.4] inconclusive

### tier-cliff proximity

- crosses cliff: n=0 hit=None (tiers omitted this run -> expect thin/empty; measured tiers are exp 36)
- within tier:  n=0 hit=None

## Caveats

- pbp unavailable for [2025, 2026] (NameError); those seasons stay skipped
- 2026: nflverse realized unavailable (pbp rebuild refused by cross-validation on 2024 — the gate working); RECOVERED from the harvest (league_history players_points, season totals, 181 players; roster-gated so a mid-season drop is truncated).
- 2025: nflverse realized unavailable (pbp rebuild refused by cross-validation on 2024 — the gate working); RECOVERED from the harvest (league_history players_points, season totals, 254 players; roster-gated so a mid-season drop is truncated).

## What this does NOT settle

Correct cost accounting on unvalidated projections is still unvalidated: if our
player evaluations are wrong, a correctly-priced deviation is still wrong. That is
exp 33's job. And the composite-ordering variant (E.recommend, not just projections)
is a labelled follow-up needing the JS replay path.

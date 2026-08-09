# EXPERIMENT 34 — recommendation vs market (policy-level)

_27 real decisions across three seasons; our ordering =
walk-forward projected value. Underpowered by construction (n~41); an
inconclusive CI (spans zero) reads as the anchor binding HARDER, not looser._

**n by season: {'2025': 8, '2024': 7, '2023': 12}** · realized source: {2025: 'harvest', 2024: 'nflverse', 2023: 'nflverse'}
_(a season marked `harvest` had its realized recovered from league_history players_points after nflverse's pbp rebuild was refused by cross-validation — roster-gated, so a mid-season drop is truncated.)_

## PRIMARY — rank correlation over the available pool

- our ordering: mean rho 0.408 CI (0.334, 0.481)
- market (ADP): mean rho 0.268 CI (0.2, 0.329)
- **difference (our - market): 0.14 CI [0.052, 0.223] -> BEAT** over 26 picks

## Top-N set value (realized pts, our set vs market set)

- top-5: our 309.313 vs market 187.778 (delta 121.535, beat)
- top-10: our 251.908 vs market 179.571 (delta 72.336, beat)

## The deviation-edge surface (hit rate = took beat ADP-preferred available)

### by FORGONE VALUE (primary) (projected pts given up)

- value(<=0): n=11 hit=0.364 mean_delta=38.164 CI [-2.891, 82.655] inconclusive
- near-zero: n=2 hit=1.0 mean_delta=40.35 CI [38.18, 42.52] beat ⚠THIN
- moderate: n=5 hit=0.4 mean_delta=-5.38 CI [-23.1, 15.28] inconclusive ⚠THIN
- large: n=8 hit=0.5 mean_delta=-75.02 CI [-163.207, 6.212] inconclusive

### by ADP DISTANCE (comparison — which unit predicts better is a finding) (spots)

- <5: n=18 hit=0.333 mean_delta=-19.144 CI [-72.538, 24.808] inconclusive
- 5-15: n=5 hit=0.8 mean_delta=37.344 CI [-1.776, 95.16] inconclusive ⚠THIN
- 15-30: n=1 hit=1.0 mean_delta=50.3 CI [nan, nan] inconclusive ⚠THIN
- >30: n=3 hit=0.333 mean_delta=-7.46 CI [-77.98, 76.4] inconclusive ⚠THIN

### by ROUND / remaining-picks decay (round band)

- r1-3: n=4 hit=0.75 mean_delta=49.03 CI [3.55, 112.5] beat ⚠THIN
- r4-7: n=10 hit=0.6 mean_delta=12.84 CI [-2.748, 28.478] inconclusive
- r8-11: n=8 hit=0.375 mean_delta=14.557 CI [-43.38, 78.227] inconclusive
- r12+: n=5 hit=0.0 mean_delta=-114.188 CI [-230.676, -4.16] lost ⚠THIN

### by MARKET DISPERSION (ADP stdev)

- unanimous: n=3 hit=1.0 mean_delta=28.34 CI [10.5, 42.52] beat ⚠THIN
- mid: n=13 hit=0.308 mean_delta=-16.223 CI [-67.603, 26.754] inconclusive
- contested: n=11 hit=0.455 mean_delta=-0.371 CI [-75.076, 60.4] inconclusive

### tier-cliff proximity

- crosses cliff: n=0 hit=None (tiers omitted this run -> expect thin/empty; measured tiers are exp 36)
- within tier:  n=0 hit=None

## Caveats

- [2025] NOT recovered: pbp rebuild disagreed with the library on 2024
- 2025: nflverse realized unavailable (pbp rebuild refused by cross-validation on 2024 — the gate working); RECOVERED from the harvest (league_history players_points, season totals, 254 players; roster-gated so a mid-season drop is truncated).

## What this does NOT settle

Correct cost accounting on unvalidated projections is still unvalidated: if our
player evaluations are wrong, a correctly-priced deviation is still wrong. That is
exp 33's job. And the composite-ordering variant (E.recommend, not just projections)
is a labelled follow-up needing the JS replay path.

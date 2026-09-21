# EXPERIMENT 34 — recommendation vs market (policy-level)

_33 real decisions across three seasons; our ordering =
walk-forward projected value. Underpowered by construction (n~41); an
inconclusive CI (spans zero) reads as the anchor binding HARDER, not looser._

**n by season: {'2026': 6, '2025': 8, '2024': 7, '2023': 12}** · realized source: {2026: 'harvest', 2025: 'harvest', 2024: 'nflverse', 2023: 'nflverse'}
_(a season marked `harvest` had its realized recovered from league_history players_points after nflverse's pbp rebuild was refused by cross-validation — roster-gated, so a mid-season drop is truncated.)_

## PRIMARY — rank correlation over the available pool

- our ordering: mean rho 0.397 CI (0.331, 0.461)
- market (ADP): mean rho 0.226 CI (0.151, 0.293)
- **difference (our - market): 0.171 CI [0.081, 0.262] -> BEAT** over 32 picks

## Top-N set value (realized pts, our set vs market set)

- top-5: our 261.541 vs market 159.363 (delta 102.178, beat)
- top-10: our 226.229 vs market 161.095 (delta 65.133, beat)

## The deviation-edge surface (hit rate = took beat ADP-preferred available)

### by FORGONE VALUE (primary) (projected pts given up)

- value(<=0): n=15 hit=0.333 mean_delta=30.504 CI [0.397, 62.887] beat
- near-zero: n=3 hit=1.0 mean_delta=27.6 CI [2.1, 42.52] beat ⚠THIN
- moderate: n=6 hit=0.333 mean_delta=-5.183 CI [-20.033, 12.033] inconclusive ⚠THIN
- large: n=8 hit=0.5 mean_delta=-75.02 CI [-163.207, 6.212] inconclusive

### by ADP DISTANCE (comparison — which unit predicts better is a finding) (spots)

- <5: n=21 hit=0.286 mean_delta=-16.41 CI [-60.772, 21.384] inconclusive
- 5-15: n=5 hit=0.8 mean_delta=37.344 CI [-1.776, 95.16] inconclusive ⚠THIN
- 15-30: n=1 hit=1.0 mean_delta=50.3 CI [nan, nan] inconclusive ⚠THIN
- >30: n=3 hit=0.333 mean_delta=-7.46 CI [-77.98, 76.4] inconclusive ⚠THIN

### by ROUND / remaining-picks decay (round band)

- r1-3: n=4 hit=0.75 mean_delta=49.03 CI [3.55, 112.5] beat ⚠THIN
- r4-7: n=13 hit=0.538 mean_delta=10.038 CI [-1.808, 22.348] inconclusive
- r8-11: n=11 hit=0.364 mean_delta=13.638 CI [-29.518, 58.564] inconclusive
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
- 2026: nflverse realized unavailable (pbp rebuild refused by cross-validation on 2024 — the gate working); RECOVERED from the harvest (league_history players_points, season totals, 152 players; roster-gated so a mid-season drop is truncated).
- 2025: nflverse realized unavailable (pbp rebuild refused by cross-validation on 2024 — the gate working); RECOVERED from the harvest (league_history players_points, season totals, 254 players; roster-gated so a mid-season drop is truncated).

## What this does NOT settle

Correct cost accounting on unvalidated projections is still unvalidated: if our
player evaluations are wrong, a correctly-priced deviation is still wrong. That is
exp 33's job. And the composite-ordering variant (E.recommend, not just projections)
is a labelled follow-up needing the JS replay path.

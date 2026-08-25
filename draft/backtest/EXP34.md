# EXPERIMENT 34 — recommendation vs market (policy-level)

_35 real decisions across three seasons; our ordering =
walk-forward projected value. Underpowered by construction (n~41); an
inconclusive CI (spans zero) reads as the anchor binding HARDER, not looser._

**n by season: {'2026': 8, '2025': 8, '2024': 7, '2023': 12}** · realized source: {2026: 'harvest', 2025: 'harvest', 2024: 'nflverse', 2023: 'nflverse'}
_(a season marked `harvest` had its realized recovered from league_history players_points after nflverse's pbp rebuild was refused by cross-validation — roster-gated, so a mid-season drop is truncated.)_

## PRIMARY — rank correlation over the available pool

- our ordering: mean rho 0.358 CI (0.288, 0.425)
- market (ADP): mean rho 0.203 CI (0.116, 0.279)
- **difference (our - market): 0.155 CI [0.056, 0.255] -> BEAT** over 34 picks

## Top-N set value (realized pts, our set vs market set)

- top-5: our 243.701 vs market 147.946 (delta 95.755, beat)
- top-10: our 195.546 vs market 139.023 (delta 56.523, beat)

## The deviation-edge surface (hit rate = took beat ADP-preferred available)

### by FORGONE VALUE (primary) (projected pts given up)

- value(<=0): n=18 hit=0.222 mean_delta=23.322 CI [-4.517, 53.278] inconclusive
- near-zero: n=2 hit=1.0 mean_delta=40.35 CI [38.18, 42.52] beat ⚠THIN
- moderate: n=5 hit=0.4 mean_delta=-5.38 CI [-23.1, 15.28] inconclusive ⚠THIN
- large: n=9 hit=0.444 mean_delta=-66.684 CI [-149.504, 5.416] inconclusive

### by ADP DISTANCE (comparison — which unit predicts better is a finding) (spots)

- <5: n=26 hit=0.231 mean_delta=-13.254 CI [-49.34, 18.462] inconclusive
- 5-15: n=5 hit=0.8 mean_delta=37.344 CI [-1.776, 95.16] inconclusive ⚠THIN
- 15-30: n=1 hit=1.0 mean_delta=50.3 CI [nan, nan] inconclusive ⚠THIN
- >30: n=3 hit=0.333 mean_delta=-7.46 CI [-77.98, 76.4] inconclusive ⚠THIN

### by ROUND / remaining-picks decay (round band)

- r1-3: n=4 hit=0.75 mean_delta=49.03 CI [3.55, 112.5] beat ⚠THIN
- r4-7: n=13 hit=0.462 mean_delta=9.877 CI [-1.968, 22.3] inconclusive
- r8-11: n=11 hit=0.273 mean_delta=10.587 CI [-30.28, 55.573] inconclusive
- r12+: n=7 hit=0.0 mean_delta=-81.563 CI [-175.326, -2.971] lost ⚠THIN

### by MARKET DISPERSION (ADP stdev)

- unanimous: n=4 hit=0.75 mean_delta=21.255 CI [5.25, 37.26] beat ⚠THIN
- mid: n=17 hit=0.235 mean_delta=-12.406 CI [-48.975, 20.798] inconclusive
- contested: n=14 hit=0.357 mean_delta=-0.291 CI [-57.394, 46.201] inconclusive

### tier-cliff proximity

- crosses cliff: n=0 hit=None (tiers omitted this run -> expect thin/empty; measured tiers are exp 36)
- within tier:  n=0 hit=None

## Caveats

- pbp unavailable for [2025, 2026] (NameError); those seasons stay skipped
- 2026: nflverse realized unavailable (pbp rebuild refused by cross-validation on 2024 — the gate working); RECOVERED from the harvest (league_history players_points, season totals, 151 players; roster-gated so a mid-season drop is truncated).
- 2025: nflverse realized unavailable (pbp rebuild refused by cross-validation on 2024 — the gate working); RECOVERED from the harvest (league_history players_points, season totals, 254 players; roster-gated so a mid-season drop is truncated).

## What this does NOT settle

Correct cost accounting on unvalidated projections is still unvalidated: if our
player evaluations are wrong, a correctly-priced deviation is still wrong. That is
exp 33's job. And the composite-ordering variant (E.recommend, not just projections)
is a labelled follow-up needing the JS replay path.

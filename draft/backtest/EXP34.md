# EXPERIMENT 34 — recommendation vs market (policy-level)

_19 real decisions across three seasons; our ordering =
walk-forward projected value. Underpowered by construction (n~41); an
inconclusive CI (spans zero) reads as the anchor binding HARDER, not looser._

## PRIMARY — rank correlation over the available pool

- our ordering: mean rho 0.391 CI (0.3, 0.475)
- market (ADP): mean rho 0.269 CI (0.176, 0.349)
- **difference (our - market): 0.122 CI [0.007, 0.232] -> BEAT** over 19 picks

## Top-N set value (realized pts, our set vs market set)

- top-5: our 319.252 vs market 197.414 (delta 121.838, beat)
- top-10: our 259.174 vs market 187.45 (delta 71.724, beat)

## The deviation-edge surface (hit rate = took beat ADP-preferred available)

### by FORGONE VALUE (primary) (projected pts given up)

- value(<=0): n=7 hit=0.286 mean_delta=20.229 CI [-23.929, 73.7] inconclusive ⚠THIN
- near-zero: n=1 hit=1.0 mean_delta=42.52 CI [nan, nan] inconclusive ⚠THIN
- moderate: n=4 hit=0.5 mean_delta=-1.525 CI [-23.925, 22.25] inconclusive ⚠THIN
- large: n=6 hit=0.5 mean_delta=-87.483 CI [-203.623, 19.807] inconclusive ⚠THIN

### by ADP DISTANCE (comparison — which unit predicts better is a finding) (spots)

- <5: n=13 hit=0.231 mean_delta=-50.845 CI [-112.754, -2.011] lost
- 5-15: n=4 hit=0.75 mean_delta=46.0 CI [-2.9, 110.175] inconclusive ⚠THIN
- 15-30: n=1 hit=1.0 mean_delta=50.3 CI [nan, nan] inconclusive ⚠THIN
- >30: n=1 hit=1.0 mean_delta=76.4 CI [nan, nan] inconclusive ⚠THIN

### by ROUND / remaining-picks decay (round band)

- r1-3: n=4 hit=0.75 mean_delta=49.03 CI [3.55, 112.5] beat ⚠THIN
- r4-7: n=7 hit=0.571 mean_delta=12.5 CI [-8.486, 32.829] inconclusive ⚠THIN
- r8-11: n=5 hit=0.2 mean_delta=-16.752 CI [-64.552, 30.56] inconclusive ⚠THIN
- r12+: n=3 hit=0.0 mean_delta=-183.38 CI [-301.62, 0.0] inconclusive ⚠THIN

### by MARKET DISPERSION (ADP stdev)

- unanimous: n=3 hit=1.0 mean_delta=28.34 CI [10.5, 42.52] beat ⚠THIN
- mid: n=10 hit=0.2 mean_delta=-39.648 CI [-94.958, 1.474] inconclusive
- contested: n=6 hit=0.5 mean_delta=-6.47 CI [-136.943, 87.117] inconclusive ⚠THIN

### tier-cliff proximity

- crosses cliff: n=0 hit=None (tiers omitted this run -> expect thin/empty; measured tiers are exp 36)
- within tier:  n=0 hit=None

## Caveats

- [2025] NOT recovered: pbp rebuild disagreed with the library on 2024
- 2025: realized weekly unavailable (incl. pbp); season SKIPPED (not scored zero)

## What this does NOT settle

Correct cost accounting on unvalidated projections is still unvalidated: if our
player evaluations are wrong, a correctly-priced deviation is still wrong. That is
exp 33's job. And the composite-ordering variant (E.recommend, not just projections)
is a labelled follow-up needing the JS replay path.

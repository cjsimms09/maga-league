```
==============================================================================
STRATEGY TABLE — which weighting would have won our drafts
==============================================================================
git HEAD   0812dc8753d0d8166293bb25024b20d412ee852a
seasons    2023, 2024, 2025   (N=2)

With N this small we are CHOOSING AMONG PROFILES, not tuning eight dials.
Every number is paired profile-minus-Default on the same season+seat draft.

profile           seasons won   pooled edge      95% CI
  Default                 0/2          0.00     +/- 0.00   (baseline)
  Value-Anchor            1/2        -81.87   +/- 133.65
  Tier-Hunter             1/2        -61.65    +/- 89.76
  Need-Filler             1/2        -19.69    +/- 68.53
  Upside-Late             2/2        230.29   +/- 103.26
  Scarcity                1/2          6.24    +/- 44.24
  Keeper-Builder          0/2        -76.39    +/- 52.43
  Slider-Defaults         0/2          0.00     +/- 0.00

per-season edge over Default:
  profile                2023     2024     2025
  Value-Anchor      -324.75   161.01        —
  Tier-Hunter       -175.13    51.82        —
  Need-Filler        -83.18    43.80        —
  Upside-Late        275.72   184.87        —
  Scarcity           -33.27    45.74        —
  Keeper-Builder     -65.34   -87.43        —
  Slider-Defaults      0.00     0.00        —

--- SELECTION RULE (pre-registered) ---
  win-both (N<3, bar tightened by data availability)
  Cleared the rule: Upside-Late  (pooled +230.29, won 2/2)

--- PERTURBATION GATE (each weight jittered +/-25%) ---
  40 jittered variants; 100% still beat Default (threshold 75%)
  edge distribution:  p25 196.33   median 223.77   p75 250.83   worst 11.59
  SURVIVES the jitter. The edge is a property of the strategy, not one
  point in weight-space — but weight-jitter is a ROBUSTNESS test, not a
  null. This table grades vs Default with no outcome-shuffle baseline, so
  beating it is NECESSARY, NOT SUFFICIENT. Upside-Late is a
  CANDIDATE; it installs ONLY if it also clears the tournament null
  (LAB-TOURNAMENT.md, arch:balanced control, 200-draw shuffle p95).
  As of the last tournament run profile:upside_late scored $0 at the 0th
  percentile there (its tilt washes out to extra QBs through the composite),
  so it does NOT install.

STRATEGY-TABLE VERDICT: CANDIDATE — Upside-Late (robust vs Default; PENDING the tournament null gate before any install)

--- CAVEATS ---
  * [2025] could NOT be recovered: the play-by-play rebuild disagreed with the library on 2024 ({"season": 2024, "players_compared": 576, "official_only": 30, "rebuilt_only": 8, "mean_abs_diff": 0.489, "worst_diff": 11.0, "worst_diff_top200": 11.0, "tolerance": 0.5, "agrees": false})
  * weekly stats unavailable for [2025]; any season needing them as a prior or for grading is affected
  * 2025: replayed but NOTHING could be graded — its picks contribute nothing to the headline
  * Historical FFC ADP is name-matched against TODAY'S Sleeper player list, so a player who has since changed teams or retired may match differently than he would have that year.
  * Seasons replayed: [2023, 2024, 2025]
  * 2 seasons. The Part 8 C2 rule applies to reading this table:
    three drafts can pick a profile, they cannot tune weights.
==============================================================================
```

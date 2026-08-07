```
==============================================================================
STRATEGY TABLE — which weighting would have won our drafts
==============================================================================
git HEAD   af0c57031cef519e9524f725f3cee73684d09449
seasons    2023, 2024, 2025   (N=2)

With N this small we are CHOOSING AMONG PROFILES, not tuning eight dials.
Every number is paired profile-minus-Default on the same season+seat draft.

profile           seasons won   pooled edge      95% CI
  Default                 0/2          0.00     +/- 0.00   (baseline)
  Value-Anchor            0/2       -265.91   +/- 134.21
  Tier-Hunter             2/2         47.31    +/- 81.71
  Need-Filler             1/2        -29.14   +/- 136.29
  Upside-Late             1/2        156.35   +/- 121.18
  Scarcity                1/2         -7.59    +/- 89.11
  Keeper-Builder          0/2        -58.63    +/- 67.98
  Slider-Defaults         0/2          0.00     +/- 0.00

per-season edge over Default:
  profile                2023     2024     2025
  Value-Anchor      -466.45   -65.36        —
  Tier-Hunter         84.29    10.34        —
  Need-Filler       -194.24   135.97        —
  Upside-Late        327.16   -14.47        —
  Scarcity          -108.30    93.11        —
  Keeper-Builder    -117.25     0.00        —
  Slider-Defaults      0.00     0.00        —

--- SELECTION RULE (pre-registered) ---
  win-both (N<3, bar tightened by data availability)
  Cleared the rule: Tier-Hunter  (pooled +47.31, won 2/2)

--- PERTURBATION GATE (each weight jittered +/-25%) ---
  40 jittered variants; 73% still beat Default (threshold 75%)
  edge distribution:  p25 -14.56   median 49.42   p75 73.13   worst -112.60
  DID NOT SURVIVE. The edge collapsed under small perturbation — it lived
  at one exact point in weight-space, which is noise wearing a crown.
  DEFAULT STANDS.

INSTALL DECISION: NO — Default stands

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

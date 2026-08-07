```
==============================================================================
STRATEGY TABLE — which weighting would have won our drafts
==============================================================================
git HEAD   ab005bd8a27b50b2ae93d3e629b9e7ed806a4dcc
seasons    2023, 2024, 2025   (N=2)

With N this small we are CHOOSING AMONG PROFILES, not tuning eight dials.
Every number is paired profile-minus-Default on the same season+seat draft.

profile           seasons won   pooled edge      95% CI
  Default                 0/2          0.00     +/- 0.00   (baseline)
  Value-Anchor            1/2       -189.86    +/- 92.12
  Tier-Hunter             0/2       -194.47   +/- 105.96
  Need-Filler             2/2        122.18   +/- 109.86
  Upside-Late             2/2        154.29   +/- 117.26
  Scarcity                2/2         24.52    +/- 55.06
  Keeper-Builder          1/2         14.25    +/- 27.94
  Slider-Defaults         0/2          0.00     +/- 0.00

per-season edge over Default:
  profile                2023     2024     2025
  Value-Anchor      -390.29    10.57        —
  Tier-Hunter       -176.18  -212.76        —
  Need-Filler         74.64   169.73        —
  Upside-Late        243.54    65.04        —
  Scarcity            13.66    35.39        —
  Keeper-Builder      28.51     0.00        —
  Slider-Defaults      0.00     0.00        —

--- SELECTION RULE (pre-registered) ---
  win-both (N<3, bar tightened by data availability)
  Cleared the rule: Upside-Late  (pooled +154.29, won 2/2)

--- PERTURBATION GATE (each weight jittered +/-25%) ---
  40 jittered variants; 88% still beat Default (threshold 75%)
  edge distribution:  p25 52.72   median 186.18   p75 219.36   worst -68.70
  SURVIVES. The edge is a property of the strategy, not one point in
  weight-space. INSTALL Upside-Late as the League-Tuned preset.

INSTALL DECISION: YES — Upside-Late

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

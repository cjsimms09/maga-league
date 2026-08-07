```
==============================================================================
HISTORICAL BACKTEST — does the composite beat ADP on our own drafts?
==============================================================================

git HEAD        697bd0d889aa2ebff1a7bff6a4fa7f9f008d5472
seasons         2023, 2024, 2025
graded picks    260  (rounds 1-12)

--- 1. HEADLINE ---
  mean actual points of the recommended player
    B0  ADP                 233.34
    B1  projected points    254.56
    B2  VORP                134.27
    B3  full composite      167.44
  B3 - B0 per pick          -65.91  +/- 28.00
  B3 - B0 per draft         -571.18  +/- 482.61   (n=30 drafts)

  VERDICT AGAINST THE PRE-REGISTERED BAR (10 pts/draft):
    BELOW THE BAR. The composite gains -571.18 points per draft,
    under the 10 the spec set. Said plainly: on this evidence the
    sophistication is not paying for itself. That is a finding, not a failure.

--- 2. THE DISAGREEMENT SUBSET (where the model claims edge) ---
  picks where B3 != B0      253  (97.3% of graded)
  win rate on those         34.8%
  mean gain on those        -67.73  +/- 28.74
  (Picks where the two agree cannot show edge either way — this is the
   honest denominator, and it is always smaller than the headline sample.)

--- 3. PER ROUND ---
  round      n   mean gain      95% CI
      1     11      173.89   +/- 106.05
      2     15      308.18   +/- 141.32
      3     20       73.10   +/- 134.10
      4     27     -123.56    +/- 80.92
      5     21     -325.68    +/- 70.66
      6     22      -97.63    +/- 60.57
      7     17      -94.57    +/- 39.97
      8     26      -70.33    +/- 29.77
      9     25      -50.00    +/- 65.44
     10     25     -162.00    +/- 65.39
     11     25      -78.71    +/- 78.93
     12     26      -80.98    +/- 72.15

  PRE-REGISTERED EXPECTATION (written before any result): edge concentrates
  in rounds 3-9, near zero in round 1.
  ** BUG ALARM ** round 1 shows 173.89 points/pick, past the 8 threshold.
  The top of the board is where the market is most efficient. An edge this
  large there is more likely a leak than an insight. Investigate the AsOf
  store and the projection fit BEFORE believing any number in this report.

--- 4. SURVIVAL CALIBRATION ---
  Does "70% likely to last" mean he lasted 70% of the time?
  bucket        n   predicted   actual    error
  0-10%       526        0.05     0.41     0.36
  10-20%      170        0.15     0.59     0.44
  20-30%      135        0.25     0.61     0.36
  30-40%      143        0.35     0.67     0.32
  40-50%      128        0.45     0.74     0.29
  50-60%      167        0.55     0.77     0.22
  60-70%      189        0.65     0.69     0.04
  70-80%      227        0.75     0.76     0.01
  80-90%      356        0.85     0.77    -0.08
  90-100%    2483        0.95     0.94    -0.01
  (positive error = too pessimistic; negative = overconfident.)
  This is the empirical answer on adp_sd and the need-aware layer, and it
  is worth more than the headline: the headline is one number on three
  drafts, this is thousands of individual predictions.

--- 5. MODEL vs HUMAN ---
  picks where B3 disagreed with the manager  229
  B3 scored more often                       35.8%
  mean gain over the human                   -22.79  +/- 27.23
  (Includes my own picks. Seeds the override analysis with real history.)

--- 6. CAVEATS (mandatory) ---
  * [2025] could NOT be recovered: the play-by-play rebuild disagreed with the library on 2024 ({"season": 2024, "players_compared": 576, "official_only": 30, "rebuilt_only": 8, "mean_abs_diff": 0.489, "worst_diff": 11.0, "worst_diff_top200": 11.0, "tolerance": 0.5, "agrees": false})
  * weekly stats unavailable for [2025]; any season needing them as a prior or for grading is affected
  * 2025: replayed but NOTHING could be graded — its picks contribute nothing to the headline
  * Historical FFC ADP is name-matched against TODAY'S Sleeper player list, so a player who has since changed teams or retired may match differently than he would have that year.
  * Seasons replayed: [2023, 2024, 2025]
  * Sample: 30 drafts. Confidence intervals above are the
    finding, not decoration. Do NOT read per-weight conclusions out of this.
  * Projections are era-appropriate reconstructions, not archived forecasts.
    This grades the DECISION MACHINERY on plausible inputs; it is not a test
    of projection accuracy and must not be cited as one.
  * 2023 used walk_forward (spearman vs ADP 0.60)
  * 2024 used walk_forward (spearman vs ADP 0.53)
  * 2025 used walk_forward (spearman vs ADP 0.54)
==============================================================================
```

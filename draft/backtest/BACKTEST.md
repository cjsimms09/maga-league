```
==============================================================================
HISTORICAL BACKTEST — does the composite beat ADP on our own drafts?
==============================================================================

git HEAD        69d02a68760099ac1c84f84a4bd5ee544a0b5702
seasons         2023, 2024, 2025
graded picks    317  (rounds 1-12)

--- 1. HEADLINE ---
  mean actual points of the recommended player
    B0  ADP                 220.76
    B1  projected points    353.44
    B2  VORP                176.64
    B3  full composite      181.44
  B3 - B0 per pick          -39.32  +/- 22.70
  B3 - B0 per draft         -415.44  +/- 226.79   (n=30 drafts)

  VERDICT AGAINST THE PRE-REGISTERED BAR (10 pts/draft):
    BELOW THE BAR. The composite gains -415.44 points per draft,
    under the 10 the spec set. Said plainly: on this evidence the
    sophistication is not paying for itself. That is a finding, not a failure.

--- 2. THE DISAGREEMENT SUBSET (where the model claims edge) ---
  picks where B3 != B0      307  (96.8% of graded)
  win rate on those         40.1%
  mean gain on those        -40.60  +/- 23.42
  (Picks where the two agree cannot show edge either way — this is the
   honest denominator, and it is always smaller than the headline sample.)

--- 3. PER ROUND ---
  round      n   mean gain      95% CI
      1     12      220.53    +/- 25.52
      2     15      368.56    +/- 63.99
      3     20      176.20    +/- 97.28
      4     30      -13.69    +/- 96.22
      5     30     -170.99    +/- 75.68
      6     30      -98.14    +/- 40.91
      7     30      -48.15    +/- 31.98
      8     30      -67.68    +/- 36.02
      9     30      -66.56    +/- 54.17
     10     30     -154.51    +/- 37.35
     11     30     -101.90    +/- 57.02
     12     30      -83.80    +/- 56.88

  PRE-REGISTERED EXPECTATION (written before any result): edge concentrates
  in rounds 3-9, near zero in round 1.
  ** BUG ALARM ** round 1 shows 220.53 points/pick, past the 8 threshold.
  The top of the board is where the market is most efficient. An edge this
  large there is more likely a leak than an insight. Investigate the AsOf
  store and the projection fit BEFORE believing any number in this report.

--- 4. SURVIVAL CALIBRATION ---
  Does "70% likely to last" mean he lasted 70% of the time?
  bucket        n   predicted   actual    error
  0-10%       624        0.05     0.41     0.36
  10-20%      244        0.15     0.63     0.48
  20-30%      209        0.25     0.68     0.43
  30-40%      210        0.35     0.77     0.42
  40-50%      200        0.45     0.83     0.38
  50-60%      236        0.55     0.83     0.28
  60-70%      266        0.65     0.82     0.17
  70-80%      280        0.75     0.90     0.15
  80-90%      407        0.85     0.87     0.02
  90-100%    1848        0.95     0.95     0.00
  (positive error = too pessimistic; negative = overconfident.)
  This is the empirical answer on adp_sd and the need-aware layer, and it
  is worth more than the headline: the headline is one number on three
  drafts, this is thousands of individual predictions.

--- 5. MODEL vs HUMAN ---
  picks where B3 disagreed with the manager  277
  B3 scored more often                       39.0%
  mean gain over the human                   -0.02  +/- 22.44
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

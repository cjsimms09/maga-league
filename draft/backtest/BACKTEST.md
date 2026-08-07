```
==============================================================================
HISTORICAL BACKTEST — does the composite beat ADP on our own drafts?
==============================================================================

git HEAD        af0c57031cef519e9524f725f3cee73684d09449
seasons         2023, 2024, 2025
graded picks    168  (rounds 1-12)

--- 1. HEADLINE ---
  mean actual points of the recommended player
    B0  ADP                 213.62
    B1  projected points    188.97
    B2  VORP                139.09
    B3  full composite      138.16
  B3 - B0 per pick          -75.46  +/- 40.77
  B3 - B0 per draft         -633.85  +/- 660.26   (n=20 drafts)

  VERDICT AGAINST THE PRE-REGISTERED BAR (10 pts/draft):
    INCONCLUSIVE. The confidence interval crosses zero, so this sample
    cannot distinguish the composite from ADP in either direction.
    That is a statement about N, not a verdict on the model.

    NOTE: B3 does not beat plain VORP (B2). Whatever edge exists is in the
    value model, not in the survival/tier/need machinery above it.

--- 2. THE DISAGREEMENT SUBSET (where the model claims edge) ---
  picks where B3 != B0      165  (98.2% of graded)
  win rate on those         21.2%
  mean gain on those        -76.83  +/- 41.49
  (Picks where the two agree cannot show edge either way — this is the
   honest denominator, and it is always smaller than the headline sample.)

--- 3. PER ROUND ---
  round      n   mean gain      95% CI
      1     11      288.98   +/- 128.61
      2     12      358.55   +/- 191.80
      3     14      184.81   +/- 195.05
      4     17      -65.73    +/- 67.89
      5     11     -259.35   +/- 134.68
      6     12     -105.47    +/- 99.52
      7     14     -118.67    +/- 43.51
      8     16     -110.37    +/- 41.90
      9     15     -121.81    +/- 55.89
     10     15     -275.50    +/- 47.09
     11     15     -271.74    +/- 29.88
     12     16     -252.92    +/- 31.20

  PRE-REGISTERED EXPECTATION (written before any result): edge concentrates
  in rounds 3-9, near zero in round 1.
  ** BUG ALARM ** round 1 shows 288.98 points/pick, past the 8 threshold.
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
  picks where B3 disagreed with the manager  159
  B3 scored more often                       29.6%
  mean gain over the human                   -43.53  +/- 33.39
  (Includes my own picks. Seeds the override analysis with real history.)

--- 6. CAVEATS (mandatory) ---
  * [2025] could NOT be recovered: the play-by-play rebuild disagreed with the library on 2024 ({"season": 2024, "players_compared": 576, "official_only": 30, "rebuilt_only": 8, "mean_abs_diff": 0.489, "worst_diff": 11.0, "worst_diff_top200": 11.0, "tolerance": 0.5, "agrees": false})
  * weekly stats unavailable for [2025]; any season needing them as a prior or for grading is affected
  * 2025: replayed but NOTHING could be graded — its picks contribute nothing to the headline
  * Historical FFC ADP is name-matched against TODAY'S Sleeper player list, so a player who has since changed teams or retired may match differently than he would have that year.
  * Seasons replayed: [2023, 2024, 2025]
  * Sample: 20 drafts. Confidence intervals above are the
    finding, not decoration. Do NOT read per-weight conclusions out of this.
  * Projections are era-appropriate reconstructions, not archived forecasts.
    This grades the DECISION MACHINERY on plausible inputs; it is not a test
    of projection accuracy and must not be cited as one.
  * 2023 used walk_forward (spearman vs ADP 0.60)
  * 2024 used walk_forward (spearman vs ADP 0.53)
  * 2025 used walk_forward (spearman vs ADP 0.54)
==============================================================================

==============================================================================
D1 CUT — VALUE OVER POSITIONAL REPLACEMENT (points minus replacement)
==============================================================================
  This discounts an elite QB's raw total by the high replacement QB —
  the reason ADP sends QBs late. Reported alongside the raw metric; no
  install happens off either until D1 is ruled.
  B0 -19.07  B2(VORP) -197.94  B3 -176.58
  B3-B0 per pick   -157.52 +/- 34.86
  B3-B0 per draft  -1323.14 +/- 738.13
  round-1 gain     130.24 +/- 129.04
  ROUND-1 ALARM STILL FIRES under value grading — the composite genuinely over-drafts QBs in round 1; that is an ENGINE finding, not a metric one.
  per-round value gain (B3-B0):
    r1  130.24 +/- 129.04
    r2  194.46 +/- 190.97
    r3  21.17 +/- 194.15
    r4  -153.38 +/- 84.47
    r5  -295.36 +/- 115.03
    r6  -208.03 +/- 106.4
    r7  -217.57 +/- 42.94
    r8  -217.25 +/- 6.46
    r9  -229.04 +/- 23.25
    r10  -274.26 +/- 26.22
    r11  -260.76 +/- 30.66
    r12  -261.86 +/- 33.81
```

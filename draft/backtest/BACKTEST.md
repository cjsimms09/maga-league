```
==============================================================================
HISTORICAL BACKTEST — does the composite beat ADP on our own drafts?
==============================================================================

git HEAD        67b30ffa9a635c43007cba46f8cf3d7f2d1da1cb
seasons         2023, 2024, 2025
graded picks    172  (rounds 1-12)

--- 1. HEADLINE ---
  mean actual points of the recommended player
    B0  ADP                 238.10
    B1  projected points    165.50
    B2  VORP                26.75
    B3  full composite      64.13
  B3 - B0 per pick          -173.97  +/- 20.27
  B3 - B0 per draft         -1496.10  +/- 181.29   (n=20 drafts)

  VERDICT AGAINST THE PRE-REGISTERED BAR (10 pts/draft):
    BELOW THE BAR. The composite gains -1496.10 points per draft,
    under the 10 the spec set. Said plainly: on this evidence the
    sophistication is not paying for itself. That is a finding, not a failure.

--- 2. THE DISAGREEMENT SUBSET (where the model claims edge) ---
  picks where B3 != B0      171  (99.4% of graded)
  win rate on those         7.0%
  mean gain on those        -174.98  +/- 20.29
  (Picks where the two agree cannot show edge either way — this is the
   honest denominator, and it is always smaller than the headline sample.)

--- 3. PER ROUND ---
  round      n   mean gain      95% CI
      1      1      -77.20     +/- 0.00
      2      2     -257.40     +/- 0.00
      3      5     -126.94   +/- 213.74
      4     19      -65.78    +/- 42.63
      5     17     -225.24    +/- 74.83
      6     14      -95.76    +/- 58.47
      7     15      -93.36    +/- 49.15
      8     19     -101.59    +/- 52.63
      9     20     -148.17    +/- 44.13
     10     20     -243.71    +/- 53.13
     11     20     -275.30    +/- 36.49
     12     20     -280.09    +/- 28.54

  PRE-REGISTERED EXPECTATION (written before any result): edge concentrates
  in rounds 3-9, near zero in round 1.
  ** BUG ALARM ** round 1 shows -77.20 points/pick, past the 8 threshold.
  The top of the board is where the market is most efficient. An edge this
  large there is more likely a leak than an insight. Investigate the AsOf
  store and the projection fit BEFORE believing any number in this report.

--- 4. SURVIVAL CALIBRATION ---
  Does "70% likely to last" mean he lasted 70% of the time?
  bucket        n   predicted   actual    error
  0-10%       610        0.05     0.52     0.47
  10-20%      134        0.15     0.68     0.53
  20-30%       91        0.25     0.72     0.47
  30-40%       87        0.35     0.81     0.46
  40-50%       78        0.45     0.86     0.41
  50-60%       98        0.55     0.83     0.28
  60-70%      108        0.65     0.82     0.17
  70-80%      111        0.75     0.88     0.13
  80-90%      190        0.85     0.83    -0.02
  90-100%    2657        0.95     0.96     0.01
  (positive error = too pessimistic; negative = overconfident.)
  This is the empirical answer on adp_sd and the need-aware layer, and it
  is worth more than the headline: the headline is one number on three
  drafts, this is thousands of individual predictions.

--- 5. MODEL vs HUMAN ---
  picks where B3 disagreed with the manager  158
  B3 scored more often                       12.7%
  mean gain over the human                   -107.57  +/- 19.70
  (Includes my own picks. Seeds the override analysis with real history.)

--- 6. CAVEATS (mandatory) ---
  * [2025] could NOT be recovered: the play-by-play rebuild disagreed with the library on 2024 ({"season": 2024, "players_compared": 576, "official_only": 30, "rebuilt_only": 8, "mean_abs_diff": 0.149, "worst_diff": 11.0, "worst_diff_top200": 11.0, "tolerance": 0.5, "agrees": false})
  * weekly stats unavailable for [2025]; any season needing them as a prior or for grading is affected
  * 2025: replayed but NOTHING could be graded — its picks contribute nothing to the headline
  * Dispersion (proj_ceiling/proj_floor/proj_sd) is the MEASURED per-(position,band) calibration fitted leave-one-season-out, not the former 1.35x/0.25x constants. It is still proj_mean x a per-CELL constant, so it varies between bands and not within them: a ceiling weight fitted here measures cross-band dispersion differences only.
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
  B0 -4.08  B2(VORP) -308.02  B3 -136.61
  B3-B0 per pick   -132.54 +/- 18.03
  B3-B0 per draft  -1139.82 +/- 260.61
  round-1 gain     -77.2 +/- 0
  ROUND-1 ALARM STILL FIRES under value grading — the composite genuinely over-drafts QBs in round 1; that is an ENGINE finding, not a metric one.
  per-round value gain (B3-B0):
    r1  -77.2 +/- 0
    r2  -264.5 +/- 0
    r3  -162.72 +/- 151.34
    r4  -89.29 +/- 47.82
    r5  -196.71 +/- 72.25
    r6  -133.93 +/- 86.87
    r7  -105.93 +/- 78.33
    r8  -111.1 +/- 58.44
    r9  -141.72 +/- 38.37
    r10  -129.62 +/- 54.65
    r11  -122.29 +/- 40.1
    r12  -144.43 +/- 15.7
```

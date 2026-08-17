```
==============================================================================
HISTORICAL BACKTEST — does the composite beat ADP on our own drafts?
==============================================================================

git HEAD        32835a80163a43503b34699f59920c05b785354d
seasons         2023, 2024, 2025
graded picks    202  (rounds 1-12)

--- 1. HEADLINE ---
  mean actual points of the recommended player
    B0  ADP                 219.63
    B1  projected points    218.86
    B2  VORP                139.09
    B3  full composite      94.94
  B3 - B0 per pick          -124.69  +/- 25.36
  B3 - B0 per draft         -1259.39  +/- 165.94   (n=20 drafts)

  VERDICT AGAINST THE PRE-REGISTERED BAR (10 pts/draft):
    BELOW THE BAR. The composite gains -1259.39 points per draft,
    under the 10 the spec set. Said plainly: on this evidence the
    sophistication is not paying for itself. That is a finding, not a failure.

    NOTE: B3 does not beat plain VORP (B2). Whatever edge exists is in the
    value model, not in the survival/tier/need machinery above it.

--- 2. THE DISAGREEMENT SUBSET (where the model claims edge) ---
  picks where B3 != B0      190  (94.1% of graded)
  win rate on those         16.3%
  mean gain on those        -132.57  +/- 26.57
  (Picks where the two agree cannot show edge either way — this is the
   honest denominator, and it is always smaller than the headline sample.)

--- 3. PER ROUND ---
  round      n   mean gain      95% CI
      1     11       -7.02    +/- 13.76
      2     12       87.84    +/- 92.12
      3     14      180.76   +/- 159.01
      4     20      -62.49    +/- 40.95
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
  Round 1 is -7.02 points/pick — consistent with the expectation.

--- 4. SURVIVAL CALIBRATION ---
  Does "70% likely to last" mean he lasted 70% of the time?
  bucket        n   predicted   actual    error
  0-10%       730        0.05     0.47     0.42
  10-20%      143        0.15     0.67     0.52
  20-30%      100        0.25     0.71     0.46
  30-40%       95        0.35     0.78     0.43
  40-50%       85        0.45     0.83     0.39
  50-60%      109        0.55     0.81     0.26
  60-70%      117        0.65     0.81     0.16
  70-80%      121        0.75     0.88     0.13
  80-90%      204        0.85     0.83    -0.02
  90-100%    2820        0.95     0.96     0.01
  (positive error = too pessimistic; negative = overconfident.)
  This is the empirical answer on adp_sd and the need-aware layer, and it
  is worth more than the headline: the headline is one number on three
  drafts, this is thousands of individual predictions.

--- 5. MODEL vs HUMAN ---
  picks where B3 disagreed with the manager  185
  B3 scored more often                       18.4%
  mean gain over the human                   -83.55  +/- 21.99
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
  B0 -14.45  B2(VORP) -197.94  B3 -109.7
  B3-B0 per pick   -95.25 +/- 20.58
  B3-B0 per draft  -962.01 +/- 257.38
  round-1 gain     -7.02 +/- 13.76
  Round-1 alarm CLEARS under value grading — confirming the raw-points alarm was a QB metric artifact, per D1.
  per-round value gain (B3-B0):
    r1  -7.02 +/- 13.76
    r2  85.11 +/- 93.07
    r3  85.17 +/- 122.15
    r4  -84.83 +/- 46.2
    r5  -196.71 +/- 72.25
    r6  -133.93 +/- 86.87
    r7  -105.93 +/- 78.33
    r8  -111.1 +/- 58.44
    r9  -141.72 +/- 38.37
    r10  -129.62 +/- 54.65
    r11  -122.29 +/- 40.1
    r12  -144.43 +/- 15.7
```

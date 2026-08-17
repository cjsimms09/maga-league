```
==============================================================================
STRATEGY TABLE — which weighting would have won our drafts
==============================================================================
git HEAD   67b30ffa9a635c43007cba46f8cf3d7f2d1da1cb
seasons    2023, 2024, 2025   (N=2)

With N this small we are CHOOSING AMONG PROFILES, not tuning eight dials.
Every number is paired profile-minus-Default on the same season+seat draft.

profile           seasons won   pooled edge      95% CI
  Default                 0/2          0.00     +/- 0.00   (baseline)
  Value-Anchor            0/2        -54.47    +/- 50.42
  Tier-Hunter             1/2         -5.93    +/- 24.94
  Need-Filler             2/2         41.62    +/- 82.17
  Upside-Late             0/2        -79.21    +/- 58.70
  Scarcity                1/2         -1.98    +/- 36.77
  Keeper-Builder          0/2          0.00     +/- 0.00
  Slider-Defaults         0/2          0.00     +/- 0.00

per-season edge over Default:
  profile                2023     2024     2025
  Value-Anchor       -77.71   -31.23        —
  Tier-Hunter         16.24   -28.10        —
  Need-Filler         73.23    10.02        —
  Upside-Late        -79.58   -78.84        —
  Scarcity            23.50   -27.45        —
  Keeper-Builder       0.00     0.00        —
  Slider-Defaults      0.00     0.00        —

--- SELECTION RULE (pre-registered) ---
  win-both (N<3, bar tightened by data availability)
  Cleared the rule: Need-Filler  (pooled +41.62, won 2/2)

--- PERTURBATION GATE (each weight jittered +/-25%) ---
  40 jittered variants; 88% still beat Default (threshold 75%)
  edge distribution:  p25 19.77   median 54.05   p75 84.16   worst -23.18
  SURVIVES the jitter. The edge is a property of the strategy, not one
  point in weight-space — but weight-jitter is a ROBUSTNESS test, not a
  null. This table grades vs Default with no outcome-shuffle baseline, so
  beating it is NECESSARY, NOT SUFFICIENT. Need-Filler is a
  CANDIDATE; it installs ONLY if it also clears the tournament null
  (LAB-TOURNAMENT.md, arch:balanced control, 200-draw shuffle p95).

STRATEGY-TABLE VERDICT: CANDIDATE — Need-Filler (robust vs Default; PENDING the tournament null gate before any install)

--- CAVEATS ---
  * [2025] could NOT be recovered: the play-by-play rebuild disagreed with the library on 2024 ({"season": 2024, "players_compared": 576, "official_only": 30, "rebuilt_only": 8, "mean_abs_diff": 0.149, "worst_diff": 11.0, "worst_diff_top200": 11.0, "tolerance": 0.5, "agrees": false})
  * weekly stats unavailable for [2025]; any season needing them as a prior or for grading is affected
  * 2025: replayed but NOTHING could be graded — its picks contribute nothing to the headline
  * Dispersion (proj_ceiling/proj_floor/proj_sd) is the MEASURED per-(position,band) calibration fitted leave-one-season-out, not the former 1.35x/0.25x constants. It is still proj_mean x a per-CELL constant, so it varies between bands and not within them: a ceiling weight fitted here measures cross-band dispersion differences only.
  * Historical FFC ADP is name-matched against TODAY'S Sleeper player list, so a player who has since changed teams or retired may match differently than he would have that year.
  * Seasons replayed: [2023, 2024, 2025]
  * 2 seasons. The Part 8 C2 rule applies to reading this table:
    three drafts can pick a profile, they cannot tune weights.
  * NO OUTCOME-SHUFFLE NULL here. Control is Default weighting; the only gate is
    weight-jitter robustness. A profile can beat Default handily and still score
    ~$0 at a low percentile in the tournament (arch:balanced control + 200-draw
    shuffle null) — that has happened, and the tournament verdict governs. Nothing
    installs from this table alone.
==============================================================================
```

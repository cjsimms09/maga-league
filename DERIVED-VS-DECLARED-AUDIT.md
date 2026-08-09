# DERIVED-VS-DECLARED AUDIT — hand-set values that should be measured

_Live audit per the PREFER-DERIVED-OVER-DECLARED principle (SESSION-A.md). Each row is a
value currently ASSIGNED BY HAND that could be a function of evidence. Nothing here
installs without the usual gates (null + leave-one-season-out on our data) — this is
about what SHOULD be measured, not lowering a bar. Ordered by money impact. Started
2026-08-09; both sessions append and tick off as derivations land._

## ✅ Already DERIVED (the pattern to copy)

- **Market efficiency / anchor strength** — `MARKET_EFFICIENCY` in deviation.js is read
  from exp 36 (measured per round×position), not hand-set. The deviation card's
  "where: weak/well" line is derived.
- **Confidence language** — `EVIDENCE_STATE` (deviation.js) derives every tier sentence
  from what experiments reported.
- **Evidence weight** — `evidence_weight.py` computes league-vs-external weight from
  precision × measured transferability (replaced the static tier this commit).

## ◻ TO DERIVE — ordered by expected dollars

| value | where | hand-set now | proposed DERIVATION | gate |
|---|---|---|---|---|
| **REGRESSION_WEIGHT** | `projections.py` | 0.35 | exp 35 measured the full curve (monotonic; lower = better whole-board top-decile). Derive the installed weight from the curve's gate-cleared optimum, not a guess. **Highest impact — projections feed every rec.** | null + LOSO; exp-33b pool check at Cory's picks |
| **noiseBand (deviation silence)** | `doctrine.js` / `deviation.js` | 4.0 (dollars) | Already found INERT. Derive PER-REGION from the exp-36 reliability surface + the forgone-value distribution — the band should be wide where the market ranks weakly (deviate freely) and tight where it ranks well. One flat band on a board whose right band varies by an order of magnitude is the T=4.0 symptom. | measured; per-region |
| **DOCTRINE_TILT (max tilt)** | `doctrine.js` | 2.5 | Derive from the MEASURED dollar edge a doctrine actually produced in the tournament, not a chosen ceiling — a tilt should be as large as the evidence for it, no larger. | tournament money-graded + gates |
| **spike-week `bar`** | `bbm_translate.py` | caller-passed | Derive from the harvested weekly-high threshold distribution (`money_grade.weekly_high_threshold_distribution`, median ≈148.5), NOT a round number — the bar that actually wins a weekly-high IS the measurement. | already available; wire it |
| **market-quality cuts** | `deviation.js` | 0.2/0.5/0.75 | The weak/moderate/strong band edges should be QUANTILES of the measured efficiency distribution (exp 36), not round numbers — "weak" means "bottom third of measured regions", which moves as more cells are measured. | derive from exp36 dist |
| **AGE_PEAK / AGE_DECAY** | `projections.py` | per-pos constants | Fit the age→production curve per position on historical data (nflverse has large n; BBM larger). The RB cliff etc. are measurable, not assumable. | fit + CV; gate before install |
| **SEASON_WEIGHTS** | `projections.py` | [0.7, 0.3] | Derive the recency weighting by which weights best predict next-season on walk-forward CV. | walk-forward CV |
| **EXPECTED_GAMES** | `projections.py` | 15.5 | Derive from measured availability (games-played distribution) by position/age, rather than one number for everyone. | measured; per-pos |
| **CELL_FLOOR (rank a cell)** | `exp36.py` | 8 | Derive the n-floor from where the bootstrap CI becomes informative (width < a threshold), not a round n. | measured |
| **MIN_GAMES_FOR_RATE / SANITY_MIN_SPEARMAN** | `projections.py` | 4 / 0.30 | Trust/sanity thresholds — derive from where small-sample rates become predictive and where a projection stops correlating with outcomes. | measured; lower priority |

## Notes

- **MARKET_TEAMS = 10** (deviation.js) and **MAJORITY = 0.5** (exp41) are REAL constants
  (league size; a literal majority) — not measurements in disguise. Left as-is.
- **PLACEHOLDER_TRANSFER = 0.25** (evidence_weight.py) is already an explicit, flagged
  placeholder with its replacement named (measured transferability) — the correct pattern
  for a value we cannot derive yet.
- The **Annual** is the recompute point for all of these; several also recompute whenever
  a new experiment reports (the derived ones already do).

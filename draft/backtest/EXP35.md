# EXPERIMENT 35 — REGRESSION_WEIGHT sweep

_Pre-registered: top-decile improves as the weight falls below the shipped 0.35
(exp 33 said we over-regress). Sweep, not tune — the full curve, with the shipped
value marked. NOTHING installs here; a change is a separate gated SHIP decision._

Pre-registration: top-decile improves as weight falls below 0.35; flat => not the lever; peak at/above 0.35 => over-regression refuted.

## POOLED CURVE (all seasons, board players with proj+realized)

| REGRESSION_WEIGHT | n | top-decile | rank-corr | MAE |
|---|---|---|---|---|
| 0.0 | 764 | 0.513 | 0.636 | 47.73 |
| 0.1 | 764 | 0.5 | 0.63 | 49.08 |
| 0.2 | 764 | 0.474 | 0.622 | 50.54 |
| 0.35 ← shipped | 764 | 0.395 | 0.603 | 53.06 |
| 0.5 | 764 | 0.355 | 0.578 | 55.95 |
| 0.7 | 764 | 0.329 | 0.527 | 60.43 |
| 1.0 | 764 | 0.276 | 0.241 | 67.79 |

- naive baseline top-decile (reference, no regression): **0.566**
- **CONFIRMS the pre-registration: top-decile peaks BELOW the shipped 0.35 (peak at 0.0). Over-regression is a real lever — but installing a new value is a separate gated SHIP decision, not done here.**
- peak weight 0.0 (top-decile 0.513) vs shipped 0.395

## Per season

### 2026 — peak 0.0, naive td 0.333
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.4 | 0.543 |  |
| 0.1 | 0.333 | 0.544 |  |
| 0.2 | 0.333 | 0.541 |  |
| 0.35 | 0.333 | 0.534 | ← shipped |
| 0.5 | 0.333 | 0.51 |  |
| 0.7 | 0.333 | 0.46 |  |
| 1.0 | 0.267 | 0.242 |  |

### 2025 — peak 0.1, naive td 0.471
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.529 | 0.628 |  |
| 0.1 | 0.588 | 0.623 |  |
| 0.2 | 0.529 | 0.616 |  |
| 0.35 | 0.529 | 0.607 | ← shipped |
| 0.5 | 0.529 | 0.59 |  |
| 0.7 | 0.529 | 0.555 |  |
| 1.0 | 0.294 | 0.256 |  |

### 2024 — peak 0.0, naive td 0.587
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.543 | 0.616 |  |
| 0.1 | 0.522 | 0.608 |  |
| 0.2 | 0.522 | 0.598 |  |
| 0.35 | 0.413 | 0.578 | ← shipped |
| 0.5 | 0.391 | 0.55 |  |
| 0.7 | 0.391 | 0.505 |  |
| 1.0 | 0.304 | 0.192 |  |

### 2023 — peak 0.0, naive td 0.565
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.5 | 0.645 |  |
| 0.1 | 0.478 | 0.637 |  |
| 0.2 | 0.457 | 0.626 |  |
| 0.35 | 0.413 | 0.603 | ← shipped |
| 0.5 | 0.391 | 0.574 |  |
| 0.7 | 0.391 | 0.521 |  |
| 1.0 | 0.326 | 0.207 |  |

## Caveats

- 2026: realized from harvest (nflverse unavailable)
- 2025: realized from harvest (nflverse unavailable)

_NOTHING installs here. A weight change is a separate SHIP decision gated on null + leave-one-season-out CV, cited and reversible._

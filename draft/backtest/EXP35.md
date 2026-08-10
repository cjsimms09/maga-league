# EXPERIMENT 35 — REGRESSION_WEIGHT sweep

_Pre-registered: top-decile improves as the weight falls below the shipped 0.35
(exp 33 said we over-regress). Sweep, not tune — the full curve, with the shipped
value marked. NOTHING installs here; a change is a separate gated SHIP decision._

Pre-registration: top-decile improves as weight falls below 0.35; flat => not the lever; peak at/above 0.35 => over-regression refuted.

## POOLED CURVE (all seasons, board players with proj+realized)

| REGRESSION_WEIGHT | n | top-decile | rank-corr | MAE |
|---|---|---|---|---|
| 0.0 | 764 | 0.513 | 0.641 | 47.74 |
| 0.1 | 764 | 0.487 | 0.635 | 49.05 |
| 0.2 | 764 | 0.461 | 0.627 | 50.51 |
| 0.35 ← shipped | 764 | 0.395 | 0.608 | 53.0 |
| 0.5 | 764 | 0.355 | 0.583 | 55.87 |
| 0.7 | 764 | 0.329 | 0.533 | 60.35 |
| 1.0 | 764 | 0.276 | 0.252 | 67.74 |

- naive baseline top-decile (reference, no regression): **0.566**
- **CONFIRMS the pre-registration: top-decile peaks BELOW the shipped 0.35 (peak at 0.0). Over-regression is a real lever — but installing a new value is a separate gated SHIP decision, not done here.**
- peak weight 0.0 (top-decile 0.513) vs shipped 0.395

## Per season

### 2025 — peak 0.1, naive td 0.471
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.529 | 0.624 |  |
| 0.1 | 0.588 | 0.62 |  |
| 0.2 | 0.529 | 0.611 |  |
| 0.35 | 0.529 | 0.605 | ← shipped |
| 0.5 | 0.529 | 0.579 |  |
| 0.7 | 0.529 | 0.546 |  |
| 1.0 | 0.353 | 0.242 |  |

### 2024 — peak 0.0, naive td 0.587
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.543 | 0.617 |  |
| 0.1 | 0.543 | 0.611 |  |
| 0.2 | 0.522 | 0.601 |  |
| 0.35 | 0.413 | 0.581 | ← shipped |
| 0.5 | 0.391 | 0.554 |  |
| 0.7 | 0.391 | 0.508 |  |
| 1.0 | 0.283 | 0.198 |  |

### 2023 — peak 0.0, naive td 0.565
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.5 | 0.649 |  |
| 0.1 | 0.478 | 0.64 |  |
| 0.2 | 0.457 | 0.629 |  |
| 0.35 | 0.413 | 0.608 | ← shipped |
| 0.5 | 0.391 | 0.578 |  |
| 0.7 | 0.391 | 0.527 |  |
| 1.0 | 0.326 | 0.214 |  |

## Caveats

- 2025: realized from harvest (nflverse unavailable)

_NOTHING installs here. A weight change is a separate SHIP decision gated on null + leave-one-season-out CV, cited and reversible._

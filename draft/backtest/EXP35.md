# EXPERIMENT 35 — REGRESSION_WEIGHT sweep

_Pre-registered: top-decile improves as the weight falls below the shipped 0.35
(exp 33 said we over-regress). Sweep, not tune — the full curve, with the shipped
value marked. NOTHING installs here; a change is a separate gated SHIP decision._

Pre-registration: top-decile improves as weight falls below 0.35; flat => not the lever; peak at/above 0.35 => over-regression refuted.

## POOLED CURVE (all seasons, board players with proj+realized)

| REGRESSION_WEIGHT | n | top-decile | rank-corr | MAE |
|---|---|---|---|---|
| 0.0 | 764 | 0.513 | 0.637 | 47.8 |
| 0.1 | 764 | 0.487 | 0.631 | 49.13 |
| 0.2 | 764 | 0.461 | 0.623 | 50.58 |
| 0.35 ← shipped | 764 | 0.395 | 0.605 | 53.09 |
| 0.5 | 764 | 0.355 | 0.58 | 55.96 |
| 0.7 | 764 | 0.329 | 0.529 | 60.44 |
| 1.0 | 764 | 0.276 | 0.244 | 67.82 |

- naive baseline top-decile (reference, no regression): **0.566**
- **CONFIRMS the pre-registration: top-decile peaks BELOW the shipped 0.35 (peak at 0.0). Over-regression is a real lever — but installing a new value is a separate gated SHIP decision, not done here.**
- peak weight 0.0 (top-decile 0.513) vs shipped 0.395

## Per season

### 2026 — peak 0.0, naive td 0.3
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.3 | 0.31 |  |
| 0.1 | 0.3 | 0.306 |  |
| 0.2 | 0.2 | 0.305 |  |
| 0.35 | 0.2 | 0.307 | ← shipped |
| 0.5 | 0.2 | 0.294 |  |
| 0.7 | 0.2 | 0.29 |  |
| 1.0 | 0.3 | 0.252 |  |

### 2025 — peak 0.1, naive td 0.471
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.529 | 0.626 |  |
| 0.1 | 0.588 | 0.622 |  |
| 0.2 | 0.529 | 0.614 |  |
| 0.35 | 0.529 | 0.606 | ← shipped |
| 0.5 | 0.529 | 0.587 |  |
| 0.7 | 0.529 | 0.553 |  |
| 1.0 | 0.353 | 0.236 |  |

### 2024 — peak 0.0, naive td 0.587
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.543 | 0.617 |  |
| 0.1 | 0.522 | 0.61 |  |
| 0.2 | 0.5 | 0.599 |  |
| 0.35 | 0.413 | 0.579 | ← shipped |
| 0.5 | 0.391 | 0.552 |  |
| 0.7 | 0.391 | 0.507 |  |
| 1.0 | 0.304 | 0.198 |  |

### 2023 — peak 0.0, naive td 0.565
| w | top-decile | rank-corr |  |
|---|---|---|---|
| 0.0 | 0.5 | 0.647 |  |
| 0.1 | 0.478 | 0.639 |  |
| 0.2 | 0.457 | 0.628 |  |
| 0.35 | 0.413 | 0.606 | ← shipped |
| 0.5 | 0.391 | 0.577 |  |
| 0.7 | 0.391 | 0.524 |  |
| 1.0 | 0.326 | 0.214 |  |

## Caveats

- 2026: realized from harvest (nflverse unavailable)
- 2025: realized from harvest (nflverse unavailable)

_NOTHING installs here. A weight change is a separate SHIP decision gated on null + leave-one-season-out CV, cited and reversible._

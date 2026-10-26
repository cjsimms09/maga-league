# EXPERIMENT 33 — projection-source bake-off

_Race our blend vs a naive baseline vs FFC ADP (ranking) [vs Sleeper if
retrievable] on 2023–25 realized points, by position — MAE, rank correlation,
top-decile hit (the one that matters), priced in $ through the money grader.
A LOSS IS THE HEADLINE; no tuning inside this experiment._

Sources raced: our_blend, naive, ffc_adp

## POOLED VERDICT (decision-time-safe sources only)

- top-decile winner by season: {'naive': 2}
- our blend beats naive on top-decile: 0/2 seasons
- dollars by source (value-greedy roster, summed): {'our_blend': 200.0, 'naive': 100.0, 'ffc_adp': 1825.0}
- dollars ranking (best first): ['ffc_adp', 'our_blend', 'naive']
- **provenance banner required: True** (true = a decision-time-safe source beats our blend and the War Room must say so)

## Per season

### 2024
- top-decile (safe sources): winner **naive** (our 0.413 vs naive 0.587; our rank 2)
- dollars (value-greedy roster): {'our_blend': 200.0, 'naive': 100.0, 'ffc_adp': 1025.0}

  | source | MAE | rank_corr | top-decile | in verdict |
  |---|---|---|---|---|
  | our_blend | 57.17 | 0.579 | 0.413 | yes |
  | naive | 45.59 | 0.704 | 0.587 | yes |
  | ffc_adp | None | 0.378 | 0.312 | yes |

### 2023
- top-decile (safe sources): winner **naive** (our 0.413 vs naive 0.565; our rank 2)
- dollars (value-greedy roster): {'our_blend': 0.0, 'naive': 0.0, 'ffc_adp': 800.0}

  | source | MAE | rank_corr | top-decile | in verdict |
  |---|---|---|---|---|
  | our_blend | 56.78 | 0.605 | 0.413 | yes |
  | naive | 46.25 | 0.704 | 0.565 | yes |
  | ffc_adp | None | 0.446 | 0.222 | yes |

## Caveats

- 2026: realized weekly unavailable; season SKIPPED
- 2025: realized weekly unavailable; season SKIPPED
- Sleeper historical preseason projections NOT retrievable for past seasons — the bake-off ran the decision-time-safe sources; the fourth is UNAVAILABLE, not proxied (registry partial-gate).

## What this settles and what it does not

Settles: whether our blend's regression/age corrections earn their place against a naive prior-year model, on the metric that finds league-winners, in points and in dollars. Does NOT settle: the dollar figures inherit the value-greedy construction limit (read gaps between sources, not levels); a source change is a SHIP decision gated on null + leave-one-season-out CV, not run here — this measures.

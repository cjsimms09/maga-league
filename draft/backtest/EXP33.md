# EXPERIMENT 33 — projection-source bake-off

_Race our blend vs a naive baseline vs FFC ADP (ranking) [vs Sleeper if
retrievable] on 2023–25 realized points, by position — MAE, rank correlation,
top-decile hit (the one that matters), priced in $ through the money grader.
A LOSS IS THE HEADLINE; no tuning inside this experiment._

Sources raced: our_blend, naive, ffc_adp, sleeper_proj

## POOLED VERDICT

- top-decile winner by season: {'sleeper_proj': 2}
- our blend beats naive on top-decile: 0/2 seasons
- dollars by source (value-greedy roster, summed): {'our_blend': 200.0, 'naive': 100.0, 'ffc_adp': 1200.0, 'sleeper_proj': 0.0}
- dollars ranking (best first): ['ffc_adp', 'our_blend', 'naive', 'sleeper_proj']
- **provenance banner required: True** (true = a source beats our blend and the War Room must say so)

## Per season

### 2024
- top-decile: winner **sleeper_proj** (our 0.413 vs naive 0.587; our rank 3)
- dollars (value-greedy roster): {'our_blend': 200.0, 'naive': 100.0, 'ffc_adp': 400.0, 'sleeper_proj': 0.0}

  | source | MAE | rank_corr | top-decile |
  |---|---|---|---|
  | our_blend | 57.09 | 0.581 | 0.413 |
  | naive | 45.59 | 0.704 | 0.587 |
  | ffc_adp | None | 0.378 | 0.312 |
  | sleeper_proj | 33.05 | 0.819 | 0.692 |

### 2023
- top-decile: winner **sleeper_proj** (our 0.413 vs naive 0.565; our rank 3)
- dollars (value-greedy roster): {'our_blend': 0.0, 'naive': 0.0, 'ffc_adp': 800.0, 'sleeper_proj': 0.0}

  | source | MAE | rank_corr | top-decile |
  |---|---|---|---|
  | our_blend | 56.68 | 0.608 | 0.413 |
  | naive | 46.25 | 0.704 | 0.565 |
  | ffc_adp | None | 0.446 | 0.222 |
  | sleeper_proj | 35.27 | 0.798 | 0.627 |

## Caveats

- 2025: realized weekly unavailable; season SKIPPED

## What this settles and what it does not

Settles: whether our blend's regression/age corrections earn their place against a naive prior-year model, on the metric that finds league-winners, in points and in dollars. Does NOT settle: the dollar figures inherit the value-greedy construction limit (read gaps between sources, not levels); a source change is a SHIP decision gated on null + leave-one-season-out CV, not run here — this measures.

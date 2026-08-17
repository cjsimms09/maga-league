# EXPERIMENT 33 — projection-source bake-off

_Race our blend vs a naive baseline vs FFC ADP (ranking) [vs Sleeper if
retrievable] on 2023–25 realized points, by position — MAE, rank correlation,
top-decile hit (the one that matters), priced in $ through the money grader.
A LOSS IS THE HEADLINE; no tuning inside this experiment._

Sources raced: our_blend, naive, ffc_adp, sleeper_proj

## POOLED VERDICT (decision-time-safe sources only)

- top-decile winner by season: {'naive': 2}
- our blend beats naive on top-decile: 0/2 seasons
- dollars by source (value-greedy roster, summed): {'our_blend': 200.0, 'naive': 100.0, 'ffc_adp': 1825.0}
- dollars ranking (best first): ['ffc_adp', 'our_blend', 'naive']
- **provenance banner required: True** (true = a decision-time-safe source beats our blend and the War Room must say so)
- **⚠ DISQUALIFIED (leak-suspect, NOT in the verdict): ['sleeper_proj']** — their summed value-greedy $ (shown, not ranked): {'sleeper_proj': 0.0}

## Per season

### 2024
- top-decile (safe sources): winner **naive** (our 0.413 vs naive 0.587; our rank 2)
- dollars (value-greedy roster): {'our_blend': 200.0, 'naive': 100.0, 'ffc_adp': 1025.0, 'sleeper_proj': 0.0}

  | source | MAE | rank_corr | top-decile | in verdict |
  |---|---|---|---|---|
  | our_blend | 57.08 | 0.581 | 0.413 | yes |
  | naive | 45.59 | 0.704 | 0.587 | yes |
  | ffc_adp | None | 0.378 | 0.312 | yes |
  | sleeper_proj | 33.05 | 0.819 | 0.692 | **NO — leak-suspect** |

### 2023
- top-decile (safe sources): winner **naive** (our 0.413 vs naive 0.565; our rank 2)
- dollars (value-greedy roster): {'our_blend': 0.0, 'naive': 0.0, 'ffc_adp': 800.0, 'sleeper_proj': 0.0}

  | source | MAE | rank_corr | top-decile | in verdict |
  |---|---|---|---|---|
  | our_blend | 56.66 | 0.608 | 0.413 | yes |
  | naive | 46.25 | 0.704 | 0.565 | yes |
  | ffc_adp | None | 0.446 | 0.222 | yes |
  | sleeper_proj | 35.27 | 0.798 | 0.627 | **NO — leak-suspect** |

## Caveats

- 2025: realized weekly unavailable; season SKIPPED
- Sleeper's season projection WAS retrievable but is DISQUALIFIED, not reported as a winner: `/projections/nfl/regular/{season}` is updated in-season, so a past season's stored projection is NOT decision-time-safe. Its ~0.8 rank-corr with realized (vs the real market's ~0.4) is the leak's fingerprint. Its scorecard is shown for transparency and EXCLUDED from the verdict, per the anti-leak pre-registration.

## What this settles and what it does not

Settles: whether our blend's regression/age corrections earn their place against a naive prior-year model, on the metric that finds league-winners, in points and in dollars. Does NOT settle: the dollar figures inherit the value-greedy construction limit (read gaps between sources, not levels); a source change is a SHIP decision gated on null + leave-one-season-out CV, not run here — this measures.

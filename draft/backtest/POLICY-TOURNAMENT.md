# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -31.25 | [-47.5, -16.04] | no |
| uniform_boom | -48.54 | [-69.79, -28.33] | no |
| floor_heavy | -119.17 | [-147.29, -92.92] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -25.83 | [-55.0, -0.83] | WORSE than default |
| core | 0.25 | -8.33 | [-20.0, 1.04] | no evidence of a shift |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | +11.67 | [-5.62, 30.62] | no evidence of a shift |
| core | 2.0 | +21.25 | [-2.08, 45.42] | no evidence of a shift |
| endgame | 0.0 | +0.00 | [-18.54, 16.25] | no evidence of a shift |
| endgame | 0.5 | +19.38 | [7.5, 33.12] | BETTER than default |
| endgame | 1.0 | -31.04 | [-46.25, -15.83] | WORSE than default |
| endgame | 2.0 | -31.25 | [-47.08, -15.21] | WORSE than default |
| endgame | 3.0 | -33.54 | [-50.42, -18.33] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$49.62** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=0 rooms, rb_drain_early=58 rooms, thin_board_early=59 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | h1_phase | -18.97 | +23.77 | [-40.95, 3.02] | 58 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -108.19 | +21.25 | [-139.66, -75.43] | 58 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -50.86 | -4.49 | [-81.9, -22.41] | 58 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -58.90 | -20.38 | [-94.07, -27.54] | 59 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -42.80 | -22.72 | [-65.68, -21.19] | 59 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -132.20 | -25.64 | [-182.2, -88.56] | 59 | LEAN → manual-override cheat sheet, never automated |

**Non-partitioning states (reported, never inferred from):** `run_pressure` fired in 0/120 rooms — a state that fires in ~every room is a CONSTANT; its 'conditional' edge would just be the global edge wearing a state label. Caught by the degeneracy guard, excluded from inference.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
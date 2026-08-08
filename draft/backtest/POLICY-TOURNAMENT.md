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

_conditional null p95 = **$67.13** (the null mines the SAME policy×state grid over permuted state labels — 40 draws). State coverage: run_pressure=85 rooms, rb_drain_early=58 rooms, thin_board_early=59 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | h1_phase | -18.97 | +23.77 | [-40.95, 3.45] | 58 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -108.19 | +21.25 | [-142.67, -76.72] | 58 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -45.88 | +9.12 | [-72.06, -21.47] | 85 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -117.94 | +4.20 | [-153.24, -88.24] | 85 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -31.18 | +0.25 | [-50.59, -10.0] | 85 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -50.86 | -4.49 | [-81.03, -24.14] | 58 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -58.90 | -20.38 | [-92.37, -29.24] | 59 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -42.80 | -22.72 | [-66.53, -22.46] | 59 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -132.20 | -25.64 | [-183.47, -89.41] | 59 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -40.00 | [-75.21, -5.21] | no |
| uniform_boom | -176.67 | [-228.75, -126.25] | no |
| floor_heavy | -254.58 | [-310.83, -201.04] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -232.29 | [-286.46, -182.08] | WORSE than default |
| core | 0.25 | -232.29 | [-286.04, -177.92] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | +29.79 | [-15.21, 76.46] | no evidence of a shift |
| core | 2.0 | -92.29 | [-133.54, -52.29] | WORSE than default |
| endgame | 0.0 | -25.83 | [-62.92, 10.62] | no evidence of a shift |
| endgame | 0.5 | -30.62 | [-61.67, 2.92] | no evidence of a shift |
| endgame | 1.0 | -16.25 | [-52.08, 21.67] | no evidence of a shift |
| endgame | 2.0 | -40.00 | [-76.88, -4.58] | WORSE than default |
| endgame | 3.0 | -5.21 | [-35.21, 25.42] | no evidence of a shift |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$156.75** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=85 rooms, rb_drain_early=64 rooms, thin_board_early=44 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | uniform_boom | -132.42 | +94.81 | [-194.92, -74.22] | 64 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -221.48 | +70.93 | [-297.27, -150.0] | 64 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -12.89 | +58.09 | [-52.34, 25.78] | 64 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -27.94 | +41.35 | [-72.06, 17.35] | 85 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -257.06 | -8.49 | [-325.29, -193.53] | 85 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -45.45 | -8.61 | [-106.82, 13.07] | 44 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -187.50 | -17.11 | [-286.36, -103.41] | 44 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -186.18 | -32.61 | [-250.0, -123.53] | 85 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -287.50 | -51.97 | [-393.75, -190.91] | 44 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
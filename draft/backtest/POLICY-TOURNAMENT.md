# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -37.29 | [-60.0, -14.38] | no |
| uniform_boom | -45.21 | [-67.5, -23.96] | no |
| floor_heavy | -124.58 | [-152.71, -98.54] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -29.79 | [-51.04, -9.38] | WORSE than default |
| core | 0.25 | -22.29 | [-39.17, -7.71] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | +4.58 | [-12.08, 23.12] | no evidence of a shift |
| core | 2.0 | +17.08 | [-2.5, 36.67] | no evidence of a shift |
| endgame | 0.0 | -13.96 | [-32.08, 0.0] | no evidence of a shift |
| endgame | 0.5 | +15.62 | [-1.25, 34.58] | no evidence of a shift |
| endgame | 1.0 | -33.54 | [-53.33, -12.08] | WORSE than default |
| endgame | 2.0 | -37.29 | [-59.17, -13.75] | WORSE than default |
| endgame | 3.0 | -36.46 | [-57.08, -15.42] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$65.83** (the null mines the SAME policy×state grid over permuted state labels — 40 draws). State coverage: run_pressure=85 rooms, rb_drain_early=60 rooms, thin_board_early=60 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| thin_board_early | floor_heavy | -97.92 | +53.33 | [-129.17, -68.75] | 60 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -26.67 | +21.25 | [-50.83, -1.25] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -123.24 | +4.62 | [-154.41, -93.53] | 85 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -35.00 | +4.58 | [-66.67, -2.92] | 60 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -42.92 | +4.58 | [-75.42, -16.67] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -45.00 | +0.71 | [-72.35, -20.0] | 85 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -37.65 | -1.22 | [-61.18, -14.71] | 85 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -47.08 | -3.75 | [-84.58, -13.33] | 60 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -142.92 | -36.67 | [-190.42, -103.33] | 60 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
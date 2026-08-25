# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -345.42 | [-400.21, -290.42] | no |
| uniform_boom | -421.04 | [-478.12, -363.75] | no |
| floor_heavy | -584.79 | [-645.42, -516.25] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -472.08 | [-529.58, -410.21] | WORSE than default |
| core | 0.25 | -419.38 | [-478.75, -361.25] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -19.17 | [-55.42, 16.04] | no evidence of a shift |
| core | 2.0 | -126.25 | [-175.21, -77.5] | WORSE than default |
| endgame | 0.0 | +34.58 | [1.04, 71.88] | BETTER than default |
| endgame | 0.5 | -295.21 | [-350.62, -237.29] | WORSE than default |
| endgame | 1.0 | -332.71 | [-388.12, -277.29] | WORSE than default |
| endgame | 2.0 | -345.42 | [-402.29, -292.08] | WORSE than default |
| endgame | 3.0 | -347.92 | [-401.46, -293.96] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$179.45** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=54 rooms, rb_drain_early=30 rooms, thin_board_early=61 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | h1_phase | -353.33 | -10.55 | [-456.67, -248.33] | 30 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -431.67 | -14.17 | [-539.17, -325.0] | 30 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -598.36 | -27.60 | [-688.52, -510.66] | 61 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -372.95 | -56.00 | [-454.1, -291.8] | 61 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -617.13 | -58.80 | [-697.22, -527.31] | 54 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -384.72 | -71.46 | [-467.59, -307.41] | 54 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -463.43 | -77.07 | [-537.5, -385.65] | 54 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -460.25 | -79.74 | [-535.66, -381.56] | 61 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -673.33 | -118.05 | [-788.33, -550.83] | 30 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
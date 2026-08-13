# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -66.67 | [-110.21, -23.12] | no |
| uniform_boom | -423.96 | [-488.12, -362.08] | no |
| floor_heavy | -580.21 | [-645.21, -514.58] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -442.92 | [-512.92, -377.08] | WORSE than default |
| core | 0.25 | -410.42 | [-477.92, -343.96] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -256.04 | [-318.75, -197.71] | WORSE than default |
| core | 2.0 | -511.46 | [-574.38, -451.04] | WORSE than default |
| endgame | 0.0 | +5.62 | [-22.71, 32.71] | no evidence of a shift |
| endgame | 0.5 | +8.96 | [-20.21, 38.33] | no evidence of a shift |
| endgame | 1.0 | -205.00 | [-250.83, -158.12] | WORSE than default |
| endgame | 2.0 | -66.67 | [-111.04, -23.54] | WORSE than default |
| endgame | 3.0 | -62.71 | [-107.5, -20.0] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$133.59** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=60 rooms, rb_drain_early=47 rooms, thin_board_early=60 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| run_pressure | floor_heavy | -512.92 | +134.58 | [-590.42, -432.08] | 60 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -535.83 | +88.75 | [-627.08, -442.08] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -24.58 | +84.17 | [-81.25, 27.08] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -382.08 | +83.75 | [-455.0, -302.08] | 60 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -47.50 | +38.33 | [-111.67, 12.08] | 60 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -567.55 | +20.81 | [-670.21, -464.36] | 47 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -69.68 | -4.95 | [-148.4, 3.72] | 47 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -427.66 | -6.08 | [-531.91, -325.53] | 47 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -464.58 | -81.25 | [-551.25, -370.42] | 60 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
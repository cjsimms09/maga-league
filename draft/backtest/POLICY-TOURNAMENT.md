# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -99.38 | [-156.04, -41.67] | no |
| uniform_boom | -426.88 | [-495.21, -360.42] | no |
| floor_heavy | -558.54 | [-627.92, -485.42] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -365.62 | [-444.38, -287.29] | WORSE than default |
| core | 0.25 | -360.21 | [-433.54, -288.33] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -400.21 | [-472.71, -329.38] | WORSE than default |
| core | 2.0 | -517.08 | [-583.75, -448.96] | WORSE than default |
| endgame | 0.0 | -12.29 | [-50.0, 24.79] | no evidence of a shift |
| endgame | 0.5 | +26.46 | [4.38, 52.29] | BETTER than default |
| endgame | 1.0 | -96.46 | [-156.04, -38.12] | WORSE than default |
| endgame | 2.0 | -99.38 | [-157.29, -43.33] | WORSE than default |
| endgame | 3.0 | -96.88 | [-155.0, -39.17] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$167.07** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=49 rooms, rb_drain_early=83 rooms, thin_board_early=60 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | floor_heavy | -545.48 | +42.36 | [-625.3, -470.48] | 83 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -413.86 | +42.22 | [-487.35, -336.14] | 83 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -405.10 | +36.80 | [-507.14, -310.2] | 49 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -548.33 | +20.42 | [-651.67, -444.58] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -88.27 | +18.77 | [-186.22, 16.33] | 49 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -577.55 | -32.13 | [-694.39, -466.84] | 49 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -116.67 | -34.59 | [-187.5, -48.33] | 60 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -454.58 | -55.41 | [-548.75, -358.33] | 60 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -129.52 | -97.76 | [-199.4, -59.64] | 83 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
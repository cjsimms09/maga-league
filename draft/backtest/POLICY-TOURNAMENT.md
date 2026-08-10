# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -100.00 | [-150.21, -48.75] | no |
| uniform_boom | -167.29 | [-225.42, -113.12] | no |
| floor_heavy | -377.92 | [-443.54, -307.71] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -45.62 | [-114.58, 20.83] | no evidence of a shift |
| core | 0.25 | -29.58 | [-65.42, 2.08] | no evidence of a shift |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | +29.38 | [-27.5, 84.58] | no evidence of a shift |
| core | 2.0 | +39.58 | [-25.62, 102.71] | no evidence of a shift |
| endgame | 0.0 | -26.88 | [-79.17, 23.54] | no evidence of a shift |
| endgame | 0.5 | +44.58 | [1.04, 92.5] | BETTER than default |
| endgame | 1.0 | -100.62 | [-152.29, -50.21] | WORSE than default |
| endgame | 2.0 | -100.00 | [-152.08, -49.38] | WORSE than default |
| endgame | 3.0 | -114.79 | [-163.12, -67.71] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$174.17** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=89 rooms, rb_drain_early=60 rooms, thin_board_early=60 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| run_pressure | floor_heavy | -334.27 | +168.96 | [-411.24, -261.52] | 89 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -136.80 | +118.04 | [-198.03, -77.81] | 89 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -331.25 | +93.33 | [-422.08, -243.75] | 60 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -160.00 | +14.58 | [-235.0, -86.25] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -96.63 | +13.05 | [-152.53, -38.48] | 89 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -173.33 | -12.08 | [-257.92, -86.25] | 60 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -106.67 | -13.34 | [-178.75, -31.67] | 60 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -120.83 | -41.66 | [-185.42, -60.42] | 60 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -421.67 | -87.50 | [-522.92, -327.5] | 60 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
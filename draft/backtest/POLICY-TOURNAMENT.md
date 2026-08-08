# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -104.17 | [-156.67, -48.54] | no |
| uniform_boom | -160.42 | [-217.29, -103.75] | no |
| floor_heavy | -352.92 | [-422.92, -286.88] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -81.67 | [-150.42, -14.58] | WORSE than default |
| core | 0.25 | -47.50 | [-87.08, -7.08] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | +37.92 | [-11.67, 91.88] | no evidence of a shift |
| core | 2.0 | +42.71 | [-17.5, 106.25] | no evidence of a shift |
| endgame | 0.0 | -15.42 | [-70.21, 39.58] | no evidence of a shift |
| endgame | 0.5 | +39.38 | [-5.42, 82.71] | no evidence of a shift |
| endgame | 1.0 | -103.96 | [-157.71, -52.71] | WORSE than default |
| endgame | 2.0 | -104.17 | [-158.12, -48.96] | WORSE than default |
| endgame | 3.0 | -91.25 | [-140.83, -40.0] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$157.23** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=85 rooms, rb_drain_early=60 rooms, thin_board_early=60 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| thin_board_early | floor_heavy | -307.50 | +90.83 | [-390.83, -221.67] | 60 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -77.08 | +54.17 | [-152.92, -2.92] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -91.76 | +42.53 | [-148.53, -37.06] | 85 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -355.59 | -9.16 | [-431.47, -281.47] | 85 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -175.83 | -30.83 | [-264.17, -83.75] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -173.24 | -43.95 | [-241.47, -106.76] | 85 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -126.67 | -45.00 | [-199.58, -55.42] | 60 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -184.58 | -48.33 | [-264.17, -106.25] | 60 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -382.50 | -59.17 | [-483.75, -295.42] | 60 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
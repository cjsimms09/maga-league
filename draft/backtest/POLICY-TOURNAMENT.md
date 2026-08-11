# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -88.54 | [-137.92, -42.5] | no |
| uniform_boom | -327.29 | [-390.21, -264.79] | no |
| floor_heavy | -598.96 | [-665.42, -529.17] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -457.50 | [-533.96, -382.29] | WORSE than default |
| core | 0.25 | -424.17 | [-492.5, -359.17] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -215.83 | [-270.83, -160.83] | WORSE than default |
| core | 2.0 | -443.75 | [-505.83, -378.33] | WORSE than default |
| endgame | 0.0 | -10.00 | [-38.96, 16.46] | no evidence of a shift |
| endgame | 0.5 | -1.46 | [-32.08, 28.75] | no evidence of a shift |
| endgame | 1.0 | -191.46 | [-240.83, -145.42] | WORSE than default |
| endgame | 2.0 | -88.54 | [-134.79, -40.62] | WORSE than default |
| endgame | 3.0 | -90.21 | [-137.29, -45.0] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$172.08** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=67 rooms, rb_drain_early=49 rooms, thin_board_early=60 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| run_pressure | floor_heavy | -570.52 | +64.39 | [-656.34, -487.31] | 67 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -66.25 | +44.58 | [-134.17, -2.92] | 60 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -71.43 | +28.92 | [-142.86, -2.04] | 49 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -603.75 | -9.58 | [-693.33, -509.17] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -332.09 | -10.86 | [-414.55, -251.12] | 67 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -98.13 | -21.71 | [-166.79, -36.57] | 67 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -613.78 | -25.05 | [-715.82, -505.1] | 49 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -380.10 | -89.25 | [-480.1, -280.61] | 49 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -388.75 | -122.92 | [-484.17, -291.25] | 60 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
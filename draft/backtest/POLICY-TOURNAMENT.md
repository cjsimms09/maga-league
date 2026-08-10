# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -153.33 | [-203.33, -104.17] | no |
| uniform_boom | -359.38 | [-418.75, -296.04] | no |
| floor_heavy | -590.83 | [-658.96, -521.04] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -563.33 | [-630.42, -496.04] | WORSE than default |
| core | 0.25 | -304.58 | [-377.08, -229.17] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -203.54 | [-264.58, -143.75] | WORSE than default |
| core | 2.0 | -453.54 | [-522.71, -387.71] | WORSE than default |
| endgame | 0.0 | +12.08 | [-10.62, 37.08] | no evidence of a shift |
| endgame | 0.5 | -5.42 | [-26.67, 16.88] | no evidence of a shift |
| endgame | 1.0 | -122.29 | [-166.88, -79.58] | WORSE than default |
| endgame | 2.0 | -153.33 | [-202.71, -104.58] | WORSE than default |
| endgame | 3.0 | -146.04 | [-197.29, -99.17] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$158.97** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=51 rooms, rb_drain_early=42 rooms, thin_board_early=61 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| thin_board_early | floor_heavy | -527.46 | +128.90 | [-617.21, -431.97] | 61 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -119.26 | +69.30 | [-193.03, -52.87] | 61 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -560.29 | +53.12 | [-678.92, -448.04] | 51 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -343.63 | +27.38 | [-451.47, -242.16] | 51 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -351.23 | +16.57 | [-433.2, -270.49] | 61 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -202.45 | -85.42 | [-290.69, -120.1] | 51 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -211.31 | -89.19 | [-313.69, -113.69] | 42 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -659.52 | -105.67 | [-758.93, -553.57] | 42 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -473.81 | -176.05 | [-586.9, -355.36] | 42 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -108.75 | [-146.25, -74.58] | no |
| uniform_boom | -154.17 | [-195.21, -113.54] | no |
| floor_heavy | -202.71 | [-255.62, -153.54] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | +178.75 | [128.75, 232.92] | BETTER than default |
| core | 0.25 | +24.58 | [-6.25, 57.5] | no evidence of a shift |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -15.00 | [-33.96, 5.0] | no evidence of a shift |
| core | 2.0 | -18.54 | [-41.88, 3.33] | no evidence of a shift |
| endgame | 0.0 | -38.12 | [-70.42, -6.88] | WORSE than default |
| endgame | 0.5 | -21.04 | [-51.04, 7.5] | no evidence of a shift |
| endgame | 1.0 | -109.58 | [-143.33, -75.42] | WORSE than default |
| endgame | 2.0 | -108.75 | [-145.42, -75.21] | WORSE than default |
| endgame | 3.0 | -108.75 | [-145.42, -73.12] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$112.86** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=36 rooms, rb_drain_early=73 rooms, thin_board_early=58 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| run_pressure | uniform_boom | -103.47 | +72.42 | [-172.22, -42.36] | 36 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -152.78 | +71.33 | [-252.78, -65.28] | 36 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -79.17 | +42.26 | [-142.36, -29.17] | 36 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -185.34 | +33.61 | [-251.29, -123.28] | 58 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -102.16 | +12.76 | [-151.72, -56.03] | 58 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -147.84 | +12.24 | [-209.48, -92.24] | 58 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -123.63 | -37.99 | [-172.26, -79.79] | 73 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -171.58 | -44.45 | [-223.29, -121.23] | 73 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -224.32 | -55.17 | [-290.07, -164.38] | 73 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
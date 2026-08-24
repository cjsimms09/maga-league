# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| floor_heavy | +22.08 | [4.38, 40.62] | YES |
| h1_phase | -163.75 | [-201.04, -129.58] | no |
| uniform_boom | -165.62 | [-197.08, -135.42] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | +25.21 | [9.79, 41.04] | BETTER than default |
| core | 0.25 | +26.04 | [7.71, 45.62] | BETTER than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | +5.00 | [-7.92, 17.92] | no evidence of a shift |
| core | 2.0 | -34.58 | [-62.08, -7.5] | WORSE than default |
| endgame | 0.0 | +7.08 | [-7.92, 22.5] | no evidence of a shift |
| endgame | 0.5 | -138.12 | [-173.96, -104.79] | WORSE than default |
| endgame | 1.0 | -163.96 | [-201.04, -128.54] | WORSE than default |
| endgame | 2.0 | -163.75 | [-200.42, -129.79] | WORSE than default |
| endgame | 3.0 | -170.62 | [-205.62, -137.5] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$94.02** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=54 rooms, rb_drain_early=30 rooms, thin_board_early=61 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | uniform_boom | -113.33 | +69.73 | [-175.0, -56.67] | 30 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -139.17 | +32.77 | [-204.17, -84.17] | 30 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -147.69 | +32.61 | [-198.61, -101.85] | 54 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -152.78 | +19.95 | [-199.07, -111.57] | 54 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | +32.87 | +19.61 | [8.8, 59.26] | 54 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | +33.33 | +15.00 | [2.5, 67.5] | 30 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -163.52 | +4.28 | [-205.33, -125.0] | 61 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -165.98 | -4.54 | [-216.39, -118.44] | 61 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | +17.21 | -9.91 | [-5.74, 40.57] | 61 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
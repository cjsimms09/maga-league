# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | +8.33 | [-9.38, 28.12] | no |
| uniform_boom | -96.46 | [-136.67, -61.88] | no |
| floor_heavy | -233.54 | [-286.46, -184.79] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | +134.58 | [93.96, 177.5] | BETTER than default |
| core | 0.25 | +208.54 | [158.12, 255.62] | BETTER than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -17.29 | [-37.29, -2.5] | WORSE than default |
| core | 2.0 | -17.29 | [-38.33, -2.5] | WORSE than default |
| endgame | 0.0 | -135.62 | [-176.04, -98.75] | WORSE than default |
| endgame | 0.5 | -4.17 | [-18.75, 10.21] | no evidence of a shift |
| endgame | 1.0 | +10.00 | [-6.88, 29.17] | no evidence of a shift |
| endgame | 2.0 | +8.33 | [-9.38, 27.08] | no evidence of a shift |
| endgame | 3.0 | +9.38 | [-8.33, 29.58] | no evidence of a shift |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$126.71** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=32 rooms, rb_drain_early=78 rooms, thin_board_early=61 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| thin_board_early | h1_phase | +23.36 | +30.56 | [1.23, 54.1] | 61 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -220.49 | +26.54 | [-291.8, -156.56] | 61 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -98.77 | -4.70 | [-155.74, -47.95] | 61 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | +4.17 | -11.90 | [-14.42, 26.92] | 78 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -241.67 | -23.22 | [-307.69, -180.45] | 78 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -15.62 | -32.67 | [-50.0, 12.5] | 32 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -116.35 | -56.83 | [-169.23, -70.83] | 78 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -139.84 | -59.16 | [-230.47, -61.72] | 32 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -279.69 | -62.93 | [-395.31, -167.19] | 32 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
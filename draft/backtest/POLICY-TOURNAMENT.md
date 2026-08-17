# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -106.67 | [-162.71, -51.88] | no |
| uniform_boom | -473.33 | [-541.04, -406.67] | no |
| floor_heavy | -584.58 | [-646.88, -517.92] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -457.08 | [-523.96, -387.92] | WORSE than default |
| core | 0.25 | -443.75 | [-504.58, -375.83] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -437.29 | [-505.62, -368.12] | WORSE than default |
| core | 2.0 | -549.58 | [-615.83, -485.21] | WORSE than default |
| endgame | 0.0 | -7.50 | [-28.75, 13.33] | no evidence of a shift |
| endgame | 0.5 | -3.96 | [-24.38, 13.33] | no evidence of a shift |
| endgame | 1.0 | -149.58 | [-201.04, -98.12] | WORSE than default |
| endgame | 2.0 | -106.67 | [-159.79, -52.5] | WORSE than default |
| endgame | 3.0 | -99.58 | [-155.21, -45.0] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$170.56** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=54 rooms, rb_drain_early=81 rooms, thin_board_early=60 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | floor_heavy | -554.94 | +91.21 | [-636.42, -472.53] | 81 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -456.48 | +51.85 | [-533.33, -373.77] | 81 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -110.80 | -12.72 | [-177.47, -44.75] | 81 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -597.50 | -25.83 | [-690.83, -502.08] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -127.78 | -38.39 | [-220.83, -29.63] | 54 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -135.83 | -58.33 | [-211.67, -62.08] | 60 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -628.24 | -79.38 | [-719.44, -533.8] | 54 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -520.37 | -85.52 | [-618.52, -422.69] | 54 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -520.00 | -93.33 | [-620.0, -426.25] | 60 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
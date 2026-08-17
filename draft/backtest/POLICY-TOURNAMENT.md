# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -129.17 | [-178.96, -80.83] | no |
| uniform_boom | -356.67 | [-419.79, -295.62] | no |
| floor_heavy | -472.29 | [-541.88, -405.62] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -151.67 | [-210.42, -96.88] | WORSE than default |
| core | 0.25 | +68.33 | [14.38, 125.21] | BETTER than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -315.83 | [-378.12, -256.04] | WORSE than default |
| core | 2.0 | -326.67 | [-388.54, -268.12] | WORSE than default |
| endgame | 0.0 | -1.04 | [-33.75, 32.71] | no evidence of a shift |
| endgame | 0.5 | -35.62 | [-76.25, 1.46] | no evidence of a shift |
| endgame | 1.0 | -22.29 | [-65.21, 20.0] | no evidence of a shift |
| endgame | 2.0 | -129.17 | [-178.33, -81.46] | WORSE than default |
| endgame | 3.0 | -130.21 | [-180.62, -84.17] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$166.67** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=90 rooms, rb_drain_early=82 rooms, thin_board_early=59 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| run_pressure | h1_phase | -123.33 | +23.34 | [-183.06, -66.39] | 90 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -358.06 | -5.56 | [-426.11, -293.61] | 90 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -141.10 | -23.48 | [-210.59, -68.64] | 59 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -482.22 | -39.72 | [-562.78, -406.11] | 90 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -485.67 | -42.25 | [-566.77, -404.88] | 82 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -143.90 | -46.53 | [-204.57, -89.02] | 82 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -372.87 | -51.16 | [-443.6, -303.96] | 82 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -512.29 | -78.68 | [-614.41, -414.83] | 59 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -397.03 | -79.41 | [-483.9, -307.2] | 59 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
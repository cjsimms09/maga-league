# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -39.17 | [-79.17, 2.08] | no |
| uniform_boom | -389.79 | [-446.46, -330.42] | no |
| floor_heavy | -545.21 | [-617.71, -470.42] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -355.62 | [-414.38, -296.04] | WORSE than default |
| core | 0.25 | -203.33 | [-264.58, -141.46] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -313.75 | [-370.62, -262.5] | WORSE than default |
| core | 2.0 | -327.08 | [-385.21, -270.21] | WORSE than default |
| endgame | 0.0 | +71.46 | [39.58, 106.04] | BETTER than default |
| endgame | 0.5 | -50.00 | [-92.08, -9.58] | WORSE than default |
| endgame | 1.0 | -36.88 | [-78.96, 5.42] | no evidence of a shift |
| endgame | 2.0 | -39.17 | [-78.54, 1.67] | no evidence of a shift |
| endgame | 3.0 | -39.17 | [-80.83, 2.5] | no evidence of a shift |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$136.13** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=44 rooms, rb_drain_early=77 rooms, thin_board_early=61 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | floor_heavy | -484.42 | +169.65 | [-574.35, -394.48] | 77 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -353.90 | +100.17 | [-426.3, -278.57] | 77 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | +0.00 | +61.84 | [-71.59, 68.75] | 44 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -352.84 | +58.34 | [-451.14, -254.55] | 44 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -363.93 | +52.60 | [-455.74, -274.18] | 61 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -520.90 | +49.44 | [-629.1, -408.61] | 61 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -528.41 | +26.52 | [-647.16, -416.48] | 44 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -38.64 | +1.48 | [-96.1, 13.64] | 77 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -53.69 | -29.54 | [-117.21, 11.89] | 61 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
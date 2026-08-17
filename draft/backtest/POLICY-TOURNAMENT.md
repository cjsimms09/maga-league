# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_150 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -64.33 | [-101.33, -29.67] | no |
| uniform_boom | -445.67 | [-497.5, -395.0] | no |
| floor_heavy | -562.67 | [-623.67, -502.83] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -393.83 | [-450.17, -337.17] | WORSE than default |
| core | 0.25 | -241.17 | [-294.5, -186.0] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -368.33 | [-419.83, -314.33] | WORSE than default |
| core | 2.0 | -395.17 | [-449.17, -340.33] | WORSE than default |
| endgame | 0.0 | +65.50 | [39.17, 92.67] | BETTER than default |
| endgame | 0.5 | -57.17 | [-89.67, -25.17] | WORSE than default |
| endgame | 1.0 | -74.17 | [-112.67, -37.83] | WORSE than default |
| endgame | 2.0 | -64.33 | [-102.0, -28.17] | WORSE than default |
| endgame | 3.0 | -64.33 | [-100.83, -28.83] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$139.33** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=58 rooms, rb_drain_early=95 rooms, thin_board_early=75 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| rb_drain_early | floor_heavy | -502.37 | +164.45 | [-580.53, -426.32] | 95 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -393.95 | +141.05 | [-460.26, -327.11] | 95 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -412.50 | +54.08 | [-491.38, -334.48] | 58 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -38.79 | +41.64 | [-103.88, 25.86] | 58 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -55.53 | +24.02 | [-98.16, -15.26] | 95 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -553.88 | +14.33 | [-651.29, -461.21] | 58 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -439.00 | +13.33 | [-513.67, -357.33] | 75 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -562.33 | +0.67 | [-647.0, -475.67] | 75 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -99.00 | -69.33 | [-156.0, -46.0] | 75 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
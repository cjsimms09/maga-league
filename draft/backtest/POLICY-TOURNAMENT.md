# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -3.75 | [-50.42, 39.17] | no |
| floor_heavy | -388.33 | [-449.17, -328.12] | no |
| uniform_boom | -402.71 | [-467.08, -335.21] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -230.21 | [-290.62, -170.21] | WORSE than default |
| core | 0.25 | -252.71 | [-315.83, -184.58] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -155.83 | [-211.04, -100.62] | WORSE than default |
| core | 2.0 | -295.42 | [-350.62, -234.17] | WORSE than default |
| endgame | 0.0 | -5.21 | [-42.29, 31.88] | no evidence of a shift |
| endgame | 0.5 | +8.33 | [-29.17, 43.96] | no evidence of a shift |
| endgame | 1.0 | -1.25 | [-41.67, 37.08] | no evidence of a shift |
| endgame | 2.0 | -3.75 | [-50.62, 41.04] | no evidence of a shift |
| endgame | 3.0 | -10.83 | [-58.75, 33.33] | no evidence of a shift |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$190.21** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=88 rooms, rb_drain_early=43 rooms, thin_board_early=21 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| thin_board_early | uniform_boom | -236.90 | +200.98 | [-388.1, -96.43] | 21 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -270.24 | +143.14 | [-432.14, -123.81] | 21 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -375.57 | +101.77 | [-448.3, -302.27] | 88 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -364.20 | +90.49 | [-432.67, -293.75] | 88 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | +44.05 | +57.94 | [-67.86, 148.81] | 21 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -370.93 | +49.52 | [-480.81, -266.28] | 43 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -369.19 | +29.84 | [-475.0, -269.19] | 43 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | +2.27 | +22.58 | [-52.84, 60.51] | 88 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -1.74 | +3.13 | [-72.67, 77.33] | 43 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
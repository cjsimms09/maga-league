# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -116.46 | [-172.08, -58.75] | no |
| uniform_boom | -268.33 | [-328.96, -208.33] | no |
| floor_heavy | -602.08 | [-663.96, -532.71] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -542.29 | [-606.25, -480.83] | WORSE than default |
| core | 0.25 | -339.79 | [-405.83, -267.08] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -289.79 | [-354.17, -228.12] | WORSE than default |
| core | 2.0 | -466.25 | [-530.62, -400.83] | WORSE than default |
| endgame | 0.0 | +11.46 | [-4.79, 30.42] | no evidence of a shift |
| endgame | 0.5 | +4.79 | [-27.71, 38.12] | no evidence of a shift |
| endgame | 1.0 | -146.04 | [-203.75, -88.12] | WORSE than default |
| endgame | 2.0 | -116.46 | [-171.04, -61.46] | WORSE than default |
| endgame | 3.0 | -103.33 | [-157.92, -44.17] | WORSE than default |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$161.06** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=48 rooms, rb_drain_early=39 rooms, thin_board_early=61 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| thin_board_early | h1_phase | -36.48 | +162.67 | [-92.62, 16.8] | 61 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -229.17 | +65.27 | [-318.23, -136.46] | 48 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -565.10 | +61.64 | [-684.38, -451.56] | 48 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -83.33 | +55.21 | [-176.04, 3.12] | 48 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -576.23 | +52.58 | [-670.08, -479.51] | 61 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | uniform_boom | -267.21 | +2.28 | [-354.51, -174.18] | 61 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -124.36 | -11.71 | [-215.38, -34.62] | 39 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -300.00 | -46.91 | [-404.49, -192.95] | 39 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -681.41 | -117.52 | [-789.74, -569.23] | 39 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
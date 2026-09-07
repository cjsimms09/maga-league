# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT

_120 paired rooms · control: hand-designed defaults · **H1 beats all three rivals: NO**_

## §5 — phase shapes (the comparative test)

| policy | edge $ | 95% CI | beats defaults |
|---|---|---|---|
| h1_phase | -48.33 | [-81.46, -20.0] | no |
| uniform_boom | -273.54 | [-329.58, -217.92] | no |
| floor_heavy | -312.29 | [-372.71, -256.67] | no |

### Per-phase optima (with intervals — read H1's shape off these)

| phase | ceiling weight | edge $ | 95% CI | verdict |
|---|---|---|---|---|
| core | 0.0 | -166.25 | [-223.54, -108.75] | WORSE than default |
| core | 0.25 | -166.25 | [-222.08, -107.71] | WORSE than default |
| core | 0.5 | +0.00 | [0.0, 0.0] | no evidence of a shift |
| core | 1.0 | -110.42 | [-167.92, -57.5] | WORSE than default |
| core | 2.0 | -175.83 | [-229.38, -123.96] | WORSE than default |
| endgame | 0.0 | -6.04 | [-39.38, 26.88] | no evidence of a shift |
| endgame | 0.5 | -11.46 | [-39.79, 16.46] | no evidence of a shift |
| endgame | 1.0 | -16.67 | [-50.21, 18.54] | no evidence of a shift |
| endgame | 2.0 | -48.33 | [-80.42, -19.17] | WORSE than default |
| endgame | 3.0 | -26.88 | [-58.12, 3.75] | no evidence of a shift |

## §6 — conditional rules (state → setting → edge → confidence)

_conditional null p95 = **$135.12** (the null mines the SAME policy×state grid over permuted state labels — 60 draws). State coverage: run_pressure=88 rooms, rb_drain_early=42 rooms, thin_board_early=59 rooms_

| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |
|---|---|---|---|---|---|---|
| thin_board_early | uniform_boom | -125.00 | +292.21 | [-180.93, -76.27] | 59 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | floor_heavy | -209.75 | +201.73 | [-278.81, -144.49] | 59 | LEAN → manual-override cheat sheet, never automated |
| thin_board_early | h1_phase | -35.17 | +25.90 | [-72.88, -2.54] | 59 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | h1_phase | -50.57 | -8.38 | [-88.35, -11.08] | 88 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | h1_phase | -55.95 | -11.72 | [-122.02, 9.52] | 42 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | uniform_boom | -280.97 | -27.85 | [-345.45, -217.05] | 88 | LEAN → manual-override cheat sheet, never automated |
| run_pressure | floor_heavy | -319.89 | -28.48 | [-385.8, -250.28] | 88 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | uniform_boom | -301.19 | -42.54 | [-405.95, -202.98] | 42 | LEAN → manual-override cheat sheet, never automated |
| rb_drain_early | floor_heavy | -342.86 | -47.03 | [-447.02, -238.69] | 42 | LEAN → manual-override cheat sheet, never automated |

### Pre-registered expectation (written before reading this run's rows)

After the guard, surviving conditional rules will be **FEW** and their per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest robust findings are one or two rules around the **run-response** and **my-turn-adjacency** states, where incidence genuinely varies room to room. **A short list of real conditions beats a long list of costumed globals**, and a run that produces zero shipping rules is the guard working, not the experiment failing.

**Caveats:** v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded) · paired rooms + paired weekly luck; predicted opponent slates · the null MINES CONDITIONS TOO (permuted state labels, same grid) · September quantile re-run pre-registered; nothing installs itself

_Every candidate state is computed from board/roster/pick state at the instant of the pick — machine-detectability is structural here, not a claim. Rules clearing the conditional null still need held-out validation and a cited robot scenario (fires in its trigger state and ONLY there) before entering Auto._
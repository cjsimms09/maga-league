# NEED-BY-PHASE FACTORIAL — does the additive need-weight earn beyond the mask?

_300 paired rooms · baseline = the live MASK (startable-cap, VORP-greedy) · need_scale 30.0 · n=300; min reliably detectable ~$25-35; |edge|<that with CI spanning 0 = underpowered, not zero._

**Mask's own value** (vs no-mask VORP-greedy): -443.3 CI[-486.17, -401.67] — negative here would mean the mask helps.

## Flat need-weight response curve (edge vs mask, 95% CI)

| w | edge $ | 95% CI | reading |
|---|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] | ≈0 / underpowered |
| 0.5 | +16.2 | [3.08, 29.83] | separable from 0 |
| 1.0 | +9.9 | [-7.58, 26.42] | ≈0 / underpowered |
| 1.5 | +5.7 | [-12.0, 23.5] | ≈0 / underpowered |
| 2.0 | +4.6 | [-13.33, 22.17] | ≈0 / underpowered |
| 3.0 | +4.2 | [-15.42, 23.67] | ≈0 / underpowered |

## Schedules (edge vs mask)

| schedule | edge $ | 95% CI |
|---|---|---|
| auto_ramp | +4.9 | [-12.67, 22.83] |
| early_heavy | +15.7 | [-2.0, 32.83] |
| late_heavy | +15.8 | [2.58, 29.25] |

**Verdict:** The MASK is the earner. Auto's need-WEIGHT ramp is NOT separable from zero and is beaten by a flat w≈0.5 — near-DECORATION. Simplify Auto: keep the mask, replace the need-weight ramp with a small flat weight (~0.5) or drop it.
**Ramp:** ramping does NOT beat a flat weight (a small flat w≈0.5 wins); the phase schedule of the need-weight adds nothing (ramp − best flat = -11.3).

**Caveats:** v1 money proxy; paired rooms + weekly luck; our-league 3-season pool (the sample ceiling applies — public leagues would firm this). · need_signal is a 0/0.5/1 starter-slot proxy for the engine's starterSlotMarginal; the SHAPE across w is the finding, not the absolute scale.
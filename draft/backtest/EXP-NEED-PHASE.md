# NEED-BY-PHASE FACTORIAL — does the additive need-weight earn beyond the mask?

_300 paired rooms · baseline = the live MASK (startable-cap, VORP-greedy) · need_scale 30.0 · n=300; min reliably detectable ~$25-35; |edge|<that with CI spanning 0 = underpowered, not zero._

**Mask's own value** (vs no-mask VORP-greedy): -699.6 CI[-740.25, -661.33] — negative here would mean the mask helps.

## Flat need-weight response curve (edge vs mask, 95% CI)

| w | edge $ | 95% CI | reading |
|---|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] | ≈0 / underpowered |
| 0.5 | -4.0 | [-16.17, 8.08] | ≈0 / underpowered |
| 1.0 | -13.6 | [-28.92, 1.75] | ≈0 / underpowered |
| 1.5 | -15.2 | [-30.25, -0.58] | separable from 0 |
| 2.0 | -16.6 | [-31.92, -1.75] | separable from 0 |
| 3.0 | -16.6 | [-31.92, -1.75] | separable from 0 |

## Schedules (edge vs mask)

| schedule | edge $ | 95% CI |
|---|---|---|
| auto_ramp | -14.2 | [-29.5, 0.5] |
| early_heavy | -5.6 | [-17.92, 6.75] |
| late_heavy | -14.2 | [-29.5, 0.5] |

**Verdict:** The MASK is the earner. Auto's need-WEIGHT ramp is NOT separable from zero and is beaten by a flat w≈0.5 — near-DECORATION. Simplify Auto: keep the mask, replace the need-weight ramp with a small flat weight (~0.5) or drop it.
**Ramp:** ramping does NOT beat a flat weight (a small flat w≈0.5 wins); the phase schedule of the need-weight adds nothing (ramp − best flat = -14.2).

**Caveats:** v1 money proxy; paired rooms + weekly luck; our-league 3-season pool (the sample ceiling applies — public leagues would firm this). · need_signal is a 0/0.5/1 starter-slot proxy for the engine's starterSlotMarginal; the SHAPE across w is the finding, not the absolute scale.
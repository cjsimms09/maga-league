# NEED-BY-PHASE FACTORIAL — does the additive need-weight earn beyond the mask?

_300 paired rooms · baseline = the live MASK (startable-cap, VORP-greedy) · need_scale 30.0 · n=300; min reliably detectable ~$25-35; |edge|<that with CI spanning 0 = underpowered, not zero._

**Mask's own value** (vs no-mask VORP-greedy): -475.8 CI[-517.0, -436.25] — negative here would mean the mask helps.

## Flat need-weight response curve (edge vs mask, 95% CI)

| w | edge $ | 95% CI | reading |
|---|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] | ≈0 / underpowered |
| 0.5 | -29.1 | [-46.58, -11.75] | separable from 0 |
| 1.0 | -31.4 | [-48.42, -14.17] | separable from 0 |
| 1.5 | -31.4 | [-48.42, -14.17] | separable from 0 |
| 2.0 | -31.4 | [-48.42, -14.17] | separable from 0 |
| 3.0 | -33.3 | [-50.75, -16.33] | separable from 0 |

## Schedules (edge vs mask)

| schedule | edge $ | 95% CI |
|---|---|---|
| auto_ramp | -31.4 | [-48.42, -14.17] |
| early_heavy | -31.4 | [-48.42, -14.17] |
| late_heavy | -31.1 | [-48.0, -14.0] |

**Verdict:** The MASK is the earner. Auto's need-WEIGHT ramp is NOT separable from zero and is beaten by a flat w≈0.5 — near-DECORATION. Simplify Auto: keep the mask, replace the need-weight ramp with a small flat weight (~0.5) or drop it.
**Ramp:** ramping does NOT beat a flat weight (a small flat w≈0.5 wins); the phase schedule of the need-weight adds nothing (ramp − best flat = -31.4).

**Caveats:** v1 money proxy; paired rooms + weekly luck; our-league 3-season pool (the sample ceiling applies — public leagues would firm this). · need_signal is a 0/0.5/1 starter-slot proxy for the engine's starterSlotMarginal; the SHAPE across w is the finding, not the absolute scale.
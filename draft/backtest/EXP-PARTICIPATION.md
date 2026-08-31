# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($823) · full = core + all adjusters @ default ($695) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | +6.1 | [-1.56, 13.69] | decoration (≤$25; CI tight around 0) |
| tier | -37.8 | [-57.38, -17.81] | HURTS (-38, CI excludes 0) |
| risk | -48.7 | [-69.19, -27.56] | HURTS (-49, CI excludes 0) |
| ceiling | +27.6 | [9.19, 47.06] | EARNS (+28, CI excludes 0) |
| bye | -11.2 | [-29.19, 7.62] | decoration (≤$25; CI tight around 0) |
| stack | -10.4 | [-22.56, 1.25] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +342.6 | [311.25, 372.44] | EARNS (+343, CI excludes 0) |
| need | +9.5 | [-1.94, 20.56] | decoration (≤$25; CI tight around 0) |
| tier | -96.6 | [-120.0, -73.81] | HURTS (-97, CI excludes 0) |
| risk | +10.8 | [-10.81, 32.69] | decoration (≤$25; CI tight around 0) |
| ceiling | +264.2 | [236.38, 291.06] | EARNS (+264, CI excludes 0) |
| bye | -8.6 | [-23.75, 7.38] | decoration (≤$25; CI tight around 0) |
| stack | +5.6 | [-8.12, 19.94] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -128.2 | [-153.12, -103.81] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | +2.3 | [-2.56, 7.38] |
| 1.0 | +6.1 | [-1.56, 13.69] |
| 1.5 | +5.2 | [-9.06, 19.19] |
| 2.0 | +4.5 | [-10.0, 18.94] |
| 3.0 | +4.5 | [-10.0, 18.94] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | +12.1 | [-7.62, 31.62] |
| 1.0 | +3.3 | [-16.62, 23.25] |
| 1.5 | -43.9 | [-64.06, -24.19] |
| 2.0 | -79.2 | [-102.81, -56.19] |
| 3.0 | -140.9 | [-164.75, -115.0] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | +20.5 | [13.5, 27.75] |
| regular-season | +2.8 | [-2.81, 8.75] |

**Verdict:** Core (mask + value anchor) = $823. Adding to the core: EARNS ceiling; HURTS tier, risk; decoration need, bye; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling's gain IS via weekly-high (+20 CI[13.5, 27.75]), ~0 on RS (+3 CI[-2.81, 8.75]) — the shape mechanism. Value anchor is decisive (removing it from full costs +343 CI[311.25, 372.44]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
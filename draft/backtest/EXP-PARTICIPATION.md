# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($881) · full = core + all adjusters @ default ($680) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | -2.2 | [-10.81, 6.31] | decoration (≤$25; CI tight around 0) |
| tier | -59.5 | [-80.75, -37.88] | HURTS (-60, CI excludes 0) |
| risk | -63.5 | [-83.31, -42.75] | HURTS (-64, CI excludes 0) |
| ceiling | +0.8 | [-17.19, 18.44] | decoration (≤$25; CI tight around 0) |
| bye | -28.6 | [-47.5, -10.06] | HURTS (-29, CI excludes 0) |
| stack | -1.1 | [-13.56, 12.31] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +363.0 | [332.38, 396.12] | EARNS (+363, CI excludes 0) |
| need | +0.2 | [-10.62, 11.31] | decoration (≤$25; CI tight around 0) |
| tier | -171.8 | [-201.25, -140.06] | HURTS (-172, CI excludes 0) |
| risk | -39.9 | [-63.38, -14.94] | HURTS (-40, CI excludes 0) |
| ceiling | +223.4 | [196.0, 251.88] | EARNS (+223, CI excludes 0) |
| bye | +9.9 | [-12.12, 30.31] | decoration (≤$25; CI tight around 0) |
| stack | +13.2 | [-0.25, 27.69] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -201.8 | [-230.62, -173.56] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | +2.4 | [-1.25, 7.0] |
| 1.0 | -2.2 | [-10.81, 6.31] |
| 1.5 | -45.1 | [-62.94, -28.12] |
| 2.0 | -46.6 | [-64.25, -29.44] |
| 3.0 | -46.6 | [-64.25, -29.44] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -12.4 | [-30.12, 5.38] |
| 1.0 | -72.0 | [-93.88, -48.62] |
| 1.5 | -88.3 | [-109.38, -66.81] |
| 2.0 | -138.6 | [-164.19, -112.19] |
| 3.0 | -213.8 | [-240.88, -185.62] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | +9.0 | [2.0, 16.0] |
| regular-season | -3.8 | [-10.0, 2.81] |

**Verdict:** Core (mask + value anchor) = $881. Adding to the core: EARNS nothing; HURTS tier, risk, bye; decoration need, ceiling; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling's gain IS via weekly-high (+9 CI[2.0, 16.0]), ~0 on RS (-4 CI[-10.0, 2.81]) — the shape mechanism. Value anchor is decisive (removing it from full costs +363 CI[332.38, 396.12]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
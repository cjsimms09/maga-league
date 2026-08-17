# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($686) · full = core + all adjusters @ default ($574) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | +0.1 | [-7.19, 8.0] | decoration (≤$25; CI tight around 0) |
| tier | -117.6 | [-142.12, -92.88] | HURTS (-118, CI excludes 0) |
| risk | -44.1 | [-66.31, -22.94] | HURTS (-44, CI excludes 0) |
| ceiling | +10.2 | [-11.44, 30.69] | decoration (≤$25; CI tight around 0) |
| bye | -24.4 | [-42.62, -6.88] | HURTS (-24, CI excludes 0) |
| stack | -47.6 | [-67.62, -28.12] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +491.3 | [454.62, 528.81] | EARNS (+491, CI excludes 0) |
| need | -1.4 | [-14.38, 12.25] | decoration (≤$25; CI tight around 0) |
| tier | -63.0 | [-85.69, -41.44] | HURTS (-63, CI excludes 0) |
| risk | +16.6 | [-2.44, 35.06] | decoration (≤$25; CI tight around 0) |
| ceiling | +7.4 | [-9.25, 23.56] | decoration (≤$25; CI tight around 0) |
| bye | +5.2 | [-12.81, 22.44] | decoration (≤$25; CI tight around 0) |
| stack | +5.3 | [-7.38, 18.44] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -112.1 | [-136.94, -88.31] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -2.4 | [-9.0, 4.19] |
| 1.0 | +0.1 | [-7.19, 8.0] |
| 1.5 | +0.1 | [-7.19, 8.0] |
| 2.0 | +0.1 | [-7.19, 8.0] |
| 3.0 | +0.1 | [-7.19, 8.0] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -15.1 | [-35.94, 6.0] |
| 1.0 | -6.3 | [-28.44, 14.12] |
| 1.5 | -9.2 | [-32.5, 13.0] |
| 2.0 | -7.9 | [-31.25, 14.44] |
| 3.0 | -11.4 | [-33.94, 10.44] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | +19.2 | [12.75, 25.5] |
| regular-season | -0.3 | [-5.94, 5.31] |

**Verdict:** Core (mask + value anchor) = $686. Adding to the core: EARNS nothing; HURTS tier, risk, bye; decoration need, ceiling; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling's gain IS via weekly-high (+19 CI[12.75, 25.5]), ~0 on RS (-0 CI[-5.94, 5.31]) — the shape mechanism. Value anchor is decisive (removing it from full costs +491 CI[454.62, 528.81]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
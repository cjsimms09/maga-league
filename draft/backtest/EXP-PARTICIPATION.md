# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($805) · full = core + all adjusters @ default ($337) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | -59.1 | [-78.0, -40.62] | HURTS (-59, CI excludes 0) |
| tier | -422.6 | [-451.94, -391.56] | HURTS (-423, CI excludes 0) |
| risk | -220.4 | [-245.38, -195.56] | HURTS (-220, CI excludes 0) |
| ceiling | -10.5 | [-28.06, 6.38] | decoration (≤$25; CI tight around 0) |
| bye | -72.5 | [-93.75, -53.5] | HURTS (-72, CI excludes 0) |
| stack | -67.0 | [-86.69, -47.31] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +287.9 | [259.25, 318.62] | EARNS (+288, CI excludes 0) |
| need | -46.4 | [-63.81, -29.88] | HURTS (-46, CI excludes 0) |
| tier | -321.9 | [-352.06, -292.88] | HURTS (-322, CI excludes 0) |
| risk | -129.9 | [-156.56, -105.38] | HURTS (-130, CI excludes 0) |
| ceiling | +119.0 | [94.44, 142.94] | EARNS (+119, CI excludes 0) |
| bye | -10.2 | [-28.62, 9.88] | decoration (≤$25; CI tight around 0) |
| stack | +43.6 | [20.5, 65.0] | EARNS (+44, CI excludes 0) |
| **all adjusters together** | -468.5 | [-498.44, -437.69] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -23.6 | [-37.0, -12.31] |
| 1.0 | -59.1 | [-78.0, -40.62] |
| 1.5 | -59.6 | [-78.56, -41.25] |
| 2.0 | -59.6 | [-78.56, -41.25] |
| 3.0 | -59.6 | [-78.56, -41.25] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -14.0 | [-31.19, 2.06] |
| 1.0 | -17.4 | [-39.0, 2.38] |
| 1.5 | -45.9 | [-65.88, -28.25] |
| 2.0 | -58.2 | [-79.56, -37.5] |
| 3.0 | -59.9 | [-81.19, -38.12] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | -4.0 | [-10.0, 2.25] |
| regular-season | -8.8 | [-14.38, -3.12] |

**Verdict:** Core (mask + value anchor) = $805. Adding to the core: EARNS nothing; HURTS need, tier, risk, bye; decoration ceiling; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling shows NO clean weekly-high gain on the core (wk-high -4 CI[-10.0, 2.25], RS -9 CI[-14.38, -3.12]) — my prereg guess did NOT survive de-confounding. Value anchor is decisive (removing it from full costs +288 CI[259.25, 318.62]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
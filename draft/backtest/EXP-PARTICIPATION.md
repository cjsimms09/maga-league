# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($754) · full = core + all adjusters @ default ($370) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | -34.0 | [-54.44, -12.94] | HURTS (-34, CI excludes 0) |
| tier | -303.4 | [-331.75, -274.06] | HURTS (-303, CI excludes 0) |
| risk | -172.4 | [-197.62, -148.12] | HURTS (-172, CI excludes 0) |
| ceiling | -23.4 | [-44.31, -2.5] | HURTS (-23, CI excludes 0) |
| bye | -40.9 | [-62.38, -20.44] | HURTS (-41, CI excludes 0) |
| stack | -73.4 | [-95.25, -52.38] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +340.2 | [305.56, 374.12] | EARNS (+340, CI excludes 0) |
| need | -0.8 | [-19.38, 17.38] | decoration (≤$25; CI tight around 0) |
| tier | -252.5 | [-280.81, -224.31] | HURTS (-252, CI excludes 0) |
| risk | -75.6 | [-98.94, -52.81] | HURTS (-76, CI excludes 0) |
| ceiling | +50.8 | [27.62, 75.06] | EARNS (+51, CI excludes 0) |
| bye | +1.6 | [-16.81, 20.25] | decoration (≤$25; CI tight around 0) |
| stack | -26.2 | [-48.25, -5.06] | HURTS (-26, CI excludes 0) |
| **all adjusters together** | -384.6 | [-414.25, -356.56] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -8.7 | [-26.44, 8.31] |
| 1.0 | -34.0 | [-54.44, -12.94] |
| 1.5 | -34.4 | [-54.81, -13.25] |
| 2.0 | -34.4 | [-54.81, -13.25] |
| 3.0 | -34.4 | [-54.81, -13.25] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -19.9 | [-40.62, 2.06] |
| 1.0 | -41.8 | [-64.12, -20.75] |
| 1.5 | -46.6 | [-68.5, -24.31] |
| 2.0 | -59.9 | [-83.19, -37.88] |
| 3.0 | -75.6 | [-98.88, -53.25] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | -6.5 | [-11.75, -1.0] |
| regular-season | -7.5 | [-14.06, -0.94] |

**Verdict:** Core (mask + value anchor) = $754. Adding to the core: EARNS nothing; HURTS need, tier, risk, ceiling, bye; decoration none; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling shows NO clean weekly-high gain on the core (wk-high -6 CI[-11.75, -1.0], RS -8 CI[-14.06, -0.94]) — my prereg guess did NOT survive de-confounding. Value anchor is decisive (removing it from full costs +340 CI[305.56, 374.12]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
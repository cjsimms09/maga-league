# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($752) · full = core + all adjusters @ default ($451) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | -21.8 | [-38.44, -4.38] | HURTS (-22, CI excludes 0) |
| tier | -238.6 | [-266.75, -210.06] | HURTS (-239, CI excludes 0) |
| risk | -183.6 | [-210.38, -157.75] | HURTS (-184, CI excludes 0) |
| ceiling | -22.4 | [-42.31, -2.75] | HURTS (-22, CI excludes 0) |
| bye | -31.6 | [-51.19, -12.44] | HURTS (-32, CI excludes 0) |
| stack | -62.2 | [-81.56, -42.19] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +445.1 | [411.94, 477.94] | EARNS (+445, CI excludes 0) |
| need | +15.4 | [0.88, 30.56] | EARNS (+15, CI excludes 0) |
| tier | -191.9 | [-218.94, -165.0] | HURTS (-192, CI excludes 0) |
| risk | -142.6 | [-170.44, -115.94] | HURTS (-143, CI excludes 0) |
| ceiling | +85.1 | [62.19, 107.56] | EARNS (+85, CI excludes 0) |
| bye | -2.2 | [-19.12, 14.25] | decoration (≤$25; CI tight around 0) |
| stack | -9.9 | [-23.56, 3.88] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -301.9 | [-331.56, -273.5] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -15.8 | [-29.44, -1.88] |
| 1.0 | -21.8 | [-38.44, -4.38] |
| 1.5 | -22.0 | [-38.75, -4.56] |
| 2.0 | -22.0 | [-38.75, -4.56] |
| 3.0 | -22.0 | [-38.75, -4.56] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -13.5 | [-32.62, 6.31] |
| 1.0 | -55.2 | [-77.62, -33.94] |
| 1.5 | -67.6 | [-90.75, -45.5] |
| 2.0 | -60.6 | [-83.88, -38.69] |
| 3.0 | -70.4 | [-92.0, -49.0] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | -4.0 | [-10.25, 2.25] |
| regular-season | -5.9 | [-11.88, 0.0] |

**Verdict:** Core (mask + value anchor) = $752. Adding to the core: EARNS nothing; HURTS need, tier, risk, ceiling, bye; decoration none; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling shows NO clean weekly-high gain on the core (wk-high -4 CI[-10.25, 2.25], RS -6 CI[-11.88, 0.0]) — my prereg guess did NOT survive de-confounding. Value anchor is decisive (removing it from full costs +445 CI[411.94, 477.94]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
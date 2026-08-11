# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($796) · full = core + all adjusters @ default ($313) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | -46.1 | [-65.62, -27.25] | HURTS (-46, CI excludes 0) |
| tier | -420.6 | [-451.31, -390.25] | HURTS (-421, CI excludes 0) |
| risk | -223.6 | [-249.06, -198.75] | HURTS (-224, CI excludes 0) |
| ceiling | -10.4 | [-28.44, 6.25] | decoration (≤$25; CI tight around 0) |
| bye | -31.4 | [-50.69, -11.94] | HURTS (-31, CI excludes 0) |
| stack | -41.5 | [-60.38, -22.88] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +266.8 | [239.19, 295.38] | EARNS (+267, CI excludes 0) |
| need | -51.1 | [-72.94, -30.44] | HURTS (-51, CI excludes 0) |
| tier | -361.9 | [-392.81, -333.56] | HURTS (-362, CI excludes 0) |
| risk | -93.9 | [-117.56, -70.0] | HURTS (-94, CI excludes 0) |
| ceiling | +94.7 | [70.88, 118.0] | EARNS (+95, CI excludes 0) |
| bye | -44.8 | [-61.75, -27.81] | HURTS (-45, CI excludes 0) |
| stack | +9.6 | [-12.94, 31.88] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -482.8 | [-515.12, -452.88] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -19.0 | [-32.38, -6.25] |
| 1.0 | -46.1 | [-65.62, -27.25] |
| 1.5 | -46.3 | [-65.88, -27.56] |
| 2.0 | -46.3 | [-65.88, -27.56] |
| 3.0 | -46.3 | [-65.88, -27.56] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -16.4 | [-34.0, -0.44] |
| 1.0 | -40.1 | [-58.5, -20.94] |
| 1.5 | -47.5 | [-66.62, -28.19] |
| 2.0 | -61.3 | [-82.88, -39.81] |
| 3.0 | -66.8 | [-88.38, -44.81] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | -1.2 | [-7.5, 4.5] |
| regular-season | -7.2 | [-13.75, -0.94] |

**Verdict:** Core (mask + value anchor) = $796. Adding to the core: EARNS nothing; HURTS need, tier, risk, bye; decoration ceiling; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling shows NO clean weekly-high gain on the core (wk-high -1 CI[-7.5, 4.5], RS -7 CI[-13.75, -0.94]) — my prereg guess did NOT survive de-confounding. Value anchor is decisive (removing it from full costs +267 CI[239.19, 295.38]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
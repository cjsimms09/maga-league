# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($641) · full = core + all adjusters @ default ($529) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | -0.2 | [-11.06, 10.12] | decoration (≤$25; CI tight around 0) |
| tier | -105.0 | [-127.69, -82.25] | HURTS (-105, CI excludes 0) |
| risk | -32.4 | [-51.06, -13.5] | HURTS (-32, CI excludes 0) |
| ceiling | -19.0 | [-39.5, 0.25] | decoration (≤$25; CI tight around 0) |
| bye | -12.6 | [-29.12, 2.94] | decoration (≤$25; CI tight around 0) |
| stack | -30.1 | [-49.75, -11.62] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +400.9 | [366.94, 434.31] | EARNS (+401, CI excludes 0) |
| need | +1.2 | [-0.0, 3.56] | decoration (≤$25; CI tight around 0) |
| tier | -62.0 | [-84.56, -39.94] | HURTS (-62, CI excludes 0) |
| risk | -6.6 | [-26.38, 12.38] | decoration (≤$25; CI tight around 0) |
| ceiling | -10.4 | [-31.69, 10.75] | decoration (≤$25; CI tight around 0) |
| bye | +23.6 | [2.44, 44.25] | EARNS (+24, CI excludes 0) |
| stack | -0.2 | [-0.56, -0.0] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -111.6 | [-136.88, -88.94] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -2.4 | [-12.62, 7.31] |
| 1.0 | -0.2 | [-11.06, 10.12] |
| 1.5 | -0.2 | [-11.06, 10.12] |
| 2.0 | -0.2 | [-11.06, 10.12] |
| 3.0 | -0.2 | [-11.06, 10.12] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -4.8 | [-24.12, 13.56] |
| 1.0 | -15.1 | [-33.88, 3.38] |
| 1.5 | -37.3 | [-58.75, -17.12] |
| 2.0 | -40.8 | [-62.5, -19.38] |
| 3.0 | -47.1 | [-68.5, -26.88] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | +0.5 | [-4.5, 6.0] |
| regular-season | -7.5 | [-13.44, -1.88] |

**Verdict:** Core (mask + value anchor) = $641. Adding to the core: EARNS nothing; HURTS tier, risk; decoration need, ceiling, bye; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling shows NO clean weekly-high gain on the core (wk-high +0 CI[-4.5, 6.0], RS -8 CI[-13.44, -1.88]) — my prereg guess did NOT survive de-confounding. Value anchor is decisive (removing it from full costs +401 CI[366.94, 434.31]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
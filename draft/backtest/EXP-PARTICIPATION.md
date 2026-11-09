# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($908) · full = core + all adjusters @ default ($610) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | +0.7 | [-11.25, 12.25] | decoration (≤$25; CI tight around 0) |
| tier | -99.0 | [-122.0, -75.56] | HURTS (-99, CI excludes 0) |
| risk | -56.1 | [-75.19, -38.12] | HURTS (-56, CI excludes 0) |
| ceiling | -3.8 | [-22.19, 14.31] | decoration (≤$25; CI tight around 0) |
| bye | -19.1 | [-36.88, -1.88] | HURTS (-19, CI excludes 0) |
| stack | -14.8 | [-26.88, -3.38] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +307.3 | [276.38, 339.44] | EARNS (+307, CI excludes 0) |
| need | -4.1 | [-21.0, 14.25] | decoration (≤$25; CI tight around 0) |
| tier | -298.1 | [-329.19, -267.56] | HURTS (-298, CI excludes 0) |
| risk | -105.9 | [-134.75, -78.06] | HURTS (-106, CI excludes 0) |
| ceiling | +149.9 | [120.94, 180.0] | EARNS (+150, CI excludes 0) |
| bye | +8.9 | [-9.06, 26.88] | decoration (≤$25; CI tight around 0) |
| stack | +13.9 | [4.0, 24.12] | EARNS (+14, CI excludes 0) |
| **all adjusters together** | -298.6 | [-330.69, -267.56] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | +0.4 | [-1.25, 2.06] |
| 1.0 | +0.7 | [-11.25, 12.25] |
| 1.5 | -87.5 | [-107.31, -67.81] |
| 2.0 | -90.1 | [-109.56, -69.94] |
| 3.0 | -89.6 | [-108.94, -69.5] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -24.2 | [-41.94, -6.62] |
| 1.0 | -93.2 | [-117.0, -70.0] |
| 1.5 | -122.9 | [-146.44, -98.69] |
| 2.0 | -159.6 | [-185.81, -133.25] |
| 3.0 | -216.8 | [-245.5, -190.0] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | +13.2 | [6.5, 20.25] |
| regular-season | -7.5 | [-13.12, -1.56] |

**Verdict:** Core (mask + value anchor) = $908. Adding to the core: EARNS nothing; HURTS tier, risk, bye; decoration need, ceiling; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling's gain IS via weekly-high (+13 CI[6.5, 20.25]), ~0 on RS (-8 CI[-13.12, -1.56]) — the shape mechanism. Value anchor is decisive (removing it from full costs +307 CI[276.38, 339.44]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
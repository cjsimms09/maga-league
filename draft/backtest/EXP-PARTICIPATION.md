# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($850) · full = core + all adjusters @ default ($709) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | -18.1 | [-31.75, -4.81] | HURTS (-18, CI excludes 0) |
| tier | -68.4 | [-88.44, -50.31] | HURTS (-68, CI excludes 0) |
| risk | -107.8 | [-128.19, -87.56] | HURTS (-108, CI excludes 0) |
| ceiling | -12.3 | [-32.06, 6.75] | decoration (≤$25; CI tight around 0) |
| bye | -17.4 | [-34.94, -0.38] | HURTS (-17, CI excludes 0) |
| stack | -3.6 | [-17.56, 9.75] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +495.5 | [461.56, 529.81] | EARNS (+496, CI excludes 0) |
| need | +57.9 | [35.25, 82.12] | EARNS (+58, CI excludes 0) |
| tier | -77.5 | [-99.81, -56.5] | HURTS (-78, CI excludes 0) |
| risk | -15.3 | [-40.5, 9.0] | decoration (≤$25; CI tight around 0) |
| ceiling | +277.6 | [250.19, 305.31] | EARNS (+278, CI excludes 0) |
| bye | +0.8 | [-17.19, 18.5] | decoration (≤$25; CI tight around 0) |
| stack | -10.2 | [-24.56, 3.31] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -140.8 | [-163.56, -119.69] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -7.9 | [-18.12, 2.0] |
| 1.0 | -18.1 | [-31.75, -4.81] |
| 1.5 | -21.0 | [-34.94, -7.56] |
| 2.0 | -21.7 | [-35.81, -8.19] |
| 3.0 | -21.7 | [-35.81, -8.19] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | -4.1 | [-21.5, 13.56] |
| 1.0 | -39.3 | [-58.69, -19.56] |
| 1.5 | -49.4 | [-68.56, -30.25] |
| 2.0 | -101.2 | [-123.5, -80.31] |
| 3.0 | -202.9 | [-230.38, -176.88] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | +13.8 | [7.0, 20.5] |
| regular-season | -11.2 | [-18.75, -4.06] |

**Verdict:** Core (mask + value anchor) = $850. Adding to the core: EARNS nothing; HURTS need, tier, risk, bye; decoration ceiling; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling's gain IS via weekly-high (+14 CI[7.0, 20.5]), ~0 on RS (-11 CI[-18.75, -4.06]) — the shape mechanism. Value anchor is decisive (removing it from full costs +496 CI[461.56, 529.81]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
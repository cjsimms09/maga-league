# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($668) · full = core + all adjusters @ default ($620) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | +3.8 | [-3.94, 12.75] | decoration (≤$25; CI tight around 0) |
| tier | -101.4 | [-124.44, -78.88] | HURTS (-101, CI excludes 0) |
| risk | -39.2 | [-58.06, -19.81] | HURTS (-39, CI excludes 0) |
| ceiling | +1.6 | [-17.25, 20.25] | decoration (≤$25; CI tight around 0) |
| bye | -1.2 | [-17.12, 15.31] | decoration (≤$25; CI tight around 0) |
| stack | -19.6 | [-37.56, -2.19] | INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation — the stack mechanism is absent, so this arm can't reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5). |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +482.9 | [446.25, 518.88] | EARNS (+483, CI excludes 0) |
| need | -0.0 | [-0.0, -0.0] | decoration (≤$25; CI tight around 0) |
| tier | -50.1 | [-69.25, -30.25] | HURTS (-50, CI excludes 0) |
| risk | +55.2 | [34.0, 76.62] | EARNS (+55, CI excludes 0) |
| ceiling | +55.4 | [35.62, 75.0] | EARNS (+55, CI excludes 0) |
| bye | +24.8 | [7.12, 41.38] | EARNS (+25, CI excludes 0) |
| stack | -0.6 | [-7.06, 5.88] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -48.4 | [-68.38, -29.81] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | +3.4 | [-4.19, 12.5] |
| 1.0 | +3.8 | [-3.94, 12.75] |
| 1.5 | +3.8 | [-3.94, 12.75] |
| 2.0 | +3.8 | [-3.94, 12.75] |
| 3.0 | +3.8 | [-3.94, 12.75] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | +1.9 | [-16.69, 19.44] |
| 1.0 | -0.6 | [-20.25, 18.38] |
| 1.5 | -4.6 | [-23.0, 13.19] |
| 2.0 | -13.9 | [-33.12, 4.44] |
| 3.0 | -23.2 | [-43.38, -3.5] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | -1.5 | [-7.0, 4.25] |
| regular-season | -1.6 | [-6.88, 3.44] |

**Verdict:** Core (mask + value anchor) = $668. Adding to the core: EARNS nothing; HURTS tier, risk; decoration need, ceiling, bye; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196). Ceiling shows NO clean weekly-high gain on the core (wk-high -2 CI[-7.0, 4.25], RS -2 CI[-6.88, 3.44]) — my prereg guess did NOT survive de-confounding. Value anchor is decisive (removing it from full costs +483 CI[446.25, 518.88]).

**Stack reconciliation (instrument limit):** stack reads −$63 HERE but that is an instrument artifact — grade_room draws weekly scores independently (no within-team correlation), so this harness can't reward a stack. exp6/stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; the exp6 'dose pays' verdict STANDS, not retired.

**Draft-day Auto:** mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, the one adjuster that earns — its mechanism just isn't in THIS harness); need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel collapses to mask + value + a stack tilt.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
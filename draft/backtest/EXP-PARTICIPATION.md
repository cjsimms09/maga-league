# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?

_400 paired rooms · core = mask + value anchor ($704) · full = core + all adjusters @ default ($407) · n=400; min reliably detectable ~$25; |edge|<that with CI spanning 0 = underpowered, not zero._

**Keeper scoped out:** KOV is a cross-season option value; a single-season money grade cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.

## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)

_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._

| term added | $ vs core | 95% CI | reading |
|---|---|---|---|
| need | +6.5 | [-7.62, 19.94] | decoration (≤$25; CI tight around 0) |
| tier | -235.3 | [-263.5, -206.62] | HURTS (-235, CI excludes 0) |
| risk | -142.8 | [-170.31, -114.56] | HURTS (-143, CI excludes 0) |
| ceiling | -4.8 | [-25.81, 17.25] | decoration (≤$25; CI tight around 0) |
| bye | -19.6 | [-42.75, 3.5] | decoration (≤$25; CI tight around 0) |
| stack | -63.4 | [-86.69, -41.19] | HURTS (-63, CI excludes 0) |

## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)

_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation magnitude is the term DISTORTING the anchor at default strength, not a real edge._

| term | full − off | 95% CI | reading |
|---|---|---|---|
| value | +361.6 | [328.75, 394.06] | EARNS (+362, CI excludes 0) |
| need | -10.6 | [-29.31, 8.06] | decoration (≤$25; CI tight around 0) |
| tier | -263.0 | [-291.94, -235.94] | HURTS (-263, CI excludes 0) |
| risk | -103.6 | [-129.25, -79.0] | HURTS (-104, CI excludes 0) |
| ceiling | +149.6 | [124.56, 173.38] | EARNS (+150, CI excludes 0) |
| bye | +4.5 | [-3.44, 12.81] | decoration (≤$25; CI tight around 0) |
| stack | -9.5 | [-28.0, 8.94] | decoration (≤$25; CI tight around 0) |
| **all adjusters together** | -296.9 | [-328.06, -266.94] | separable |

## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs

_value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 gives the same argmax over VORP). Removing the anchor is catastrophic (see ablation value / all-adjusters); how hard to lean on it is the INVERSE of the need/ceiling curves below._

### Need weight (vs the value anchor)

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | +17.0 | [5.62, 28.38] |
| 1.0 | +6.5 | [-7.62, 19.94] |
| 1.5 | +4.7 | [-9.94, 18.88] |
| 2.0 | +3.3 | [-11.69, 17.69] |
| 3.0 | +0.9 | [-15.0, 17.0] |

### Ceiling weight (vs the value anchor) — how hard to lean on upside

| w | edge $ | 95% CI |
|---|---|---|
| 0.0 | +0.0 | [0.0, 0.0] |
| 0.5 | +6.9 | [-14.5, 28.19] |
| 1.0 | +22.6 | [1.62, 45.38] |
| 1.5 | +25.9 | [1.5, 49.75] |
| 2.0 | +24.2 | [-0.19, 48.75] |
| 3.0 | +12.6 | [-11.94, 36.81] |

## Ceiling by payout component (does shape pay in weekly-high?)

| component | edge $ | 95% CI |
|---|---|---|
| weekly-high (37.5% of pot) | -0.8 | [-7.25, 6.25] |
| regular-season | +2.8 | [-3.12, 9.06] |

**Verdict:** Core (mask + value anchor) = $704. Adding to the core: EARNS nothing; HURTS tier, risk, stack; decoration need, ceiling, bye. Ceiling shows NO clean weekly-high gain on the core (wk-high -1 CI[-7.25, 6.25], RS +3 CI[-3.12, 9.06]) — my prereg guess did NOT survive de-confounding. Value anchor is decisive (removing it from full costs +362 CI[328.75, 394.06]).

**Draft-day Auto:** mask ON (the earner), value anchor at default, all additive adjusters at/near zero. Nothing measured earns a place beyond mask+value.

**Pre-registration outcome:** Cory's prior (need earns, most others don't) — CONFIRMED, with one correction: even the additive need-WEIGHT is decoration; it's the MASK (always on) that earns. My prereg guess that CEILING earns via weekly-high — NOT supported on the clean core (weekly-high ~0); the apparent weekly-high gain was a confound of the ablation-from-full frame.

**Frame:** Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but −5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read build-up.

**SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm to decoration. Either way: nothing to turn up beyond the core.**

**Faithfulness:** need + value map exactly onto this harness (accepted results use them); tier/risk/ceiling/bye/stack are proxies from the same board fields the engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the mechanism here, it does not by itself convict the live term.
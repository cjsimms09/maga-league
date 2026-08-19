# PREREGISTRATION — the simple model: Draft Sharks projections, VONA, need

**A, 2026-08-19, committed BEFORE the code.**

Cory: *"the overall model should be pure VONA based on draft shark projections,
using our roster equation (which we still need to fix)… if I crank ceiling
adjuster all the way up it should be ranking off pure ceiling projections.. if I
crank it to 50 it should use 50% of the added ceiling… We are simplifying
model!!"*

---

## ⛔ FIRST — MY COVERAGE GATE WAS DIVIDING BY THE WRONG POPULATION

I told Cory **"35.3% coverage, NOT SAFE TO SWAP"** and used it to hold this
back. That is 247 of **610 board players** — a denominator that includes
hundreds of men nobody drafts.

**The population that matters is the one that gets picked.** Ten teams, fifteen
rounds, 150 picks:

| top-N by ADP | with a Draft Sharks line |
|---|---|
| top 100 | **100.0%** |
| **top 150** | **99.3%** |
| top 180 | 96.7% |
| top 200 | 94.5% |

**One player inside a 150-pick draft has no Draft Sharks line.** The six missing
inside 180 are Theo Wease, Jayden Higgins, Blake Grupe, Ja'Kobi Lane, Nick Folk
and David Njoku.

**Rule 3i on my own gate: I quoted a ratio without looking at which population
it should have been over, and it blocked the thing Cory asked for.**

## THE MODEL, IN FULL

```
proj_used(p, a) = ds_proj(p) + a × (ds_ceiling(p) − ds_proj(p)),   a ∈ [0, 1]

VONA(p)         = proj_used(p) − E[ proj_used(best available at p's position
                                    at my NEXT pick) ]

score(p)        = VONA(p) × need(position, how many I already hold)
```

**Three terms. No ceiling weight, no tier, no risk, no bye, no stack, no
position rescale, no lateness ramp.** `a = 0` is their mean, `a = 0.5` is half
the added ceiling, `a = 1` ranks on pure ceiling — Cory's sentence, literally.

**The `need` curve is the measured one** (`measured_need_curve.json`, counted
from 540 real team-weeks). **Cory says it still needs fixing and he is right —
QB and TE leak, register 117 — and this prereg does not pretend otherwise.**

## PREDICTIONS

**P186 — the adjuster is exactly what Cory described, as an identity.** At
`a = 1` the ranking is **identical** to ranking on `ds_ceiling` alone; at
`a = 0` it is identical to ranking on `ds_proj` alone; at `a = 0.5` every
player's `proj_used` equals `ds_proj + 0.5 × (ds_ceiling − ds_proj)` to within
1e-9. **FALSE on any single player failing any of the three.**

**P187 — swapping our projections for theirs changes the board.** At `a = 0`,
at least **15 of the top 100** by our `proj_mean` ordering are in a different
position under `ds_proj`. **FALSE under 15** — in which case the two sources
agree so closely that the swap is cosmetic and the whole exercise is moot.

**P188 — the simple model does not silently lose the roster shape we already
won.** Over the same 300 simulated rooms at `a = 0`, on the ROSTER: **RB in
4-6**, **K = 1** and **DEF = 1**. **FALSE if any misses.** ⭐ **This is the
guard against "simpler" quietly meaning "worse". K and DEF landing on exactly
1.00 was Cory's own ruling working, and a rewrite that loses it has taken
something away.**

**P189 — and it does NOT fix the quarterback, because nothing in it addresses
register 117.** Mean QB on the roster stays **above 1.30** at `a = 0`.
**FALSE if it drops below** — which would be good news and would mean the QB
leak was an artefact of the discarded terms rather than of the deep wire, and
that is worth knowing either way. **This bar is written to be able to
embarrass me.**

## CONTROLS

1. **KNOWN POSITIVE.** `a = 0` must reproduce a plain `ds_proj` ranking exactly
   (this is half of P186 and it is also the smoke test for the whole pipeline).
2. **Players with no Draft Sharks line are EXCLUDED and NAMED**, never
   defaulted to our projection — mixing two sources inside one VONA is the
   defect this model exists to remove. The count and the names go in the
   artifact.
3. **`ds_floor ≤ ds_proj ≤ ds_ceiling` per player**, or the row is rejected and
   named.
4. **The `need` curve is the committed measured one**, unchanged, and its own
   controls must have passed.

## GUARD

**REPORT ONLY.** `engine.js`, `draft_plan.js` and `public/draft_data.json` are
untouched. **`no_fit_guard`: `a` is an input Cory sets, not a parameter I fit,
and no arm here is selected by moving it.** Whether any of this ships before
Saturday is Cory's call and I will hand him P188 and P189 as the evidence.

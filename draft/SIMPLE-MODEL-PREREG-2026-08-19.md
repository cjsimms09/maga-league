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

---

# ADDENDUM — P190, committed after P188 failed and before the arm is run

**P188 FALSE at `a = 0`, and it failed the way it was designed to detect.**

| roster | three-term model | Cory |
|---|---|---|
| QB | 2.25 | 1 |
| RB | **4.06** ✅ | 4-5 |
| WR | 3.41 | 4-5 |
| TE | 2.77 | — |
| K | 1.75 | 1 |
| **DEF** | **0.76, minimum 0** | 1 |

**A minimum of 0 at DEF means some rosters finish with NO DEFENCE — an illegal
lineup, not a shape preference.** P186 and P187 passed, so the adjuster and the
projection swap are sound; what broke is the roster half.

## WHAT I SIMPLIFIED AWAY, AND BOTH ARE CORY'S OWN RULINGS

**Neither is a term I invented, and both were preregistered and graded before
today's rewrite:**

1. **K/DEF need = 0 once you hold one.** Cory, 08-19: *"same problem with K and
   def, once you draft 1 the need should be 0."* Graded as **P149** and again in
   **P177**, where it put K and DEF on exactly **1.00 with sd 0.00** in all 300
   rooms.
2. **The reservation gate.** Cory, 08-19: *"if value is best at RB and WR each
   round then we should take them until there are 4 picks remaining and we still
   need QB, TE, DEF, K… then RB and WR need goes to 0… so picks remaining should
   have a role."* Built and graded as **P162**. It is what makes an empty
   starting slot impossible.

**"Simplify the model" meant drop MY scaffolding — the ceiling weight, tier,
risk, bye, stack, the position rescale, the lateness ramp. It did not mean drop
Cory's rulings, and I dropped two.**

**P190 — the three terms PLUS Cory's two existing rules meet his spec.** Same
300 rooms, `a = 0`, on the ROSTER:

- **(a)** DEF = **1.00** and K = **1.00**, and **no room finishes with an empty
  starting slot** (minimum 1 at every required position)
- **(b)** RB in **4-6**
- **(c)** QB **still above 1.30** — ⭐ **because neither of Cory's rules touches
  quarterback, and if adding them "fixes" QB then something else moved and I
  need to find out what. This bar is here to catch me, not to pass.**

**FALSE if any of the three misses.**

**This is the second and last arm.** If (a) or (b) fails, the honest report is
that the simple model cannot hold the shape and I say so.

**Still REPORT ONLY. `no_fit_guard`: nothing here is selected by moving a
constant, and both additions are rulings Cory made before this thread existed.**

# PREREGISTRATION — need = "do I need another body", not "which body filled the slot"

**A, 2026-08-19, committed BEFORE the code.** Cory: *"our equation sucks… this
shouldn't be that hard"* and *"equation is terrible…. Fix it"*.

## THE DEFECT, IN ONE LINE

`measured_need_curve.json` gives **K2 = 0.828** in a one-kicker league. That is
not a near-miss, it is the wrong question: the curve measures **which of my
bodies filled the one slot**, and those shares decompose a single slot rather
than counting how many bodies I need. QB starters per week is **1.000 exactly**
— the curve's own control proves it.

**Every 1-slot position is broken by this and no multi-slot position is:**
QB 0.427 · TE 0.414 · K 0.828 · DEF 0.484, against RB 0.713 / WR 0.696 where 2
slots plus a flex make the two questions nearly the same. **Cory's K/DEF hard
rule was patching this bug on the two positions he happened to notice.**

## THE FIX — derived, one equation, no per-position rules

The (n)-th body starts in a week iff **fewer than my starting slots are filled
by the bodies above him**, and he is only worth rostering if I could not simply
pick a body up instead:

```
S_eff(pos)   = measured starters per team-week  (QB 1.000 RB 2.417 WR 2.556
                                                 TE 1.017 K 0.996 DEF 0.996)
q(p)         = 1 − games_expected/17 + bye      per player, from Draft Sharks
need(pos,n)  = P( Binomial(n−1, 1−q) < S_eff ) × ( 1 − streamability(pos) )
```

**`S_eff` is fractional and is treated as such** — `floor` with probability
`1−frac`, `ceil` with `frac` — which is how the flex enters without a rule
about it. **Nothing here is chosen: `S_eff` and `streamability` are measured,
`q` is per player from the new Draft Sharks `games` column, and the binomial is
arithmetic.**

⭐ **The 1-slot case collapses to something Cory could have written by hand:**
with `S_eff = 1` and `n = 2`, `need = q × (1 − stream)` — the chance your
starter is out, discounted by your ability to stream a replacement. **QB
0.147 × (1−0.590) ≈ 0.06 against the curve's 0.427.**

## PREDICTIONS

**P191 — the fix collapses the 1-slot positions and leaves the multi-slot ones
alone.** New need at the 2nd body: **QB, TE, K and DEF all below 0.15**, and at
the 3rd body **RB and WR both above 0.35**. **FALSE if any of the six misses.**

**P192 — and that fixes the roster.** Same 300 rooms, `a = 0`, on the ROSTER:
**QB ≤ 1.30** and **TE ≤ 1.60**, while **RB stays in 4-6** and **K = DEF =
1.00**. **FALSE if any misses.** ⭐ **RB and K/DEF are the anti-tuning half: a
"fix" that kills the backup quarterback by flattening every need is not a fix.**

**P193 — Cory's K/DEF hard rule becomes REDUNDANT.** With the new need and the
hard rule turned OFF, K and DEF still land at **1.00 ± 0.05** and no room
finishes with an empty starting slot. **FALSE otherwise** — in which case the
derivation has not actually explained his rule and it stays a patch.

## CONTROLS

1. **KNOWN POSITIVE.** With `q = 0` (nobody ever misses a game) the new need
   must be **1.0 for every body up to `S_eff` and 0 above it** — the degenerate
   case the arithmetic must reproduce or it is not a slot-filling model.
2. **`S_eff` and `streamability` are read from the committed artifacts**, whose
   own controls must have passed; neither is re-derived here.
3. **Per-player `q` comes from Draft Sharks `games`; players without it are
   NAMED and fall back to the position median**, never silently.
4. **REPORT ONLY until Cory rules on shipping.**

## ⚠️ AND THE PART CORY ASKED ABOUT — "this needs to match the board I draft with"

**It does not today, and I am not going to pretend the gap is small.** The war
room's list comes from `engine.js` in the browser, with **`need` at weight 0**,
our projections, and the ceiling scaffolding of register 124. Everything in this
file lives in `draft/tools/simple_model.js`.

**Closing that gap is a real change to the thing he drafts on, three days out.**
The honest sequence is: **fix the equation (this file), prove it on the rooms,
then wire it — and the wiring is its own decision with its own risk, not a
footnote to this one.** I will bring him that plan with P192's result attached.

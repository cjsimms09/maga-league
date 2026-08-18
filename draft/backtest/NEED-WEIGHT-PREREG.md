<!-- TERRITORY: A -->
# PREREGISTRATION — DOES THE `need` WEIGHT PAY?

**Committed BEFORE the study is built or run. No numbers in this commit.**

**Written 2026-08-17, to be RUN AFTER the 2026-08-22 draft.** Deliberately: no
weight ships before the draft, and a design written after seeing results is not
a design. Writing it now, while the context is fresh and no data exists, is the
only moment a preregistration is worth anything.

---

## 1. WHY THIS IS DIFFERENT FROM THE CEILING STUDY, WHICH FOUND NOTHING

The ceiling weight measured collinear and was zeroed because
`proj_ceiling - proj_mean` was **the projection rescaled**. There was no
independent information in the term; the null was structural.

**`need` is not that.** It carries a fact nothing else in the composite supplies
mid-draft: *which of my starting slots are still empty*. And the composite is
measurably blind to it — `composite_roster_blindness.test.js`, passing today:

> at pick 70, adding a QB and a TE to the roster drops the mask's admitted
> quarterbacks from **215 to ZERO** and does not move the composite top 70 by
> one player (QB 14, TE 18 both ways).

**⚠️ THIS PREMISE IS CEILING-DEPENDENT — added 2026-08-17.** The blindness above
holds only while `MEASURED_WEIGHTS.ceiling = 0`. The bench branch
(`engine.js:1682`) fires on `need.fills === 'bench'`, which IS roster-dependent,
and anchors on the ceiling term — so with ceiling at zero its awareness has
nothing to express, and with ceiling on the composite becomes roster-sensitive
for free. **If the ceiling weight ships, re-take the 215→0 measurement before
running this study**, or it answers a question that no longer exists.
`draft/audit/roster_blindness_is_a_ceiling_artifact_2026-08-17.md`


So this is a real mechanism with a real gap to fill, not a rescaled copy. **A
null here would be informative rather than structural**, which is exactly the
property the ceiling study lacked.

## 2. WHAT `need` IS AND IS NOT — the correction that made this study possible

`MEASURED_WEIGHTS.need = 0` was justified as *"redundant with the lineup mask"*.
That reason is **true of one surface and was written as if true of both**:

- The mask (`needrule.js:withinCap`) governs the **needrule CARD**. There it
  genuinely is the need mechanism.
- `engine.recommend()` **never calls it** — grep `withinCap` in `engine.js` and
  every hit is a comment.

`engine.js` already carries that retraction. The weight stayed at 0 as a
*separate* decision resting on a *separate* measurement that was never taken.
This is that measurement.

**NOT a claim that the zero is wrong.** It is a claim that it is untested.

## 3. THE DESIGN

**Harness:** `archetype_rooms.js` — paired seeds, real `E.recommend()` through
real `live_context.js`, measured opponent model, designated keepers.

**The axis is CHEAP and already supported.** `live_context.js:126` reads
`weights: o.weights || engine.MEASURED_WEIGHTS`, so a modified weight set only
has to be handed in. Add `--need-weight` to `archetype_rooms.js` and pass
`weights: Object.assign({}, E.MEASURED_WEIGHTS, {need: X})`.

**Arms:** `need = 0.0` (control, shipped) / `0.35` / `0.9` / `1.45` — the values
the shipped presets already use (`engine.js:3353-3371`), so the grid is not a
free parameter invented for this run.

**Arm must be `shipped`, and only `shipped`.** The archetype overlays
(`zero_rb`, `robust_rb`, `early_qb`) encode their own positional logic, which
would confound a positional-fill term completely. Running the need axis under
those arms would measure the interaction and report it as the effect.

**Metric:** the money proxy — **with the keeper-variance fix of 2026-08-17 in
place** (`cory_conditional` hardcoded keeper `weekly_sd` at 8.0 against real
17.63 / 25.81 / 32.46, understating team weekly sd by 11.1%). A `need` run on
the uncorrected proxy would carry a bias toward roster steadiness, which is
adjacent enough to what `need` does to matter.

**Both replacement models**, `--wire-floor` on and off. This is load-bearing
here, not routine: `need`'s whole claim is that filling a starting slot beats
taking the best player available. Under zero-replacement an empty slot scores
0, which *flatters* need; under the measured wire floor it scores the waiver
level, which is the honest bar. **If need only wins under zero-replacement, it
has not won.**

## 4. THE PREDICTION, DECLARED BEFORE THE RUN

**I do not know the sign, and I am saying so rather than manufacturing a
hypothesis to confirm.** Two mechanisms point opposite ways:

- **For:** the composite is fill-blind mid-draft (§1). A roster that reaches
  round 12 with no QB and two TEs loses points no VORP ranking can see.
- **Against:** `applyRosterLegality` is already fill-aware in the ENDGAME, and
  the money proxy rewards points. Reaching for need over the best available
  costs value at every pick where the need is not yet binding.

**The specific, falsifiable shape this implies:** if `need` pays at all, the
gain should concentrate in the **MID draft** — after the early rounds where the
best-available and the needed player usually coincide, and before the endgame
where `applyRosterLegality` already covers it. **A uniform gain across all
phases would be evidence the mechanism is NOT the one claimed**, and will be
reported that way.

## 5. WHAT MAY NOT HAPPEN

- **No weight ships from this run.** A single measurement promotes nothing; that
  is what the graduation gate exists for.
- **The `risk` axis is not touched.** It is PARTIAL on backtest boards (6 of
  production's 11-13 distinct values) for reasons this study does not fix.
- **No re-running with a different grid after seeing the first result.** The
  four values in §3 are the grid. If the answer is "no evidence", that is the
  answer.
- **`need` interacts with the needrule CARD, which is NOT in this harness.**
  A positive result here does not license removing the card; it would mean the
  composite should stop needing it.

## 6. LIMITATIONS

1. One board, one seat, one keeper slate — the standing limit of every room study.
2. The opponent model is our own measured model; a term that exploits real-room
   behaviour can measure zero here by construction.
3. The money proxy is v1 and simulates weeks as normals.
4. `need.value` itself is computed from the board's own fields; this study grades
   the WEIGHT, and takes the term's construction as given.

**Refusal, "no evidence of a shift", and "the mechanism is not the claimed one"
are all valid outcomes and need no further permission.**

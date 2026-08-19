# PREREGISTRATION — re-grade every need form on the corrected inputs

**A, 2026-08-19, committed BEFORE the run.**

Cory: *"once we have solved this valuation problem we should retry all the
equations we had because I believe some where better than others and the values
were what was ruining it"*

## ⚠️ HIS INSTINCT IS RIGHT AND ONE DETAIL IS NOT — CHECKED BEFORE RUNNING

I expected to find the old arms priced on a broken value term. **They were not.**
`one_equation_plan.js:218` and `average_draft.js` both use
`Math.max(0, proj_mean − WAIVER[pos])` — **surplus over the wire, the correct
shape.** Zero Draft Sharks references in any of them.

**So the broken valuation was in the arms I built TODAY (P186 onward), when I
over-read "pure VONA" and dropped the wire.** What was ruining the EARLIER arms
was two different inputs, both since fixed:

1. **our `proj_mean`** instead of Draft Sharks projections
2. **the 1-slot need bug** — the curve measured which body filled the one slot
   (K2 = 0.828 in a one-kicker league), so QB/TE/K/DEF were all mispriced

**Cory is right that the arms deserve a re-run. The reason is different from the
one he gave, and saying so is the point of this section.**

## THE ARMS — every need FORM that has been graded, re-run on identical inputs

| arm | need form | its original result |
|---|---|---|
| **A. measured** | the counted curve, as committed | the baseline everything used |
| **B. p144** | `P(ever needed) × margin` | 5 of 6 cells, +4.0% value |
| **C. p146** | `E[weeks started] × margin` | fixed QB, broke TE/K/RB |
| **D. derived** | `P(Binom(n−1,1−q) < S_eff) × (1−stream)` | P191 TRUE, QB 1.75 |
| **E. cory** | his transcribed table | QB/TE/K/DEF exactly 1.00 |

**Held identical across all five:** Draft Sharks projections, `a = 0`, surplus
valuation, the corrected wire, the same 300 rooms and seed, the same keepers,
the reservation gate on.

## PREDICTIONS

**P197 — the re-grade changes at least one verdict.** At least one arm that was
FALSE on its original bars now passes them, or at least one that passed now
fails. **FALSE if all five land exactly where they did before** — in which case
the inputs never mattered and Cory's hypothesis is wrong.

**P198 — and the ranking is not what the original grades said.** The arm closest
to Cory's stated shape on the re-run is **NOT arm B (p144)**, which won the
original comparison at 5 of 6 cells. **FALSE if p144 wins again** — which would
mean the original comparison was sound despite the bad inputs, and that is worth
knowing.

## ⛔ THE GUARD, AND IT IS THE WHOLE RISK HERE

**This is a five-arm sweep and `no_fit_guard` forbids selecting a model from
one.** So, declared before the run:

- **No arm becomes "the model" because it won this comparison.** The output is a
  re-grade of published predictions, nothing more.
- **An arm may only be REOPENED if it now passes ITS OWN ORIGINAL BARS** — not
  because it looks best on a new measure I choose after seeing the results.
- **All five results are published, including the ones that flatter nothing.**
- **The arms are exactly the five above, fixed now.** No sixth arm may be added
  after seeing these, and no constant inside any arm may be moved.

**REPORT ONLY.**

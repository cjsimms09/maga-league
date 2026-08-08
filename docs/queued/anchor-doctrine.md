# THE ANCHOR DOCTRINE — consensus is the prior; deviation must be paid for

Filed 2026-08-08 (Cory). An architectural principle for how recommendations
relate to the market, not a tweak to a slider.

> **Consensus ADP is the PRIOR. Every deviation from it must be paid for with
> evidence, and deviation size scales with evidence strength.**

## 1. Restructure the composite as market-anchored

Today the composite scores players from our own terms and ADP enters as one
input among several. Inverted: **start from the consensus rank**, then apply our
terms as **evidence-weighted shifts**, each term's contribution scaled by its own
**measured** reliability:

| term | reliability comes from |
|---|---|
| projections | **experiment 33** — the projection source bake-off |
| market efficiency by round/position | **experiment 36** — the ADP-efficiency audit |
| tier model | its calibration |
| survival model | its Brier score |

A term with weak evidence moves the needle a little. A term with strong evidence
moves it a lot. Where the market is **measurably efficient**, deviations shrink
toward zero automatically; where it is **measurably wrong**, they widen. Nobody
hand-tunes the shrinkage — it is read off the audits.

## 2. Deviation budget, displayed

Every recommendation shows **how far it sits from consensus and what bought the
distance**: `Judkins — ADP 78, we say now (14 picks early): tier cliff +18,
ceiling +6, need +4`. The flip side is shown with it — *if you don't believe the
cliff, he's a reach.*

**This is the same feature as the ADP-DEVIATION EXPLAINER** from the mock-#1
three-fixes batch. One build serves both: one compact line by default, detail on
tap, nothing rendered when the deviation is inside noise, Zone-1 sparseness
preserved.

## 3. 🚧 THE HONEST BLOCKER — this cannot be installed yet

**The reliability weights ARE the mechanism.** Without measured reliability,
"evidence-weighted shift" degrades into "shift by a number I chose", which is a
fitted parameter wearing a principle's clothing — exactly what the project's
install discipline exists to refuse. Current state of the four inputs:

| input | status |
|---|---|
| survival Brier / calibration | ✅ **measured** — `replay.js` `calibration()`, and the auto-adjuster pre-registration already scores survival by calibration error |
| projection reliability (exp 33) | ❌ **registered, not run** |
| ADP efficiency by round/position (exp 36) | ❌ **now registered (below), not run** |
| tier-model calibration | ❌ **not measured, no instrument yet** |

So: **one of four exists.** The restructure installs when 33 and 36 have landed
and the tier model has a calibration instrument. Until then it is a spec.

**What IS buildable now, and should be built now:** §2, the deviation budget
display. It requires no reliability weights at all — it reports the deviation the
CURRENT composite already produces and decomposes it into the terms that caused
it. That is honest today, useful today, and it becomes the natural display
surface for §1 later. It also does something valuable ahead of the restructure:
**it makes the current model's deviations auditable**, which is how we find out
whether they were ever justified.

## 4. Build split

- **NOW:** §2 deviation budget display (merged with the mock-#1 ADP-deviation
  explainer). Threshold-gated so normal picks render nothing.
- **NOW:** experiment 36, registered below — it is a dependency and did not exist.
- **NOW:** a tier-model calibration instrument (the missing fourth input), specced
  as part of 36's harness since both are "is our structure right?" questions.
- **GATED on 33 + 36 + tier calibration:** the §1 composite restructure. It
  installs through the normal gates — null baseline, leave-one-season-out CV, and
  a money-graded win over the current composite. **A restructure this large does
  not get a pass because its principle is sound.**

## 5. Pre-registered risk, stated before the work

If 33 says our projections beat the market and 36 says ADP is inefficient where
we deviate, the Anchor Doctrine will **widen** deviations and look like a
vindication. If 33 says our projections lose to a naive baseline, the doctrine
will **collapse deviations toward ADP** and the tool becomes, largely, a
well-presented consensus board with a legality layer and a money function.

**Both outcomes are the doctrine working.** Write that down now, because the
second one will be tempting to explain away later.

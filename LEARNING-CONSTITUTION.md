# THE LEARNING CONSTITUTION — ⚠️ PROPOSED, NOT RATIFIED

**Status: PROPOSED 2026-08-24.** Cory agreed with this taxonomy in principle and
ordered an independent audit first: *"Agreed with your write up, but let's send
to open AI auditor first and act on their suggestions."* Ratification requires:
① the independent reviewer's suggestions acted on, ② Cory's final word. Until
both, nothing cites this file as authority.

This is the missing document the Learning Engine spec (PARKED.md item 10, filed
2026-08-08) depends on: its item ③ says *"the Annual stays the ONLY path from
proposal to installed change for Tier-2 items; Tier-1 auto-installs through the
gates; Tier-0 flows freely"* — and no file ever defined the tiers. This one does.

**The question this answers:** which changes can the system adopt by itself,
which only after passing preregistered tests, and which require Cory in January?

---

## TIER 0 — FLOWS FREELY (no gate, no approval)

Anything that changes what is **shown or recorded** but never a recommendation.

* Confidence chips/tiers moving as evidence accumulates (louder when right,
  quieter when wrong) — the display of certainty, never the advice itself.
* New captures, new descriptive statistics, new ledger kinds.
* Copy, explainers, provenance labels.

**The test for membership:** fully reversible, no money or start/sit decision
rides on it, and removing it changes no recommendation anywhere.

## TIER 1 — AUTO-INSTALLS THROUGH THE GATES (machine-adoptable, bounded)

The weekly blend's **champion arm and its weights — only among PREREGISTERED
arms**, via the machinery Cory already ruled on:

* Promotion: 3-of-4-week wins **and** clears the best-of-K null
  (`ADAPTATION-POLICY.md` / `decide_promotion()`).
* Demotion: QUICK-KILL benches a decaying champion automatically (register
  199's gap — the policy calls it automatic; the implementation must exist
  before Tier-1 is live, not after).
* Bounds: no arm outside the preregistered set, no weight outside its declared
  range, ever. An unregistered arm winning a week is a reason to preregister
  it, never to install it.

**Why this is safe:** nothing Cory acts on in 2026 consumes the weekly arm —
it is the "search wide, ship narrow" sandbox by design. **The moment any
decision surface consumes the weekly arm, that consumption is itself a Tier-2
change.**

## TIER 2 — THE ANNUAL ONLY, CORY'S SIGNATURE ONLY

Anything that changes **a number Cory acts on**:

* Engine draft weights (`MEASURED_WEIGHTS`), the roster-shape terms and their
  weights (P344), board construction, replacement anchors.
* Keeper policy.
* Any signal ENTERING production — a Tier-1 champion graduating into anything
  a tool recommends from.
* Any change to THIS document's tier boundaries (the constitution amends only
  through its own strictest tier).

**The path:** the January synthesis (P345, due 2027-01-15) presents what was
learned, what is proposed, what was retired — **and the honest count of
hypotheses that DIED, because a learning system that only ever adds is
memorizing, not learning** (the spec's own words). Cory signs or it does not
ship. One install window per year.

## PROVENANCE RIDES EVERYTHING (spec §2b, unchanged)

Machine-generated hypotheses are tagged as such; the Annual reports machine vs
human hit rates **separately, as rate WITH n** (a scanner at 2/60 and a human
at 2/3 share a numerator and mean opposite things), and both streams face
IDENTICAL gates — else the comparison measures gate leniency, not hypothesis
quality.

---

## RATIFICATION CHECKLIST

- [ ] Independent review dispatched at this document's diff (claim file:
      `draft/audit/claims/learning_constitution_claim.md`)
- [ ] Reviewer suggestions acted on, each with a visible disposition
- [ ] Cory's final word
- [ ] Status line above flips to RATIFIED; the Learning Engine's item ③
      becomes buildable and PARKED.md's flag closes

# THE ADAPTATION POLICY — how the in-season models tinker without fooling us
<!-- TERRITORY: relay (the policy); D owns its execution in the Tuesday grader.
     2026-08-20. Cory, verbatim: "Our in season prediction models should adapt
     quickly, keep tinkering with what works, if something doesn't work, try new
     things, never stop trying to improve." This file makes that a MECHANISM with
     thresholds committed before week 1, so speed never turns into result-chasing. -->

**The tension this resolves:** adapt-quickly and preregister-everything pull
against each other. The resolution is to preregister the ADAPTATION RULES
rather than freezing the arms — the rules below are committed before any
graded week exists, so no threshold can be invented after a result.

## The three rules, thresholds committed now

1. **QUICK-KILL:** any published arm that grades below the champion for
   **3 consecutive graded weeks** is BENCHED — it stops feeding any published
   number but keeps grading in shadow. Benching is automatic (the Tuesday
   grader prints the verdict); un-benching goes through rule 2 like any arm.
2. **QUICK-PROMOTE:** any shadow arm that beats the champion for
   **3 consecutive graded weeks** AND clears the best-of-K null in that
   window is PROMOTED to publish from the next Tuesday. One promotion per
   week maximum — two arms clearing at once means the better margin goes
   first and the other waits a week (churn is its own failure mode).
3. **NEVER-EMPTY:** every Tuesday, each of D/E (and C for capture health)
   files at least one of: a new blind P-row · a graded P-row · a line reading
   `NOTHING — <reason>`. The ledger's OPEN floor (≥6) already guards the
   program pipeline; this guards each LANE's pulse. The relay sweeps every
   Wednesday and files the miss as a ROUTES item, named.

## What the rules do NOT allow

No threshold moves after a result it would affect (the no_fit_guard clause).
No arm edits mid-week — an improved arm is a NEW shadow arm with its own
P-row, never an in-place patch to a published one (in-place patches are how
a graded history stops meaning anything). Weekly re-fits are fine INSIDE an
arm only where its prereg declared a walk-forward fit (the one stacker rule,
BLEND-SEARCH-DESIGN §Tier-2).

## Cadence, one line

Tuesday: grade everything → print bench/promote/hold per arm → file the
P-rows → change what the rules say to change → Wednesday: relay sweeps.

---

## THE THREE-PART FILING STANDARD — Cory's ruling, 2026-08-20, verbatim

> "Everytime we predict and grade something we need to make sure we are
> predicting the right things to learn, grading it the right way to actually
> capture skill not luck and using that info to either explore new ideas or if
> we found an edge, implement it.."

Every NEW ledger row filed from this date states, inside the claim cell:

1. **THE LEARNING TARGET** — the decision this grade changes. A row whose
   grade would change nothing is not filed (the ledger check already fails
   "a grade that moved nothing"; this moves the test to FILING time).
2. **THE SKILL DESIGN** — what separates skill from luck in the grading:
   a paired counterfactual, a persistence/naive null, a baseline arm, or a
   pre-declared chance rate. A raw outcome with no comparison is a weather
   report, not a grade. (House precedents: Cory's skill-not-luck replay
   ruling; best-of-K; the RANDOM-WEIGHT null; P144's persistence null.)
3. **THE CONSEQUENCE ROUTE, PRE-DECLARED** — TRUE routes to (implement:
   named surface/owner) and FALSE routes to (explore: named next question),
   or the reverse. "Interesting either way" without a route is how findings
   die in registers.

The relay's Wednesday ledger sweep checks new rows against all three and
bounces non-conforming rows back to their lane with the missing part named.
Exemplar filed the same day: **P282** (the bench-option weekly waiver
valuation), written to be copied.

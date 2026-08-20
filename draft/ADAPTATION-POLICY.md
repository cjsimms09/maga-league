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

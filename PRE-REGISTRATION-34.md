# PRE-REGISTRATION — what experiment 34's result will mean

_Written 2026-08-08 at HEAD `65417d6`, **before experiment 34 exists in code**,
let alone reports. That is the entire point: a consequence agreed after the fact
is not a consequence, it is a rationalisation._

> **⛔ THE NARROWING IS WITHDRAWN (2026-08-08).** D13's Option A proposed grading
> 34 against *the room's revealed preference* instead of the market, on the belief
> that historical ADP was unreachable. **That belief was false** — the reachability
> probe (run 31284357107) found FantasyFootballCalculator historical, half-PPR,
> usable for all three seasons (2023/24/25). The narrowing was adopted under a
> false constraint and is **void**. Experiment 34 answers the ORIGINAL question —
> *did our picks beat real contemporaneous ADP on realized dollars* — exactly as
> this document specifies below. `EVIDENCE_STATE` for 34 is graded against real
> ADP (`raced against market at n=36`), per the reporting obligation at the end.
> Leaving a withdrawn narrowing standing in a file is the stale-claim problem the
> tier-voice expiry exists to prevent, so it is struck here, not merely superseded
> elsewhere. _(A room-revealed-preference arm is still worth running as a SECOND,
> separately-reported arm — it answers "did we beat these nine humans", a
> different and arguably more actionable question — but it is an addition, never
> the substitute Option A made it.)_

## The finding this responds to

Measured tonight over 25 seeded drafts, 300 real decisions
(`draft/backtest/pre-tree-baseline.json`):

> **73.7% of picks deviate from consensus beyond the noise band.
> 8.8 per draft. Mean deviation 17.1 picks. 212 reaches to 9 falls.
> 100% of those deviations are LEAN tier — not one reached LIKELY.**

Cory's pre-registered prior was **~2 per draft**. Measured 8.8.

The two lead drivers are `need` (structural — roster arithmetic, not a belief)
and `value` — **our own projections, which have never been raced against the
market.** That race is experiment 33.

## THE BINDING CONSEQUENCE, registered before the result

**If 34 shows our picks lose to ADP on realized dollars:**

> **Stage 4's default aggression starts SMALL and earns its way up, per measured
> edge class — rather than starting loud and being tuned down.**

These are not the same thing and the difference is not cosmetic. Tuning down
from loud preserves the assumption that aggression is correct and treats every
reduction as a concession to be minimised. Starting small inverts the burden:
each edge class begins at or near market and **must produce measured evidence to
widen.** That is the anchor doctrine's own principle applied to the tree's
construction rather than only to its output.

**If 34's confidence interval spans zero** — which n≈36 makes entirely likely —
the honest read is:

> **"We cannot distinguish our picks from ADP at this sample."**

Registered explicitly, because that outcome is the one most vulnerable to being
narrated as encouraging. It is not a tie that lets the aggressive default stand.
**It argues for the small-Stage-4 default exactly as strongly as a loss would**,
for the plain reason that an unproven edge and a disproven edge both fail to
justify deviating 17 picks on 100%-LEAN evidence.

**If 34 shows our picks beat ADP:** Stage 4 still starts small, and widens per
class where 34 measured the gain. A win at n≈36 is not a licence for a 74% rate;
it is evidence that some edges are real, and the tree should say which.

## What is NOT pre-registered here

The size of "small". That is a calibration and it belongs to 36's reliability
surface, not to a number chosen tonight. Choosing it now would be the same sin
in the opposite direction.

## The power limitation, filed as it stands

34 grades ~36 decisions — three historical drafts, ~12 of Cory's picks each. It
is **underpowered by construction** and that was registered when 34 was, not
after seeing the answer. Every reading above already assumes wide intervals; none
of them is contingent on the sample being better than it is.

## Why this document exists at all

Because the temptation after a null or negative result is to find the reason it
does not apply — the sample, the era, the roster, the opponent model. Some of
those objections may even be correct. But they have to be raised **against a
consequence already on the record**, not used to select which consequence gets
adopted once the number is known.

---

## THE REPORTING OBLIGATION — mechanical, not remembered

When 34 reports, the confidence sentence shown on **every** deviation must be
rewritten to reflect what was measured. This is not a documentation step; it is
a one-line call:

```js
DraftDeviation.recordEvidence(34, 'inconclusive',
  'raced against market at n=36, inconclusive');
// or 'lost'  -> 'lost to market by $X/season at n=36'
// or 'won'   -> 'beat market by $X/season at n=36'
```

`EVIDENCE_STATE` is the sentence's source of truth. `tierVoice()` derives from
it, `tierLine()` renders it, and the badge reads it live rather than snapshotting
the wording — all asserted in `deviation.test.js`, including that the badge
follows a mid-session change.

**Why this is a rule and not a nicety:** *"LEAN — unvalidated vs market"* is
honest today and becomes a **lie** the moment 34 reports, in either direction,
because the market race will have happened. A confidence sentence that outlives
the experiment which should have updated it is worse than the bare word — the
bare word at least does not assert a fact about evidence that no longer holds.

The same rule binds 33 to the same table. Any experiment that changes what we
know about a term's evidence must update `EVIDENCE_STATE` in the same commit
that records its result.

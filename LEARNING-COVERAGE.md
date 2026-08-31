# WHAT THE MODEL LEARNS FROM, AND WHAT IT STILL CANNOT SEE

**A, 2026-08-24.** Cory: *"I want to make sure our model is set up to actually
learn all the things it can to make me better at fantasy football next year."*

Not a draft question. This is the coverage map: **every decision he makes in a
season**, whether we capture it, whether we GRADE it against a constructed null
(`GRADING-POLICY.md`), and what the gap is worth. Every number below is measured
off `league_history.json` and the shipped graders, not asserted.

---

## THE MAP

| decision | captured | graded vs a null | n | result |
|---|---|---|---|---|
| **Draft pick** | ✅ | ✅ `draft_pick_vs_random.py` | 345 | 0.8554 vs null [0.470, 0.531] — **⚠️ flat at ~0.85 from round 1 to round 15; a floor test, not a resolution instrument (§2)** |
| **Start / sit** | ✅ | ✅ `start_sit_vs_random.py` | 530 owner-weeks | 0.8497 vs [0.475, 0.525] |
| **Waiver / FA add** | ✅ | ✅ `waiver_vs_random.py` | 756 claims | 0.7116 vs [0.479, 0.521] |
| **The DROP** | ✅ | ✅ **NEW 08-24** `drop_vs_random.py` | **676** | **0.8001 vs [0.478, 0.522]** |
| **Keeper choice** | ✅ | ✅ **NEW 08-24** `keeper_vs_random.py` | **73** (not 43 — see §2) | vs a random name **0.9082** vs [0.434, 0.566] — **passes and is near-vacuous**; vs a REAL PICK at that round **+0.025, z=1.16, NOT RESOLVED** |
| **Trade** | ✅ | ❌ — and correctly so | **6 in 3 seasons** | no power, ever |
| **Projection quality** | ✅ | ◐ separate programme | — | `PROJECTION-PROGRAM-2027.md`, first grade 09-15 |

---

## 1 · THE DROP WAS HALF OF EVERY WAIVER TRANSACTION AND WAS GRADED NOWHERE

`waiver_vs_random.py` grades the ADD. **1,026 of those same transactions carry
a cut, and not one was ever scored.** We were grading half of a decision and
calling the loop closed.

It is not a small half. Three days ago the live wire told Cory to **drop
Ja'Marr Chase** — register 277, keepers priced at `proj_mean: null` so the best
player he owned was always the cheapest man on his roster. **A tool that
advises on a decision nobody grades is exactly the shape that defect lived in**,
and it survived to production because no instrument was watching that output.

Built today. 676 drops graded, both controls passing:

```
known-negative  random own player            0.497   (band ±0.0218, derived from n=676)
known-positive  cut the least-scoring man    0.955
MEAN PERCENTILE 0.8001    null 95% [0.4782, 0.5218]    verdict: SKILL
league mean points handed away per drop: 25.86
```

**⚠️ The direction is inverted relative to every other grader**, and that is
the one thing that could silently invert the conclusion: for an add, more
rest-of-season value is better; for a drop, *less* is. The known-positive
control — an agent that cuts the man who went on to score least must land near
1.0 — is what pins the sign. It reads 0.955.

### The bias I nearly shipped, and how it announced itself

The first run graded **315 of 752** and I almost published it. The skip was not
random: **the weekly roster snapshot is taken AFTER transactions settle**, so a
player cut in week W is already gone from week W's roster, and my check for
"was he on this roster" threw away every drop where the snapshot had caught up.

It showed up exactly the way `GRADING-POLICY.md` rule 4 says it does — **a
ragged n column**, Cory on 25 against another owner's 52. Reading the roster as
it stood *before* the cut (week W−1, falling back to W for a week-1 drop)
recovers **676**, and the n column flattens to 34–96.

Verified deterministic across `PYTHONHASHSEED` 1 and 99999 and a default run —
identical to the decimal (rule 3: fix the seed *and* the iteration order).

---

## 2 · ~~THE KEEPER DECISION IS GRADED NOWHERE~~ — BUILT 08-24, AND IT FOUND SOMETHING WORSE THAN A GAP

**✅ BUILT the same day this section was written: `draft/backtest/keeper_vs_random.py`,
wired into `weekly-grade.yml`, four controls gating.** Three things in the text
below were wrong or incomplete and are corrected in place rather than deleted,
because two of them are the interesting part:

**① The count was 43 and it is 73. "2023 had no keepers" was false.** I read
`drafts[0]` and stopped. **2023 has TWO draft objects** — a 150-pick main draft
(0 keepers) and a **separate 30-pick keeper draft (30 keepers)**. 30+23+20 = 73.
The first draft object in a season is not the only one. This is Rule 3i in its
plainest form: an absence asserted without iterating the collection.

**② The null I proposed here — "a random legal keeper set from the roster he
actually held" — is not the one that shipped, and the shipped one is better.**
The decision is not *which of my men do I keep*; it is *is this man worth the
pick he costs*. So the null is **the players available at the slot the keeper
consumed** — the same pool `draft_pick_vs_random.py` builds — which puts keeping
and drafting on one yardstick.

**③ And that null, on its own, is nearly vacuous — which indicts the SHIPPED
PICK GRADER too, not just this one.** The keepers score **0.9082** against
[0.4338, 0.5662] and it reads as a large result. It is not. **Real draft picks
score 0.8554 on the same null, and they are FLAT at ~0.85 from round 1 to round
15.** The pool is 570 players of whom **38% scored under 20 points all season**,
so "beat a random name in the points store" is a floor test essentially every
drafted player passes. Rounds 1-3 vs 13-15 resolves at z=2.15 and nothing finer
does; the by-owner spread [0.808, 0.890] is a **selected maximum over 45 pairs**
and is not a finding.

**So the grader ships a SECOND panel, and it is the one to read: the keeper
against what a REAL PICK at that round actually returned.** +0.025 percentile,
z=1.16, **NOT RESOLVED**. In the unit that pays: **+22.8 season points, ≈1.3 a
week** — a point estimate with nothing behind it. **We cannot show that keeping
beats drafting at the slot it costs.** Not "keepers are worthless"; we cannot
tell, at n=73, and saying which of those two it is matters.

**Rule 3f, applied to the contrast itself:** a comparison with no power and a
comparison that correctly finds nothing print the same words. So panel 2 has its
own two controls — split-halves of the R1-3 picks must NOT resolve (z=1.08 ✓),
keepers vs R13-15 picks MUST resolve (z=3.11 ✓) — and the exit gate was broken
deliberately in both directions and confirmed to fire and name the right control.

**⚠️ THE FOLLOW-UP THIS OWES (Rule 3g).** *Does it imply another failure?* Yes —
`draft_pick_vs_random.py`'s docstring promises **"TWO NULLS, REPORTED
SEPARATELY"** including a SAME-POSITION null, and **the code computes only one**;
`SAME-POS` appears at lines 32-34 and nowhere else, and the artifact has a single
`mean_percentile`. The missing null is precisely the one that would add
resolution. *Does it invalidate something we trust?* It weakens the pick
grader's standing as "the replacement yardstick" for the retired
engine-minus-owner headline — a yardstick that cannot separate round 1 from
round 6 cannot separate a good drafter from a bad one. *Routed?* A (mine).
**Filed as its own register row; not folded into 289 silently.**

---

### The original text of this section, kept for the record

`draft_pick_vs_random.py:27` states it plainly: **"KEEPER PICKS ARE EXCLUDED.
A keeper is not a choice made at that pick."** That is correct for grading the
*pick* — nobody chose at pick 8 — but it means the **keeper choice itself falls
through every net we have.** `keeper_optimize.py` *chooses* keepers; nothing
scores the choice.

It is not a marginal decision. Cory's three keepers are his three best players
and they cost rounds 1, 2 and 3:

| | pos | proj | VORP | cost |
|---|---|---|---|---|
| Ja'Marr Chase | WR | 271.8 | 128.9 | round 2 |
| Derrick Henry | RB | 259.15 | 111.35 | round 1 |
| Kenneth Walker | RB | 233.82 | 86.02 | round 3 |

~~**Available to grade: 43 decisions** (2024: 23, 2025: 20; 2023 had no
keepers), plus 2026's 23 once the season is played. Thin but real, and the null
is constructible in the obvious way — a random legal keeper set from the roster
he actually held at that cost.~~ **← BOTH THE COUNT AND THE NULL ARE WRONG; see
① and ② above. The real n is 73 and the shipped null is the board at the slot
the keeper consumed.** **Filed as register 289 with the design; not built
today because I would rather it get the same control discipline the drop
grader got than be rushed in behind it.** — *and it did get it: built the same
day, four controls, gate proven to fire.*

---

## 3 · TRADES: THE ANSWER IS "NEVER", AND THAT IS A MEASUREMENT

| season | trades |
|---|---|
| 2023 | 4 |
| 2024 | 2 |
| 2025 | **0** |

**Six trades in three seasons.** There is no null that makes n=6 informative,
and no amount of building changes that. This is the one gap that should stay
open forever, and it is recorded here so nobody spends a week on it and
discovers the same thing.

If the league's behaviour changes — a season with 15+ trades — this becomes
worth revisiting. Not before.

---

## 4 · WHAT COVERAGE DOES **NOT** MEAN

Stated because the table above is easy to over-read:

* **Beating a random null says a decision TYPE carries skill. It does not say
  the beliefs behind it were good.** Start/sit skill is not projection accuracy.
* **It does not rank owners.** Adjacent rows in every table here sit inside one
  standard error. The ordering is not evidence; the top-to-bottom gap is.
* **The 2026 season is not graded and cannot be.** `draft_pick_vs_random.json`
  lists 2026 under `seasons_without_points_store` — the draft produced
  decisions, the season produces outcomes, and it has not been played.
* **Getty's Tests 1 and 2 remain unimplemented.** Test 3 is the one our data
  supports; that was the whole argument for the switch.

---

## 5 · THE HONEST ANSWER TO CORY'S QUESTION

**Four of the six decisions he makes are now graded against a constructed null,
up from three this morning.** One of the two gaps (trades) is permanent and
measured. The other (keepers) is real, is the biggest single decision on the
list, and is registered with a design.

The mechanism runs weekly in `weekly-grade.yml`, every grader gates its exit
code on its own controls, and `prediction_ledger_check.js` fails the build on a
grade that changes nothing. **What is missing is no longer "we don't know what
we're not learning from" — it is one named, sized, designed gap.**

---

## RULE 3g — THE THREE FOLLOW-UP QUESTIONS

**Does this imply another failure we have not looked for?** Yes, and it is the
general form: **the drop was ungraded because it is an OUTPUT the tool produces
that nobody listed as a decision.** The right sweep is not "what other decisions
exist" but **"what does the war room / wire / board TELL Cory to do, and is
each of those outputs scored?"** Register 277 was a recommendation nobody
graded; there may be others. Filed as register 290.

**Does it invalidate something we already trust?** No result changes, but one
framing does: *"the loop is closed"* was true of three decision types and was
being said of the whole system. `GRADING-POLICY.md`'s MECHANISM list is now the
authority on what is actually wired, and this file is the authority on what is
not.

**Is it routed to the lane that can actually act?** The drop grader is mine (A)
and is built and wired. ~~Keepers (289)~~ **the keeper grader is built and wired
too (08-24), and it opened a new row of its own: the pick grader's missing
same-position null.** The recommendation sweep (290) is
mine. The projection programme is the relay's and already has its own dates.

# SESSION D — the data-stewardship lane (read this first, every time)

> **📣 READ IN THIS ORDER:** `OPERATING-MODEL.md` (how the four of us work) →
> `DRAFT-WEEK-BRIEF.md` (what is true now) → this file → `DATA-LIFECYCLE.md`
> (your subject) → `ROUTES.md` → `## TO: D` (your inbox).
>
> **The lane was created 2026-08-17** because an audit found that of ten data
> stores, two complete their lifecycle and **four stop with no recorded reason.**
>
> **That count is now ONE** (`component_stats_*`), and the reason is the finding
> the first session ended on: **five of the six rows handed to this lane had a
> premise that was wrong.** Not one was a measurement error. They were sentences
> — in the register, in `DATA-LIFECYCLE.md`, in artifact `_note` fields — that
> had never been reconciled with the code or the filesystem. **Read §"WHAT THE
> FIRST SESSION FOUND" before picking anything up.**

_Resume ritual: **"You are session D, read SESSION-D.md and STATUS.md, then continue."**
Files are truth, not memory. A rule changes HERE, in the commit that changes the
behaviour — never only in chat._

---

## WHAT YOU OWN — stewardship, NOT acquisition

**C fetches data. A decides what a number means. You own everything in between:
is it correct, is it being used, is it being graded, does the grade change
anything.**

Your subject is the eight-question chain in `DATA-LIFECYCLE.md`:

> why don't we have it → can we get it → should we capture it consistently → are
> we predicting with it → **should we be** → are we grading those predictions →
> **should we be** → does the grade move the weights

**Every store must have a recorded answer at every step.** Including "no" — a NO
with a measurement behind it is a finished answer, and two stores are correctly
closed that way already (pace on a published null, Vegas on a measured +0.23
weekly-MAE ceiling). **The problem is never a NO. It is a NO nobody wrote down.**

## WHAT THE FIRST SESSION FOUND — 2026-08-17, all six rows walked

**The four things this file used to list as waiting are done.** What replaced
them matters more than the results themselves.

| row | what it said | what was true |
|---|---|---|
| **18** Vegas +0.23 | a perfect-foresight ceiling on Vegas information | a **game**-total oracle handed to BOTH teams — 208/208 games — so it bounds nothing team-level. Rule 3d: Q1 passes, **Q2 has no answer** (no join counter exists), Q3's control bar was `> 0` |
| **13/13b** snap_counts | "feeds `projections.py`, nothing grades it" | it feeds **nothing** — 0 board fields of 56 keys. Stops at step 4, not 6. There was no contribution to grade |
| **16** two Vegas copies | "nobody has checked they agree" | only **one** was ever committed, so nobody could. Reconciler built and proven; the fetch is C's |
| **15a** advanced_stats | "wiring never decided" | **it was decided** — preregistered, graded, published null. Rule 3d passes *better* than row 18. Not reopened |
| **15b** historical_props | filed with 15a as undecided | **three seasons of PAID data, never graded**, behind a stale refusal naming three files that exist |
| **14** routes | prereg a feature and measure it | **done, and the only premise that survived.** Season TPRR is +0.74…+0.82 collinear with target volume — it duplicates rather than complements. A real null |

**The lesson, and it is this lane's whole method:** the defects were not in the
numbers. They were in **claims nobody had checked against the thing they
described** — and one false claim (that `nflverse_weekly_points_2022.json` does
not exist) appeared in **three separate files**, cost the pace study a graded
fold, and had C assigned to build a store that was already committed.

**So: before working a row, verify its premise.** Every audit in
`draft/audit/*_2026-08-17.md` written by this lane opens with what was expected
before looking, because four of six expectations were wrong.

## WHAT IS OPEN NOW

- **Row 19 — `component_stats_*`, owner A.** The last store with no recorded
  reason, and the only one where that is genuinely true: it *does* predict
  (own_v6) and *is* graded, but only through weekly points, so its contribution
  is never isolated. Needs a preregistered **ablation of the live model**. Filed,
  not started — it is A's territory and would read 2025 a fifth time.
- **Row 15b — the props re-run, owner A.** One command. Paid data, ungraded.
- **Row 18 Q2 — still unanswered.** The Vegas oracle's join survival cannot be
  recovered from committed artifacts; it needs the replacement arm run *with a
  counter*.
- **Row 16 — waiting on C** for the second Vegas copy. The check is written and
  skips until it lands.
- **Row 13 — post-08-22.** Prereg a snap-share feature.
- **Row 17 — closed.** Every null now carries a trigger.

**Nothing this lane found changes a number Cory drafts from** — every store
involved is unwired, which was checked rather than assumed.

## THE STANDARD THAT CAUGHT THE MOST

**Record the surviving population, not just the statistic.** Row 18 is
unanswerable because `exp_weekly_env.py` counted no joins; `fetch_snap_counts.py`
and `advanced_efficiency_study.py` both record theirs unprompted, and the routes
study was written to. **If a study you touch does not count its join, that is the
first thing to fix.**

## THE RULE YOU WILL BE MOST TEMPTED TO BREAK

**You do not stop a capture job. Nobody in any lane does — only Cory.**

Your lane's whole job is finding stores that reach nothing, and the obvious
tidy-minded conclusion is to turn them off. **That conclusion is wrong and it is
the one mistake here that cannot be undone.** A weekly fetch costs a
runner-minute and is reversible forever. A season we did not capture is gone, and
so is every future study that needed it.

**A null grades the WIRING, never the STORE.** Nearly every null we hold was
measured on one season at low n with one method — "no signal at n=1" is not "no
signal." So every null you write ships with a re-test trigger: a season count, an
event, a method, or a date. **A null with no trigger is abandoned, not answered**,
and finding those is item 4 above.

If you believe a job genuinely should stop, that is an ASK to Cory stating the
cost of keeping it and what is permanently lost by stopping. Not a lane call.

## HOW YOU COMMUNICATE

**Your inbox is `ROUTES.md` → `## TO: D`.** Post to another lane under their
heading. Tick an item `- [x]` when it is genuinely done — an inbox where done and
open look identical has to be read end to end, which is how the same work gets
done twice.

**Every request to A is four lines, and the fourth is what keeps you moving:**

```
ASK:      the single decision, in one sentence
EVIDENCE: what was measured, and what it does not cover
REC:      what you would do
DEFAULT:  what you will do if A says nothing by <time>
```

**Silence from A is consent to your DEFAULT.** You never idle waiting. If
proceeding would genuinely be unsafe, write `NO DEFAULT — BLOCKED` and A treats
it as top of queue. A may reply `SEND BACK: <reason>` and that is a complete
answer — re-prepping is your job, not A's.

## WHERE YOU MUST NOT REACH

**You do not fetch** — that is C's lane (`fetch_*.py`, the ingest workflows).
**You do not decide what a number means, and you do not merge** — that is A's.
**You do not touch the engine, the Lab, valuation, views or config.**

Need a change in someone else's files? **Park a precise request** — file,
function, shape needed, and the test it should satisfy. `TERRITORY.md` is the
authority on ownership and `scripts/territory-check.sh` refuses a trespass by
name.

> ⚠️ **`territory-check.sh` has no `d_owns()` yet** — it knows A, B and C. Until A
> adds one, your lane is enforced by judgement rather than by the script. **Say
> so in any commit that touches a file whose owner is ambiguous**, and do not
> treat the script's silence as permission.

## THE STANDARD THAT MATTERS MOST IN THIS LANE

**Absent is absent.** You are the lane that decides what a missing row means, and
every defect this project has found in your subject came from answering that
implicitly:

- a field written as `0` when the truth is "no data" reads as a measurement;
- a join that silently drops unmatched rows reports a clean number over a
  shrunken population;
- a refusal threshold set far below anything ever observed is decoration.

All three were found here on 2026-08-17
(`coverage_guard_sweep_2026-08-17.md`, `routes_position_source_2026-08-17.md`).

**And the rule that would have caught all of them: every check you write ships
with a known-positive control that proves it can fail.** If you cannot make a
check fail on purpose, it is not evidence. That is the standard the whole project
now runs on, and it exists because a weight sat at zero for weeks on a
measurement that could not have come out any other way.

## AND THE SAME STANDARD APPLIES TO PROSE — added 2026-08-18

**A sentence that summarises an artifact is a claim, and it is checkable.**

`CLAUDE.md`, `OWNERS.md` and two `ROUTES.md` entries carried the project's
headline edge number — *"loses to the league's best drafter (−163)"* — for two
days. The artifact they cite ranks that owner **4th of ten**, thirty lines from
the delta being quoted, and its own `honesty` list forbids the read in advance.

**Nobody had to measure anything to find it. The two numbers were in one file.**

This lane already made a lifecycle step number testable
(`test_data_lifecycle_predicts_column.py`) and a register owner testable
(`test_defect_register.py`). The third is now
`test_best_drafter_claim.py`: **no prose file may crown a drafter the artifact
does not crown, or attribute a seat delta to an owner it does not belong to.**

**The reason to keep doing this:** the numbers in `CLAUDE.md` are trusted without
re-derivation, by every session, on boot. A wrong one there is the cheapest
possible error to make and the most expensive to hold.

`draft/audit/replay_best_drafter_claim_2026-08-18.md`. Register DS1.

# OPERATING MODEL — who does what, and how A stays fast

**Cory, 2026-08-17:** *"A's role is the final gatekeeper and decider… everyone
else needs to be doing work for A because A has the hardest job. A needs to be
able to work quickly, make decisions and if needed send work back."*

This file is short on purpose. If it grows past one screen it has failed.

---

## THE FOUR ROLES

| | role | does | does NOT |
|---|---|---|---|
| **A** | **gatekeeper & decider** | reviews, rules, merges to `main`, deploys | grunt work, chasing, re-deriving context |
| **B** | site & in-season lane | builds surfaces, in-season tools | touch model/draft or ingest files |
| **C** | external ingest lane | fetches, crosswalks, stores | touch engine, Lab, valuation, views |
| **D** | data stewardship | is it correct, used, graded, does the grade move anything | fetch (C's) or decide what a number means (A's) |
| **E** | **red team** | reads the published board, flags what makes no football sense | change any number, chase, assign, or overrule a measurement |
| **PM** (relay) | integration & verification | CI health, cross-cutting sweeps, keeping the record honest, prepping A's decisions | decide anything A should decide |

**A's time is the scarcest thing in the project.** Everything below exists to
spend less of it.

## THE GOALS EVERY LANE SHARES — Cory's, not any session's

Every lane signs up to all four. A lane that hits its own targets while one of
these slips has not done its job.

1. **Cory drafts and starts from numbers that are right.** Every other goal
   serves this one.
2. **Every number is measured, and the measurement could have come out the other
   way.** A check that cannot fail is not evidence.
3. **Data we hold is used, graded, and fed back** — or has a written reason,
   with a measurement behind it, for why it is not *yet*.
4. **We keep capturing through a null.** History cannot be backfilled, so a
   store that predicts nothing today still gets captured for the season that
   makes the test answerable. Nulls are dated, not permanent.
5. **Nothing is left behind.** A concern with no owner is itself a defect.

## RULE 1 — ONLY A MERGES TO `main`

Everyone else works on a feature branch and hands A a branch that is **ready**.
`TERRITORY.md` already said this; on 2026-08-17 the practice drifted, three
writers pushed to `main` inside one hour, and two of the three collided —
a `ROUTES.md` conflict and a verification that went stale mid-run.

**Ready means:** full suite green on the branch, merged with current `main`
first, one concern, and a commit message that explains it.

## RULE 2 — EVERY REQUEST TO A IS ONE DECISION, WITH A DEFAULT

A must be able to answer in one word. So a request to A carries all four:

```
ASK:      the single decision, in one sentence
EVIDENCE: what was measured, and what it does not cover
REC:      what I would do
DEFAULT:  what I will do if you say nothing by <time>
```

**The DEFAULT line is what stops anyone idling.** Silence is not a block — it is
consent to the stated default. If a default is genuinely unsafe, say so in the
ASK and mark it `NO DEFAULT — BLOCKED`, which A treats as top of queue.

## RULE 3 — A CAN SEND WORK BACK IN ONE LINE

`SEND BACK: <reason>` is a complete reply. The sender re-preps and re-asks. A
never has to explain how to fix it — that is the sender's job.

## RULE 3b — A DOES NOT LOWER THE BAR, AND DOES NOT DO THE WORK EITHER

**Cory, 2026-08-17:** *"A is also not to lower its standards! but need to put
more work back on other sessions if they are able to do it."*

These are one rule, not two. The pressure that lowers a standard is almost always
time — A accepts something thin because fixing it himself costs an hour A does
not have. **So the answer to "this isn't good enough" is never "I'll fix it" and
never "fine, ship it". It is `SEND BACK`.**

A's default on anything another lane *could* do:

| the work is… | A does |
|---|---|
| in B's or C's lane | `SEND BACK` — with the standard it missed, not the fix |
| cross-cutting, verification, sweeps, CI, evidence-gathering | hand to the relay |
| a judgement about what a number MEANS, or a merge | **A, and only A** |

**If A is typing code that isn't a decision, something has been mis-routed.**
Say so — that is a routing bug and the relay owns it.

## RULE 3c — NO LANE STOPS A CAPTURE JOB. ONLY CORY DOES.

**Cory, 2026-08-17:** *"Im getting frustrated of everyone just throwing things
away!!! we need to keep digging and searching. we dont just throw out vegas odds
or weekly routes because we havent seen a pattern yet, that is stupid."*

Deleting a store, disabling a scheduled fetch, or narrowing a season range is
**not a lane decision — not B's, not C's, not D's, not A's, not the relay's.**
It goes to Cory with the cost and the loss stated.

**Because the two errors are not symmetric.** Keeping a useless weekly fetch
costs a runner-minute a week and is reversible any time. Stopping one costs a
season of history that **can never be re-fetched**, and it takes with it every
future study that needed that season to be answerable. So the default is always
KEEP, and "we haven't found a pattern yet" is the weakest possible argument for
stopping — it is a statement about our current method and sample, not about the
data.

**A null grades the WIRING. It never grades the STORE.** Every null ships with a
re-test trigger (`DATA-LIFECYCLE.md`); a null with no trigger is an abandoned
question, not a closed one.

## RULE 3d — AN IMPLAUSIBLE RESULT IS A BUG REPORT UNTIL PROVEN OTHERWISE

**Cory, 2026-08-17:** *"common logic shouldve told us that everyone having the
same ceiling makes no sense… Do we really think it makes sense vegas odds didnt
move a single thing? not an ounce? does that seem like an error… instead of a
legit finding."*

**Both of our worst defects were implausible results accepted as findings.** The
ceiling one is proven: every player sharing a dispersion figure was a
`proj_mean × constant` degeneracy, not football. Nobody asked whether it made
sense, for weeks.

**A null and "the signal never reached the model" produce the IDENTICAL output.**
That is the trap. One is a finding; the other is a wiring bug. So before any
surprising result is recorded as a finding, its author answers three questions
**with numbers**, in the write-up:

1. **Did the input actually vary?** Distinct-value count and spread. A feature
   with one effective value cannot move anything — that is the ceiling defect,
   and `test_constant_multiple_sweep` already detects its shape.
2. **Did it actually arrive?** The file and line consuming it, and the row count
   that survived the join. A silent inner join is the most common way a real
   signal becomes a clean null.
3. **Could the test have fired at all?** The known-positive control.

**If the result is surprising and any of the three is missing, it is filed as a
suspected defect, not as a finding.** Say what you expected before you look —
ideally in the prereg — so "surprising" is a fact and not a memory.

**The tell is size, not just direction.** An oracle that buys almost nothing is
more suspicious than a modest honest effect: perfect foresight of something that
obviously matters should be worth a lot, so a near-zero oracle result usually
means the oracle never got through. Register row 18 is exactly this, reopened.

## RULE 3e — WHERE E SITS: BESIDE THE PIPELINE, NEVER INSIDE IT

**E does not gate anything and nothing waits on E.** A is the bottleneck; a
review step in front of the gatekeeper slows the whole project down. So E runs
**in parallel, on published output**, and its findings enter the same queue as
everyone else's.

```
  A merges ──▶ board publishes ──▶ Cory drafts
                     │
                     └──▶ E sweeps the PUBLISHED board (never blocks the publish)
                              │
                              ├──▶ mechanical//data cause ──▶ ROUTES.md → owning lane
                              ├──▶ needs a ruling          ──▶ ROUTES.md → A  (ASK/EVIDENCE/REC/DEFAULT)
                              └──▶ every finding, always   ──▶ ROUTES.md → relay (chases + registers)
```

**E posts directly to the owning lane — it does NOT route through the relay
first.** A hop through me is a day of latency five days before a draft. The post
IS the routing; I read `ROUTES.md` every session, chase what stalls, and put it
in the register. **E finds and files. The relay chases and holds to account. A
rules. E never does the last two.**

**On SURFACES, E reviews truth and findability — never taste.** Does a number
match the artifact, does its label say what it actually is, and can it be found
in the seconds a pick allows. **Layout, density and style are Cory's call and
Cory's alone** — the war room failed on 08-17 because it was designed from
someone's taste rather than his reference screenshots, and a second taste-haver
is that failure with more voices. E converts "too busy" into timed findability
drills, which give B a target instead of an argument.

**What triggers a sweep:** a new board publish · any weight or formula change
reaching `main` · a full pass before draft day. Not a schedule — an event.

**The one thing E may escalate straight past everyone:** a number Cory could act
on in the next 24 hours that looks wrong. That goes to A marked
`NO DEFAULT — BLOCKED` and to the relay in the same breath. Speed beats protocol
when the board is live.

## RULE 2b — A RULING REQUEST TO CORY CARRIES FIVE LINES, NOT FOUR

**Cory, 2026-08-17:** *"when asking for a ruling on me you need to explain what I
am deciding, what that means, how it affects model, and recommendation."*

`ASK/EVIDENCE/REC/DEFAULT` is the format for **A**, who has the context. **Cory
does not, and should not have to reconstruct it.** So anything routed to Cory
uses this instead:

```
DECIDING:   the choice, in one line — the actual options, not the topic
MEANS:      what it is in plain English, no jargon, no field names
EFFECT:     what changes on the board, WITH NUMBERS — and say plainly
            which parts are measured and which are not
REC:        what I would do, and why
IF SILENT:  what happens if you say nothing
```

**`EFFECT` is the line that gets faked, so it is the one to hold hardest.** If
the blast radius has not been measured, the honest text is "unmeasured — here is
who is measuring it and when," never a plausible-sounding estimate. A proxy is
allowed only when it is labelled a proxy **and its confounds are named in the
same breath** — a directional number presented as a finding is the defect this
project keeps paying for.

**And Cory sends work to the relay, not to a lane.** He should not have to know
who owns what; routing is the relay's job and a single entry point is what stops
an ask going missing. **The one exception: when a lane has asked Cory directly
for something, he answers that lane directly** — the relay picks it up from
`ROUTES.md`. Waiting on a middleman to deliver a screenshot is a day lost.

## RULE 5b — WHICH MODEL EACH LANE RUNS ON

Keep the strongest model where **judgment is scarce and volume is low**; drop to
Sonnet where the work is **well-specified and high-volume**. That moves most of
the usage with the least quality lost.

| lane | model | why |
|---|---|---|
| **A** | **Opus** | last line before `main`, and rules on what numbers MEAN. Every defect this project has eaten was subtle-judgment failure. Do not economize here. |
| **E** | **Opus** | pure judgment, tiny volume — the best quality-per-token in the setup |
| **D** | **Opus**, revisit in ~3 weeks | telling a real null from a wiring bug is the reasoning that produced our worst defects |
| **B** | **Sonnet** | highest-volume lane, and now spec-bound — it builds against Cory's screenshots, not its own invention |
| **C** | **Sonnet** (Haiku for routine re-fetches) | fetchers, parsers, crosswalks: mechanical and well-tested |
| **relay** | **Opus**, and the next honest cut after B and C | chasing needs skepticism, but the volume is high |

**Never Haiku for D or E.** Both lanes exist to catch subtle wrongness; a model
that misses it makes them *worse* than absent, because they report
"checked, looks fine."

## RULE 5c — TWO NUMBERS THE RELAY WATCHES, BECAUSE BOTH GREW SILENTLY

**Boot cost.** Measured 2026-08-17: `ROUTES.md` **48,350 words**, `STATUS.md`
**27,834**, `SESSION-A.md` **14,968**, `TODO.md` **9,500**. A's boot is ~48k words
*before* its inbox — roughly **130k tokens to say hello**, paid by every lane at
every session start. Docs are how this project stays honest, so the fix is
archiving closed material, never writing less down.

**A's queue.** Also measured today: **A 80 open items, B 52, C 13, D 5, E 5 — and
13 items closed in the project's entire history.** A is supposed to answer in one
word. Eighty items is not a queue, it is a wall, and by Rule 3b **a mis-routed
item is the relay's defect, not A's.** The relay triages A's inbox down to
decisions only, and anything that is really work goes to the lane that can do it.

## RULE 3f — A REFUSAL IS NOT AN ENDING, AND "WHAT NEXT" IS EVERYONE'S JOB

**Cory, 2026-08-17:** *"WE NEED BE ASKING WHAT SHOULD WE STUDY NEXT, WE ALSO NEED
TO STOP TREATING REFUSAL AS ENDING. FIX BOTH THESE PROBLEMS FOR GOOD!"*

Both are dated failures, not hypotheticals.

**a) EVERY REFUSAL SHIPS THREE THINGS:**

```
REFUSED — unblocked by <condition>, owner <lane>, recheck <date>
```

**A refusal without all three is an open defect, not an answer.** This project
refuses beautifully — `no_control`, `failed-gate`, `leaked_markers`,
`INSUFFICIENT-N` — and every one of those was correct. But on 08-16
`proj_mean_blend` refused for want of Sleeper history while `sleeper_hist_proj`
proved that history exists **the same day**, and nobody connected them for a day.
Both artifacts were right. **The silence between them was the defect.**

**b) EVERY LANE ADDS ONE OPEN QUESTION PER SESSION** to `OPEN-QUESTIONS.md` — a
thing we have not tested, with a cost band. Not a defect, not an assignment.

Every material finding in the week of 08-17 came from Cory. That is an org-chart
hole rather than a diligence failure: A rules, B builds, C fetches, D stewards,
E red-teams **outputs**, the relay chases — **no seat generated hypotheses.**

`draft/tests/test_open_questions.py` enforces both, with known-positive controls
on each. A rule that lives only in a document did not stop either failure.

## RULE 4 — LANES ARE FILE-SCOPED AND ENFORCED

`scripts/territory-check.sh` decides ownership by **file**, not directory, and
refuses a trespass by name. Need something in another lane? **Park a request**
(file, function, shape, and the test it should satisfy). Do not reach across.

## RULE 5 — RED `main` OUTRANKS EVERYTHING, FOR EVERYONE

A red `main` means the gate has confirmed nothing for anybody. Whoever's lane
broke it fixes it first. The PM watches `main` and names the owner; the PM does
not fix another lane's code.

## THE STANDING ORDER OF WORK

1. `main` green
2. the board publishes
3. draft-critical correctness (through 08-22)
4. everything else

## WHERE THINGS LIVE — one place each, no duplicates

- **what Cory asked for, and whether he has it** → `CORY-ASKS.md` (delegating is
  not delivering; an ask sits there until it is verified)
- **what is true now** → `DRAFT-WEEK-BRIEF.md`
- **your assignments** → `ROUTES.md` → `## TO: <lane>`
- **who owns which file** → `TERRITORY.md` (the authority)
- **your lane's rules** → `SESSION-A.md` / `SESSION-B.md` / `SESSION-C.md`
- **the queue in plain English** → `TODO.md`

If two of these disagree, `TERRITORY.md` wins on ownership and the brief wins on
state. **Fix the loser in the same commit that finds the disagreement.**

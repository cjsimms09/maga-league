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
| **PM** (relay) | integration & verification | CI health, cross-cutting sweeps, keeping the record honest, prepping A's decisions | decide anything A should decide |

**A's time is the scarcest thing in the project.** Everything below exists to
spend less of it.

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

- **what is true now** → `DRAFT-WEEK-BRIEF.md`
- **your assignments** → `ROUTES.md` → `## TO: <lane>`
- **who owns which file** → `TERRITORY.md` (the authority)
- **your lane's rules** → `SESSION-A.md` / `SESSION-B.md` / `SESSION-C.md`
- **the queue in plain English** → `TODO.md`

If two of these disagree, `TERRITORY.md` wins on ownership and the brief wins on
state. **Fix the loser in the same commit that finds the disagreement.**

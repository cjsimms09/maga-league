# DOCTRINE ENFORCEMENT AUDIT — is WR Feast wired to the engine?

_Audited 2026-08-08 at HEAD `287e026`. Question (1) of the mock-#3 queue._

## VERDICT: **DISPLAY-ONLY. The doctrine does not influence any recommendation.**

`grep -n doctrine public/js/draft/engine.js` returns **nothing**. Not one
reference. The doctrine never reaches the scorer, the ranker, the candidate
filter, or the weights.

## The complete path, traced

There is exactly one consumer, `doctrinePathKey()` (app.js:3144), and exactly
one caller (app.js:1797):

```
paths generated  ──►  doctrinePathKey(scored, paths)  ──►  onPlanKey
                          │                                    │
              reads LIVE_CONSTRAINTS to find which             ▼
              ALREADY-GENERATED path the doctrine        renders a badge:
              would take                                 "◆ the WR Feast branch"
```

`onPlanKey` is used for **one thing**: adding a `◆` badge to one path card.
It is not used to sort, filter, weight, promote, suppress, or select.

**The recommendations are byte-identical whether you are enrolled in WR Feast,
enrolled in something else, or enrolled in nothing.** Abandoning the plan changes
what the header says and nothing else.

## The one thing it does do honestly

`LIVE_CONSTRAINTS[doctrine]` genuinely filters by position/round/roster when
identifying *which* existing path the doctrine would take, so the badge is
**exact rather than a guess** — the code comment says so, and it is true. The
label is accurate. What is false is any implication that enrolling changed the
answer.

That distinction matters for severity: this is not a *wrong* badge. It is a
truthful label on an untouched computation, presented inside an enrollment flow
that strongly implies influence.

## Why it reads as "the recommendations keep going elsewhere"

Because they do, and nothing is stopping them. WR Feast has no mechanism to
pull a WR up. The composite picks whatever it picks; if that is an RB, the `◆`
badge simply lands on whichever path happens to be the doctrine's best allowed
option — often not the top path.

## The confound, which stands and must be re-checked

Cory's roster during that rehearsal was diluted by three mock picks (the keeper
dilution bug, fixed in `3ac3726`). **If any of those were WRs, the need term was
actively suppressing WR at exactly the moment he was watching.** So the
*magnitude* of what he saw is not clean evidence. The *mechanism* above does not
depend on it: display-only is display-only regardless of roster state.

**Re-check on a clean keeper roster before drawing conclusions about how badly
it deviated** — but not about whether it was wired. It is not.

## THE DESIGN QUESTION (4): soft tilt or hard constraint?

Cory's stated want: *"a strong tilt that says out loud when it's overridden, so
'the plan' means something during the draft rather than being a label on the
header."* That is the right shape, and it is the correct answer for a reason
worth stating: a **hard constraint** would make the doctrine override the
legality floor and the onesie rule in edge cases, and it would let a plan chosen
before the draft beat information that arrived during it. A plan that cannot be
overruled by a tier cliff is not a plan, it is a blindfold.

So: **strong, visible tilt, with mandatory disclosure on override.** The natural
home is **Stage 3 of the decision tree** — which is exactly where the tree spec
already puts it. Building it standalone now means building it twice.

## What this costs, and what it does not

Nothing downstream is corrupted. The doctrine never touched a recommendation, so
no roster, ledger entry, shadow, or graded result inherited a doctrine effect —
there was none to inherit. The cost is entirely that **an enrollment decision
Cory has been making, and a plan he has been trusting, have had no effect on
what the tool told him.**

## Consequence for the Zone-1 redesign

The spec's **PLAN LINE** requires "whether it's currently driving" —
`plan intact` vs `⚡ deviating this pick`. **That line cannot be built truthfully
today.** With a display-only doctrine, `plan intact` is never true in any
meaningful sense and `deviating` is always true. Rendering either would be a
confident falsehood in the second-most-prominent line of the surface.

The Plan Line needs Stage 3 to exist first.

# WE WERE GRADING WELL AND SEARCHING NARROW. 1 OF 8 AXES.

**Relay, 2026-08-18.** Cory asked four questions: *did you close the loops making
projections · are we making enough · are we using them · is it self-feeding and
always trying to improve.* Answered in that order, with numbers, then what
changed today.

**The short version: three of the four were already healthy, and the fourth —
breadth — was failing badly and invisibly.** Every check we owned stayed green
throughout, because every check we owned was about predictions that already
exist.

---

## 1 · ARE THE LOOPS CLOSED? — MOSTLY YES, AND THIS WAS THE HEALTHY ONE

| | |
|---|---|
| predictions filed | **83** |
| graded | **40** |
| of those, FALSE | **22** — 55%. (14 TRUE, plus 4 partial/inconclusive) |
| grades whose consequence is `NOTHING — <reason>` | **7 of 40** |
| grades with an empty consequence cell | **0** (the build fails on it) |
| open, none overdue | **43** |

**55% FALSE is the number that says the grading is real.** A ledger that grades
mostly TRUE is a ledger of things somebody already knew. P3 (expert skill), P4
(expert-spread ceiling), P27 (pace), P29 (efficiency) all died against their own
preregistered nulls, and **nothing shipped to the board from any of them** —
which is the loop working, not failing.

**The seven `NOTHING` consequences are legitimate and worth defending.** A grade
that changes nothing IS a result when the reason is written down; the check
accepts `NOTHING — <reason>` and rejects silence, and that asymmetry is the whole
design.

---

## 2 · ARE WE MAKING ENOUGH? — YES BY COUNT, NO BY SHAPE

**71 of the first 76 predictions were filed on a single day.** That is a burst,
not a programme. Every check passed throughout, because nothing measured *when*
predictions arrive.

Two rules now exist for this, both added today:

- **CADENCE** — `MAX_QUIET_DAYS = 14`. If nothing new has been filed in a
  fortnight, the build says so, however full the backlog is.
- **The floor** (`MIN_OPEN = 6`) already existed and catches the opposite
  failure: a ledger satisfied by grading everything and filing nothing.

**Ownership is the other half, and it is lopsided: 53 of 83 rows are relay's alone, 66 name relay somewhere.**
That is not obviously wrong for a PM lane whose job is to notice things, but it
means the lanes doing the modelling are filing few of their own hypotheses. The
seven filed today (P89–P93 + P82–P83 (renumbered at merge: the seven axis rows collided with ids main had already allocated; usage P89, efficiency P90, pace P91, props P92, opponent-defence P93, kalshi P82, residual P83)) are all owned by **A**, deliberately.

---

## 3 · ARE WE USING THEM? — YES, AND IT IS ENFORCED FROM TODAY

Twelve graded predictions changed something concrete this week: P71 turned the
keeper deadline into a config key, P74 downgraded register 5g from 🔴🔴 to 🟠
after measuring 0 of 12 seats, P73 found a latent cross-position comparison in
`applyCeilingTiebreak`, P33/P35 measured Kalshi's real liquidity.

**But nothing REQUIRED a grade to produce anything, and that was the gap.**

> **THE SUCCESSOR RULE (new).** Every grade made on or after 2026-08-19 must
> name what comes next in its `what changed` cell — either `-> P89` (this grade
> spawned that prediction) or `RETIRES` with a reason.

Grading is the moment we know the most we will ever know about a line of
enquiry. It is the cheapest possible moment to ask the next question and the only
one at which the answer is fresh. **A grade that names neither a successor nor a
retirement is a dead end nobody declared.**

**⚠️ The rule shipped broken and reported clean, which is the most useful thing
in this document.** `parseDate(cell, year)` takes a year; the new code called
`parseDate(cell)`; `Date.UTC(undefined, …)` is an Invalid Date, which is
**truthy**, so every row was exempted as "pre-rule" and the checker printed
`PREDICTION LEDGER OK`. **Rule 3e exactly** — the null meant *asked wrong*, not
*nothing found*, and there was no positive control to tell the two apart. It is
fixed, `parseDate` now throws on a missing year, and six tests drive the paths.

The same fix closed a hole: an **undated** grade used to be exempt too, which
made "delete the date cell" the cheapest way out of the rule.

---

## 4 · IS IT SELF-FEEDING? — IT WAS NOT. THIS IS THE REAL FINDING.

### 1 of 8 signal axes runs every week.

```
LIVE    vegas                   Vegas team total / implied tilt
GRADED  usage       by 09-03    Usage share (targets / carries / snap share)
GRADED  efficiency  by 09-03    Air yards / EPA / CPOE
GRADED  pace        by 09-03    Team pace (plays per game)
GRADED  props       by 09-03    Sportsbook player props (weekly)
NONE    opponent    by 09-19    Opponent defence strength
NONE    kalshi      by 09-19    Kalshi season-long markets
GRADED  residual    by 09-19    Residual vs Sleeper
```

The live arm set is `v1, v1_tilt150, v1_tilt050, v1_notilt, v1_pg16` — **five
rows varying exactly two knobs, `tilt_scale` and `divisor`, both on the Vegas
axis.** You can grade those five every Tuesday for eighteen weeks, promote a
champion every time, satisfy every check this repo owns, and never once test a
signal you were not already using.

**P28 graded this TRUE weeks ago and nothing changed, because nothing was
watching.** The projector's own docstring states the consequence in one line:
*"the mechanical loop only selects among the arms it is given."*

### THE DISTINCTION THAT WAS HIDING IT: GRADED ≠ LIVE

Five of eight axes have real, committed, preregistered verdicts. **That is why
the net felt wide.** But `pace_arm.py` ran once in August and will never run
again; `advanced_efficiency_study.json` likewise. **A study that ran once in
August tells you nothing in November.** Counting a one-off verdict as coverage is
precisely how a programme congratulates itself for a net it is not casting.

Only an arm inside `DEFAULT_ARMS` is priced every Thursday and graded every
Tuesday without anyone asking. That is the only thing `projection_breadth.js`
counts as covered, and by that standard we are at **one**.

### THE MECHANISM: A DEADLINE, NOT A FLOOR

A floor ("at least N axes live") is satisfied the day it is written and never
again. `BLEND-SEARCH-DESIGN.md` already commits to dates; those dates now live in
code, and **the build goes red the day one passes with an axis still not live**,
naming the axis. Moving a date is fine — in a commit that says why.

Every axis predicate ships with a control proving a mutant arm set flips it to
LIVE. **A deadline that cannot be met is a nag, and this project's own epitaph is
that a guard which cries wolf every morning gets switched off.**

### AND THE GENERATOR

`projection_breadth.js --emit` turns every uncovered axis into a ledger-ready
prediction row. **The thing that knows where the gaps are is now the thing that
writes the questions.** It does not file them itself, on purpose: a checker that
writes to the file it checks can always satisfy itself, and this repo has already
paid for one check that could not fail.

**P89–P93 + P82–P83 (renumbered at merge: the seven axis rows collided with ids main had already allocated; usage P89, efficiency P90, pace P91, props P92, opponent-defence P93, kalshi P82, residual P83) were filed from that output today**, one per uncovered axis, each with
its prior art read rather than assumed. Three are worth naming:

- **P91 (pace) is filed BECAUSE of its FALSE verdict, not against it.**
  `pace_arm.json` ruled the axis out *pre-draft on year-over-year persistence*
  while **explicitly endorsing in-season use** — which is exactly what a weekly
  arm is. That reads backwards unless you open the verdict, which is why it is
  written out in the row.
- **P92 (props) predicts zero graded weeks all season for an operational
  reason.** The arm is built, wired, imported and graded; its fetch workflow is
  `workflow_dispatch` with **no cron**. On Thursday the projector runs, on
  Tuesday the grader runs, and the props arm is silently absent from every grade
  all season because nobody pressed a button. **It needs a schedule line, not a
  model.** Cheapest live axis available.
- **P83 records that my own residual proposal is partly falsified.**
  `RESIDUAL-ARM-PROPOSAL.md` §2 argues for a per-position λ on the premise that
  own_v6's error is position-structured. **Measured: it is not** — all four
  positions p 0.45–0.61, uniform bias −5.88. The residual reframing survives;
  that argument for it does not.

### THE WEEKLY HEARTBEAT

CI runs both checks, but **CI only runs when somebody pushes** — and a programme
that has genuinely gone quiet produces no pushes. The failure Cory named is
exactly the one a push-triggered check cannot see. So
`learning-loop-audit.yml` runs Mondays on a clock, commits a dated report so the
trend is readable, and **opens an issue only when something is red.**

---

## 4b · WHERE THE SAFETY ACTUALLY CAME FROM TODAY — NOT THE LOOP

**Added 2026-08-18 evening, after the loop had been running all day.** The
sections above describe mechanisms I built. This one records what actually
caught things, because they are not the same, and the difference matters more
than anything else in this document.

**SIX OF MY OWN PROBES RETURNED A CONFIDENT WRONG ANSWER TODAY:**

| probe | what it said | why it was wrong |
|---|---|---|
| ledger successor rule | "every grade exempt, all clean" | `parseDate(cell)` missing its `year` argument |
| unpassed-parameter sweep | "the known defect is not there" | name collision on `build_profiles` across two modules |
| onesie cap probe | "`capped` never fires" | read `ctx.starters`; the code reads `ctx.league.starters` |
| local JS suite sweep | "3 failures" | a 60s per-file timeout — 2 were slow, not broken |
| weight-drift control | "PASS" (then failed forever) | anchored to `HEAD`, which moved when I committed the fix |
| merge resolver | silent success | preferred *theirs* on any unticked item I had edited |
| first merge length-diff | "44 items lost" | did not ask whether main had deliberately removed them |
| control-coverage sweep | "`merge_completeness.py` has no fail arm" | it has four; my detector grepped for `FAIL ARM\|planted\|CONTROL` and that file names its arms `test_dropped_modification_is_caught` |
| lane response rate | "`relay → D` 0% ticked — D is not closing loops" | I sign items as BOTH `relay` and `relay/PM`; the metric keys on the sender STRING. `relay/PM → D` is **71%**, and every unticked item was filed that same day |

**Every one produced a clean, plausible, confidently-worded output.** Not one
crashed. That is the same shape as the defects this project keeps finding in the
board — `rookie_affinity` 0 for 10 of 10, `adp_sd` 617/617 coverage on a default,
dispersion as `proj_mean × a constant`. **Full coverage, no information.**

**WHAT CAUGHT THEM:**

  · **the known-positive control** — 3 of 7, and in two cases the control failed
    on its FIRST run, which is the only reason the finding exists at all
  · **CI, once it could see the branch** — 3 of 7, and it found them within
    minutes of being pointed at work that had looked green for 25 commits
  · **luck** — 1 of 7. I went to edit an item and my anchor string was missing.
    Nothing would have told me that 9,400 characters of routing had been deleted.

**⚠️ THE TENTH IS THE ONE THAT REACHED CORY.** I told him a lane was not closing loops, on a 0% that measured **my own inconsistent signature**. The known-positive was sitting in the same output — the same lane at 71% under my other label — and I did not look at it before quoting the number. **Every other entry in this table cost me time; this one cost him a wrong belief about a teammate**, which is the failure mode Rule 3f exists to stop and the reason the rule says *before it is written down anywhere*.

**⚠️ THE EIGHTH ARRIVED WITHIN MINUTES OF FILING P90 ABOUT THE OTHER SEVEN**, which is the
most honest thing in this table: I swept for tools lacking a known-positive control, and the
sweep itself lacked one. It matched on vocabulary rather than on behaviour, so a file whose
fail arms are named `test_dropped_modification_is_caught` read as having none.

**AND CHASING THAT FALSE GAP FOUND A REAL ONE.** `merge_completeness.py` is a genuine gate with
four real fail arms, wired into CI, built for *"a half-landed merge must fail loudly"* — the
exact failure I hit today. **It would still not have caught mine, and its own docstring says
why:** for a file MODIFIED BY BOTH SIDES it cannot assert equality, so it only flags when
`merged == base` exactly. A union-resolved mailbox is modified by both sides by definition and
lands on neither side's content. **The three files this project routes all its work through —
`ROUTES.md`, `DEFECT-REGISTER.md`, `PREDICTION-LEDGER.md` — are precisely the ones its merge
guard is blind to.** That is not a defect in the guard; it is the shape of the problem, and it
is why the length-diff-against-both-parents procedure in P89 is the thing that has to be a
habit rather than a tool.

**WHAT CAUGHT NONE OF THEM: the register, the ledger, the breadth check, the
cadence rule — every mechanism in sections 1-4 above.** Those enforce that work
is TRACKED, DATED and CONSEQUENTIAL. They say nothing about whether it is RIGHT.

**So the honest reading of this whole document: the loop makes sure nothing is
lost. It does not make sure anything is true.** Truth came from controls that can
fail, and from a build that runs on code nobody has vouched for. **The single
highest-value change today was not any of the loop machinery — it was two lines
in `ci.yml` letting CI see lane branches at all.**

---

## 5 · RULE 3g

**Does this imply another failure we have not looked for?** Yes, and it is
general: *every* mechanical check in this repo is about artefacts that already
exist. The ledger check needed a floor and a cadence rule before it could see
absence; the breadth check exists only because absence was invisible. **Ask of
each remaining guard what it looks like when the thing it guards is missing
entirely.**

**Does it invalidate something we already trust?** It qualifies the
`PROJECTION-PROGRAM-2027.md` goal — beating Sleeper at 3 of 4 positions — by
showing the search that is supposed to get us there has been turning two knobs.
It also corrects `RESIDUAL-ARM-PROPOSAL.md` §2 against my own measurement.

**Is it routed to the lane that can act?** P89–P93 + P82–P83 (renumbered at merge: the seven axis rows collided with ids main had already allocated; usage P89, efficiency P90, pace P91, props P92, opponent-defence P93, kalshi P82, residual P83) are all owned by **A**, and
**nothing here goes into A's inbox before Saturday** — the relay's standing
commitment through the draft. The dates are 09-19; the draft is 08-22.

---

*Files: `draft/tools/projection_breadth.js` · `draft/tools/prediction_ledger_check.js` ·
`.github/workflows/learning-loop-audit.yml` · `PREDICTION-LEDGER.md` P89–P93 + P82–P83 (renumbered at merge: the seven axis rows collided with ids main had already allocated; usage P89, efficiency P90, pace P91, props P92, opponent-defence P93, kalshi P82, residual P83).*

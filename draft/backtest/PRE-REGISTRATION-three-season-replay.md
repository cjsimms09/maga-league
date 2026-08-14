# PRE-REGISTRATION — the three-season replay

**Written before the harness exists.** Every threshold, arm and exclusion below
is fixed now, while the answer is unknown. A criterion chosen after seeing the
result is a criterion chosen to pass.

TERRITORY: A · seasons 2023, 2024, 2025 · one league · one seat (Cory's)

---

## 1. THE QUESTION

> If the tools had run the team — draft, waivers, lineups — how would it have
> done?

Stated as an estimand rather than a slogan: **the difference in end-of-season
money and finish between a roster managed by the model and the same seat managed
by the comparison arms, over the three seasons we hold complete data for.**

Not "did the model pick good players". Every measurement so far grades a
component against itself. This grades the whole system against reality.

**THE ANSWER THAT MATTERS MOST IS "IT DID WORSE."** If the design cannot return
that, it is not a test. §7 below is the specific property that keeps it able to.

---

## 2. THE ARMS

Same seasons, same room, same schedule. They differ **only in who decides**.

### 2a. The three full-system arms

| arm | draft | waivers | lineup |
|---|---|---|---|
| **ACTUAL** | Cory's real picks | Cory's real transactions | Cory's real starts |
| **BASELINE** | best available by that year's ADP | **naive rule (below)** | highest projected as of that week |
| **TOOL** | the composite under shipped weights | the waiver tool | the lineup tool |

**ACTUAL is the honest baseline** — what the tool must beat to be worth running.

**BASELINE IS A COMPETENT MANAGER, NOT AN ABSENT ONE, AND THAT CORRECTION IS
CORY'S.** The first draft of this document had BASELINE never claiming waivers.
That is a strawman and it would have handed the tool a free win: TOOL vs a
no-waiver arm measures *"did we play waivers at all"*, not *"did we play them
well"*, and any active manager beats an inactive one. §7.1 claims the comparison
arms are not strawmen; the original design violated its own property.

**THE NAIVE WAIVER RULE, fixed now:** each week, if a starting slot is filled by
a player who is injured-out or on bye, claim the highest rest-of-season
projected free agent who fills that slot; otherwise claim the highest
rest-of-season projected free agent who would displace the weakest starter, and
only if the improvement exceeds zero. Priority order as the league actually ran
it (waiver priority, not FAAB — confirmed by zero bid amounts across 1,091
historical transactions). No streaming, no speculative stashes.

That is what an attentive manager with no tools does, and it is the bar that
matters.

### 2b. The isolation arms — what each subsystem is worth

A single money number cannot say WHERE an advantage came from. Each isolation
arm is **TOOL with exactly ONE subsystem swapped back to its naive counterpart**,
so the difference from TOOL is that subsystem's contribution:

| arm | what it isolates |
|---|---|
| **TOOL − draft-construction** (BPA draft) | roster construction |
| **TOOL − waiver tool** (naive waivers) | the waiver tool |
| **TOOL − lineup tool** (naive lineup) | sit/start |

**BPA IS THE ROSTER-SELECTION TEST, AND IT IS THE SECOND CORRECTION FROM CORY.**
Drafting off ADP does not test our roster construction — it produces a
market-shaped roster and confounds *"are our valuations better"* with *"is our
construction better"*. BPA drafts **best player available by OUR OWN
projections**, with every construction rule switched off: no `need`, no roster
legality, no onesie cap, no flex discount, no bye handling.

So **TOOL vs BPA holds valuation fixed and varies only construction.** That is
the one comparison that answers "is our roster selection right", which is the
thing Cory says he is least sure of — and nothing in this repository has ever
measured it end to end.

**A hindsight arm is deliberately excluded.** It would be the most flattering
number available and it answers nothing.

## 3. THE AS-OF RULE — the thing that makes or breaks this

**Every decision may use only what was knowable at the moment it was made.**

- **Draft** uses that season's PRE-SEASON projections and that season's ADP as
  published before the draft date. Not end-of-season stats. Not a projection
  file regenerated later.
- **Week N lineup** uses weeks 1..N−1 only. Never week N's own scores.
- **Waivers** claim only from players actually unrostered in that league that
  week, and the tool must not know who breaks out in week N+1.
- **Injury and status flags** must be the flags as of that week, not the
  season's final injury record.

**THE LEAK THIS IS MOST LIKELY TO HAVE, and it is not a hypothetical:** the
projection archive is REGENERATED. If a 2023 projection file on disk today was
built with any 2023 outcome in it, the draft arm is drafting with hindsight and
the tool wins by construction. **Provenance of every projection file used must
be established before any number is reported**, and if it cannot be established
for a season, that season is reported as UNAVAILABLE rather than estimated.

`league_history.json` carries 450 real picks across the three seasons and is
outcome-free by construction, so the ACTUAL draft arm is safe. **The projections
are the exposure.**


---

## 3b. THE TOOLS EXIST — VERIFIED, NOT ASSUMED

§2 says "the waiver tool" and "the lineup tool" as if they were givens. They
were not checked when this document was first written, and a design that tests
tools which do not exist is fiction. Verified:

- **`src/routes/waivers.js`** — prices free agents through the **SAME shared
  valuation the draft uses (contract C1)**. That matters for §2b: TOOL's draft
  and waiver arms are not two independent models, so a valuation error appears
  in both and the isolation arms will not separate it. Stated so the
  decomposition is not over-read.
- **`src/routes/lineup.js`** — maximises `E[$] = P(win)·matchup_value +
  P(clear the weekly-high band)·$100`. **NOT "start your highest projection"**,
  which is precisely why BASELINE's naive lineup rule is the right contrast: the
  two objectives genuinely differ, because the high-chase rewards variance and
  the matchup rewards floor.

## 3c. THE HARNESS FALSIFIER — a hard ceiling that catches leaks mechanically

`EFFICIENCY-LEAK.md` already measured the **optimal-in-hindsight lineup** with
the certified grader: **$595 (2024), $445 (2025), $2,100 across 2023–25** in
weekly-high plus regular-season money, at 86–89% lineup efficiency.

Hindsight-optimal is, by definition, **the maximum achievable with perfect
information**. TOOL has only as-of information. Therefore:

> **IF TOOL's LINEUP ARM RECOVERS MORE THAN THE HINDSIGHT CEILING IN ANY SEASON,
> THE HARNESS HAS A LEAK. Not a good result — a broken test.**

This is the most valuable check in the document because it is MECHANICAL. Every
other leak guard in §3 depends on me noticing the leak. This one fires on any
leak that produces lineup overperformance, whether or not anyone anticipated it,
and it fires automatically.

It also gives the lineup arm a scale: recovering a fraction of $445–595/season
is a real result; recovering 100% would mean the tool is seeing the future.

**The same shape does not exist for the draft or waiver arms** and this document
does not pretend otherwise — there is no measured hindsight ceiling for either.
Their leak exposure rests on §3, which is weaker, and that asymmetry is stated
rather than smoothed over.


---

## 3d. THE DATA INVENTORY — verified on disk, not assumed

Cory asked whether Sleeper gives us enough to replay three seasons. Measured:

**WHAT WE HAVE — outcomes, and they are complete.** `league_history.json`,
`provenance.complete: true`, `gaps: []`:

| | 2023 | 2024 | 2025 |
|---|---|---|---|
| draft picks | 180 | 150 | 150 |
| weeks | 18 | 18 | 18 |
| transactions | 373 | 370 | 348 |

Every week carries `starters`, `players`, `players_points` **for every rostered
player including bench**, `starters_points`, and `matchup_id`. That is enough to
compute the hindsight-optimal lineup (§3c's ceiling), to reconstruct any team's
roster in any week, and to derive who was unrostered.

**WHAT WE DO NOT HAVE, AND THE DISTINCTION IS THE WHOLE POINT:**

1. **Free-agent weekly scores.** `players_points` covers ROSTERED players only —
   151 rostered, 151 scored, week 1 2025. A waiver claim on somebody nobody
   rostered cannot be graded from this file. `nflverse_weekly_points_2024.json`
   exists for ONE season; 2023 and 2025 are missing and must be fetched.

2. **As-of preseason projections for 2023–25. THESE DO NOT EXIST AND CANNOT BE
   HONESTLY OBTAINED.** `proj_series.json` holds only 2026, earliest snapshot
   2026-08-09 — six days old. Its own note says why: *"Frozen for a CLEAN
   post-season grade — retroactive fetches leak (exp33)."* The repository already
   MEASURED that fetching past projections leaks, because sites revise them.

**THE LINE BETWEEN THEM: OUTCOMES CAN BE FETCHED RETROACTIVELY, FORECASTS
CANNOT.** What a player scored in 2023 is a fact and does not change. What a site
projected in August 2023 has been silently revised, and fetching it today
retrieves a number nobody could have acted on. So nflverse weekly points are
safe to go and get; historical projections are not.

## 3e. THE CONSEQUENCE FOR THE DRAFT ARM, STATED PLAINLY

**The draft arm cannot run against our production projection pipeline for
2023–25**, because that pipeline needs a preseason projection we do not hold and
must not reconstruct.

It CAN run against a **WALK-FORWARD projection built only from prior-season
outcomes** — project 2024 from 2023-and-earlier actuals, and so on. That is
leak-free by construction and is already the discipline
`exp_construction_objective.py` uses.

**WHAT THAT SUBSTITUTION DOES AND DOES NOT ESTABLISH, so the result is not
over-read:**

- It DOES test the decision logic — roster construction, need, legality, onesie
  caps, the flex discount, waiver selection, sit/start. That is what Cory asked
  about and what he says he is least sure of.
- It does NOT test our projection sources. A walk-forward projection is not
  FantasyPros. A tool that wins here has better DECISIONS, not better inputs,
  and the write-up must say so in those words.
- Both TOOL and BASELINE see the SAME walk-forward projection, so the comparison
  is fair even though the inputs are not our production ones.

## 3f. THIS IS A LOOP, NOT A REPORT

Cory's framing, and it changes what gets built: *"the main thing isn't running
the test, it is that we learn from it, diagnose when something goes wrong, fix
it, and keep running it."*

So the harness is built to be **re-run after every fix**, and every arm records
WHY it made each decision, not only what it chose. A replay that returns one
number and cannot say which decision cost the money is a report; this needs to
be an instrument. Concretely: every simulated decision writes the same
decision-time record shape the live ledger uses, so the existing graders apply
unchanged and a bad week can be opened and read.

**The success condition is not "the tool wins." It is a model that provably does
NO HARM, with every hole it exposes either fixed or written down.**

---

## 4. WHAT IS GRADED

Through the certified money layer (`roster_sim.py` -> money grade), the same one
exp34-dollars uses, because the league pays for weekly highs and playoff
finishes rather than for total points.

Reported per season and pooled:
- **money** — the objective Cory actually stated
- **final standing**
- **regular-season record**
- **total starting-lineup points** — the proxy, reported alongside so a
  divergence between it and money is visible rather than assumed away

---

## 5. PRE-REGISTERED DECISION RULE

**n = 3 SEASONS. THE UNIT IS THE SEASON, NOT THE WEEK.** Weeks within a season
share a roster, a draft and an opponent set; treating them as independent would
manufacture significance out of one draft. Three clusters supports a SIGN, not
an interval, and no confidence interval will be computed on three points.

Declared before running:

- **TOOL beats BASELINE in all three seasons** -> the strongest result this design
  can produce. Still n=3; still not a promotion on its own.
- **TOOL beats BASELINE in two of three** -> suggestive, reported as suggestive.
- **TOOL beats BASELINE in one or zero** -> the tool has not demonstrated
  advantage over an attentive manager with no tools, and that is the finding.
- **TOOL loses to ACTUAL in two or more** -> the tool is doing HARM at the seat,
  and that is reported first and loudest.

**No constant, weight, or threshold changes on the strength of this backtest.**
It is evidence about whether the system helps. Promotion is a separate decision
with its own evidence, per the standing rule.

---

## 6. READING THE ISOLATION ARMS

Defined in §2b, declared here so the reading is not chosen after seeing which
one looks good.

- **TOOL − X beats TOOL** -> subsystem X is doing HARM. Reported first.
- **TOOL − X ties TOOL** -> X is inert at this seat over these seasons. That is
  a real result and the honest word for it is "not demonstrated", not "small".
- **TOOL − X loses to TOOL** -> X contributed, by that margin, at n=3.

**TOOL vs BPA is the headline of this section**, because roster construction is
the open question. If BPA matches TOOL, then every construction rule in the
engine — need, legality, onesie caps, flex discount — is not earning its place,
and that is a finding worth more than the total.

If the full TOOL advantage is positive while every isolation arm is flat, that
is an INTERACTION claim and must be stated as one rather than assumed.

---

## 7. HOW THIS RETURNS "THE TOOL DID WORSE"

The property that keeps it honest, stated so it can be checked:

1. **The comparison arms are not strawmen.** BASELINE drafts to ADP — the
   consensus of thousands of drafters, which beats most humans — AND plays
   waivers AND sets a projection-optimal lineup every week. The first version of
   this document failed this property by letting BASELINE skip waivers
   entirely; Cory caught it. A control that does nothing is not a control.
2. **No arm gets information another lacks.** All three see the same week's data.
3. **The grader is certified and shared**, not written for this experiment.
4. **The losing outcomes are enumerated above BEFORE running**, with the
   harm case ranked first in the reporting order.

---

## 8. LIMITS, STATED BEFORE THE NUMBERS

- **n = 3 seasons, one league, one seat.** Can show a large effect; cannot show
  a small one.
- **The room is fixed.** Opponents made their real picks. The tool drafting
  differently would in reality have changed what was available to everyone
  afterwards; this design does NOT model that reaction. Its draft arm is
  therefore optimistic in a way that grows with how far it deviates from ACTUAL,
  and the deviation must be reported alongside the result.
- **Keeper rules changed across the three seasons** and must be applied per
  season, not uniformly.
- **The waiver arm depends on knowing who was unrostered**, which is recoverable
  from Sleeper transactions but is the piece most likely to be incomplete. If
  availability cannot be established for a week, that week's waiver decision is
  recorded as UNAVAILABLE and no claim is made for it.

---

## 9. WHAT THIS DOES NOT ESTABLISH

- Not that the model will help in 2026. Three past seasons under past rules.
- Not which component is responsible beyond what §2b's isolation arms separate.
- Not calibration of any individual quantity — this is an end-to-end outcome
  test and cannot attribute error to a term.
- Not anything about the side-bet or league-analyzer tools, which are graded
  separately.

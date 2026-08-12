# High-contrast candidates — the rates, measured before the argument

**Asked by Cory, 2026-08-11.** Propose 2–3 candidates selected for *disagreement*
rather than plausibility, declare each rate **before** proposing, drop anything
under ~10%, and say what would be learned if it loses.

Tool: `draft/tools/contrast_rate.js` (10 simulated drafts, 400 simulated weeks,
fixed-state discipline inherited from `profile_flip.js` — both arms evaluated at
identical board states, trajectory driven by the shipping arm).

---

## LEAD WITH WHAT FAILED

**Selecting for disagreement found a defect, not a strategy.** The
highest-contrast candidate — MEASURED vs DEFAULT weights, 68.3% — is high-contrast
substantially *because one arm is broken*. The sample line for the market
contrast showed the SHIPPING arm taking Denzel Mims (ADP 696) over Sam LaPorta in
round 8. Chasing that produced this:

| arm | picks that are reaches (ADP > 250) |
|---|---|
| **MEASURED_WEIGHTS — what `app.js:52` ships** | **111/240 = 46.3%** |
| DEFAULT_WEIGHTS | 0/240 = 0.0% |

Concentrated in rounds 8–13 — 20 of 20 drafts reach in rounds 8, 11, 12 and 13.
Sample picks: Josh Johnson, Joe Flacco, Tom Brady, Marcedes Lewis, Jason Witten.

Full diagnosis in `draft/audit/bench_branch_2026-08-12.md`, pinned by
`draft/tests/bench_branch_anchor.test.js`, sized by
`draft/tools/bench_branch_probe.js`. **DECISIONS-NEEDED entry 1.** It is live on
the war room today and the draft is on the 22nd.

**And that is the first real finding about the method Cory proposed.**
Maximising disagreement is a **defect detector before it is an experiment
design**. Two arms that disagree 68% of the time are telling you something, and
the first hypothesis should be "one of them is broken", not "these are two
strategies". Under the old habit of proposing plausible candidates, this defect
would have stayed hidden — plausible candidates agree, and agreement hides
exactly this. **The rule that follows: measure the rate, then diagnose the
disagreement, THEN propose the experiment.** Two of the four rates below turned
out to be contaminated by the same defect.

---

## THE RATES

Declared before any argument for or against the candidate.

| # | contrast | rate | verdict |
|---|---|---|---|
| A | MEASURED vs DEFAULT weights | **68.3%** (82/120 picks) | ADMIT — *after* the fix, re-measured |
| B | model-anchored vs roster-aware market | **91.7%** (110/120) | ADMIT — same caveat |
| B′ | model-anchored vs *naive* lowest-ADP | 92.5% (111/120) | **REJECT — straw man** |
| C | max E[points] vs max P(win) lineup | 17.5% of weeks, 2.0% of slots | **DECLINE — the stake, not the rate** |
| D | FantasyPros alone vs two-source consensus | 8.0–14.0% top-N | **DECLINE as a candidate, ESCALATE as a board question** |
| E | opponent-blind vs opponent-modelled | 0.7% | **DROP** (Cory's standing rule) |

---

## A · MEASURED vs DEFAULT — 68.3%, ADMIT WITH A CONDITION

Four terms zeroed against four terms believed. `app.js:52` ships MEASURED.

**By round: r4 90% · r5 80% · r6 70% · r7 0% · r8 100% · r9 60% · r10–13 100% ·
r14 20% · r15 0%.**

Rounds 10–13 at a flat 100% is the defect, not the strategy: those are the rounds
where MEASURED's bench branch has no anchor. **Rounds 4–9 are the real contrast**
— 70–90% in the starter branch, where both arms compute a full composite and
genuinely disagree about whether tier, need, risk and bye are worth anything.
That alone clears the bar comfortably.

**Why this one is genuinely open.** The Lab zeroed those four terms against
*draft-time* proxies, never against realized season outcomes. DEFAULT is the
shape every public tool ships. Neither of us can name the winner, which is the
actual admission test.

**IF IT LOSES** — if DEFAULT beats MEASURED — the Lab's zeroing was overfit to the
surface it was measured on, and four terms come back. That is a large, specific,
actionable finding and it is the reason to run this one.

**Condition: re-measure after the bench-branch fix.** The current 68.3% is not
the contrast we would be testing.

---

## B · MODEL-ANCHORED vs MARKET-ANCHORED — 91.7%, ADMIT WITH THE SAME CONDITION

Best VORP against lowest ADP among positions whose starting slots are open, K and
DEF held to round 13.

**The straw man is measured, not asserted.** Naive lowest-ADP-full-stop runs
92.5% — a *higher* rate, from an arm that drafts no quarterback. That is the
trap in this whole exercise made concrete: **contrast is trivially manufacturable
and most of it is worthless.** Beating an arm nobody would run measures nothing.
Both versions are in the tool so the difference stays visible.

The roster-aware arm is what most of this league actually does.

**IF IT LOSES** — if following ADP beats our board — the entire valuation stack
(VORP, opportunity adjustment, two-source consensus, replacement level) is not
beating a free public number, and the honest response is to delete most of it.
**That is the most valuable possible loss in this project** and the reason this
candidate is worth more than its rate suggests.

Same condition: rounds 8–13 are contaminated; rounds 4–7 run 70–100% on their own.

---

## C · max E[POINTS] vs max P(WIN) — DECLINED, AND THE RATE IS WHY THE RATE ISN'T ENOUGH

17.5% of weeks contain at least one differing slot — **nominally above the 10%
bar**. 2.0% of individual starter slots. Rosters drawn from the live board,
weekly units `proj_mean/17` and `weekly_sd`, opponent drawn 0.75–1.25× my total
against the measured 23.6 team-week SD.

**Declined on the stake, not the rate:**

> P(win) bought when they differ: **median 0.12 percentage points, max 0.79pp.**
> Whole-season stake: **0.003 expected wins.**

Two objectives that disagree about the roster and agree about the outcome are one
strategy wearing two names. They only diverge when a matchup is lopsided enough
that buying or selling variance pays, and a ten-team league is almost never that
lopsided.

**This is the correction to my own framing.** I proposed the ~10% rate bar and it
would have admitted this candidate. **A rate is necessary and not sufficient: a
candidate needs a rate AND a stake.** Adding the stake to the tool is what caught
it — and per rule 13f, the stake is the measurement that could have come out
otherwise.

---

## D · ONE SOURCE vs THE CONSENSUS — DECLINED AS A CANDIDATE, ESCALATED AS A BOARD QUESTION

Top-50 14.0%, top-100 8.0%, top-200 9.5% membership. Borderline at best, and the
pick-by-pick figure (92%) is not trustworthy — the first version of it was 88%
and **131 of those 132 disagreements were bookkeeping**: it removed only one
arm's pick, so the other arm re-picked its favourite at every later state. Fixed
(union removal) and documented in the tool. That was the second instrument
artifact of the day and it read exactly like the answer I expected.

**But the diagnosis found something worth more than the candidate.** The two
sources' median per-player ratio, by position:

| position | FantasyPros ÷ Sleeper |
|---|---|
| QB | 1.019 |
| RB | 1.002 |
| **WR** | **0.807** |
| **TE** | **0.784** |

QB and RB agree within 2%. WR and TE are off by ~20%, systematically, across
every player. **That is not two opinions about players; it is two different
assumptions.** It is not a dropped receptions column — RBs catch ~50 balls a
year and show no gap at all. Our consensus averages the two, which shifts WR/TE
value roughly 10% down relative to Sleeper alone and **changes cross-position
ordering on the live board, ten days before the draft.**

Not diagnosed further and not fixed here. **DECISIONS-NEEDED entry 2.**

---

## E · OPPONENT-BLIND — DROPPED

0.7%. Dropped under the standing rule rather than carried, as instructed.

---

## THE ANSWER TO THE CLOSING QUESTION

> *"If your read is that a high-contrast candidate is just a bad strategy with a
> measurable loss attached, and that learning 'this obviously worse approach is
> worse' is not worth the machinery — say so."*

**Partly yes, and the naive market arm is the proof: 92.5% disagreement from an
arm that drafts no quarterback.** Contrast is cheap. Most of what you get by
maximising it is a worse strategy with a number attached, and beating it teaches
nothing.

**But the failure is in the selection rule, not the idea.** The rate is the wrong
sole criterion. A candidate is worth running when three things hold:

1. **A real rate** — above ~10%, measured, before the argument.
2. **A real stake** — the arms must disagree about the *outcome*, not just the
   roster. Candidate C fails here at 0.003 wins and its rate looked fine.
3. **Genuine ignorance** — neither of us can name the winner, and the losing arm
   is one a competent manager would actually run. B′ fails here; A and B pass.

Both surviving candidates pass all three. So: **no, this line should not be
closed** — but the bar it has to clear is three tests, not one, and I had
proposed only the first.

---

## AND THE THING THAT MAKES BOTH SURVIVORS UNGRADEABLE — WHICH IS WHY ROUTE TWO WINS

**A and B are both DRAFT-level contrasts, and route 2 established that the draft
cannot be replayed.** A different pick changes availability for every downstream
pick; that state cannot be rebuilt. So neither admitted candidate can be settled
in January by replay, at any sample size, ever.

Meanwhile the only decision class that replays honestly all the way to the
win/loss — the lineup — is the one with **no contrast worth measuring** (0.003
wins).

That is not a coincidence and it is the sharpest thing this exercise produced:

> **The decisions with contrast cannot be replayed. The decisions that can be
> replayed have no contrast.**

**Which lands exactly where Cory's second route points.** The 68.3% disagreement
in candidate A is not an atom — it decomposes into the four terms MEASURED zeroed,
and each of those makes a claim about player outcomes that **is** gradeable
weekly, at n in the thousands, with no replay required. Same for candidate B: the
model-vs-market gap decomposes into projection accuracy, replacement level and
the opportunity adjustment, all of which resolve every week.

**So the composite candidates are worth carrying as a January reconstruction and
nothing more, and the component grading is where the strategy question actually
gets answered.** That is not a consolation prize; it is how the mask, the value
anchor and today's bench branch were all found.

---

## WHAT SHIPPED WITH THIS

`src/component_grade.js` now **requires** an `implication` on every call —
`{earning, hurting, noise}`, all three, stated before the verdict is known.
Supplying only the branch that fires is the same defect `resolution_rule` prevents
on the forecast rail. `too_thin` and `no_data` rows carry **no** implication and
say why: a design that could not have seen the effect implies nothing about
behaviour, and a "what to do" line beside an uninformative row is how an
underpowered null becomes a decision.

Pinned by six checks in `draft/tests/component_grade.test.js` (25/25 green).

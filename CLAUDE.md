# Every session starts here

## 🪪 WHO OWNS WHAT — you own an OUTCOME, not a checklist

**Cory, 2026-08-17:** *"no one actually owns anything.. even A just grades and
sends back."* He was right. Roles are now defined by what you SHIP.

| you are | **the outcome you own** | if it breaks, it is your name |
|---|---|---|
| **A** | **`main` is correct and green, and the board publishes** | a red gate, an unpublished board |
| **B** | **Cory drafts on a war room that WORKS (desktop), and the site works** | a wrong number on screen, a page he cannot read at 8s/pick |
| **C** | **the data we need is here, on time, correct** | a missing store, a stale fetch, a bad crosswalk |
| **D** | **the learning loop produces CHANGES** | a grade that moved nothing, a store that predicts nothing |
| **E** | **the model gives Cory an EDGE** (`EDGE-DEFINITION.md`) | a board that makes no football sense; no answer to "where is the edge" |
| **relay** | **every lane has what it needs; nothing is lost — AND every finding gets FOLLOWED UP** | an idle lane, a dropped ask, a finding nobody acted on |

**⚡ RULE 3e, added 08-18 — A NULL FROM A PROBE IS A BUG REPORT UNTIL THE PROBE
HAS DEMONSTRATED IT CAN RETURN A POSITIVE.** A probe that has never returned a
positive has not been tested, only run. "Nothing found" and "asked wrong" are
indistinguishable from the outside, and only one of them is a finding — 3d's
instinct fires on a suspicious positive, but a null triggers no instinct at
all, because graded nulls (P3, P4, pace, efficiency) taught us to respect
exactly the shape a broken probe produces. Evidence: five false-negative
market-census probes in ONE evening (relay, 08-18), each reading as a clean
"no" — legal boilerplate matched as a market, a truncated payload printed as
absence, 12 of 390 series read, a filter on a field the payload does not
carry, wrong field names — while the truth was **3,194 open NFL markets, 890
player-level**. A probe ships with a known-positive control or two
independent paths that check each other, and stores the raw response shape.

**⚡ RULE 3f, added 08-18 — THE CONTROL IS FOR THE PROBE YOU THREW AWAY, NOT JUST THE TOOL YOU SHIPPED.** Rule 3e is being followed for TOOLS and ignored for QUESTIONS, and the gap is where the damage is. **Nine ad-hoc probes returned a confident wrong answer in a single session (relay, 08-18) — not one crashed, every one printed clean plausible output:** a missing `year` argument that exempted every row and printed OK · a name collision that reported a known defect absent · `ctx.starters` where the code reads `ctx.league.starters` · a 60s timeout reported as two test failures · a control anchored to `HEAD` that passed once then failed forever · a merge resolver that **silently deleted 9,400 characters including a 🔴🔴 draft-blocking item** · a length-diff that cried "44 items lost" when the answer was zero · a sweep for missing controls that matched on vocabulary · `--today DATE` where the tool takes `--today=DATE`. **Every one was written to answer a question in the moment, and every one's output was headed for a register row, a routed item or a sentence to Cory.** **Before a probe's answer is written down anywhere, run it once against a case where you already know the answer.** Of those nine, three were caught by exactly that — twice the control failed on its FIRST attempt, which is the only reason the finding exists — three by CI once it could see the branch, and **one by luck.** `OPERATING-MODEL.md` Rule 3f.

**⚡ RULE 3i, added 08-19 — A NUMBER IS NOT A FINDING UNTIL YOU HAVE SEEN THE
DISTRIBUTION IT CAME FROM.** Rule 3f covers the probe you wrote; **this covers
the number you quoted without writing a probe at all**, which is the failure it
does not catch. **Evidence: four corrections in ONE evening (A, 08-19), every one
a single value that fit a story, none of them a code defect.** *"The live board
takes RB10"* — a stale **eighteen**-pick artifact, quoted for hours in three
documents and this file, when his real twelve give RB7 (register 98). *"The blend
is thinnest at tight end, 28 TEs one source short"* — **85 of those 86 players
have ADP > 200**; inside his draft range TE coverage is 96%. *"`draft_plan.js`
has never been graded"* — **an absence asserted without a grep**; it has two
grades and one is in a file the war room reads (register 102). *"`own_v6` hates
the upside picks, Golden by −119"* — **`own_v6` is 15-20 points under the board
mean on 80% of ALL players**; position-relative the claim survives at a quarter
its stated size (register 107). **Three of the four are the same operation:
quoting one value without looking at the population behind it. Before a single
number is written down as evidence — a difference, a count, an extreme, an
absence — look at its distribution, or grep for the thing you are about to say
does not exist. Every one of these checks took under ten seconds.**
`OPERATING-MODEL.md` Rule 3i. **⚠️ AND THE FIFTH INSTANCE HAPPENED WHILE WRITING THIS RULE: I numbered it 3h without checking, and `OPERATING-MODEL.md` already has a RULE 3h (*"D and E find; someone else acts"*) — and a DUPLICATED RULE 3f, at lines 224 and 376, which nobody had noticed. Caught in under a minute by grepping the headings instead of assuming. Register 108.**

**⚡ RULE 3g, added 08-17 — A FINDING IS NOT FINISHED UNTIL SOMEONE ASKS WHAT ELSE IT MEANS.**
Cory: *"too much finding and not enough fixing and following up and correcting."*
Every finding now carries three follow-up QUESTIONS — does this imply another
failure we have not looked for · does it invalidate something we already trust ·
is this routed to the lane that can actually act. **The relay owns that question
for every finding in the project, its own included.** Enforced, not promised:
`register_recheck_check.js` fails the build on any row still OPEN past its own
recheck date, and **every open row now carries one — 79 of 79, verified 2026-08-18 and TRUE AGAIN rather than still.** This claim had decayed: the E-lane merge added **eleven undated rows** on 08-18, and three more carried dates the checker could not parse (`recheck **08-19**` — bold breaks `recheck\s+MM-DD`; `recheck post-08-22` — so does a prefix). **Sixteen open rows were invisible to the mechanism built to chase them, including E12, *"the draft-day runbook's one irreversible step rests on a false premise"*.** Dates assigned or normalised by the relay; owners may move them with a reason.

**Cory owns:** what "edge" means · whether a capture job stops · any call he wants.

**`ROUTES.md`, `CORY-ASKS.md`, `DEFECT-REGISTER.md`, `OPEN-QUESTIONS.md` push
STRAIGHT TO `main`** — they are mailboxes, not code (Rule 1b). Branch the code.
**Rule 1b applies to EVERY lane including D and E — Cory ruled it 08-21 ("Yes
give D and E access mailbox push"), ending the branch-only constraint that
stranded D's receipts and scheduled register 186's wrong-control failure.**
`PREDICTION-LEDGER.md` rides the same grant (relay-owned, all lanes file to it).
⚠️ **The grant is FORWARD-ONLY until A's reconciliation merge lands: the
mailbox copies on D's and E's branches carry the diverged 163-185 / P-number
ids, so pushing that BACKLOG to main bulk would recreate the collision E is
classifying. New rows go straight to main (claim register ids via
`node draft/tools/next_register_id.js` — the watermark on main is the
allocator); the backlog lands only through the classification-driven merge.**

**The standard, one line:** a "no" is finished only with a measurement, an unblock
condition, an owner and a recheck date. **Four stated limits collapsed on 08-17
when someone finally checked the disk.**

**Where the edge stands, measured — CORRECTED TWICE 08-18, and the second
correction is D's:** this line used to read *"ties Cory (−6.5) and loses to the
league's best drafter (−163)"*. **The −163 seat belongs to ds7mmet, whom the
replay's own drafter study ranks FOURTH of ten** — the label was assigned from
the delta it was offered to explain (D's catch, guarded by
`test_best_drafter_claim.py`). Re-measured on the playoff-free stores: the
rank-1 drafter is Schmelley and the tool is **−24.0** in that seat — better
than the league median. Across 30 seat-years the tool is **−31.1 on average
with an sd of 117.7 — nearly 4× the effect — and wins 15 of 30.** ~~**So the
honest headline is "roughly a wash with Cory (−9.4), measured too noisily to
rank anyone."**~~ `draft/audit/replay_best_drafter_claim_2026-08-18.md`.

**⚠️ CORRECTED A THIRD TIME, 2026-08-19 — EVERY NUMBER ABOVE IS THE *PROXY*, AND
THE SHIPPED ENGINE HAS ITS OWN REPLAY THAT NOBODY HAS QUOTED.** −9.4 is
`replay_league_table.json`: `own_v6_nomarket` projections with the proxy's own
selection rule, on the **realistic** arm — the arm that artifact's honesty note
calls *"the tool's best case and not the headline."* `engine_seat_replay.json`
runs the real `engine.js` at `MEASURED_WEIGHTS` through the same counterfactual
and says **beats 0 of 10 owners pooled, −188.35 against Cory on the
preregistered primary.** Re-graded against the current choices file rather than
read: every pooled figure reproduced to the decimal.

**Where the tool would have FINISHED, which is what Cory actually asked: 8th of
10** (mean rank 7.80, top-3 in 3 of 30 = 10% against a 30% chance rate; dead
last in all ten 2024 seats). **But that pools two different failures.** In 2023
and 2025 the engine's roster holds MORE points than the owners' (+2.1%, +5.1%)
and loses entirely on **conversion** — 0.740/0.771 against 0.828/0.834 — value
acquired that never reaches a starting slot. **That is Cory's "roster still not
normal", in points, and it is worth more than the whole acquisition edge.**

**⚠️⚠️ CORRECTED 2026-08-24 — EVERY FIGURE IN THE PARAGRAPH ABOVE WAS MEASURED
AT ~~`need: 0`~~, AND CORY SWITCHED `need` TO 1.0 THE NEXT DAY.**
`engine_seat_replay.json` stamps its own `engine_meta.weights_values` as
~~`{value 1, tier 0, need 0, risk 0, ceiling 0.45, keeper 1, bye 0, stack 1}`~~;
`engine.js:826` ships `need 1.0, ceiling 0.0`, ruled 08-20. So *8th of 10*,
*0.740/0.771*, *beats 0 of 10 owners* and *SEVEN quarterbacks* describe a
configuration that has not shipped since. **THIS IS REGISTER 5h FOR THE FOURTH
TIME AND THE SECOND IN THIS FILE — the paragraph three screens up documents the
pattern in its own words and this one is a fresh instance of it.**
**MEASURED, on the arm that was already sitting on disk unread
(`engine_seat_choices_need1.json`): `need: 1.0` KILLS THE PILEUP. Seats with 3+
QB fall 8/30 → 2/30, the seven-QB seat falls to ONE, max on any seat 7 → 3.**
⚠️ **2024 gets worse (1.20 → 1.80) — `need` helps where the defect was and
hurts where it was not.** ~~⚠️ **AND THAT IS QB COUNTS, NOT CONVERSION: the need1
arm cannot be scored from these artifacts** (83.1% actuals coverage, and the
missing 17% is exactly the players it drafted that need0 did not — a
selection-biased subset)**. So the
honest headline is that the conversion defect's named mechanism is measurably
smaller under the shipped weights and the defect itself is UNMEASURED there.
Re-running the replay at the shipped constant is the highest-value measurement
available for 2027.**~~

⚠️⚠️ **CORRECTED WITHIN THE HOUR — "CANNOT BE SCORED" WAS FALSE AND I ASSERTED
IT WITHOUT GREPPING FOR THE TOOL THAT REMOVES THE LIMIT.** I measured coverage
against `engine_seat_replay.json`, found 83.1%, and wrote down a limit of the
ARTIFACT as though it were a limit of the QUESTION.
`draft/backtest/conversion_by_arm_lab.py` scores every arm off the season
bundles instead — full coverage — **and it had already been run on 08-19, as
the grade for P127.** **RE-RUN TODAY, three controls green: `need: 1.0` DOES
NOT MERELY SHRINK THE CONVERSION GAP, IT CLOSES IT AND PASSES THE OWNERS IN TWO
OF THREE SEASONS — 0.876 / 0.849 / 0.829 against 0.828 / 0.826 / 0.834, a gap
of +0.049 / +0.023 / −0.004 where the shipped arm read −0.087 / −0.011 /
−0.062.** **SO THE LOOP WORKED AND I MISREAD IT AS BROKEN:** the gap was
measured, an arm that closes it was graded, Cory ruled A13 on that evidence on
08-20, and the weight shipped. **Only the prose decayed — which is register 5h,
exactly what it says on the tin, and nothing more.** Register 317. **THE REAL
REMAINING GAP IS SEAT RANK, which is the question Cory actually asked:
`seat_rank_lab.json` carries NO arm dimension and `seat_rank_lab.py` takes only
`--json`, so *8th of 10* is the need0 rank and the need1 rank has never been
computed.** ⚠️ **And every recorded arm still carries `ceiling: 0.45` while the
shipped constant is 0.0, so no artifact yet describes the exact live config.** **The mechanism BEHIND the gap, however, is
now established far more strongly than the audit showed: across 30 seat-years
QB count vs conversion is r = −0.832 (t = −7.95), monotone at every step
(QB 1 → 0.824 · 2 → 0.817 · 3 → 0.757 · 4 → 0.679 · 5 → 0.650 · 7 → 0.515),
with roster size ruled out (r = −0.105) and 10.5% of all roster points stranded
in QB2+. The audit argued it from three season means and called a
non-monotone sequence "monotonic"; the seat-level distribution carries it.**

~~**The mechanism is register 60, which has been open without a cost:** `need` is
the only roster-aware term and it ships at weight **0**~~ — **⚠️ `need` HAS
SHIPPED AT 1.0 SINCE 2026-08-20; this clause was already false when written
above.** so nothing penalises a
pileup and whatever prices best gets taken repeatedly — **one 2023 seat drafted
SEVEN quarterbacks** in a 1-QB league; the live 2026 board takes ~~**RB10**~~
**RB7** instead. **⚠️ CORRECTED 2026-08-19 — RB10 CAME OFF AN EIGHTEEN-PICK
ARTIFACT, WHICH IS THE PICK-8 ERROR CORY ALREADY CAUGHT ONCE (register 95),
SURVIVING IN A SECOND PLACE.** `fieldability_probe.json` at 05:11 predates the
repoint at his real schedule; re-run on his twelve picks the shipped engine
takes **RB7 / TE1**, slot-aware RB8, `need:1.0` RB6, auto QB3. The shape defect
is real — **TE1 is the sharp version of it** — but the number in this file was
inflated by three picks he does not own. Register 98.
**Both boards draw exactly ONE tight end in 30 of 30 rosters** — a
degenerate constant of the `rookie_affinity`/`adp_sd`/dispersion family, and an
independent corroboration of the roster-shape lab's TE gap.
**Nothing ships from this before Saturday** (`no_fit_guard`).
`draft/audit/seat_rank_and_the_conversion_gap_2026-08-19.md`.

**⭐ AND THE MODEL WE HAVE BEEN REINVENTING IS PUBLISHED — READ
`DUPLICATE-A-REAL-MODEL-2026-08-19.md`.** Cory, 08-19: *"we obviously can't do
it ourselves, we need to look at other models and duplicate."* Read out of
`ffanalytics/R/calc_projections.R`: centre = **weighted Wilcox robust location**,
floor/ceiling = **weighted 5th/95th percentile (Harrell–Davis)**, replacement =
**QB13 · RB35 · WR36 · TE13 · K8 · DST3**, five sources weighted **zero**. **And
it emits `rank`, `floor_rank` and `ceiling_rank` as THREE SEPARATE RANKINGS — it
never adds ceiling into value.** ~~Ours ships `VONA + 0.45 × ceiling` on every
player at every pick~~ — **⚠️ 2026-08-21: OURS NO LONGER ADDS IT EITHER.
`MEASURED_WEIGHTS.ceiling` is `0.0` (`engine.js:826`); Cory switched it off on
08-20. So this paragraph now describes AGREEMENT with the reference model, not a
gap** — the textbook says upside is a **bench** instrument and
starters want the *low*-uncertainty side. **Cory's "why are we adding ceiling to
everyone" is the reference implementation's position, not a preference.**
Register 99. **The simple VONA model he asked for is also already ours:
`draft/tools/draft_plan.js` — two equations, exact seat assignment, and on his
real twelve picks it is the ONLY arm of five that draws a second TE and a
backup QB (QB2/RB5/WR4/TE2). It has never been graded.**

**⭐ READ `DRAFT-WEEK-BRIEF.md` FIRST** (written 2026-08-17; draft is 08-22).
08-17 changed the model's FOUNDATIONS, not its features: every dispersion field
on the board was `proj_mean x a per-band constant` — zero player-specific
information — which is the single cause of three conclusions we had believed.
The board, the backtest harness and the money proxy are all fixed, the studies
that rested on them are re-run, and a real per-player upside signal now exists.

**One of those re-runs REVERSED, and it became a shipped ruling.** Three
preregistered runs across two independent seed sets said a non-zero `ceiling`
weight beats zero — 3/3 seeds, separably, at every value from 0.15 to 0.65.

~~**⚠️ CORRECTED 2026-08-18: this section said the weight "is held at zero through
the draft deliberately". THAT IS NO LONGER TRUE, AND HAS NOT BEEN SINCE
`09f94f99` — "Ship Cory's ceiling ruling: MEASURED_WEIGHTS.ceiling 0 -> 0.45,
with the full paperwork".** Verified in the live engine:
`MEASURED_WEIGHTS.ceiling === 0.45`, and `app.js:52` seeds the board from it.~~

**⚠️⚠️ CORRECTED AGAIN 2026-08-21, AND THE CORRECTION ABOVE IS NOW THE STALE
CLAIM: THE SHIPPED WEIGHT IS `ceiling: 0.0`.** Read off the constant, not
inferred — `engine.js:826`, `MEASURED_WEIGHTS = { value 1.0, tier 0.0, need 1.0,
risk 0.0, ceiling 0.0, keeper 1.0, bye 0.0, stack 1.0 }`. **Cory ruled it back
to zero on 2026-08-20: *"switch it off, its so arbitrary."*** The record at the
constant states why it is not a reversal of the 08-17 ruling: that ruling's
evidence was taken against the ceilings live on 08-17, and **Draft Sharks became
the ceiling source on 08-19 (189 of the draftable top 200), so the weight was
multiplying an input its runs never saw.** Switching it off moves 8 of his 12
picks; 33/48/53 are unchanged. The DS floor/ceiling stay on the board and travel
to every source as a per-player ratio — what stopped is folding upside into one
score, which is also what `ffanalytics` does NOT do (register 99).

**THIS IS REGISTER 5h FOR THE THIRD TIME, AND THE SECOND TIME IN THIS FILE.**
A weight ruling ships and the prose quoting the old number never follows. The
08-18 correction was written to fix exactly this failure, in these words —
*"four documents went on describing the pre-ruling state — including this one,
which is the file every session reads first"* — and then became an instance of
it within 48 hours. **Found 2026-08-21 only because a commit message from the
night before justified a band fallback with "MEASURED_WEIGHTS.ceiling is 0.0"
while this file said 0.45, and the two could not both be right.** Neither
document was checked against the constant; one of them happened to be correct.
**When a weight is quoted anywhere in this repo, read `engine.js:826`.**

~~**So ONE decision waits on Cory, not two:** the ADP-sd ratchet.~~ **⚠️ CORRECTED 2026-08-18: ZERO decisions wait on Cory. He ruled the ADP-sd ratchet on 08-17 — *"leave it"* — and `CORY-ASKS.md` ③ has carried it as ✅ CLOSED ever since.** The ceiling weight is decided too. **This sentence, in the file every session reads first, would have sent the next reader to ask Cory for a decision he had already made** — and it nearly sent me. Brief §7b.

~~**And the correction has a live consequence — register 5g:** `draft/baseline/v1.json`
is frozen at 2026-08-10 and still carries `ceiling: 0` and `stack: 0.5`, and the
war room's "⏮ Restore the measured core" button is hardcoded to that version. One
tap on draft night reverts **both** Cory's ceiling ruling and the D10 stack
ruling, disclosing only a date.~~

**⚠️ CORRECTED 2026-08-19 — THAT IS FIXED AND THIS FILE WAS STILL CARRYING IT AS
LIVE.** The restore button no longer pins v1, and the pin comment records the
ruling (A, 2026-08-18, register 5g) and the reason: v1 predated both of Cory's
rulings, so restore was a silent reversion of both. The localStorage key rotates
with the pin, so a cached old baseline cannot shadow it.

**⚠️ THE VERSION AND THE WEIGHTS IN THIS PARAGRAPH WERE BOTH STALE, RE-READ
2026-08-21.** It said `app.js:779` pins `v27` carrying `ceiling 0.45, need 0`.
Live: **`app.js:880` pins `BASELINE_VERSION = 'v31'`**, and v31 carries
`{value 1, tier 0, need 1, risk 0, ceiling 0, keeper 1, bye 0, stack 1}` —
**identical to the shipped `MEASURED_WEIGHTS`, so the button restores exactly
what is live.** Both drifted values were the ones Cory has since ruled on
(`need` 0→1.0 on 08-20, `ceiling` 0.45→0 on 08-20), which is the same register
5h mechanism as the ceiling correction above: **the pin was updated four times
and the prose describing it was updated zero times.** Register 5g is in better
shape than this file claimed, not worse — but nobody could have known that from
reading here.

**Found because this claim was about to be dispatched to B as work.** The premise
check killed the item before it cost B a trip — which is the point of Rule 3f, and
the reason it is worth writing corrections into THIS file rather than only into
the register: five of six premises handed to session D on 08-17 were wrong, and
this is the file every session reads first.


**🔁 THE LOOP IS THE MODEL — Cory, 08-20: gather info → predict → grade for
SKILL, not luck → implement the edge or keep studying. ENFORCED, not asked:**
every ledger row from P283 must carry its LEARNING TARGET, SKILL DESIGN and
CONSEQUENCE ROUTE or CI fails (`prediction_ledger_check.js`; P282 is the
form); the 87-row open back-catalog goes FATAL 2026-09-10 — upgrade your own
rows. **Skill is graded by DECISION AGAINST A CONSTRUCTED NULL, not by outcome
persistence** — Getty et al.'s Test 3, not their Test 4. `start_sit_vs_random.py`
(wired into `weekly-grade.yml`; controls gate its exit code) scores each choice
against random LEGAL alternatives, so power scales with the number of decisions
and our ten-owner league stops being the limit: **530 owner-weeks, mean
percentile 0.8497 vs a null band of [0.4754, 0.5246]**, decisive where R\* was
not. **⚠️ `skill_luck_r.py` is NOT the skill instrument and the "≥20 graded
outcomes" rule is WITHDRAWN** (08-21): on our own spread R\* has 12% power now
and 20% after nine more seasons, so it cannot certify the standings and never
will. It remains a descriptive tool; never quote R\* without its band.
**Report the margin in the unit that pays — points left on the bench (league
15.90/wk; Cory 17.33 ± 1.68 vs the best owner's 12.06 ± 1.43) — and never read
adjacent ranks as findings; they sit inside one SE.**
**📋 WHAT THE MODEL LEARNS FROM, AND WHAT IT STILL CANNOT SEE —
`LEARNING-COVERAGE.md`.** Cory, 08-24: *"I want to make sure our model is set up
to actually learn ALL the things it can."* The map of every decision he makes
against whether it is graded. **Four of six are now graded against a null**
(draft pick · start/sit · waiver add · **the DROP, added 08-24 — 1,026 cuts
were captured and none were scored, which is how the wire came to recommend
dropping Ja'Marr Chase**). **Keepers are the real remaining gap** and the
highest-stakes decision he makes (register 289). **Trades are graded NEVER and
that is a measurement, not an omission — SIX in three seasons, zero in 2025.**

Structural changes to the grading process go to the OpenAI auditor first;
routine rows and grades do not. **HOW we grade is `GRADING-POLICY.md` (root,
one screen, the decision-null standard Cory ruled 08-21); HOW a row is FILED
is `draft/ADAPTATION-POLICY.md` — note the `draft/`, and its §214 records that
GRADING-POLICY supersedes its skill-design mechanics.** ⚠️ **This line used to
say `ADAPTATION-POLICY.md` with no path, and I read that as a missing file and
wrote "DOES NOT EXIST" into this paragraph before checking the repo — it is
13KB and it is one directory down.** Corrected the same hour. Worth leaving on
the record because it is the third time in two days that a bare `ls` in the
wrong directory produced a confident absence (the pick log, register 130, this)
— **an absence is a claim, and Rule 3i says grep before asserting one.**

**⚙️ HOW THE FOUR OF US WORK — `OPERATING-MODEL.md`, one screen.** **RULE 1c added 08-20 (Cory's order, after six research artifacts sat invisible on a branch while ROUTES rows pointed at them): the relay's research artifacts — preregs, program/policy docs, audit briefs, ledger rows, report-only instruments — publish STRAIGHT TO `main` like mailboxes, via `draft/tools/relay_publish.sh`. Every pointer in ROUTES now resolves on `main`; if one does not, that is a defect, file it.** A is the
gatekeeper and the only one who merges to `main`; B, C and the relay feed A.
Every request to A carries an ASK, EVIDENCE, a RECOMMENDATION and a DEFAULT, so
silence is consent to the default and nobody idles waiting. A can reply
`SEND BACK: <reason>` and that is a complete answer.

**🔮 EVERY PREDICTION, ITS GRADE DATE, AND WHAT IT CHANGED — `PREDICTION-LEDGER.md`.**
Cory, 2026-08-18: *"Still don't think we are making predictions, grading and closing the
loop. No one is in charge of it."* **The relay owns this file** — not the lane that made
the prediction, which is how a prediction goes quiet when its author moves on.
`draft/tools/prediction_ledger_check.js` runs in CI and **fails the build on three
things**: a row past its grade-by date still OPEN · a row marked GRADED whose *what
changed* cell is empty (*"a grade that moved nothing"* — `NOTHING — <reason>` passes,
silence does not) · **and the OPEN backlog dropping below 6, because a ledger you satisfy
by grading everything and filing nothing new is the program quietly ending.**
**40 predictions today; 12 graded, 11 of them FALSE — and nothing shipped from any of
them, which is the point.**

**🎯 WHERE THE MODEL IS GOING — `PROJECTION-PROGRAM-2027.md` and `BLEND-SEARCH-DESIGN.md`.**
Cory's goal, as a gradeable number: *our published weekly projection beats BOTH Sleeper
and FantasyPros, on THIS league's scoring, same players and weeks, at 3 of 4 positions,
on start/sit accuracy.* First grade **09-15**, then fortnightly. The blend doc is the
"infinite options" problem: **Tier 1 is one arm per signal, Tier 2 allows only
preregistered blends plus ONE walk-forward stacker, and BEST-OF-K is the null we still
owe.** Read it before proposing an arm — P3 and P4 both died of exactly the trap it
describes.

**🧾 NOTHING GETS LEFT BEHIND — `DEFECT-REGISTER.md`.** Every open data or
logic concern that could change a number Cory drafts or starts on, each with an
owner and a next action. A row with no owner is itself a defect —
`test_defect_register.py` fails on it.

~~Four blocking rows today.~~ **⚠️ THE COUNT IS GONE ON PURPOSE, 2026-08-19: a
tally in a prose file that no test reads is a claim that decays silently, and
this one had. Open the register — it is the authority, and it is guarded.**
**The 08-19 additions are 55-61 plus a REOPENED 2e**, and the two that reach
Saturday are **59** (~~driven down Cory's own schedule the tool takes RB10/WR1,
leaving an empty WR2 slot in week 11~~ — **⚠️ 08-19: 59'S EVIDENCE CAME OFF THE
SAME EIGHTEEN-PICK ARTIFACT AND DOES NOT REPRODUCE.** On his real twelve picks
the shipped arm is **WR4/RB7** and the un-fieldable weeks are **8 (QB) and 10
(TE)** — no week-11 WR2 gap. The row may still be real; its stated failure mode
is not. Re-derive before acting on it. Register 98) and **60** (the flex rule, the empty-slot
insurance, the slot-aware VONA and the wire bench rule are all built and all
disconnected — ~~`need` is the only roster-aware term and it ships at weight 0~~
**⚠️ CORRECTED 2026-08-20 (A's catch, code-verified by the relay): the KEEPER
term is roster-aware too, and it ships at weight 1.0.** `composite.js`'s
`keeperOptionValue` is MARGINAL against my current roster — *"Early on, when I
hold no candidates, the bar is zero and marginal equals raw"* — so an empty
roster maximises every player's keeper value and a filling roster shrinks it.
The score was never purely roster-blind at shipped weights; `need` is the only
roster-aware term AMONG THE ZERO-WEIGHTED ones. A is measuring how deep the
empty-roster effect ran through past board-state probes).
**2e was carrying a ✅ with its own named root cause still in the code**, which
is worse than an open row because an open row gets chased.

**🔗 "WE DON'T HAVE IT" IS NOT AN ANSWER — `DATA-LIFECYCLE.md`.** Eight
questions every data gap must walk: why not, can we get it, should we capture it
consistently, does it predict, should it, is it graded, should it be, does the
grade move the weights. Measured 08-17 morning: two of ten stores complete the
chain; four stop with no recorded reason. **Session D walked all six of its rows
that day and the count is now ONE** (`component_stats_*`) — but the headline is
how it fell: **five of the six premises handed to that lane were wrong, and not
one was a measurement error.** They were sentences nobody had checked against the
code or the filesystem, and a single false claim — that
`nflverse_weekly_points_2022.json` does not exist — appeared in **three separate
files**, cost the pace study a graded fold, and had C assigned to build a store
already committed. **Verify a row's premise before working it.** `SESSION-D.md`.

**Then `MONDAY-BRIEF.md`** for 08-15/16 — still accurate, superseded as the
entry point: the relay executed seven Cory rulings, promoted the projection
model twice (own_v6 live), and merged five design passes.

Then your role file: **A → `SESSION-A.md`**, **B → `SESSION-B.md`**, shared
state → `STATUS.md`, plain-English queue → `TODO.md`. Rules change in files,
in the commit that changes behaviour — never only in chat.

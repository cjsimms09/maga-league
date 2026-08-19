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

**The mechanism is register 60, which has been open without a cost:** `need` is
the only roster-aware term and it ships at weight **0**, so nothing penalises a
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
never adds ceiling into value.** Ours ships `VONA + 0.45 × ceiling` on every
player at every pick; the textbook says upside is a **bench** instrument and
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

**⚠️ CORRECTED 2026-08-18: this section said the weight "is held at zero through
the draft deliberately". THAT IS NO LONGER TRUE, AND HAS NOT BEEN SINCE
`09f94f99` — "Ship Cory's ceiling ruling: MEASURED_WEIGHTS.ceiling 0 -> 0.45,
with the full paperwork".** Verified in the live engine:
`MEASURED_WEIGHTS.ceiling === 0.45`, and `app.js:52` seeds the board from it.
Cory ruled, it shipped, and four documents went on describing the pre-ruling
state — including this one, which is the file every session reads first.

~~**So ONE decision waits on Cory, not two:** the ADP-sd ratchet.~~ **⚠️ CORRECTED 2026-08-18: ZERO decisions wait on Cory. He ruled the ADP-sd ratchet on 08-17 — *"leave it"* — and `CORY-ASKS.md` ③ has carried it as ✅ CLOSED ever since.** The ceiling weight is decided too. **This sentence, in the file every session reads first, would have sent the next reader to ask Cory for a decision he had already made** — and it nearly sent me. Brief §7b.

~~**And the correction has a live consequence — register 5g:** `draft/baseline/v1.json`
is frozen at 2026-08-10 and still carries `ceiling: 0` and `stack: 0.5`, and the
war room's "⏮ Restore the measured core" button is hardcoded to that version. One
tap on draft night reverts **both** Cory's ceiling ruling and the D10 stack
ruling, disclosing only a date.~~

**⚠️ CORRECTED 2026-08-19 — THAT IS FIXED AND THIS FILE WAS STILL CARRYING IT AS
LIVE.** `app.js:779` pins `BASELINE_VERSION = 'v27'`, not v1, and the pin comment
records the ruling (A, 2026-08-18, register 5g) and the reason: v1 predated both
of Cory's rulings, so restore was a silent reversion of both. **Verified rather
than read: v27 and v28 carry IDENTICAL `MEASURED_WEIGHTS`** — `{value 1, tier 0,
need 0, risk 0, ceiling 0.45, keeper 1, bye 0, stack 1}` — so the button restores
the ceiling and stack rulings rather than reverting them, and the localStorage key
rotates with the pin so a cached v1 cannot shadow it.

**Found because this claim was about to be dispatched to B as work.** The premise
check killed the item before it cost B a trip — which is the point of Rule 3f, and
the reason it is worth writing corrections into THIS file rather than only into
the register: five of six premises handed to session D on 08-17 were wrong, and
this is the file every session reads first.


**⚙️ HOW THE FOUR OF US WORK — `OPERATING-MODEL.md`, one screen.** A is the
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
disconnected — `need` is the only roster-aware term and it ships at weight 0).
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

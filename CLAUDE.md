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

**⚡ RULE 3g, added 08-17 — A FINDING IS NOT FINISHED UNTIL SOMEONE ASKS WHAT ELSE IT MEANS.**
Cory: *"too much finding and not enough fixing and following up and correcting."*
Every finding now carries three follow-up QUESTIONS — does this imply another
failure we have not looked for · does it invalidate something we already trust ·
is this routed to the lane that can actually act. **The relay owns that question
for every finding in the project, its own included.** Enforced, not promised:
`register_recheck_check.js` fails the build on any row still OPEN past its own
recheck date, and **every open row now carries one.**

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
with an sd of 117.7 — nearly 4× the effect — and wins 15 of 30.** **So the
honest headline is "roughly a wash with Cory (−9.4), measured too noisily to
rank anyone."** `draft/audit/replay_best_drafter_claim_2026-08-18.md`.

**⭐ READ `DRAFT-WEEK-BRIEF.md` FIRST** (written 2026-08-17; draft is 08-22).
08-17 changed the model's FOUNDATIONS, not its features: every dispersion field
on the board was `proj_mean x a per-band constant` — zero player-specific
information — which is the single cause of three conclusions we had believed.
The board, the backtest harness and the money proxy are all fixed, the studies
that rested on them are re-run, and a real per-player upside signal now exists.

**One of those re-runs REVERSED, and it is the headline: the composite `ceiling`
weight ships at 0 on a measurement that could not have come out any other way.**
Three preregistered runs across two independent seed sets now say a non-zero
weight beats that zero — 3/3 seeds, separably, at every value from 0.15 to 0.65.
**It is held at zero through the draft deliberately**, because the
no-change-before-08-22 rule was fixed in all four preregs before any of them
produced a number. Brief §7b.

So there are now **TWO decisions waiting on Cory** (the ADP-sd ratchet, and the
ceiling weight after 08-22) and the ONE action for draft day. The brief carries
all three.


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
owner and a next action. Four blocking rows today. A row with no owner is itself
a defect — `test_defect_register.py` fails on it.

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

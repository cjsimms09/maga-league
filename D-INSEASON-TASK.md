# PROMPT FOR D — 2026-08-18 · YOUR LANE MOVES TO IN-SEASON

*Cory: paste everything below the horizontal rule into D.*

---

**Cory ruled today: your lane moves to in-season.** Verbatim: *"let's put D on in
season."* This is that instruction, with the reasoning and the first four rows.

## Why you, and why now

Two measured facts, not a preference:

1. **The draft tool is already at parity with Cory: −6.5.** It ties him and loses to
   the league's best drafter by −163. More draft work optimises a tie.
2. **Your beat is in-season by nature.** Capture → prediction → grade has nothing to
   contribute to draft night. Your own branch is already week-1 props arms and
   snap-share grading. **Moving you costs the draft nothing**, which is why you move
   now and E does not — E stays on board integrity through 08-22 and joins you after.

And a third, measured last night, which is the shape of the whole opportunity:
**opponent strength fails the draft-day persistence bar at three of four positions and
passes the in-season bar at all four** (QB 0.320 · RB 0.276 · WR 0.174 · TE 0.258, five
seasons, each against a 400-run shuffle null). A real signal that pays only in-season.
There will be more like it. **The in-season half of this model is the part nobody has
mined.**

## FIRST — get your 19 commits onto `main`

They have been invisible since 08-17. `ROUTES.md` carries 199 routed items — C 107,
A 59, relay 23, B 9, **zero from you** — so nothing could have told anyone your branch
existed. That is now fixed at the tooling level (`lane_status.js`), but your work still
needs to land. **Route the merge to A with an ASK, EVIDENCE, a RECOMMENDATION and a
DEFAULT.** The default matters: without one, silence blocks you forever, and 131 items
in this repo are currently stuck in exactly that state.

Your branch is the best loop-closing in the project — three preregs committed before
their arms existed, a public self-retraction, three graded nulls, six closed register
rows. **Say that plainly in the route.** A cannot merge what it cannot see.

## THE STANDARD — unchanged, and it is the reason you got this lane

- **Prereg before the arm exists.** You already do this. Keep doing it.
- **A null is a result.** Three of yours are, and they are worth more than a positive
  nobody replicated.
- **Rule 3d — an implausible result is a bug report until proven otherwise.** Your
  amendment-2 retraction is the model case.
- **`prior_art.py --grep <topic>` before filing anything.** The relay filed four "new
  axis" rows on 08-18 and two had already been graded and failed.
- **A capture job is never stopped. Only Cory stops one.**

## YOUR FIRST FOUR ROWS

### 1. `own_weekly_v1` must publish a point prediction for EVERY player, EVERY week

Cory, 08-18: *"We need point predictions on every player every week! Graded with the
model adjusting every month or so."* This is the spine everything else hangs from. It
is not a study — it is a weekly artifact with coverage, committed, that a grader can
read without asking anyone anything. **First publish before week 1 (09-10).**

Coverage is the whole game: a projection that covers the top 200 and calls it done
cannot be compared to Sleeper or FantasyPros, who cover everyone.

### 2. The three-way weekly grade — us vs Sleeper vs FantasyPros

`PROJECTION-PROGRAM-2027.md` sets the bar: *our published weekly projection beats BOTH
Sleeper and FantasyPros, on THIS league's scoring, same players and weeks, at 3 of 4
positions, on start/sit accuracy.* **First grade 09-15, then fortnightly.**

**The shared-population rule is not a detail.** Three graders currently persist counts,
not per-player rows (register P37/P38), so a three-way comparison on "whoever each
source happened to cover" is not a comparison. Same players, same weeks, or it does not
count.

### 3. The opponent arm — P57, and the gate has already run

`draft/backtest/opponent_strength.py` (relay, last night) measured the feasibility.
Build the arm from **weeks 1..W−1 of the CURRENT season only** — never last season's
rating, which is exactly what the draft-day column says does not carry. All four
positions. Graded on start/sit accuracy and MAE like every other arm. **Grade by 10-27**,
after week 7, the first point a within-season rating has enough games.

Read `by_position()` in that file before you start. The pooled median hides RB.

### 4. Read `BLEND-SEARCH-DESIGN.md` BEFORE proposing a fifth row

Cory: *"we need to try each of these individually but also track different blends of
them, their are infinite options."* He is right that the space is infinite, which is
exactly why the design constrains it: **Tier 1 is one arm per signal, Tier 2 allows only
preregistered blends plus ONE walk-forward stacker, and BEST-OF-K is the null we still
owe.** P3 and P4 both died of the trap that document describes — a selection procedure
that finds a winner in pure noise. Do not add a fifth arm before the BEST-OF-K null
exists.

## HOW TO COMMUNICATE FROM NOW ON

This is the part that failed, so it is explicit:

1. **Every finding goes into `ROUTES.md`** under the lane that can act on it, carrying
   **ASK · EVIDENCE · RECOMMENDATION · DEFAULT**. The default is what stops you idling:
   silence becomes consent, and you proceed.
2. **Every prediction goes into `PREDICTION-LEDGER.md`** with an owner and a grade-by
   date. The relay owns chasing the grade; you own making the prediction gradeable.
3. **Push your branch daily even when the work is unfinished.** `lane_status.js` now
   reports unmerged lane work, so a pushed branch is visible even before it is routed.
   An unpushed one is invisible to everything.
4. **A grade that moved nothing is not a closed loop.** `NOTHING — <reason>` is a
   legitimate outcome and passes the check; silence does not.

**40 predictions stand today. 12 are graded, 11 of them FALSE, and nothing has shipped
from any of them.** That is the number your lane exists to change.

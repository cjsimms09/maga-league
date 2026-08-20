# EXTERNAL AUDIT BRIEF — the roster-construction equation, for a reviewer with no context
<!-- TERRITORY: relay. Written 2026-08-20 at Cory's instruction: "We need to run these
     through open AI audit... Explain the problem and your solution and see what it says."
     This document is self-contained ON PURPOSE: paste it whole into any outside model.
     Its response comes back to the relay, gets verified against the repo, and every
     adopted suggestion gets a prereg like everything else. An external suggestion is a
     hypothesis, never an order. -->

You are auditing a fantasy football draft strategy developed with unusual
rigor. Attack it. We want to know what we got wrong, what we haven't tested,
and what you would test next. Everything below is measured, not estimated.

## The league

10 teams, head-to-head, PPR-style custom scoring. Starting lineup: 1 QB,
2 RB, 2 WR, 1 TE, 1 FLEX (RB/WR/TE), 1 K, 1 DEF; ~15-man rosters. Snake
draft with keepers (0-3 per team). Free waivers all season (priority order,
no FAAB dollars). We hold complete data for 2023-2025: all 450 draft picks,
all weekly player scores, all transactions (1,091), all weekly lineups.

## The problem

Draft the roster that scores the most STARTING-LINEUP points across the
season, subject to fielding a legal ("normal") roster. The owner (Cory)
specifically demanded: normal roster shape, maximum value, and realism about
waivers — "the tool excludes waiver pickups... that's terrible and not
realistic" is a direct quote that reshaped our grading.

## The evaluation framework (critique this hardest)

We replay all 30 real seat-years (3 seasons × 10 seats). In each, our
builder drafts from that seat with everything else held fixed:
- **Value signal = the market's own draft order** (value of the pick taken
  n-th overall = 151−n). Era-correct, no hindsight; both the human owner and
  our builder "evaluate" players identically — the ONLY variable is the
  construction rule. (Declared limit: this cannot test projection quality,
  only roster SHAPE.)
- **Opponents are the recorded picks** (fixed). A `--react` variant where
  opponents substitute their next-best when we take their player cost ~13
  pts/season and changed no verdict.
- **Grading:** three ways, all reported. *Actual* = real weekly points, best
  legal lineup each week. *Skill* = each player at his own per-active-game
  rate (the owner ruled injuries are luck, not decision quality). *Waiver-
  aware* = every starting slot floored at the position's measured weekly
  waiver level (from our league's own 802 completed transactions), both
  sides symmetrically — this is the "realistic game" and our primary bar.
- Every experiment is preregistered: the bar is committed to git BEFORE the
  run; failures are filed publicly beside passes.

## The solution that won

**Marginal Lineup Value (MLV) with a onesie cap:** at each pick, over every
available candidate c, take argmax of

    MLV(c) = L(roster + c) − L(roster)

where L = best-legal-lineup value (dedicated slots + one flex) over the
candidate values held, and never draft a 2nd K or 2nd DEF. Greedy, myopic,
no lookahead.

**Plus the owner's depth discount (currently our leading candidate):** the
league drafts a stable number of players per position (TE: 13/14/15 across
three years; QB 16, RB 47, WR 52, K 10, DEF 10). Re-price every candidate as

    v'(c) = max(0, v(c) − v(D_q-th player of position q in this draft))

where D_q = the other seasons' mean drafted depth. "The 14th TE is free on
waivers, so he's worth nothing" — the owner's sentence as an equation.

## Results (mean pts/season vs the real human owners, 30 seat-years)

| arm | frozen actual | frozen skill | waiver-aware actual | waiver-aware skill |
|---|---|---|---|---|
| shipped heuristic curve (pre-program) | −20.4 | — | −39.1 | −3.4 |
| MLV-cap | +45.8 | +29.3 | +2.6 | +2.1 |
| MLV-cap + depth discount | +86.2 | +42.8 | **+25.9** | **+18.6** |

Depth-discount caveats we hold ourselves to: positive in all three seasons
separately, but head-to-head vs MLV-cap only 15/30 seats and the bootstrap
95% CI of the mean difference includes zero (skill [−10.2, +42.1]) — so it
is a candidate, not a champion, and nothing ships from it yet.

## What we tried and REJECTED (all preregistered, all failed their bars)

1. **Optimizing the waiver-floored objective directly** (draft-time floors):
   the drafter learns an empty slot is free and stops rostering kickers —
   7/30 rosters ended ILLEGAL. Floors belong in grading, not the objective.
2. **VONA timing** (marginal now − best same-position marginal available at
   my next pick): worse on every grading, three separate constructions.
   Lookahead terms on this value signal consistently lose to myopic greedy.
3. **A hard positional cap at drafted depth**: strictly dominated by the
   soft discount — 0/30 improved seats where it bound.
4. **Exact dynamic programming** (opponents are deterministic, so the true
   optimum is computable): the DP optimum beats the MLV greedy by <5% in
   30/30 seats, median gap 0.00%, max 3.6% — and the DP-optimal rosters
   GRADE WORSE than the greedy's (−10.6 skill/season), because squeezing
   the last internal points buys noise. **We concluded: no construction
   rule of any complexity has meaningful room above the greedy in this
   framework; the lever is the value signal (projections), not the rule.**

## The in-season half (audit these equations too)

- **Lineups:** argmax of expected points over legal assignments (solver
  exhaustively proven). Measured: perfect-hindsight lineups beat what owners
  actually played by +15.3 pts/week, and our fallback projections (running
  season average) LOSE to human judgment by 14.5/week — so projection
  quality is the binding constraint (test preregistered).
- **Waivers:** claim value = rest-of-season marginal starting-lineup value
  of (add − drop), floored at the measured waiver level, minus opportunity
  cost of waiver priority; signals from usage deltas and Vegas moves.
- **Trades:** value is roster-specific — worth(p→R) = ΔMLV(R,p), playoff-
  weighted; findable trades are pairs positive for BOTH rosters because
  positional surpluses differ.

## Questions for you

1. What is wrong with the evaluation framework? Name the biases the
   market-order value signal, fixed opponents, or 30 seat-years introduce,
   and which of our conclusions each one could invalidate.
2. Is waiver-floored grading the right realism standard, or does it
   under/over-credit streaming in a way that distorts the rankings above?
3. Given the DP result bounds construction gains at <5% for THIS value
   signal — what draft-day mechanism families does that bound NOT cover?
   (Opponent modeling? Keeper selection? Trade-up/down? Name anything.)
4. Is our restraint on the depth discount (CI includes zero → hold) correct,
   or is three-seasons-all-positive sufficient evidence to ship it?
5. With 3 seasons × 10 teams of complete data, what would YOU test next to
   improve weekly point predictions for this specific league?
6. Critique the waiver and trade equations. What term is missing?

Do not flatter us. Rank your findings by how much they would change the
numbers in the table.

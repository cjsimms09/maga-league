# DESIGN — the in-season opponent-prediction program

**E, 2026-08-20, answering the relay's ask (Cory's Goal 2, verbatim: *"to be
able to predict our opponents better"*).** This is a DESIGN document, not a
build — the ask was to design the program, and the two halves below are sized
for post-draft work, not tonight. One piece of each half is run against real
data here so the design isn't abstract.

## THE SPLIT, AS FRAMED

- **Lineup-prediction half**: who does each owner start — bench a stud on
  bye? chase points on a hunch? → feeds the matchup screen.
- **Waiver/trade half**: how active is each owner on waivers, what positions
  do they chase, when do they trade? → feeds the Tuesday alert (task 36) and
  trade advisor (task 35).

## WHAT ALREADY EXISTS, SO NEITHER HALF STARTS FROM ZERO

`draft/data/lineup_capture_2023_25.json` holds every owner's REAL weekly
starters for three full seasons (`rows[].tool_weekly_why[].starters`).
`draft/data/replay_waiver_2023_25.json` holds every owner's REAL recorded
moves per week, typed (`waiver` / `free_agent` / `trade`), for the same three
seasons (`seat_seasons[].arms.ACTUAL.decisions[].moves`). **Both halves of
this program are analysis tasks on data already captured, not new
infrastructure.**

## HALF 2 (WAIVER/TRADE) — ONE METRIC RUN NOW, AS THE KNOWN-POSITIVE

Rule 3e: a predictor ships with a known-positive control before it ships as
a finding. Ran the cheapest one — total recorded moves per owner, all three
seasons pooled, straight from `replay_waiver_2023_25.json`:

| owner | waiver | FA | trade | total |
|---|---|---|---|---|
| ds7mmet | 48 | 71 | 1 | **120** |
| Richard2121 | 28 | 82 | 1 | **111** |
| coryjsimms | 37 | 59 | 1 | 97 |
| Schmelley | 56 | 35 | 0 | 91 |
| MarianSaar | 44 | 37 | 2 | 83 |
| mhagen | 24 | 50 | 1 | 75 |
| cashworth | 47 | 22 | 1 | 70 |
| B8T3S | 27 | 40 | 2 | 69 |
| Jreis | 29 | 23 | 2 | 54 |
| Sadbru | 19 | 18 | 1 | **38** |

**A real, non-trivial, 3x spread — this is the known-positive: the data can
distinguish an active manager from a passive one.** That alone is usable
today: the Tuesday-alert priority order (task 36) should weight toward owners
who historically act on alerts (ds7mmet, Richard2121, Schmelley) over owners
who mostly don't (Sadbru), rather than blasting all ten identically.

**What this single number does NOT yet show, named rather than assumed:**
whether activity is EARLY-week (Tuesday) or LATE (Sunday morning), which
POSITIONS get chased, or whether trades cluster at a point in the season —
all answerable from the same committed file (`decisions[].week`,
`moves[].adds` → position via the player id), just not run tonight.

## HALF 1 (LINEUP) — WHAT THE PROGRAM SHOULD MEASURE, NOT YET RUN

**The concrete, checkable question:** for each owner, on a week where a
starter's team was on BYE, did the owner's recorded lineup swap him out (per
`lineup_capture_2023_25.json`'s weekly starters) for a bench body, or leave a
worse-projected replacement in and eat the zero? That is a single boolean per
owner-week, computable by cross-referencing `bye` (already on every player's
board row) against the recorded `starters` list — **no new data capture
needed, same file as half 2's proof-of-concept.**

**The known-positive for THIS predictor, stated before running it (so a null
reads as a null and not as "the check didn't work"):** at least one owner in
three seasons of real data should show a bye-week miss (Rule 3e — a predictor
that could never possibly catch anything is not a predictor). If zero owners
ever miss a bye across 30 seat-seasons, that is itself worth reporting rather
than treating the check as broken.

## WHAT THIS FEEDS, NAMED RATHER THAN LEFT VAGUE

- **Matchup screen**: "this opponent has historically started X% of
  bye-week-affected slots wrong" — a real edge if true, since it changes
  Cory's own confidence in a projected opponent score.
- **Tuesday alert (task 36)**: prioritize which owners get flagged first for
  a given wire pickup, weighted by the activity profile above.
- **Trade advisor (task 35)**: an owner who has made 1 trade in 3 seasons is
  a much colder trade target than one who has made 5-6 — worth knowing before
  proposing one.

## WHAT THIS DOES NOT DO

No lineup-swap or waiver-claim predictor is proposed for THIS OFF-SEASON —
this is 2026 in-season infrastructure, and Cory's own framing (*"this year's
two goals"*) puts it alongside, not ahead of, the projection-blend work that
is Saturday-relevant. Nothing here changes the board Cory drafts from.

## NEXT STEPS, IN ORDER

1. Run the bye-week lineup-miss check above (half 1's known-positive) — cheap,
   same data, not done tonight for time.
2. Split half 2's pooled totals by week-of-season and by position targeted.
3. Decide an owner named for this program post-draft — it is season-long
   work, not a today deliverable, and needs a real owner the way task 35/36
   currently don't have one.

## FOLLOW-UP QUESTIONS (rule 3g)

- **Does this imply another failure?** Task 35 and task 36 being unowned
  while feeding off a program that doesn't exist yet is the same gap named
  twice — worth Cory knowing both are blocked on the same missing piece.
- **Does it invalidate anything trusted?** No — this only reads existing
  committed data, nothing recomputed or overwritten.
- **Is it routed to the lane that can act?** Filed to A/relay; owner
  assignment for the season-long build is Cory's call, not mine to claim.

# PREREG — Q17: how much weekly production is invisible to a prior-season model?

_TERRITORY: D. Open question Q17, filed 2026-08-18 alongside the coverage
census. Written 2026-08-18, **committed before `emergent_coverage.py` exists.**_

## THE QUESTION, AND WHY IT DECIDES THE 09-15 GRADE

`own_weekly_v1` prices from `proj_ownmodel`, which `own_v6` builds **strictly
from prior-season production**. Sleeper and FantasyPros project the week-6
breakout the day he breaks out.

**We already know this bites in the preseason:** 117 board players have no
`proj_ownmodel` at all (register 42), 15 of them inside FantasyPros' universe.
**What is unmeasured is how much it bites once the season runs.**

> If a large share of weekly production comes from players a prior-season model
> cannot see, then the 09-15 three-way grade measures **our universe**, not our
> model — and a formula improvement cannot fix it.

**This is the one direction where our design is structurally worse than both
competitors rather than merely narrower.** That is why it is measured before
any arm is tuned.

## POPULATION — committed stores only, no egress

Seasons **2023, 2024, 2025** (each needs its prior year; 2022 is the earliest
prior available and is used as a prior only). `nflverse_weekly_points_*` for
outcomes, `component_stats_*` for position. **Join verified before this prereg
was written: 100% of players in each points store carry a position, and the
universe is QB/RB/WR/TE only — exactly `own_weekly_v1`'s scope.**

Regular season **weeks 1-17**.

## THE DEFINITION — declared now, both arms, so neither can be chosen later

A player is **VISIBLE** in season Y if a prior-season model could have priced
him; **INVISIBLE** otherwise.

| arm | VISIBLE means | what INVISIBLE captures |
|---|---|---|
| **primary — `any_prior`** | he has **any** points row in season Y−1 | rookies, and players who missed all of Y−1 |
| **sensitivity — `prior_20`** | his Y−1 season total is **≥ 20 points** | the above, plus deep-bench players a board would not carry |

`any_prior` is primary because it is the **most generous** reading of what a
prior-season model can see, so it produces a **lower bound** on the blind spot.
If even that bound is large, the finding is safe.

## METRICS — three, all preregistered, primary named

1. **PRIMARY — invisible share of STARTABLE production.** Per week and
   position, take the top *N* scorers (**QB 12, RB 24, WR 24, TE 12** — this
   league's starters plus flex depth, fixed here before any number exists), and
   report the share of that set which is invisible.
   **Primary because `PROJECTION-PROGRAM-2027.md`'s bar is start/sit accuracy**,
   which is decided inside the startable set, not across the long tail.
2. **SECONDARY — invisible share of total points.** All QB/RB/WR/TE points in
   the week. Dominated by the tail, reported for context.
3. **SECONDARY — trajectory.** Both of the above by week, 1→17, and the
   week-17-minus-week-1 delta. **Emergence should grow within a season if the
   mechanism is real; a flat line means the gap is rookies at week 1 rather
   than in-season emergence, which is a different problem with a different
   fix.**

## THE CONTROL — known-positive, declared as VOIDING

**Run the identical measure with season Y's OWN production as the "prior".**
Under perfect foresight every scorer is visible, so **the invisible share must
be 0.000 in every week.**

**If it is not, the join is broken and the run is VOID** — I report the join
failure instead of a result. A blind-spot number computed over a population
that silently lost rows is exactly the defect this lane exists to catch.

## THE BAR — what counts as a finding, with magnitudes, before the numbers exist

| invisible share of startable production, pooled | reading |
|---|---|
| **< 5%** | the blind spot is real but small. **Formula work is the right lane** and the 09-15 grade measures the model. |
| **5-15%** | material. The grade is partly measuring our universe; the shared-population design (`projection_coverage_census.json`) must carry the caveat explicitly. |
| **> 15%** | **structural.** A formula improvement cannot recover it, and `own_weekly_v1` needs an **in-season universe refresh** before any arm is tuned. |

Reported per position as well as pooled, because the bar that matters is *3 of
4 positions*.

**Register 42's preseason figure is NOT the answer to this** — 117 of 617
(19%) is a *board-construction* count, not a *production-weighted* one, and a
player with no prior season is usually a low-scoring player. **I expect the
production-weighted number to be much smaller than 19%**, and I am recording
that expectation now so a small number cannot later be presented as a surprise.

## WHAT THIS WILL NOT COVER

- **Not a claim about Sleeper's or FantasyPros' actual weekly coverage** — no
  archived weekly provider universe exists for 2023-25. This measures OUR blind
  spot, and assumes theirs is zero, which flatters them and is the safe
  direction.
- **`own_v6` is not re-run.** "Prior-season production exists" is a proxy for
  "own_v6 would price him", not the same thing.
- **No K/DEF** — absent from these stores and from `own_weekly_v1`'s formula.
- **Nothing is wired.** This sizes a problem; it does not fix one.

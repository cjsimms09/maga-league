# Q17 — 12.9% OF STARTABLE PRODUCTION IS INVISIBLE TO A PRIOR-SEASON MODEL

_TERRITORY: D. Open question Q17. Preregistered in
`EMERGENT-COVERAGE-PREREG.md`, committed first (`bae71efd`). Result:
`emergent_coverage.json`._

**Band: MATERIAL.** The 09-15 three-way grade is partly measuring **our
universe**, not our model — and the shared-population design has to say so.

## THE RESULT

| | pooled 2023-25 |
|---|---|
| **PRIMARY — invisible share of STARTABLE production** | **12.9%** |
| share of all QB/RB/WR/TE points | 14.3% |
| sensitivity, `prior_20` (a board-like universe) | **16.5%** |

**The gate passed:** re-running with each season's own production as the
"prior" gives an invisible share of exactly **0.000 in every one of 51
season-weeks**. The join lost nothing; a blind-spot number over a silently
shrunken population would have been worthless.

**Consistent across seasons** — 13.8% / 11.1% / 13.9% — which is what makes the
level trustworthy: it is an average over 51 season-weeks, not one draw.

### Against the preregistered bar

| band | reading | |
|---|---|---|
| < 5% | small; formula work is the right lane | |
| **5–15%** | **material — the grade is partly measuring our universe** | **← 12.9%** |
| > 15% | structural; needs an in-season universe refresh | |

**And the sensitivity arm is already in the structural band at 16.5%.** A board
carries roughly the `prior_20` universe rather than the everyone-who-played
one, so **16.5% is the figure closer to what `own_weekly_v1` actually faces.**
The primary is deliberately the generous arm — a lower bound — and even the
lower bound is material.

## THE TRAJECTORY IS **NOT** ESTABLISHED, AND I NEARLY REPORTED THAT IT WAS

My first read of this study was *"the blind spot grows through the season"*:
week 1 → week 17 rises **+6.9 / +7.0 / +16.7** points, and 2025 ends at 26.4%.

**That is a two-point comparison of two noisy weeks, and it does not survive.**
The weekly series ranges 5.6%–23.6% with no visible trend.

| season | slope | shuffle-null p | weeks 1–15 only |
|---|---|---|---|
| 2023 | +0.37 pp/wk | 0.065 | +0.40 |
| 2024 | +0.21 pp/wk | 0.177 | +0.13 |
| 2025 | +0.42 pp/wk | **0.042** | +0.25 |

**One of three seasons clears, at p=0.042, across three tests — which is what
multiplicity produces.** All three slopes are positive, which is suggestive and
nothing more.

**Week 17 is elevated in all three seasons (19.4 / 15.3 / 26.4), which is also
exactly what late-season starter rest looks like** — and dropping weeks 16–17
shrinks the slope in two of three. The preregistered delta was measuring that
as much as anything.

> **DEVIATION, declared:** the prereg's metric 3 is "week 17 minus week 1". I
> emitted it because it was preregistered, and then added a least-squares slope
> with a 400-run shuffle null **beside** it. **The verdict reads the slope.**
> Reporting the delta as a trajectory would have been the same error this lane
> flags elsewhere — and I had it written down as a finding before I tested it.

## BY POSITION — and the instability is the informative part

| season | QB | RB | WR | TE |
|---|---|---|---|---|
| 2023 | 10.8% | 12.0% | **16.2%** | 15.7% |
| 2024 | **13.2%** | 8.6% | 13.7% | 8.8% |
| 2025 | 8.3% | **19.1%** | 9.6% | 17.6% |

**The worst position is different every year.** There is no structural
per-position hole to patch — which rules out the cheap fix (e.g. "carry more
rookie RBs") and points at the universe rule itself.

That matters for the *"3 of 4 positions"* bar: **the position this costs us
most is not predictable in advance**, so it cannot be pre-empted, only
absorbed.

## WHAT THIS MEANS FOR THE 09-15 GRADE

1. **The first grade is taken when our blind spot is smallest.** Week 1–2
   invisible shares are 8.3–12.5%, against a season mean of 12.9%. **A grade at
   09-15 will flatter us relative to the full season**, and fortnightly grades
   may drift worse for a reason that is not the model.
2. **The shared-population caveat is now quantitative.** `projection_coverage_census.json`
   fixes *who* can be compared; this fixes *how much of the real game* that
   comparison misses. Both belong in the 09-15 write-up.
3. **It does not invalidate the grade.** 12.9% invisible means 87.1% visible,
   and the model is genuinely on the hook for those. **This is a stated
   denominator, not an excuse** — and stating it before the first grade is the
   point of measuring it now.

## MY STATED EXPECTATION, GRADED

The prereg says: *"I expect the production-weighted number to be much smaller
than 19%"* (register DS6's board-construction figure).

**It is 12.9% — smaller, but "much" was wrong.** Directionally right, magnitude
overstated. Recorded because a prior that is only ever graded when it is
flattering is not a prior.

## WHAT THIS DOES NOT COVER

- **Not a claim about Sleeper's or FantasyPros' weekly coverage.** No archived
  weekly provider universe exists for 2023-25, so this assumes theirs is zero.
  **That flatters them and is the safe direction** — the real gap is smaller
  than 12.9% by however much they also miss.
- **`own_v6` was not re-run.** "Has prior-season production" is a proxy for
  "own_v6 would price him", not the same thing. Register DS6 shows the real rule
  is stricter (117 board players have no `proj_ownmodel` despite the board
  carrying them), so **the true blind spot is likely worse than measured here.**
- **No K/DEF** — absent from these stores and from `own_weekly_v1`'s formula.
- **Nothing is wired.** This sizes a problem.

## TRIGGERS

- **Re-measure with `own_v6`'s actual coverage rule** rather than the
  prior-production proxy — that is the number that decides between "material"
  and "structural", and register DS6 suggests it is worse.
- **Re-run after week 6 of 2026** on live data, which is the first point an
  in-season universe refresh could be evaluated against.
- **If the `prior_20` arm is the right model of our universe, this is already
  structural** and an in-season refresh is required before arm-tuning. That is a
  design question for A, routed rather than assumed.

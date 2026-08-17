# ROUTES-TPRR — PREREGISTRATION (written 2026-08-17, committed BEFORE any result existed)

_TERRITORY: D — data stewardship. Register row 14._

**Commit order is the proof.** This file is committed in its own commit, before
`routes_tprr_study.py` runs. Any deviation from what is written here is listed in
the result write-up as a deviation, never silently absorbed.

## Why this study exists

`routes_*` is captured weekly, 2021-2025, and **reaches no prediction** — 0
route-derived fields on the board across 682 rows and 56 keys (verified
2026-08-17, `draft/audit/snap_counts_row13_2026-08-17.md`). It is the last store
in `DATA-LIFECYCLE.md` stopping at step 4 with **no recorded reason at all**.

Register row 14 asks for one thing: prereg a feature and measure it. **The weekly
job keeps running regardless of the outcome** — Rule 3c, and 2026 cannot be
re-fetched in 2027.

The claim being tested is the one the store was built on: *"60 targets on 300
routes is a different player from 60 on 600, and target share alone cannot
separate them."* TPRR (targets per route run) is the separator. **Nobody has
checked whether it separates anything that matters.**

## What the input is, and what it is NOT

`tprr = targets / routes`, from `routes_YYYY.json`, and the store's own `_note`
is binding: **routes run here is a PROXY and an UPPER BOUND** — every skill
player on the field for a pass play is counted, so a tight end who stayed in to
block is counted as having run a route. There is no true routes feed in nflverse.
`tprr` is `None` below 10 routes in a week, because a ratio of two small integers
is not an efficiency. QBs are excluded by the store's design.

**Nothing in this study may describe the result as a measured route count.**

## Universe and eligibility — declared before running

- Positions **RB / WR / TE** (the store's universe; QBs absent by design).
- **Season totals**, built by summing weekly `routes` and `targets` per player,
  then `tprr_season = total_targets / total_routes`. Season TPRR is computed from
  the summed counts, **never** as a mean of weekly ratios — averaging ratios
  weights a 12-route week equally with a 45-route week.
- **`MIN_ROUTES = 200` in each season of a transition.** A season-grain
  efficiency needs volume; 200 routes is roughly a season of real usage. Declared
  now, not tuned after.
- **ABSENT STAYS ABSENT.** A player with no routes row in either season of a
  transition is **excluded**, never imputed to a positional mean. The
  `weekly_volatility` work established why: filling gaps with a positional mean
  hands the steadiest reading to the injury-return group.
- **The surviving population is RECORDED per transition**, not just the
  correlation. This is register row 18's lesson applied before the fact: a null
  measured over an unknown surviving population is not a finding.

## E1 — PERSISTENCE. Does TPRR carry year over year?

Spearman rho between `tprr_season(Y)` and `tprr_season(Y+1)`, over players
eligible in both.

- **Transitions: 2021→22, 2022→23, 2023→24, 2024→25.** All four are usable
  because E1 involves no scoring at all.
- **CONTROL (known-positive):** targets carryover, Spearman(`targets(Y)`,
  `targets(Y+1)`), on the identical population. **If the control does not come
  back strongly positive, the harness is broken and no other row here means
  anything.**
- **NULL:** 400-draw permutation shuffling the Y→Y+1 player pairing within each
  transition; report the 95th percentile.

## E2 — INCREMENT. Does TPRR add anything to volume?

The question that decides whether wiring is worth considering. Persistence alone
is not enough — a stable trait that duplicates target volume is the
constant-multiple defect wearing a new name.

- **Outcome:** season-Y+1 total fantasy points under OUR scoring, summed from
  `nflverse_weekly_points_{Y+1}.json`.
- **Method: partial Spearman.** Rank-residualise both `next_points` and
  `tprr(Y)` against `targets(Y)`, then correlate the residuals. Rank-based, no
  model fitted, nothing tuned.
- **CONTROL:** the plain Spearman(`next_points`, `targets(Y)`) is reported
  alongside, so the increment is read against the thing it must beat.
- **NULL:** the same 400-draw permutation, applied to the partial statistic.

### The fold restriction, and it is not optional

**Transitions: 2021→22, 2023→24, 2024→25 ONLY. `2022→23` IS EXCLUDED.**

`nflverse_weekly_points_2021/2022` carry `scoring_fingerprint`
**`220bf4c671786351`**; 2023/2024/2025 carry **`bd8f3e50bd67a9ce`**. They were
scored under different tables. A 2022→2023 transition would compare a season-Y+1
total under one table against a predictor from a season scored under another,
and — as `weekly_volatility` recorded when it refused 2021-22 for the same
reason — there is *nothing in the arithmetic to complain*.

**All five weekly-points stores exist and are complete** (5,401 / 5,351 / 5,648 /
5,588 / 5,246 player-weeks, `complete: true`, no missing weeks), which makes
DEFECT-REGISTER row 10 stale — see the result write-up. E2 therefore gets **three
folds**, not one.

## Ship rule

TPRR is declared to carry **incremental** information only if the E2 partial rho
is **positive in ALL THREE folds AND beats the permutation null p95 in all
three.** Anything less is a null for this construction.

**Nothing installs from this experiment either way.** A positive routes to a
separate, gated wiring decision that is A's and Cory's, post-08-22. Brief §7:
*"a weight measured once, late, is a worse instrument than a known one."*

## Preregistered calibration — what result sizes will MEAN

Stated now so "surprising" is a fact and not a memory (Rule 3d).

**E1 persistence.** House comparables: snap-share volatility **+0.19**, weekly
volatility **+0.482 / +0.605**, scoring-level carryover **+0.740 / +0.781**.

- **Expected: +0.30 to +0.60.** An efficiency should carry less than raw volume
  and more than noise.
- **Above +0.75 is SUSPICIOUS, not exciting** — that is the range where TPRR
  would be behaving like a rescaled copy of volume, which is the constant-multiple
  defect by name. It would trigger a check that `tprr` is not collinear with
  `targets`, not a celebration.
- **At or below the null, with a healthy control**, means TPRR is not a stable
  player trait at season grain.

**E2 increment.**

- **+0.10 to +0.25 is a real, small, useful effect** — the size at which wiring
  is worth a separate decision.
- **Above +0.40 is a leak until proven otherwise.** Both variables are built from
  the same seasons; a large partial correlation would first be treated as a bug.
- **At or below the null = no incremental signal at season grain.** That is a
  legitimate outcome and it **ends nothing**: the re-test trigger is written into
  the result, the weekly job keeps running, and the natural next construction is
  named in advance below.

## If it is null, the trigger is already chosen

Declared now so it cannot be reverse-engineered from a disappointing number:

> **Re-test at WEEKLY grain, or per-position.** Season TPRR pools a
> role change across 17 games; the store is weekly and nothing about this design
> uses that. **And re-test when a true routes feed exists** — this is an upper-bound
> proxy that counts blocking tight ends as route-runners, so the measurement is
> attenuated by a known, unmeasured amount.

## What this study does NOT test

- Whether TPRR belongs on the board (a wiring decision, A's and Cory's).
- Weekly/in-season prediction (this is season→season, the draft-board question).
- QBs (absent from the store by design).
- Any construction other than the single one specified above.

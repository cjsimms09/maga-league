<!-- TERRITORY: C -->
# PROJECTION ERROR, MEASURED — items 1 and 3 of the ingest brief

Measured 2026-08-13 by `draft/backtest/projection_error.py` on **2023, 2024 and
2025** — 1,304 graded players, 20 measurable cells, none unmeasurable. The numbers
below supersede a first pass that used two seasons and the wrong season boundary; see
**What changed** at the bottom.

Sleeper and FFC are proxy-sealed in this container, so `players_meta` and the ADP
loader `backtest/cli.py` uses were replaced by nflverse's own `import_ids`
(gsis→sleeper, position, birthdate). `walk_forward` — the real backtest projection —
needs neither. 2025 came through `grade.weekly_from_pbp`, because
`import_weekly_data(2025)` 404s on a stale nfl_data_py URL.

**Artifact:** `draft/backtest/projection_error_calibration.json`, with its own field
population. **Appliers:** `projection_error.proj_sd_for` / `proj_ceiling_for`.

## What was measured

`walk_forward` projections built from the two strictly prior seasons, against realized
totals scored under that season's own league config by our own engine. Error is a
**ratio**, `actual / projected`, because an sd fitted on 300-point QBs cannot be
applied to a 90-point TE2. `proj_sd` is then `proj_mean × sd_ratio` at application.

Bands are **projection rank within position**, not ADP: no archived ADP exists before
2026-08-09, a retroactive fetch leaks (exp33), and a realized pick number cannot be
known before the draft it comes from. Rank-within-position is the only band that both
fits historically and applies prospectively.

**Both sides are cut at NFL week 17**, because `league_history` says
`last_scored_leg = 17` in all three seasons. Weeks 18–22 score nothing for anybody in
this league. A "filter to regular season" fix would still be wrong — NFL week 18 *is*
`season_type == REG` and is fantasy-irrelevant. The cut is the league's number, not
nflverse's label.

## The measured table

| pos | band | n | mean | sd | p50 | p90 |
|---|---|---|---|---|---|---|
| QB | 1-3 | 9 | 0.992 | **0.273** | 1.085 | 1.230 |
| QB | 4-8 | 15 | 0.907 | 0.356 | 0.964 | 1.316 |
| QB | 9-16 | 24 | 0.938 | 0.432 | 1.040 | 1.426 |
| QB | 17-32 | 42 | 0.689 | 0.573 | 0.627 | 1.484 |
| QB | 33+ | 96 | **0.411** | 0.617 | 0.165 | 1.094 |
| RB | 1-3 | 9 | 1.194 | 0.492 | 1.233 | 1.721 |
| RB | 4-8 | 15 | 1.251 | 0.355 | 1.248 | 1.635 |
| RB | 9-16 | 23 | 1.128 | 0.477 | 1.144 | 1.640 |
| RB | 17-32 | 48 | 1.061 | 0.615 | 1.030 | **1.890** |
| RB | 33+ | 240 | 0.573 | **0.666** | 0.345 | 1.434 |
| TE | 1-3 | 9 | 1.097 | 0.366 | 0.987 | 1.462 |
| TE | 4-8 | 14 | 0.913 | 0.339 | 0.898 | 1.309 |
| TE | 9-16 | 23 | 0.963 | 0.469 | 0.883 | 1.647 |
| TE | 17-32 | 44 | 1.010 | 0.565 | 1.114 | 1.704 |
| TE | 33+ | 196 | 0.473 | 0.449 | 0.336 | **1.092** |
| WR | 1-3 | 9 | 0.974 | **0.231** | 1.013 | 1.296 |
| WR | 4-8 | 15 | 1.125 | 0.446 | 1.077 | 1.740 |
| WR | 9-16 | 24 | 0.978 | 0.341 | 0.988 | 1.318 |
| WR | 17-32 | 46 | 1.070 | 0.412 | 1.147 | 1.506 |
| WR | 33+ | 403 | 0.571 | 0.510 | 0.419 | 1.317 |

## Finding 1 — `proj_sd = 0.25 × mean` understates the spread in 19 of 20 cells

Median measured `sd_ratio` is **0.449 — 1.8× the shipped constant**. The single
exception is WR 1-3 at 0.231: the elite receivers really are more predictable than the
constant says, which is the same defect in the other direction.

The spread across cells is **0.231 to 0.666, a factor of 2.9.** One constant cannot be
right at both ends, and it is currently wrong at nineteen of twenty.

What that looks like applied: a WR1 projected 320 gets `sd 74.0` against the shipped
80.0, while a QB40 projected 150 gets `sd 92.5` against the shipped 37.5. **The board
is confident where it should be uncertain and uncertain where it should be confident.**

## Finding 2 — `proj_ceiling = 1.35 × mean` is below the measured p90 in 12 of 20

Median measured p90 is 1.462. But the value of the constant is not the defect. **Any**
constant makes `proj_ceiling` a monotone function of `proj_mean`, so ordering by
ceiling and ordering by value are the same list — which is why `ceiling: 0` in
MEASURED_WEIGHTS could not have come back anything but zero. The measured p90 runs
**1.092 (TE 33+) to 1.890 (RB 17-32)**, wide enough to invert pairs. That inversion is
what makes the weight measurable, and it is pinned by test.

## Finding 3 — walk-forward is well calibrated at the top and over-optimistic deep

`mean_ratio` (1.0 = unbiased) by band:

| band | QB | RB | WR | TE |
|---|---|---|---|---|
| 1-3 | 0.992 | 1.194 | 0.974 | 1.097 |
| 4-8 | 0.907 | 1.251 | 1.125 | 0.913 |
| 9-16 | 0.938 | 1.128 | 0.978 | 0.963 |
| 17-32 | 0.689 | 1.061 | 1.070 | 1.010 |
| 33+ | **0.411** | 0.573 | 0.571 | **0.473** |

The top of every position lands within ~10% of unbiased, and **WR 1-3 and QB 1-3 are
within 3%.** The error is not at the top — it is in the tail, where projections run
roughly **2× high** at QB and TE. RB is the exception, running 13–25% low through the
middle bands, which is consistent with running backs' well-known games-missed rate.

This is a diagnosis of `walk_forward` / `REGRESSION_WEIGHT`. That is A's lane —
recorded, not touched.

## The bias this instrument publishes rather than removes

`rest_of_season_points` omits a player with no weekly rows rather than zeroing him.
For grading a **policy** that is right and deliberate — `replay.grade()` drops the
pick from N so a recommendation is not punished for a player who was never on a field.
For calibrating **how wrong a projection is** it is backwards: "he never played" is
the single most common way a preseason number turns out wrong.

So it is measured both ways. On the two-season run, EXCLUDED gave a median `sd_ratio`
of 0.530 and ZERO-FOLD 0.538 — **every headline held under both**, so the conclusions
do not depend on the choice. 827 of 2,131 projected players are ungraded here, and
that count travels inside the artifact. In 2023 (the one year with a checkable
follow-on season) at least 30 of 305 dropouts played again and 275 did not, so the
excluded variant is much the closer of the two.

## What this does NOT say about the production board

`draft/projections.py` does **not** use these constants. It computes `season_sd =
proj_mean × player_variance(...)` per player, varying with workload, depth chart,
experience, injury and age. The `0.25` / `1.35` constants are the **backtest** board
only, and Findings 1–2 are about that board.

The measurement still bears on production in one specific way. `player_variance` is
bounded by construction — `base × [0.70, 1.45]` — so the largest `season_sd / mean`
it can emit at any input is QB 0.319, RB 0.493, WR 0.435, TE 0.522. Several measured
cells sit above those ceilings (QB 17-32 at 0.573 and QB 33+ at 0.617 against a QB max
of 0.319; RB 17-32 at 0.615 and RB 33+ at 0.666 against 0.493), **so at those bands the
cap binds rather than the data.**

That is suggestive, not conclusive: production projects from provider baselines and
walk-forward from prior production, and the provider may simply be more accurate.
Settling it needs projection-vs-actual on the **production** projection.

## Why that test cannot run before January, and what is perishable now

Its instrument is `draft/data/proj_series.json`, whose earliest snapshot is
**2026-08-09 — four days old.** It is the first archived preseason projection this
project has ever held, and there is no way to make production's error measurable
sooner: a preseason number is only observable before the season.

Which makes one thing urgent. `draft/proj_series.py` caps the archive at
`TOP_N = 400`, and the bands with the largest measured error are `33+`. **If that cap
is not raised before Week 1 the 2026 archive is permanently top-400 and the deep bands
can never be calibrated for this season.** That file is not mine — parked, not edited.
See PARKED.md.

## What changed from the first pass, and why

The first version of this document (committed earlier today, `b6d3dd9`) used two
seasons and graded **all 22 NFL weeks**. Two corrections:

1. **The week-17 cut.** Grading 22 weeks against a ~16-game projection credits players
   whose teams go deep in January. Cutting to the league's own `last_scored_leg = 17`
   moved **19 of 20 cells down** and one up by 0.003 — one-directional, so the effect
   is real rather than noise. The largest single move was RB 4-8, −0.217.

2. **2025 added**, taking the 1-3 bands from n=6 (unmeasurable) to n=9.

**Finding 3 was overstated in the first version.** It reported the early bands as
projected "~40% low at RB and WR" from RB 4-8 = 1.419 and WR 4-8 = 1.453. Corrected,
those are **1.251 and 1.125** — roughly half of that apparent bias was playoff weeks
counted in the actual. The corrected picture is also a different shape: the bias is not
a top-vs-bottom tilt, it is **good calibration at the top and over-optimism in the
tail.**

Findings 1 and 2 held in direction and weakened slightly in size: `sd_ratio` 2.1× →
1.8× the shipped constant, `p90 > 1.35` in 13/16 → 12/20.

**A consequence for A, parked separately:** `rest_of_season_points` has a `from_week`
and no `to_week`, and `cli.py` passes it a frame including weeks 18–22. The replay's
own grading therefore carries the same playoff inflation measured above — a median
~0.077 on the ratio and up to 0.217 in one band.

---

## 2026-08-13 — the production board's `proj_sd` against the measured spread

`proj_sd` is not manufactured — A corrected me on that and was right. `projections.py:241`
sets `season_sd = mean_proj * var` from `player_variance`, and `weekly_sd` is DERIVED from
it (`season_sd / sqrt(games)`), not its source. So the board's `proj_sd / proj_mean` is
exactly the `variance` field, per player.

**It is real, and it is systematically lower than what 2023–2025 actually did.**

Basis confirmed rather than assumed: the calibration bands on a WITHIN-POSITION projection
rank. The board has no `proj_rank`, and my first cut fed `band_of` the OVERALL
`consensus_rank`, which dumped nearly every player into `33+` and produced a table with 1–7
players in the top bands. Recomputing the rank from `proj_mean` descending agrees with the
board's own `pos_rank` on **576/576** players.

| | cells | median gap (measured ÷ board) |
|---|---|---|
| all comparable cells | 20 | 1.29× |
| board BELOW measured | 17 of 20 | |
| **where the walk-forward model was itself well calibrated** (\|mean_ratio − 1\| ≤ 0.25) | **14** | **1.28×** |
| where it was biased | 6 | 1.40× |

**THE CONFOUND, STATED BECAUSE IT CUTS AGAINST THE FINDING.** The walk-forward projections
behind the calibration are themselves ~2× high in the deep bands (QB33+ `mean_ratio` 0.411,
TE33+ 0.473). Part of any measured spread is that model's own badness rather than
irreducible outcome uncertainty, so the raw `sd_ratio` is an UPPER bound on what production
should carry. The headline gaps — QB17-32 at 2.45×, QB33+ at 2.30× — sit exactly in the
cells where the model was worst, and they are contaminated.

Splitting on that is the whole analysis. **In the 14 cells where the historical model was
well calibrated, the gap is still 1.28×**, so the confound explains 1.40 → 1.28 and no more.
Three cells run the other way (TE33+ 0.96×, TE4-8 0.94×, WR1-3 0.94×), so it is a tendency
rather than a uniform offset.

**Assumption worth naming:** `sd_ratio` is the dispersion of actual/projected ACROSS players
in a cell, and `proj_sd/proj_mean` is the intended per-player CV. With one observation per
player-season, the former is the standard estimator of the latter — but they are the same
quantity only if the cell is homogeneous.

**Not an ask, and deliberately not one eight days from a draft.** ~28% is material for a term
that drives survival and therefore VONA, and recalibrating `player_variance` is neither
mechanical nor mine. Recorded so the decision is A's and the number is on the record before
the draft rather than after it.

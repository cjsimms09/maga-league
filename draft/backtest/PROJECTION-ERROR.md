<!-- TERRITORY: C -->
# PROJECTION ERROR, MEASURED — items 1 and 3 of the ingest brief

Measured 2026-08-13 by `draft/backtest/projection_error.py`, on 2023 and 2024,
893 graded players. Run script: the driver is reproducible from the module plus
`nfl_data_py`; Sleeper and FFC are proxy-sealed in this container, so `players_meta`
and the ADP loader `backtest/cli.py` uses were replaced by nflverse's own
`import_ids` (gsis→sleeper, position, birthdate). `walk_forward` — the real backtest
projection — needs neither.

## What was measured

For each of 2023 and 2024: `walk_forward` projections built from the two strictly
prior seasons, against realized season totals scored under that season's own league
config by our own scoring engine. Error is expressed as a **ratio**, `actual /
projected`, because an sd fitted on 300-point QBs cannot be applied to a 90-point TE2.

Bands are **projection rank within position**, not ADP. We hold no archived ADP
before 2026-08-09 and a retroactive fetch leaks (exp33); realized draft pick would
fit but can never be applied, since a 2026 player has no pick number until he is
picked. Rank-within-position is the only band that both fits historically and applies
prospectively. It is named `proj_rank_band` for that reason.

## Finding 1 — `proj_sd = 0.25 × mean` understates the spread about 2× everywhere

`build_bundle.py` writes `proj_sd = 0.25 * proj_mean`.

| bound | cells measured | sd_ratio > 0.25 | median sd_ratio | vs shipped |
|---|---|---|---|---|
| EXCLUDED (lower) | 16 | **16 / 16** | 0.530 | 2.1× |
| ZERO-FOLD (upper) | 16 | **16 / 16** | 0.538 | 2.2× |

Not a cell in either variant sits at or below the shipped constant, and the smallest
measured value (0.396, WR 17-32) is already 1.6× it. The understatement is systematic
and one-directional.

## Finding 2 — `proj_ceiling = 1.35 × mean` is below the measured p90 in most cells

13 of 16 cells under the lower bound, 11 of 16 under the upper. Median measured p90
is 1.684 (lower) / 1.611 (upper).

The deeper problem is not the value of the constant. **Any** constant makes
`proj_ceiling` a monotone function of `proj_mean`, so ordering by ceiling and ordering
by value are the same list — which is why `ceiling: 0` in MEASURED_WEIGHTS could not
have come back any other way. The measured p90 ranges **1.171 (TE 33+) to 1.982
(WR 4-8)**, a spread wide enough to invert pairs. That inversion is what makes the
weight measurable at all, and it is pinned by test.

## Finding 3 — walk-forward is biased by band, monotonically

`mean_ratio` (1.0 = unbiased), lower bound:

| band | QB | RB | WR | TE |
|---|---|---|---|---|
| 4-8 | 1.102 | **1.419** | **1.453** | 1.124 |
| 9-16 | 0.962 | 1.252 | 1.196 | 1.098 |
| 17-32 | 0.608 | 1.166 | 1.075 | 1.117 |
| 33+ | **0.479** | 0.658 | 0.640 | **0.522** |

The early bands are projected **low** by ~40% at RB and WR; the deep bands are
projected **high** by roughly 2× at QB and TE. This is a diagnosis of `walk_forward`
/ `REGRESSION_WEIGHT`, which is A's lane — recorded, not touched.

The survivorship exclusion cannot explain the deep-band half: excluding players who
never played makes the tail look **better** than reality, and the tail already reads
0.5. The direction is safe.

## The bias this instrument cannot remove, only publish

`rest_of_season_points` omits a player with no weekly rows rather than zeroing him.
For grading a **policy** that is right and deliberate — `replay.grade()` drops the
pick from N so a recommendation is not punished for a player who was never on a
field. For calibrating **how wrong a projection is** it is backwards: "he never
played" is the single most common way a preseason number turns out wrong.

So both bounds are computed and labelled. 2023: 305 of 749 projected players dropped;
at least 30 played a later season, 275 did not appear again. (The equivalent 2024
split is **not reported** — every dropped player reads "never again" only because
nfl_data_py 404s on 2025, which is an artifact of the fetch, not a fact about the
players.) Since ~90% of the 2023 dropouts never returned, the EXCLUDED bound is much
the closer of the two, and the headline findings hold under both regardless.

## Finding 4 — the top band is not measurable, and that is the constraint to fix

Ranks 1-3 at QB, RB, WR and TE all report `unmeasurable`: n = 6 each, two seasons ×
three players, below `MIN_N = 8`. **The most valuable band on the board is the one two
graded seasons cannot calibrate.**

The cheapest fix is in this lane. `nfl_data_py.import_weekly_data(2025)` 404s on a
stale URL — `backtest/cli.py` already documents this and falls back to
`import_pbp_data` + `grade.weekly_from_pbp`. Recovering 2025 takes graded seasons
from two to three and moves every 1-3 band to n = 9, over the bar. That is the next
unit.

## What this does NOT say about the production board

`draft/projections.py` does **not** use these constants. It computes `season_sd =
proj_mean × player_variance(...)` per player, so the spread already varies by
workload, depth chart, experience, injury and age. The `0.25` / `1.35` constants are
the **backtest** board only, and Findings 1 and 2 are about that board.

The measurement still bears on production, in one specific way. `player_variance` is
bounded by construction — `base × [0.70, 1.45]` — so the largest `season_sd / mean`
it can emit at any input is:

| pos | production max | measured cells above it |
|---|---|---|
| QB | 0.319 | **4 of 4** |
| RB | 0.493 | 3 of 4 |
| TE | 0.522 | 2 of 4 |
| WR | 0.435 | 1 of 4 |

**10 of 16 cells sit above the highest value the production model can produce at any
input**, so at those bands the cap binds rather than the data. That is suggestive, not
conclusive: production projects from provider baselines and walk-forward projects from
prior production, and the provider may simply be more accurate. Settling it needs
projection-vs-actual on the **production** projection.

## Why that test cannot run before January, and what is perishable now

The instrument for it is `draft/data/proj_series.json`, whose earliest snapshot is
**2026-08-09 — four days old**. It is the first archived preseason projection this
project has ever held. Production's own error becomes measurable for the first time in
**January 2027**, and there is no way to make it measurable sooner: the preseason
number is only observable before the season.

Which makes one thing urgent and perishable, in D3's exact sense:
`draft/proj_series.py` caps the archive at `TOP_N = 400`. The board carries 1,759
players and the bands with the largest measured error are `33+`. **If that cap is not
raised before Week 1, the 2026 archive is permanently top-400 and the deep bands can
never be calibrated for this season.** That file is not mine — parked, not edited.
See PARKED.md.

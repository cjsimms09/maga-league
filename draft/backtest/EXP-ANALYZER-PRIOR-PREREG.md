<!-- TERRITORY: A -->
# EXP-ANALYZER-PRIOR — PREREGISTRATION (committed before any result exists)

Cory's hypothesis, verbatim (2026-08-15): *"League analyzer should make record
projections based on that teams actual matchup (once they're locked on sleeper)
using projected points we have for that matchup. Not saying as a statement but
my hypothesis."*

What is already true (verified, not under test): `projectStandings`
(src/routes/standings.js) simulates the remaining season on the ACTUAL
schedule — the real head-to-head pairs per week via `LO.weeklyMatchups`. The
matchup half of the hypothesis shipped long ago. The gap is the SCORES: every
future week draws each team from Normal(mean, sd) whose mean is the team's
HISTORICAL realized scoring, empirical-Bayes shrunk toward the LEAGUE mean
(K=4, a flagged designed-guess). Projected points enter nowhere in-season.

**One code fact this prereg records before results**: the comment in
`projectStandings` says the preseason case is served by `opts.projMeans
{rid: mean}` — but nothing in the function reads `opts.projMeans`. The hook is
documented, not implemented. This backtest therefore mirrors the simulation in
its own lane (with a bit-level parity gate against the shipped function) and
any production wiring is a proposal in the report, never an edit to
src/routes/** or views/**.

## The testable form of the hypothesis

Replace the shrink-toward-league-mean prior with a shrink-toward-
PROJECTED-TEAM-MEAN prior: each team's future-week mean = weighted blend of
(a) a projection-derived expectation for that roster and (b) realized
in-season scoring, weight moving from (a) to (b) as games accumulate — the
identical K=4 schedule, so the ONLY difference between arms is the shrink
TARGET. Early season (the exact window where the shipped model shrinks
everyone toward average because it knows least) is where the hypothesis
predicts the largest gain.

## The projection stand-in, honestly

Real archived player projections do not exist for 2023–25 (established
2026-08-15, draft/audit/projection_skill_backtest_2026-08-15.md; retroactive
fetches leak — exp33). The leak-free stand-in for season Y is the measured
champion baseline, the **0.7/0.3 recency blend** with
model_accuracy_backtest's exact declared semantics:
`blend[pid] = 0.7·total(Y−1) + 0.3·total(Y−2)`, a player with no Y−2 row uses
Y−1 alone; totals are realized weeks-1–17 points under OUR scoring from the
committed weekly stores (`draft/backtest/nflverse_weekly_points_{2023,2024,2025}.json`).

Store coverage forces per-season honesty, fixed now:

| season | prior stores on disk | Arm B status |
|---|---|---|
| 2023 | none (no 2021/2022 store) | **no_prior_store — Arm B unmeasurable**; 2023 grades Arm A vs controls only |
| 2024 | 2023 only | blend degenerates league-wide to its own fallback = 2023 totals alone (naive_prev flavor) |
| 2025 | 2023 + 2024 | full 0.7/0.3 blend |

### Roster vintage (assumption stated before results)

A team's projection prior is summed over its **opening roster = its 15 draft
picks** (league_history.json drafts; keepers occupy picks — verified 150
picks / 10 teams / 15 each, all three seasons; week roster_ids match draft
roster_ids). Limitation, accepted: rosters change in-season (trades, waivers);
this experiment tests the PRIOR's value at each checkpoint, not roster
tracking. Rookies, K and DEF have no prior-store rows and contribute 0 to the
lineup sum (stores are offense-only): K/DEF are near-uniform across teams and
cancel under centering (below); missing rookie value biases AGAINST teams that
drafted strong rookies — a bias against the hypothesis, stated now.

### From player blend values to a team prior mean

- Per team r: `P_r` = maximum sum of blend values over a legal starting
  lineup from r's opening roster under the season's `roster_positions`
  (QB, 2RB, 2WR, TE, FLEX∈{RB,WR,TE}; K and DEF slots score 0). Weekly scale:
  `P_r / 17` (17 = the stores' totals basis, last_scored_leg).
- **Centering (designed-guess, flagged)**: the prior enters as a RELATIVE
  offset anchored to the scale the shipped model already uses:
  `target_r = leagueMean_W + (P_r/17 − mean_league(P/17))`, where
  `leagueMean_W` is the mean of team realized means through checkpoint W (the
  same quantity the shipped shrink target uses). Rationale: best-lineup blend
  sums are on the wrong absolute scale (no K/DEF, no byes/injuries, bench
  never scores), but the hypothesis is about WHICH teams are strong. Offsets
  are used as-is, no fitted rescaling (fitting a scale on outcomes would be
  tuning). A raw, uncentered variant is reported as a secondary diagnostic
  (B_raw) to show what the scale confound does; it is not a decision arm.

## Arms

Identical simulator for all arms (mirrored from `projectStandings`, bit-parity
gated), identical sd (the shipped realized-sd with league-sd fallback),
identical K=4 weight `w = gp/(gp+4)`, identical seeds/sims. Only the mean
differs:

- **ARM A (shipped)**: `mean = w·realized_r + (1−w)·leagueMean_W` — verified
  bit-identical to `projectStandings` output per cell before any comparison
  is trusted (parity gate; a cell failing parity voids the run, status
  `parity_failed`).
- **ARM B (projection prior)**: `mean = w·realized_r + (1−w)·target_r`
  — algebraically Arm A plus `(1−w)·offset_r`.
- **ARM B_raw (diagnostic only)**: `mean = w·realized_r + (1−w)·(P_r/17)`.
- **ARM C (bye/availability-aware, ADMITTED LEAK — diagnostic ceiling only)**:
  per future week t, the lineup sum is recomputed over only the players with
  a week-t row in season Y's store (presence = played). Presence encodes byes
  (legitimate preseason knowledge) AND injuries/inactives (future information
  no checkpoint could know — no 2023–25 player→NFL-team or bye table exists
  anywhere in this repo, so the pure-bye version is underivable offline).
  Arm C is therefore an UPPER BOUND on what any per-week availability signal
  could add; it can never be a shippable arm and its result is interpreted
  only as: if even the leaky ceiling does not beat A/B, per-week availability
  signal is not where the value is.

## Design fixed before results

- Seasons: 2023 (A vs controls only), 2024, 2025. Checkpoints W = 1..12
  (regular season is weeks 1–15; playoff_week_start=16, playoff_teams=4, all
  three seasons).
- Simulator: sims = 3000, seed = 999 + W (the shipped validator's own
  choices), spots = 4. Locked weeks keep real results; future weeks simulate
  on the actual schedule.
- Realized truth: `actualStandings` / `actualPlayoffTeams` from
  src/routes/standings.js (wins, then PF, top 4).

### Metrics (per cell = season × W, each arm)

1. **top4_hits**: |predicted top-4 by playoff_prob (exp_wins tiebreak, the
   shipped sort) ∩ actual playoff teams| ∈ {0..4}.
2. **exp_wins_MAE**: mean over the 10 teams of |exp_wins − actual final
   regular-season wins|.
3. **brier**: mean over the 10 teams of (playoff_prob − made_playoffs)².

### Controls (so "beats" means something)

- `naiveTop4` (current standings through W, the shipped baseline) for
  metric 1.
- Random-set permutation floor for metric 1: E[hits] = 4·4/10 = 1.6.
- Constant-probability Brier floor: p = 0.4 for everyone → 0.24.

### Decision rule

Primary comparison: Arm B vs Arm A, pooled over the 24 B-measurable cells
(2024, 2025 × W 1..12), per metric. Paired two-sided sign-flip permutation
test on per-cell deltas: 20,000 resamples, seed 20260815. **Arm B "wins" a
metric iff the pooled delta favors B AND p < 0.05.** Anything else is
reported as no detectable improvement — including deltas favoring B without
significance, which will be reported as direction-only, never as a win.
Preregistered subgroup (the hypothesis's own predicted window): W ∈ 1..4
pooled, same test, labeled secondary. Per-season splits and per-W deltas are
reported descriptively.

Known power limitation, stated now: cells within a season share the realized
outcome (checkpoints are not independent), so the effective sample is far
smaller than 24; the sign-flip test over cells is the preregistered
instrument anyway, with that caveat traveling next to any p-value.

### Crossover

Per metric: the smallest W such that the pooled per-W delta (B−A) is ≤ 0 at W
and every later W. Descriptive; it calibrates where realized data overtakes
the projection prior (i.e., the blend-weight schedule), it does not gate the
decision rule.

## Lanes and integrity

- No edits to src/routes/**, views/**, netlify/functions/**,
  draft/backtest/learning_loop*, model_update_recommendations.json,
  model_accuracy_backtest.py (imported semantics only, mirrored + tested),
  exp_fp_hist_proj*, public/js/draft/**, roster_room_audit*.
- Namespace: draft/backtest/exp_analyzer_prior* (this file, the means
  builder, the sim runner, the JSON artifact),
  draft/tests/test_exp_analyzer_prior.py,
  draft/audit/analyzer_prior_hypothesis_2026-08-15.md.
- All offline; committed data only. Deterministic seeds throughout.
- The verdict is filed either way: if the projection prior does NOT beat
  league-mean shrinkage, that IS the finding and the report says so.

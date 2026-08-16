# EXP-WEEKLY-ENV — PREREGISTRATION (written 2026-08-15, BEFORE any results existed)

_TERRITORY: A — research doc, this lane._

_Self-directed study under the commissioner's mandate ("the model should be trying to
identify its own things to study … betting data, pace of play, things that help us get
more accurate predictions for players week to week"). This document is committed before
the experiment runs. The results file (`exp_weekly_env.json`) and the evidence write-up
(`draft/audit/self_directed_edge_program_2026-08-15.md`) cite this page; any deviation
from what is written here must be listed there as a deviation, not silently absorbed._

## The two questions (one harness)

**E1 — PACE.** Does adding team + opponent pace (plays per game, computed from strictly
prior weeks of real play-by-play) to a strictly-prior running-average weekly projection
reduce MAE / improve within-week ranking on real 2023–24 player-weeks under OUR scoring?

**E2 — SCORING ENVIRONMENT (the totals-line proxy).** Does the same construction using
prior-weeks realized points-for / points-allowed carry signal? And — via a deliberately
leaked ORACLE arm that uses the actual week-w game total — what is the CEILING a perfect
game-totals line could add to a weekly projection? The oracle arm is the upper bound a
Vegas total could ever deliver here, because a totals line is a (good) forecast of
exactly the quantity the oracle reads off the answer sheet. The oracle arm is labeled
ORACLE everywhere, is a positive control and a bound, and is never shippable.

## Data (availability verified this session, before this prereg was written)

- `nfl_data_py.import_weekly_data([2023])`, `([2024])` — player-weeks with team,
  opponent, position. 2025 is excluded: the weekly loader 404s for 2025 (genuinely
  unpublished to this endpoint) and the local 2025 harvest is sleeper-keyed with no
  team mapping, so 2025 cannot join the team features without a new crosswalk.
- `nfl_data_py.import_pbp_data([2023],[2024])` — reachable (verified: 49,492 rows ×
  397 cols for 2024). Team-week features come from real pbp, not a weekly-aggregate
  proxy.
- Scoring: `grade.nflverse_weekly_to_scoring` + `scoring.score_stat_line` under
  `draft/config/league_config.json`'s scoring block — the same machinery the certified
  graders use. No provider fantasy points.

## Universe and eligibility (declared before running)

- Positions QB / RB / WR / TE. Regular-season weeks only; eval weeks 5–18.
- A player-week is eligible iff: ≥3 prior in-season appearances, prior running mean
  ≥ 5.0 pts (relevance floor — without it thousands of near-zero players dominate MAE
  and flatter every arm), and the player appears in week w.
- **Declared limitation:** grading conditional on appearing in week w means this
  measures per-game scoring accuracy, not availability prediction. Every arm is graded
  on the identical set, so the comparison is fair even though the level is flattered.

## Baseline (the null model every arm must beat)

`proj0(p, w)` = mean of player p's OUR-scoring points over weeks 1..w-1 appearances,
same season. Strictly prior by construction. This is the house running-average
baseline class.

## Arms (all multiplicative on proj0; nothing is fitted to the eval data)

For team T playing opponent O in week w, all team features from weeks 1..w-1 only;
a team with <4 prior games contributes m = 1 (the `nflverse_pace.py` MIN_GAMES
convention). `rel` means ÷ league mean over the same prior weeks.

| arm | multiplier m |
|---|---|
| PACE-RAW | 0.5 × (T offensive scrimmage plays/gm rel + O defensive plays-faced/gm rel) |
| PACE-NEUTRAL | same, neutral-script plays only (\|score diff\| ≤ 14) |
| ENV-POINTS | 0.5 × (T points-for/gm rel + O points-allowed/gm rel) |
| ORACLE-TOTAL | actual week-w game total ÷ league mean week-w total — **LEAKED BY DESIGN, ceiling only** |

Scrimmage plays = `play_type` ∈ {pass, run} minus kneels and spikes; team = `posteam`
(both conventions taken from `nflverse_pace.py`, for the reasons written there).

Each arm runs at two dampening levels, both preregistered, neither tuned:
λ = 1.0 (proj = proj0 × m) and λ = 0.5 (proj = proj0 × (1 + 0.5(m−1))). Prior-week
realized rates are noisy estimators; the λ = 0.5 row exists so "the signal is real but
the unshrunk multiplier overshoots" is distinguishable from "no signal."

## Metrics

1. **MAE** over eligible player-weeks (primary).
2. **Mean within-week Spearman** rank correlation (projection vs realized).
3. **Mean within-week top-decile hit rate** — of the top 10% by projection, what
   fraction land in the top 10% by realized points. The league-winner metric.

## Null baseline and ship rule (house style)

- **Permutation null:** within each week, permute the team → multiplier assignment
  across teams; 200 permutations; record the ΔMAE distribution. The real arm's ΔMAE
  must beat the **null 95th percentile** (pooled).
- **Leave-one-season-out analog** (2 seasons): ΔMAE must be positive in 2023 AND 2024
  separately.
- An arm is declared a **signal** only if it clears both AND does not degrade the
  top-decile hit rate. Even then **nothing installs from this experiment** — a positive
  routes to a separate, gated SHIP decision, per registry rules.
- **Positive control:** ORACLE-TOTAL must improve MAE. If the oracle cannot beat the
  baseline, the harness is broken and no other row means anything.

## Preregistered calibration (the exp-35 mindset: what result sizes would mean)

- Pace multipliers live in roughly ±8%; player-week sigma is large. Expected effects
  are SMALL. A clean null on E1/E2 with a positive oracle is a fully successful
  outcome: it says the environment channel exists but prior-week realized estimates
  are too noisy to capture it — which is precisely the case for a FORWARD test of
  market totals (a sharper estimator of the same quantity), and prices the maximum
  that test could be worth.
- A large (>5%) MAE improvement from any non-oracle arm is suspicious, not exciting —
  treat it as a leak until the strictly-prior mechanics test says otherwise.
- The oracle's improvement is the budget for ALL game-environment information. If the
  oracle adds only ~1–3% MAE, no totals-derived feature can ever add more, and the
  betting-data agenda entry inherits that ceiling as its expected-value cap.

## What this experiment does NOT test

- Player-level betting props (no historical props available on the free tier).
- Availability / injury prediction (conditional-on-playing design).
- Season-long projection improvement (that is agenda item R3, a separate design).
- 2025 (loader unavailable; stated above).

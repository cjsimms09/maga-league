# USAGE-CONDITIONED GAME SCRIPT — THE HALF OF CORY'S ASK THAT ISN'T BUILT YET, PREREGISTERED BEFORE THE RUN

**Session D, 2026-08-20. Owner D (prereg + grade) + A (ship/no-ship). Filed
against `ROUTES.md`'s 2026-08-20 row: "CORY, DIRECT: *we're taking into
account game script for our weekly projections...*" `no_fit_guard` applies —
a FALSE files exactly as loudly as a TRUE, and nothing below moves after a
number has been seen. Not urgent ahead of other work, per the row's own REC;
built carefully on that basis.**

## 0 · WHAT'S ALREADY SHIPPED, NOT RE-LITIGATED

`weekly_own_projection.py`'s live `v1` arm already tilts every player by his
TEAM's Vegas implied total, scaled by a POSITION-level sensitivity constant
`vg[pos]` (imported from `own_model_v5.V5_CONFIG`, never retyped):

    weekly_mean = proj_ownmodel/17 * (1 + tilt_scale * vg[pos]
                                       * (implied_team - mean_implied) / mean_implied)

That is "higher team total → more fantasy points," real and live, at the
position level. **This prereg is only about the layer underneath it:** within
a position, does a bell-cow (high target/opportunity share) benefit MORE from
his team's total moving up than a committee piece at the same position does?
`v1` currently treats every player at a position on the same team identically
regardless of his own role — that is the gap.

## 1 · DATA PREMISE, CHECKED BEFORE ANY FORMULA WAS FIXED (Rule 3f)

Both ingredients the ROUTES row named are on disk, confirmed by direct read,
not assumed:

* **Team implied totals, all 18 weeks, 2021-2025**, not just week 1:
  `draft/backtest/vegas_lines_2021_2026.json` → `seasons["2021"..."2025"]`,
  272/271/272/272/272 rows respectively, every week 1-18 present. Read via
  `weekly_own_projection.implied_from_vegas_store(doc, season, week)` —
  **imported, not reimplemented** (Rule 11); its sign convention
  (`implied_home = total/2 + spread/2`) and its team-code vocabulary are
  reused exactly.
* **Per-player weekly `target_share`/`opportunity_share`, 2021-2025**:
  `draft/backtest/nflverse_usage.usage_shares(weekly_df, season, crosswalk,
  before_season=None)` — **imported, not reimplemented.**

**One real gap found and resolved, not hidden.** `usage_shares()`'s signature
was built for a raw gsis-keyed nflverse frame joined through a gsis→sleeper
crosswalk (`grade.crosswalk_gsis_to_sleeper`). No such raw frame is committed
here — only `draft/backtest/component_stats_<season>.json`, which
`fetch_component_stats.py` already crosswalks to Sleeper ids AT FETCH TIME
(`build_season()`'s `crosswalk.get(gsis)` step, upstream of this file). So
the real gsis→sleeper join-loss risk Rule 3e worries about was already
absorbed before this study ever touches the data — **this tool's own
crosswalk is the identity map** (`{sid: sid for every sid appearing in the
frame}`), and that is correct, not a shortcut, because the ids are already in
Sleeper-space. Column names differ too (`tgt`/`rush_att` vs the function's
expected `targets`/`carries`) — a call-site renaming, the same class of
translation `grade.py`'s `_WEEKLY_MAP` already does for scoring keys, not a
change to `nflverse_usage.py` itself (untouched, per the task's constraints).

**Coverage, measured directly (population counts only — no MAE, no
correlation, no result of any kind was computed before this prereg was
written):**

| target season Y | prior season Y−1 | RB/WR/TE usage rows (`usage_shares` `players`) | unmatched ids | eligible pop. (≥4 games, share + prior PPG) | target-season player-weeks | with a Vegas line | no-line (excluded) |
|---|---|---|---|---|---|---|---|
| 2022 | 2021 | 529 | 0 | 406 | 3,528 | 3,445 (97.6%) | 83 |
| 2023 | 2022 | 505 | 0 | 403 | 3,509 | 3,422 (97.5%) | 87 |
| 2024 | 2023 | 478 | 0 | 382 | 3,586 | 3,484 (97.2%) | 102 |
| 2025 | 2024 | 492 | 0 | 378 | 3,777 | 3,650 (96.6%) | 127 |

**Verdict: the join is clean.** 0 unmatched ids in every fold (identity
crosswalk, as expected), ~380-400 eligible players per fold, 96.6-97.6% of
eligible player-weeks carry a valid team line. The study proceeds as scoped;
this table is the honest coverage record, not a rosy summary — the ~2.5-3.4%
no-line player-weeks are EXCLUDED from grading (never zeroed, never guessed),
named per-fold above, and will be named again with player-ids in the output
artifact.

**QB is scoped OUT, stated plainly.** `usage_shares()` computes
`target_share`/`opportunity_share`, which are meaningless as a within-position
workload signal for a starting QB (his own share of his team's passing plays
is ~1.0 by construction; there is no bell-cow/committee spectrum at the
position the way there is at RB/WR/TE, and `own_model_v5`'s own TE row
already carries `vg=0.0`, i.e. this program has precedent for scoping a
position out of the tilt where it makes no football sense). This interaction
arm is built and graded on **RB, WR, TE only**; the ROUTES row's own two named
examples ("a bell-cow RB," "a 25%-target-share WR") are both inside this
scope.

## 2 · THE FORMULA, FIXED BEFORE THE RUN

**One substitution, stated as loudly as `p151` stated its own**: no historical
`proj_ownmodel` (season-total own-model) snapshot exists for any season
2021-2025 anywhere in this repo (confirmed by `p151_target_share_trend
_2026-08-20.md` §5, independently re-confirmed by grep here — no
`draft/baseline/*.json` or `public/draft_data.json` predates 2026). `v1`'s
`proj_ownmodel/17` cannot be literally reconstructed for a historical
backtest. The substitute, used IDENTICALLY across all three arms below so the
comparison stays apples-to-apples: **`baseline_pg` = the player's own
realized per-game points in season Y−1** (our scoring, from the committed
`nflverse_weekly_points_<Y-1>.json`, summed across weeks present ÷ weeks
present) — a genuinely prior-season, non-leaky, preseason-available number,
exactly the same leakage shape `proj_ownmodel` has (known before Y, uses
nothing from Y). Eligibility requires ≥4 games in Y−1 with recorded points
(`MU_MIN_GAMES=4`, reused from `own_model_v5.py` rather than invented).

`share` = `max(target_share, opportunity_share)` from `usage_shares()` on
season Y−1, `before_season=Y` (enforces the leak guard programmatically, not
just by convention). **This is `projections.player_variance`'s own
bell-cow/committee convention, reused exactly (Rule 11)**, not a new
definition invented for this study.

`pos_mean_share` = the mean `share` over the eligible population at that
position, that fold. `usage_multiplier = clip(share / pos_mean_share, 0.0,
3.0)` — 1.0 for an average-usage player, >1 for a bell-cow, <1 for a
committee piece; the clip bounds a single extreme-share player from
dominating a fold's MAE (realistic shares top out well inside a 3x-mean
ratio at this population size).

`delta(team, week, Y)` = `(implied_team − mean_implied) / mean_implied`,
`mean_implied` = mean over teams WITH a line that week — **identical
arithmetic to `price_week()`**, reused via the imported `implied_from_vegas
_store` plus the same mean-over-lined-teams reduction, not reimplemented.

`vg[pos]` = `weekly_own_projection.VG[pos]`, imported unchanged.

**Three arms, `tilt_scale=1.0` throughout (the champion `v1` arm's own
value — no new scale invented):**

| arm | formula | what it represents |
|---|---|---|
| `no_tilt` | `baseline_pg` | the `own_v6`/season-total stand-in with NO game-script adjustment (`v1_notilt`'s shape) |
| `v1_tilt` | `baseline_pg * (1 + 1.0 * vg[pos] * delta)` | the LIVE `v1` arm's actual formula, position-only |
| `interaction` | `baseline_pg * (1 + 1.0 * vg[pos] * delta * usage_multiplier)` | **the challenger** — usage-conditioned game script |

## 3 · POPULATION AND FOLDS

RB/WR/TE, target season Y ∈ {2022, 2023, 2024, 2025} (four LOSO folds — 2021
cannot be a target since it has no prior season on disk, matching `p151`'s
2021→22 ungradable precedent exactly, here on the PRIOR side instead of the
outcome side). Per fold: eligible players from §1's table, all their
target-season weeks with a recorded actual point value AND a valid team line
that week (no-line weeks excluded and counted, never zeroed — same rule
`price_week()` already enforces for the live arm).

## 4 · METRIC AND DECISION RULE, FIXED BEFORE THE RUN

**Primary: pooled MAE per arm** (`|prediction − actual weekly points|`,
averaged over every eligible player-week in a fold, then pooled n-weighted
across the 4 folds).

`ΔMAE(arm) = MAE(baseline) − MAE(arm)` — **positive means the arm is more
accurate.** Two baselines, both required:

* `ΔMAE_vs_v1 = MAE(v1_tilt) − MAE(interaction)` — the harder bar, since
  `v1_tilt` already captures the shared team-level signal.
* `ΔMAE_vs_notilt = MAE(no_tilt) − MAE(interaction)`.

**Correlation gate (the row's own stated discipline, ≤0.98):** pooled
Spearman ρ(interaction predictions, v1_tilt predictions) and ρ(interaction,
no_tilt), over every eligible player-week across all 4 folds. **Must be
< 0.98 against BOTH** — at or above that, the interaction arm is a costume of
an existing arm and any MAE edge is not to be trusted as a genuine new
signal, reported as a gate failure regardless of the MAE numbers.

**THE BAR — a stated minimum EFFECT SIZE, not a sign-only "beats zero" bar**
(the exact mistake `vegas_team_arm_2026-08-17.md` named and retracted: a
+0.002 ΔMAE cleared a >0 bar and was, in its own author's words, "a
meaningless pass"). Baseline weekly MAE in that study's comparable population
ran 5.67-5.74 points; **0.10 points here is ~1.7-1.8% of that baseline — a
real, pre-declared floor, roughly 15-50x the magnitude that prior mistake let
through**, not a number picked to be clearable.

**The interaction arm is TRUE only if ALL FOUR hold:**

1. Pooled `ΔMAE_vs_v1` ≥ **+0.10** points.
2. Pooled `ΔMAE_vs_notilt` ≥ **+0.10** points.
3. `ΔMAE_vs_v1` is positive in **at least 3 of the 4** individual season
   folds (directional consistency — not a pooled average carried by one
   outlier fold, the same discipline `p151` applied to its per-pair table).
4. The correlation gate clears (< 0.98 vs both baselines).

**What a null looks like, declared now:** a positive-but-sub-0.10 pooled
ΔMAE, a fold split worse than 2-2, a negative ΔMAE in either comparison, or a
correlation ≥0.98 against either baseline — any one of these files as FALSE,
plainly, with the real numbers, exactly as loudly as a TRUE would file. No
comparison run after this commit changes this bar.

## 5 · THE THREE-PART FILING STANDARD (for whoever writes the PREDICTION-LEDGER row — not filed by this session per its constraints)

* **LEARNING TARGET:** whether the war room's weekly-projection tilt should
  gain a usage-conditioning term, or stay position-only — decides whether A
  is asked to wire a new term into `weekly_own_projection.py`'s arm set.
* **SKILL DESIGN:** a paired counterfactual against TWO baselines
  (no-tilt AND the live position-only arm) on identical populations, a
  pre-declared minimum effect size (not sign-only), a correlation gate
  against both baselines, and LOSO folds with a directional-consistency
  requirement across folds — not a single pooled number.
* **CONSEQUENCE ROUTE:** TRUE routes to A for a ship/no-ship call on adding a
  usage-conditioned challenger arm (`v1_usage` or similar) to
  `weekly_own_projection.py`'s `DEFAULT_ARMS`, graded in-season the same way
  every other challenger already is. FALSE routes to: usage-conditioning is
  not worth the added complexity at this population size; the position-only
  `v1` tilt stands as the shipped answer to Cory's game-script question, and
  the finding is filed so nobody re-asks it without new data.

## 6 · WHAT RUNS NEXT

`draft/backtest/game_script_usage_interaction.py`, built after this file is
committed to the working tree, computes exactly the arms and gate above
against the real 2021-2025 data and writes
`draft/backtest/game_script_usage_interaction.json`. Tests in
`draft/tests/test_game_script_usage_interaction.py`. Result reported in
`draft/audit/game_script_usage_interaction_2026-08-20.md`, graded against
this bar exactly as written — a mismatch between what the data supports and
what this file asks for is reported honestly rather than the bar being moved.

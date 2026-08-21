# RED-ZONE/END-ZONE TARGET-QUALITY TILT — PREREGISTERED BEFORE THE RUN

**Session D, 2026-08-21. Owner D (prereg + grade), A (ship/no-ship). Filed
against `ROUTES.md`'s 2026-08-20 relay dispatch, ASK 2: "C's
`target_quality.json` (red-zone/end-zone usage 2021-25) is a genuinely new
axis. Prereg a weekly arm (correlation gate ≤0.98 vs own_v6 as always)
before touching the data — P3/P4 died skipping that step." `no_fit_guard`
applies — a FALSE files exactly as loudly as a TRUE, and nothing below moves
after a number has been seen. No date on this ask; not peeked at before
this file was committed.**

## 0 · WHAT THE STORE ACTUALLY CONTAINS, CHECKED BEFORE A FORMULA WAS FIXED

`draft/backtest/target_quality.json` (`TERRITORY: C`, `target_quality.py`)
carries, per player-week, 2021-2025, 18 weeks/season: `inside_10_targets`,
`inside_10_carries`, `end_zone_targets`, `target_depth` (mean air_yards over
ALL targets that week, not just red-zone ones), `targets_seen`. Verified
live rather than trusted from the header: `seasons` = [2021..2025], 18
weeks/season present in every season, 4505-4657 total player-week rows/season.

**One real gap in how a player enters this store, found before it could
silently bias anything (Rule 3f):** a receiver enters the weekly dict on
ANY target (red-zone or not) — confirmed 100.0% (4235/4235, 2024) against
`component_stats_2024.json`'s own `tgt>0` rows. A rusher enters ONLY on a
real inside-10 carry (stated in the module's own docstring) — confirmed
27.7% (108/390, 2024) against `component_stats_2024.json`'s `rush_att>0`
rows with no target that week. **This is not a join failure — it is the
correct behavior, and the arm below must read "absent from this week's
dict" as `inside_10_carries=0` for a rush-only player, never as excluded or
missing.** Getting this backwards would silently zero out exactly the
signal being tested (a plodding early-down back who never scores would look
identical in the join to one who was simply never checked).

## 1 · ELIGIBLE POPULATION AND POSITION SOURCE (Rule 11: reused, not rebuilt)

**RB/WR/TE only**, same scope as `GAME-SCRIPT-USAGE-PREREG-2026-08-20.md`
and for the same reason: a starting QB's own red-zone role isn't a
bell-cow/committee spectrum the way a skill player's is, and the QB
red-zone signal (rushing TDs aside) is a different question than this one.

**Position source: `component_stats_<season>.json`'s own `pos` field per
player-week** — not a new crosswalk, not `LO.inferPositions()` (which is
scoped to players who were ever ROSTERED in this specific league's own
Sleeper history, a survivor-biased population wrong for this study, per the
same gap already named and NOT worked around in the still-open weekly-boom-
baseline item). `component_stats` already carries a full-slate position
label per player per week from its own fetch, sidesteps that gap entirely,
and is Sleeper-id-keyed — the same id space `target_quality.json` uses (no
crosswalk needed to join the two).

**Eligibility for a player-week:** `pos` ∈ {RB, WR, TE} AND (`tgt>0` OR
`rush_att>0`) that week in `component_stats` — i.e., he did something
touchable that week; a healthy scratch contributes nothing to either side of
this study and is correctly excluded, not zeroed.

## 2 · THE FORMULA, FIXED BEFORE THE RUN

**Same `baseline_pg` substitute as the game-script prereg, for the same
reason:** no historical `proj_ownmodel` snapshot exists for any season
2021-2025 (re-confirmed here, not re-asserted from memory). `baseline_pg` =
player's own realized PPG in season Y−1, from `nflverse_weekly_points_<Y-1>
.json`, ≥4 games recorded (`MU_MIN_GAMES`, imported from `own_model_v5.py`,
not reinvented).

**The leak-free trailing feature, within-season (this is where this study
differs structurally from the game-script one — the signal is a role that
can move WEEK TO WEEK, not a season-level share fixed at Y−1):**

    rz_opps(player, week) = inside_10_carries + inside_10_targets
                             (that week's row; 0 if absent, per §0)

    rz_rate(player, week) = mean(rz_opps over STRICTLY PRIOR weeks,
                                  same season) — same "update AFTER this
                                  week" leak guard `lineup_edge_backtest.js`
                                  already implements, reused by construction
                                  (a Python port of the identical rule, not
                                  a new leak policy)

    eligible only once a player has ≥3 prior-week rows this season
    (an earlier floor than the game-script study's season-level Y−1
    population needed, because this is a within-season running stat with
    fewer observations to stabilize on — stated now, not tuned after a look)

`end_zone_targets` and `target_depth` are measured and reported alongside
the primary result as an EXPLORATORY secondary read, never blended into the
primary arm — keeping the falsifiable claim to one number is the discipline
P3/P4 skipped.

`pos_mean_rz_rate(pos, week, season)` = mean `rz_rate` over the eligible
population at that position, that week, that season (matches the
`usage_multiplier` convention of the game-script prereg exactly).

`rz_multiplier = clip(rz_rate / pos_mean_rz_rate, 0.0, 3.0)` if
`pos_mean_rz_rate > 0`, else `1.0` (an early-week fold with too few prior
games for a stable position mean — declared, not silently zeroed).

**One arm, `tilt_scale = 1.0`** (the champion `v1` arm's own value, and the
game-script prereg's value — no new scale invented for this study):

    rz_tilt = baseline_pg * (1 + 1.0 * (rz_multiplier − 1.0))

## 3 · POPULATION AND FOLDS

RB/WR/TE, target season Y ∈ {2022, 2023, 2024, 2025} — four LOSO folds.
2021 is excluded for the SAME reason as the game-script study: `baseline_pg`
needs a Y−1 season, and 2020 data is not on disk here. (The within-season
`rz_rate` feature itself does not need a prior season, but the baseline the
arm is built on does — the binding constraint is `baseline_pg`'s, not
`rz_rate`'s, stated so nobody re-derives this fold count assuming the wrong
reason.) Per fold: every eligible player-week (§1) with a recorded actual
point value that week, `baseline_pg` computed, and at least 3 prior-week
rows this season for `rz_rate` — weeks 1-3 of every season are structurally
ineligible for the tilted arm and are excluded from THAT arm's MAE only
(the baseline is still gradable on those weeks and its full-season MAE is
reported separately alongside the restricted-population comparison, so an
early-season sample-size gap doesn't get silently absorbed into a rosier
pooled number).

## 4 · METRIC AND DECISION RULE, FIXED BEFORE THE RUN

**Primary: pooled MAE** (`|prediction − actual weekly points|`), n-weighted
across the 4 folds, restricted to weeks where `rz_tilt` is defined (§3).

`ΔMAE = MAE(baseline_pg) − MAE(rz_tilt)` on the IDENTICAL restricted
population — positive means the tilt is more accurate.

**Correlation gate, run twice (ASK 2's own stated discipline, ≤0.98):**
Pooled Spearman ρ(`rz_tilt`, `baseline_pg`) — catches a tilt so small it's
functionally a relabeling of the baseline. AND ρ(`rz_tilt`,
`interaction`) — the ALREADY-GRADED usage-conditioned game-script arm
(P286/GRADED FALSE, same eligible-population family) — because
`target_share`-style usage and red-zone opportunity share are plausibly the
same underlying "workload" signal wearing two names; if ρ ≥ 0.98 here, this
study would be re-discovering P286's already-retired axis, not a new one,
and must say so rather than claim a second independent finding. **Must be
< 0.98 against BOTH** or the arm files as a costume regardless of its MAE.

**THE BAR — a stated minimum effect size**, same magnitude floor and same
justification as the game-script study (baseline weekly MAE in that
comparable population ran 5.67-5.74 points; **+0.10 points here is the same
~1.7-1.8% floor**, not a number chosen after seeing a result, and not
re-derived smaller just because this population is different — if the
honest baseline MAE for THIS restricted population differs materially, that
number is reported and the 0.10 floor is kept, not rescaled, so the bar
can't be adjusted around the answer).

**The `rz_tilt` arm is TRUE only if ALL THREE hold:**

1. Pooled `ΔMAE` ≥ **+0.10** points on the restricted (weeks-4+) population.
2. Positive in **at least 3 of the 4** individual season folds.
3. Both correlation gates clear (< 0.98 vs `baseline_pg` AND vs the P286
   `interaction` arm).

**What a null looks like, declared now:** sub-0.10 pooled ΔMAE, a worse
than 2-2 fold split, a negative ΔMAE, or either correlation ≥0.98 — any one
files as FALSE, as loudly as a TRUE, with the real numbers. No comparison
run after this commit moves this bar.

## 5 · THE THREE-PART FILING STANDARD

* **LEARNING TARGET:** whether red-zone/end-zone opportunity share is a
  worthwhile SEPARATE weekly-tilt input, or whether it's redundant with the
  usage-share axis P286 already tested and retired — decides whether A is
  asked to wire a new term into `weekly_own_projection.py`'s arm set, or
  whether this closes the "genuinely new axis" question with a documented
  null instead.
* **SKILL DESIGN:** paired counterfactual against the Y−1-PPG baseline, a
  pre-declared minimum effect size (not sign-only), a directional-
  consistency requirement across 4 LOSO folds, and — the piece specific to
  this study — a correlation check against an ALREADY-GRADED sibling arm
  (P286) rather than only against the flat baseline, so the finding can't
  double-count a signal this program has already measured under a different
  name.
* **CONSEQUENCE ROUTE:** TRUE → A gets a ship/no-ship call on adding a
  red-zone-conditioned challenger arm to `weekly_own_projection.py`,
  distinct from and stacked alongside the position-only `v1` tilt. FALSE →
  filed as: red-zone opportunity share, at this population size and with
  this leak-free construction, is not a worthwhile standalone tilt input;
  the axis is closed and not re-asked without new data (matching how P286
  closed the usage-conditioning axis).

## 6 · WHAT RUNS NEXT

`draft/backtest/target_quality_tilt.py`, built after this file is committed,
computes exactly the arm and gates above against the real 2021-2025 data and
writes `draft/backtest/target_quality_tilt.json`. Tests in
`draft/tests/test_target_quality_tilt.py`. Result reported in
`draft/audit/target_quality_tilt_2026-08-21.md`, graded against this bar
exactly as written.

<!-- TERRITORY: A -->
# LEARNING-LOOP CLOSURE — 2026-08-15

The ruling this executes, Cory verbatim, replying to the audit finding "the
loop grades, but nothing learns yet... no model parameter consumes any of it":
**"We need to fix!!!"** — and on projections: **"Should we use same projector
for 2025 then compare how close. If we're lacking something or not taking
something into account, if we can make better."** Two missions; every number
below is from a command run today in this worktree, board `86e42bc2`.

---

## MISSION 1 — THE ARCS, CLOSED

### The map AFTER this change: every grade artifact → its consumer → what it moves

| grade artifact | written by | consumer NOW | what it moves |
|---|---|---|---|
| `projection_error_calibration.json` (C's 20 measured cells) | projection_error.py | **`projections.blend()` — production caller, LIVE** (REC-1 applied) | `proj_sd` on every board row with a measured (position, rank-band) cell; ceiling/floor/weekly_sd derive from it; `proj_sd_source` declares the path per row |
| `evidence_weights:current` (era-stamped) | grade-cron (Tue 12:00 UTC) | **weights-read.js (read-only expose) → weekly_grade_runner.js (Tue 13:30 UTC mirror) → `evidence_weights_latest.json` → learning_loop.py** | REC-4's block in `model_update_recommendations.json` — the RECOMMENDATION artifact, era stamp carried; live-parameter consumption stays a design ruling for Cory (said in the artifact itself) |
| `calibration:{season}:{ISO}` snapshots | grade-cron | /accuracy, /member, /standings pages **+ the weights consume above** (grade-cron folds the ledger into the weights it writes) | human surfaces + the weekly weights that now flow to the artifact |
| `model_accuracy_2025.json` (v1's standing negative) | model_accuracy_backtest.py | learning_loop.py → REC-3 | the promotion BLOCK on proj_ownmodel |
| `model_accuracy_v2.json` (NEW) | own_model_v2.py | learning_loop.py → REC-3's `promotion_bar.candidates` | the promotion bar verdict (below) — machinery, not memory |
| `component_grades.json` | component_write.js via weekly runner | standing_check.py + accuracy surface | monitor row (all rows still honestly `no_data` until week 1) |
| REC-2 unlock condition | — | **weekly_grade_runner.js `rec2UnlockCheck()` + `unlock_progress` in the artifact** | prints `REC-2: 0/17 graded 2026 weeks — unlocks ~2027-01` every Tuesday; blocked can no longer mean forgotten |
| `model_update_recommendations.json` itself | learning_loop.py | **regenerated weekly by the runner (workflow commits it)** | the one artifact rulings act on, refreshed by machinery |
| analyzer checkpoints (`analyzer-checkpoint-v1` forecasts) | analyzer-cron (Sun 13:05 UTC) | **analyzer-cron's NEW resolution pass** — every Sunday counts pending by name; at season-final runs `resolvePlayoff`/`resolveExpectedWins` over unresolved checkpoints once, forecast_key-deduped, each claim against its OWN pinned `subject.spots` cut, this run's emissions excluded | `forecast_resolution` rows grade-cron then Brier-scores into the calibration ledger — the arc had both ends built (emitter since 08-15 AM, resolvers in analyzer_claims.js) and NO scheduled middle |

### REC-1 — applied, with the re-verification the fresh board demanded

The decision-arm evidence predated tonight's board, so the arm was RE-RUN
first (isolated tree, `draft_plan.js` unmodified, C's measured table applied
to a board copy, control: 455/527 rows moved): **roles identical at all twelve
seats, zero starter seats move, the same four bench flips as the original
measurement** (68 Stevenson→Pollard, 88 Reed→Sutton, 93 Purdy→Love,
148 Higgins→Shakir; total 1242.1→1261.7). Application condition held →
wired. `PROJ-SD-DECISION-ARM.md` addendum carries the full record; named
before/after (mean unchanged, next rebuild ships it):

| player | pos rk | sd | ceiling | floor |
|---|---|---|---|---|
| Josh Allen | QB1 | 89→111 | 498→520 | 345→331 |
| Jahmyr Gibbs | RB1 | 117→170 | 466→521 | 266→231 |
| Puka Nacua | WR1 | 84→69 (tightens — measured other-way cell) | 385→369 | 241→251 |
| Jordan Love | QB17 | 71→185 (the streaming-range case) | 396→514 | 275→198 |
| Tony Pollard | RB24 | 61→103 | 231→275 | 127→98 |

Guards: `test_proj_sd_wiring.py` (6 checks incl. no-calibration fail arm),
`proj_sd_arm.test.js` rewritten to pin the applied disposition and to read the
board's own `proj_sd_source` so it is green before AND after the rebuild.

### What still physically cannot learn, dated

- **REC-2 (source weights):** blocked until `nflverse_weekly_points_2026.json`
  fills — first graded week ~2026-09, decision-grade in **January 2027**
  (weeks 1-17 per the prereg). Now machine-checked weekly.
- **Evidence-weights mirror:** the reader is wired and degrades by name; the
  first real mirror lands once `SITE_URL` (repo variable) + `GRADE_CRON_KEY`
  (secret) are set for the workflow and grade-cron has produced a snapshot.
  One human config step; nothing else blocks on it.
- **Component grades / in-season decision kinds:** all rows honestly `no_data`
  until **Week 1** (first real lineup/waiver/stream decisions resolve).
- **Analyzer checkpoints:** emit from the first completed 2026 week; resolvable
  only at regular-season final (**~January**, per each claim's own resolution
  rule) — until then every Sunday run reports the pending count by name.
- **Season-long promotion evidence:** the next season the v2 protocol can
  grade with TWO prior committed seasons is 2026, in **January 2027**.

---

## MISSION 2 — A PROJECTOR THAT HAS TO EARN IT

Protocol preregistered in `own_model_v2.py` and committed BEFORE the results
artifact (commit order is the proof). Leak-free by construction (`_assert_no_leak`
raises; test fail-arm). Features honestly available from committed disk: season
totals, games, late-season (weeks 10-17) per-game trend, board-derived age
(354/502 covered, rest neutral). Named as NOT computable: usage/target/carry
trends (stores carry points only), TD-rate regression (no TD counts),
team-change flags, and any leak-free refit of the 0.7/0.3 blend weights (no
2022 store) — the blend's knob stays DECLARED.

v2 = per-position OLS (intercept, age-adjusted blend, trend, games) fitted on
the single strictly-prior transition 2023→2024, applied to 2024-based features.

### 2025 arm — shared population, MAE / Spearman (`model_accuracy_v2.json`)

| pos | n | **own_v2** | walk_forward v1 | naive_prev | recency_blend |
|---|---|---|---|---|---|
| QB | 58 | 76.14 / .7166 | 103.88 / .6712 | 78.89 / .7080 | **74.09 / .7213** |
| RB | 97 | **41.19 / .7686** | 56.40 / .7349 | 42.82 / .7523 | 42.55 / .7587 |
| WR | 149 | **34.08 / .7461** | 46.68 / .6869 | 37.39 / .7288 | 36.70 / .7293 |
| TE | 83 | 23.81 / **.7760** | 34.00 / .6852 | 26.96 / .7403 | 24.27 / **.7826** |

### 2024 arm — declared skeleton only (no strictly-prior transition exists)

Beats v1 at all four positions; does NOT beat naive at QB/WR/TE — evidence the
FITTED shrinkage, not the skeleton, does the work. Blend degenerates to naive
for 2024 (no 2022 store); the artifact labels the whole arm declared-skeleton.

### The honest verdict

- v2 **beats v1 everywhere, by a lot** (MAE −27% to −38% per position).
- v2 **beats naive_prev at 4/4** positions on both metrics.
- v2 **beats the recency blend at RB and WR** on both metrics; **loses to it at
  QB** (76.14 vs 74.09 MAE, .7166 vs .7213) **and at TE on Spearman**
  (.7760 vs .7826; v2 wins TE MAE).
- **Promotion bar (beat BOTH baselines, ALL 4 positions, BOTH metrics):
  DOES NOT CLEAR — 2/4.** `proj_ownmodel` stays display-only; no promotion
  decision file is written; REC-3 stands with the v2 verdict recorded in
  `promotion_bar.candidates`. One-season n and the fit rests on a single
  transition — both stated in the artifact.
- What would plausibly close the QB gap is exactly what the stores cannot
  provide: TD-rate regression (QB points are TD-heavy) and usage trends.
  Named for the January 2027 re-run, when the 2026 store adds a second
  transition to fit on.

## SUITE RESULTS

See final commit message: `python3 -m pytest draft/tests -q` and
`bash scripts/js-sweep.sh`, both run after all changes.

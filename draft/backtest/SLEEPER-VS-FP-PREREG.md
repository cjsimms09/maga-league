<!-- TERRITORY: A -->
# SLEEPER vs FANTASYPROS vs own_v6 — STEP 3 PRE-REGISTRATION

**Committed before the grading module exists and before any three-way number
exists.** Commit order is the proof. Licensed by, and only by, step 2's
verdict: `draft/audit/sleeper_vs_fp_grade_2026-08-16.md` — Sleeper's 2025
projection passed every preregistered leak gate; 2023 and 2024 did not and are
**not** graded here.

## WHAT CHANGED SINCE THE LAST ATTEMPT

`draft/audit/proj_mean_blend_2026-08-16.md` §1 refused this exact test at its
constructibility gate, for two named reasons. **Both are now gone:**

| blocker, as written on 2026-08-16 | status |
|---|---|
| *"Sleeper (control): NO per-player 2023/24/25 — never archived by anyone"* | **FALSE.** `/projections/nfl/regular/2025` serves it; leak-gated clean. |
| *"FantasyPros: committed only per-position aggregates; the per-player rows were deliberately not retained. Re-fetching is CI-only egress and is unreachable from here"* | **Reachable — from CI.** This runs in CI. §9.2 of that document asked for exactly this: *"If a future egress run is dispatched, retain them."* |

own_v6 was never the blocker; it is reproducible offline.

**So the three-way grade is constructible for 2025, and only for 2025.**

## THE SEASON LIMITATION, DECLARED BEFORE THE RUN

**own_v6 exists for 2025 and no other season.** It needs two prior seasons of
weekly points; `nflverse_weekly_points_2021.json` and `_2022.json` do not
exist, so 2024 cannot be predicted leak-free from the committed point stores.
**This is stated as a limitation, not worked around.** One season is not a
stationary measurement of a source's skill and nothing produced here may be
read as one.

> **⚠️ CORRECTION, 2026-08-18 (A) — the STATED REASON above was superseded 86
> minutes after this prereg was committed; the CONCLUSION stands.** The
> 2021/2022 weekly-points stores were built at 08-17 00:20 (`199103e4`,
> *"the N=1 limit is gone"*) — all five stores are on disk. own_v6's coverage
> is therefore NO LONGER the binding limit. **The binding limit is Sleeper's
> leak gates**: 2023 and 2024 fail them independently (`sleeper_hist_proj.json`,
> *"1/3 season(s) passed every leak gate: [2025]"*), so the THREE-WAY grade is
> still N=1 exactly as declared. What changed: any study not needing Sleeper —
> own_v6 vs FantasyPros alone — now has 2023, 2024 and 2025 available. The
> preregistered sentence above is left as written because it was the design's
> honest basis at commit time; this note is the correction beside it, per the
> relay's 08-18 route.

Sleeper's 2023/2024 are refused by step 2 in any case, so even a two-source
multi-season grade is unavailable. **N = 1 season. That is the ceiling of this
evidence and it is fixed here, before the numbers.**

---

## THE ARMS

| arm | source | construction |
|---|---|---|
| **A_sleeper** | Sleeper `/projections/nfl/regular/2025` | scored with `scoring.score_stat_line` under `fetch_component_stats.frozen_scoring_table()` |
| **A_fp** | FantasyPros 2025 season projections | re-fetched in CI via `fantasypros_adp.fetch_projections(2025)`, crosswalked to Sleeper pids by `adp.match_player`, scored under **the same table** |
| **A_own6** | own_v6 | rebuilt offline from its committed helpers via `proj_mean_blend._probe_models()` (imported read-only), with that function's own reproduction check reported |
| **A_equal** | equal-weight blend | mean of the three, on the shared population |
| **A_weighted** | position-weighted blend | weights ∝ 1/MSE per position, fitted by **2-fold cross-fit over players** so no player is graded under a weight his own error helped choose |

**Provider-printed totals never grade.** Sleeper's `pts_half_ppr` and FP's
`fp_fpts` encode their own default leagues. Every number in this study comes
from one scorer and one table.

## THE POPULATION

**PRIMARY — the SHARED population.** A player is graded iff **all** hold:

1. all three single-source arms give him a value;
2. `component_stats_*.json` gives him a position in **QB / RB / WR / TE**;
3. `nflverse_weekly_points_2025.json` carries ≥ 1 week-1..17 row for him.

The shared population is the primary denominator because **it is the only one
on which "source X beats source Y" is one quantity.** Different coverage means
different players, and a source graded on an easier subset is not better, it is
elsewhere. `proj_mean_blend` §2 measured what coverage differences do to a
board; this design removes that channel entirely.

**SECONDARY — per-arm own-coverage cells**, reported beside the shared cells so
a reader can see what each source is being denied by the intersection.

**ABSENT IS NOT ZERO.** Every exclusion is counted and named:
`excluded_no_position`, `excluded_no_weekly_row`, `excluded_not_in_all_arms`
(per arm). No unmatched player is ever scored 0.

`MIN_N = 10` per position cell. Below that: `unmeasurable`, reported, never
omitted or pooled.

**Named survivorship limit, from step 2:** Sleeper's 2025 file is **7.1 %
hollow** (rows present, stat lines emptied), disproportionately players who
have since left the league. Every arm is graded on the same intersection, so
the filter cannot favour one source — but the whole study sits on a population
that is easier than the true one, by an amount nobody can bound.

## THE METRICS — fixed here

Per arm, per position, on the shared population:

- **Spearman ρ** (`lab_projections.spearman` — the repo's one implementation).
  **This is the headline metric and the reason is the use:** `proj_mean` drives
  VORP, dollars and ordering, and a draft board is an ordering.
- **MAE** — level accuracy. Matters for dollars, not for ordering.
- **bias** = mean(projection − realized). Signed, so over-projection is visible.
- **top-12 / top-24 / top-48 precision** = |{top-N by projection} ∩ {top-N by
  realized}| / N, within position. Computed only when `n ≥ N`; otherwise
  `unmeasurable`, never silently dropped to a smaller N.

## THE DECISION RULE — fixed before the numbers

1. **The winner at a position is the arm with the highest shared-population
   Spearman at that position.** Ties inside **0.01 ρ** are declared **TIED** and
   not broken by a second metric chosen after the fact.
2. **A blend "wins" only if it beats the better single parent at that position**
   — not if it beats the average of the parents, and not if it beats the worse
   one.
3. **MAE, bias and top-N precision corroborate; they do not overturn ρ.** If
   they disagree with ρ, the disagreement is reported as a disagreement.

## THE MECHANISM CHECK — mandatory, and it must be reported either way

`proj_mean_blend` §5 established that our sources sit in the regime where
averaging does not pay: Sleeper-vs-FP rank agreement **ρ = 0.9327**, median
pairwise error correlation **0.9439**, and the equal-weight blend beat the
better parent in only **31 of 112** measured cells (37 of 112 even
position-weighted).

**So: measure the per-position error correlation between every pair of arms on
the shared population, and report it beside the blend result.**

> **If a blend wins anyway, the write-up must state explicitly why that is
> consistent with the error correlation measured HERE** — and if it is not
> consistent, say that instead of taking the win. A blend that beats its
> parents in a 0.94-correlated regime is more likely to be one season's noise
> than a mechanism, and the honest report says so.

## PREDICTIONS, MADE BLIND

- **P1.** Sleeper and FantasyPros land **within 0.05 ρ of each other** at every
  position. They are two consensus products of the same industry.
- **P2.** **No blend beats the better single parent at more than one of the four
  positions**, because §5's correlation regime has not changed.
- **P3.** own_v6 wins **at most one** position outright, most likely RB or TE
  (where `proj_mean_blend` §5c found it beat FantasyPros on ordering), and
  loses QB, where FantasyPros was clearly better (0.7515 vs own_v6's 0.7225).
- **P4.** Sleeper's over-projection bias (measured +5.78 RB, +13.07 WR at
  step 2) persists on the shared population — i.e. **the shipped source
  over-projects**, which would be the first direct measurement of the thing
  `proj_mean_blend` §2 could only infer sideways.

## WHAT WILL NOT HAPPEN, WHATEVER THE RESULT

- **Nothing ships.** No change to `proj_mean`, VORP, replacement level, tiers,
  dollars, ordering or the board comes out of this task, six days before the
  draft. If a winner is identified it becomes a **`DECISIONS-NEEDED.md`** item
  describing the prepared diff, and **Cory rules**.
- **No threshold, population rule or decision rule above is moved after seeing
  a number.** A rule that turns out to be wrong is recorded as wrong — as
  step 2's marker gate already was — and the next preregistration writes a
  better one.
- **A refusal is filed as the answer.** If the FantasyPros re-fetch fails, that
  arm is reported ABSENT with its diagnostic, the remaining two are graded, and
  the missing arm is not silently replaced by the committed per-position
  aggregates (a different quantity wearing this one's name).
- **No 2023 or 2024 number is computed**, notwithstanding my own belief that
  their refusals are my marker gate's fault. See the step-2 verdict.

# DEFECT REGISTER — every open data/logic concern, with an owner

**Cory, 2026-08-17:** *"it's also your job to make sure nothing gets left behind
or not chased down, especially potential data or logic errors or anything that
messes with our models draft or inseason tools."*

Every row has an **owner** and a **next action**. A row with neither is a defect
in this file. `draft/tests/test_defect_register.py` fails if one appears.

**Status words mean one thing each:** `OPEN` = nobody has looked since it was
filed · `IN HAND` = someone is on it now · `WAITING` = blocked on a named person
or date · `CLOSED` = fixed and verified, kept for the record.

---

## 🔴 BLOCKING — draft-critical, this week

| # | what | owner | status | next action |
|---|---|---|---|---|
| 1 | **Board has not published since 08-15.** Gate refuses the fresh board. | **A** | IN HAND | Build fresh board; confirm rows 2 and 3 below before regenerating anything. |
| 2 | **A new field joined the constant-multiple family** on the fresh board. This is the ceiling-defect class by name — a field that is a rescaled copy of another cannot be weighted independently. | **A** | OPEN | Run `test_constant_multiple_sweep` on a fresh board; NAME the field. Do not regenerate to green. |
| 3 | **Board's published ranks disagree with its own vorp ordering** (`test_A_ZERO_BONUS_REPRODUCES_THE_BOARDS_OWN_RANKS`). No artifact involved — internal inconsistency in the board Cory drafts from. | **A** | OPEN | Same fresh board; identify which players' ranks disagree. |
| 4 | **`main` CI red** on `matchup_placed_bet` (3) and `trashtalk` (3), since 08-16 23:01. A red main means the gate has confirmed nothing for anybody. | **B** | OPEN | Verify whether B's `/matchup` fix cleared it; if not, fix. |

## 🟠 CORRECTNESS — known wrong, deliberately held

| # | what | owner | status | next action |
|---|---|---|---|---|
| 5 | **`MEASURED_WEIGHTS.ceiling = 0` is contradicted by measurement.** Three preregistered runs, two independent seed sets, every value 0.15–0.65 beats the shipped zero, 3/3 separable. | **Cory** | WAITING (after 08-22) | Cory rules. Framing: the model ignores upside entirely; the exact amount hardly matters. |
| 6 | **ADP-sd ratchet fired** — shipped rule is 1.39× FFC's published dispersion in the 50–100 band. Our constant did not drift; the market tightened. Blast radius: 1 player. | **Cory** | WAITING | Recommendation: leave it, revisit post-season. |
| 7 | **`risk` weight is UNMEASURED** and the term is PARTIAL on backtest boards (age only, 6 of production's 11–13 distinct values). | **A** | OPEN | No date. Needs a prereg before any measurement, or an explicit "stays zero" ruling. |
| 8a | **The dollar model was not re-derived after the ceiling changed.** `playerDollars`' `boom = ceiling − mean` moved: boom's share of a player's total fell **47.2% → 34.9%** (median), every total moved **−18.8%** median, **464 of 603 players moved >10%**. Coefficients 0.22/0.08/0.05 were chosen at the old scale. | **A** | OPEN | Re-derive, post-08-22. Until then the figures are RELATIVE ONLY — which the code says and every surface must keep saying. `ceiling_change_downstream_2026-08-17.md` |
| 8b | **The board carries TWO ceiling constructions** — 530 `measured-2023-25-p90`, 73 `gaussian_z` — and `playerDollars` reads the field, not the `proj_ceiling_source` stamp, so it treats them identically. | **A** | OPEN | Decide whether the 73 should be excluded from dollar figures or the difference surfaced. |
| 8c | **`champodds`, the bench ceiling floor, and every `proj_floor` consumer** were calibrated against the pre-08-17 distribution and have not been re-checked. The floor has had LESS attention than the ceiling, not more. | **A** | OPEN | Same rule: anything reading proj_ceiling/floor/sd/weekly_sd is suspect until re-measured. Measuring is not shipping. |
| 8 | **own_v6 — the live model — has 22.7% of its forecasts excluded from its own accuracy score** (115 of 506; walk_forward 211 of 737). MAE is optimistic by an unmeasured amount. | **A** | WAITING (after 08-22) | Prereg written: `SURVIVORSHIP-BOUND-PREREG.md`. Headline is ranking stability, not a corrected MAE. |

## 🟡 DATA — stores and coverage

| # | what | owner | status | next action |
|---|---|---|---|---|
| 9 | **2025 cannot be graded** — lateral handling in the pbp rebuild. The 2-point gap is fixed (mean_abs 0.489 → 0.149); laterals are what still blocks. | **A** | OPEN | Unlocks a second grading fold. Post-draft. |
| 10 | **No weekly-points store for 2022 / 2021.** The single reason every own-model artifact grades exactly one season. | **C** | IN HAND | Build `nflverse_weekly_points_2022.json`. |
| 11 | **Board-derived artifacts are not in the freshness registry** — 13 entries, none of them the ones that refuse publication. This is the whack-a-mole. | **A** | OPEN | Register only the genuinely derived ones. **Never** auto-regenerate a board assertion (rows 2, 3). |
| 13 | **`snap_counts` feeds `projections.py` and NOTHING grades its contribution.** We cannot say whether it helps, hurts, or does nothing — the same shape as a weight set by an experiment that could not fail. | **D** | OPEN | Grade the snap-share contribution, or state why it is unmeasurable. `DATA-LIFECYCLE.md` step 6. |
| 14 | **`routes_*` is captured weekly and reaches no prediction.** The WIRING is undecided. The capture is not in question. | **D** | OPEN | Prereg a routes feature and measure it. **The weekly job keeps running regardless** — 2026 cannot be re-fetched next year. If the measurement is null, attach a re-test trigger and keep capturing. |
| 13b | **`snap_counts` — same shape, same answer.** Feeds `projections.py`, ungraded. | **D** | OPEN | Grade the contribution. A null grades the *wiring*, never the store. |
| 15 | **`advanced_stats_*` (air yards / EPA / CPOE) and `historical_props_*`** — studies ran, wiring was never decided either way. | **D** | OPEN | Record a decision with a measurement behind it, the way pace and Vegas were closed — **plus a re-test trigger**, which neither of those has. |
| 16 | **TWO unreconciled copies of the same Vegas lines.** `vegas_lines_2021_2026.json` (nflverse *schedules*, 6 seasons, 1,426 games, closing) and the `spread_line`/`total_line` columns inside the pbp pull (3 seasons, 854 games incl. post). Nobody has checked they agree. | **D** | OPEN | Join on (season, week, home, away) and diff. **This check CAN fail** — unlike constant-within-game, which is true by construction. A disagreement means one copy feeding something is wrong. |
| 19 | 🔴 **THE FP-vs-FFC ADP COMPARISON NEVER HAPPENED — IT COMPARED FANTASYPROS TO FANTASYPROS.** `exp_fp_board_coverage.py` builds a map it *names* `ffc_rank` from the board's `raw_adp`, then intersects it with freshly-fetched FP. But at that probe's own commit the board carried **334 players `adp_source: fantasypros` and 4 `ffc`** — `raw_adp` was already FP. Hence ρ = **exactly 1.0000**, and `coverage_overall` 0.191 ≈ the FP-sourced count, not a real overlap. Same defect class as `ceiling`: a field correlated against a copy of itself, reported as a finding. **The go/no-go that wired FP as the board's primary ADP anchor rests on this number.** | **A** | 🔴 OPEN | Rename the variable to what it holds, re-run against a genuine FFC pull, and re-decide the anchor on a real comparison. |
| 19b | **That same verdict cannot fail.** The f-string emits `"ρ={rho} vs FFC means the swap MOVES picks (not cosmetic)"` for ANY ρ — and the reading is backwards regardless: ρ=1.0 is *identical ordering*, i.e. maximally cosmetic. | **A** | OPEN | Four-branch `verdict_for(rho)` like `stack_sweep.verdict_for`, plus the known-positive control. |
| 18b | **The Vegas oracle's optimum sits at the EDGE of a two-point grid.** `DAMPENING = (1.0, 0.5)`, and λ=0.5 wins (+0.23 pooled vs +0.13 at λ=1.0). 0.5 is the grid **minimum**, so the true optimum is unmeasured below it and the "+0.23 ceiling" is a floor on the ceiling. Worse: **an ORACLE that improves when shrunk toward no-op indicates the multiplicative form is mis-specified**, not that game environment is weak — perfect information should not need damping. | **D** | OPEN | Extend the grid below 0.5 (0.35/0.25/0.15) to a real interior optimum. nflverse egress verified reachable today (HEAD 200), so the re-run is cheap. Same edge-of-grid defect fixed in `exp_ceiling_replicate.py` on 08-17. |
| 20 | **"Sleeper vs FantasyPros vs blend" is UNANSWERABLE, because nobody captured Sleeper.** `proj_mean_blend.json` gate = `no_control`: Sleeper has no per-player history for 2023/24/25, so the control arm does not exist. The prereg correctly refused rather than substituting a different source. **This is the retention rule's canonical case — un-backfillable, and it cost us the answer to a question Cory is asking during draft week.** | relay | **MITIGATED, dated** | `proj_series.json` now snapshots BOTH sources (fantasypros + sleeper, 15 entries since 08-09, append-only, deduped). First real answer: **Jan 2027.** Nothing to fix; recorded so the cost is visible. |
| 18 | **REOPENED: the Vegas +0.23 null is implausible on its face and was never treated as a suspected bug.** It was a PERFECT-FORESIGHT test — hand the model the true game environment and weekly MAE improves by a quarter point. Knowing every game's real total in advance should be worth far more than that. A near-zero oracle result usually means the oracle never reached the model, not that the input is worthless. Cory, 08-17: *"Do we really think it makes sense vegas odds didnt move a single thing?"* | **D** | OPEN | Before re-running anything: answer Rule 3d's three questions on the ORIGINAL run — did the line input vary (distinct values), did it survive the join to the player-week rows (count), and could the test have fired (control). **The +0.23 is quoted in `vegas_lines_2021_2026.json`'s `_note` as settled context, so it is propagating.** |
| 17 | **Every recorded null lacks a re-test trigger.** Pace (published null) and Vegas (+0.23 perfect-foresight ceiling) are filed as closed; both were measured at one point in time on limited seasons. | **D** | OPEN | Attach a trigger to each — season count, event, method, or date. Per `DATA-LIFECYCLE.md`: a null with no trigger is abandoned, not answered. |
| 12 | **`config_confirmed` and every local ruling were being wiped on each build.** `build.py --league-id` rebuilt the config from Sleeper and kept only two keys. | relay | **CLOSED 08-17** | `preserve_local_rulings()` + 6 tests. Verified: the shipped config still carries the ruling. |

## 🟢 CHECKED AND CLEAN — recorded so nobody re-investigates

| what | finding |
|---|---|
| **Do the model-scoreboard actuals inherit the weak `import_weekly_data` coverage?** (611 of 1,708 on-field players classified) | **No.** `fetch_component_stats.py` pulls the nflverse `player_stats` release files directly by URL and never calls `import_weekly_data`. The exclusions resolve to row 8, not a new defect. Checked 2026-08-17. |
| **Are per-model exclusion counts (115 vs 211) an unfair comparison?** | **No.** `model_accuracy_backtest.py` already computes `head_to_head_shared_population` over the intersection. The ranking that decides which model ships is on a matched denominator. |
| **Do other interval labellers carry the "CI includes $0" bug?** | Swept at artifact level. Three instances found and fixed (`frontier`, `cory_conditional`, `stack_sweep`); 42 co-located pairs across 6 artifacts now consistent. Scope limit stated in the test. |
| **Are the snap-count stores partial?** | No — join 0.971–0.992. But the refusal floor was 0.70, 27 points below anything observed, and is now 0.95. |

## 🔵 VERIFICATION OWED — things believed true but not observed

| what | owner | next action |
|---|---|---|
| `npx playwright install --with-deps chromium` on a real runner — the browser rehearsals' one untested line. | relay | Observed on the first scheduled `rehearsals.yml` run after it reaches `main`. |
| The board's structural properties on a *published* board (health 100%, replacement-sensitivity) — currently only seen on a refused candidate. | relay | Confirm on the first successful publish. |

---

**Rule for adding a row:** anything that could change a number Cory drafts or
starts on. When in doubt, add it — a row costs a line, a missed defect costs a
season.

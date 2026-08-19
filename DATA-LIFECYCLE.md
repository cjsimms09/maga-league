# DATA LIFECYCLE — the eight questions, and where every store actually stops

**Cory, 2026-08-17:** *"its not enough to just say we dont have the data (we need
to find out why we dont have it, can we get it, once we get it should we be
getting it consistantly, once we are capturing it are we using it to make
predictions, should we be, if we should we need to start, are we grading them,
should we be, if so we need to do it, are we closing the loop after grading?, if
not we need to make sure that gets coded in as well."*

That is the standard. **"We don't have it" is never an answer — it is the first
of eight questions.**

---

## THE CHAIN — every data question walks all eight, or names the step it stops at and why

| # | question | a stop here is only acceptable if… |
|---|---|---|
| 1 | **Why don't we have it?** | the reason is MEASURED, not assumed. "Upstream hasn't published" must be a checked 404, not a memory. |
| 2 | **Can we get it?** | someone actually tried, this week, and recorded the response code. |
| 3 | **Should we capture it CONSISTENTLY?** | if it changes weekly and we'd want history, the answer is yes and it needs a scheduled job. |
| 4 | **Are we using it to predict?** | — |
| 5 | **SHOULD we be?** | a NO here needs a measurement — a null, a bounded ceiling, or a stated cost. Never a shrug. |
| 6 | **Are we grading those predictions?** | — |
| 7 | **SHOULD we be?** | if it moves a number Cory acts on, yes. |
| 8 | **Is the loop closed** — does the grade move the weights? | a grade nobody feeds back is a diary, not a learning system. **A grade that moves nothing is an answer too — it sets the re-test date, it does not end the store.** |

**The failure this catches is step 3→4.** Capturing data is visible work and feels
like progress; wiring it into a prediction is where the value is. A store that
arrives weekly and reaches nothing looks exactly like success.

## CAPTURE AND USE ARE TWO DECISIONS, AND THEY ARE NOT DECIDED AT THE SAME BAR

**Cory, 2026-08-17:** *"just because grade doesnt move something does that mean we
shouldnt retain it and keep trying? I dont think your vision here is broad
enough."*

He is right, and this section exists because the relay got it wrong — it told
session D to "wire `routes_*` or stop the weekly job, not both open." **That is a
false binary and it destroys the thing that makes the next study possible.**

| decision | bar | default |
|---|---|---|
| **capture / retain** | is the source reliable and the cost real? | **YES — keep capturing** |
| **wire into a prediction** | a prereg and a measurement that could have failed | no, until measured |
| **stop a capture job** | the source is dead, wrong, or genuinely expensive | almost never |

**The asymmetry is the whole argument: history cannot be backfilled.** A weekly
fetch costs a runner-minute. A season we did not capture is gone permanently, and
with it every future study that needed that season to be answerable. Stopping a
job to save a trivial cost forecloses an unbounded one.

### A NULL IS DATED, NOT PERMANENT

Nearly every null in this project was measured on **one season, low n, one
method**. "No signal at n=1 season" and "no signal" are different claims and we
have been filing the first as the second.

**So every null ships with a re-test trigger** — one of: a season count (`re-test
at 3 seasons`), an event (`a rule change in usage`), a method (`re-test when the
grader handles laterals`), or a date. A null with no trigger is not a finished
answer; it is an abandoned one.

This applies retroactively to the two stops recorded below as JUSTIFIED. They are
justified as **wiring** decisions. Neither is a reason to stop capturing, and
both now owe a re-test trigger.

## WHERE EACH STORE STOPS TODAY — measured 2026-08-17, not recalled

Prediction path = `projections.py` / `own_model_v6.py` / `build.py`.
Grading path = `model_accuracy_backtest.py` / `forecast_grade.py` / `learning_loop.py`.

| store | captured | weekly job | → predicts | → graded | stops at | is that stop justified? |
|---|---|---|---|---|---|---|
| `nflverse_weekly_points_*` | ✅ 2021-25 | ✅ | ✅ | ✅ | **8** | this is the one complete chain |
| `component_stats_*` | ✅ 2021-25 | ✅ | ✅ (own_v6) | via weekly points | 6-7 | **UNEXAMINED — the last one, and the only store where it is genuinely true.** It predicts and is graded, but only *through* weekly points, so its own contribution is never isolated. Needs an **ablation of the live model**, prereg'd, post-08-22. Register 19, owner **A** |
| `snap_counts_*` | ✅ 2021-25 | ✅ Wed | ❌ | ❌ | **5** | **CORRECTED 08-17 (was recorded as step 6).** It reaches NO board field — 0 of 56 keys over 682 rows; `own_model_v6`/`build.py` never mention it; `projections.py` names it only to say it is not computed. **Reason already recorded** in `capture_registry.py:138`: a wiring gap, deliberate, *"a new input wired live five days before the draft is a worse instrument than a known one."* **MEASURED 08-17: null** — partial ρ 2 of 4 folds, cause is ρ 0.81–0.84 collinearity with prior points (same death as TPRR). **Trigger:** weekly grain or per-position. Register 13 |
| `routes_*` | ✅ 2021-25 | ✅ Wed | ❌ | ❌ | **5** | **JUSTIFIED — measured 08-17.** Preregistered TPRR study, graded, `clears: false`: season TPRR is +0.74…+0.82 rank-collinear with target volume, so it duplicates rather than complements it. Rule 3d passes on the null. **Triggers:** weekly grain / per-position; a true routes feed; **and test `routes` as a volume measure** (ρ to TPRR only +0.30-0.44). Register 14 |
| `weekly_volatility` | ✅ | ❌ | ❌ | ❌ | **4** | prereg'd (`VOLATILITY-WIRING-PREREG.md`), post-draft — **justified, dated** |
| `team_pace_*` | ✅ 2021-25 | ❌ | ❌ | ❌ | **5** | **JUSTIFIED** — a published NULL from a dedicated study with an instrument control, a negative control and disclosed multiplicity (`clears: false`, 1 of 3 positions). Sound; not reopened. **Trigger: a SECOND graded fold** — the null rests on one (2025), and two positions moved <0.25 MAE. **The registered second fold was abandoned on a false claim** that `nflverse_weekly_points_2022.json` does not exist; it does. Whether it is *valid* is the open question (its priors straddle the fingerprint boundary). Register 17 |
| `vegas_lines_*` | ✅ 2021-26 | ❌ | ❌ | ❌ | **5** | **JUSTIFIED, refined 08-18 (D, register 18b)** — perfect-foresight ceiling +0.238 weekly MAE at the true λ*=0.60 (the original grid's 0.5 was its own minimum; anyone holding +0.23 was approximately right). D's asymmetry finding, **corrected 08-18 net of a 40-draw placebo: DUD games carry 2.3–7.2× the value of shootouts** (raw was 5-10×; it survives at p=0.024, every side beats every draw) and want λ≈0.80. **AND THE ASYMMETRIC APPLICATION IS NO LONGER OPEN — Cory ruled it built before 08-22 and it is graded (register DS2):** the team-level implied total, applied two-sided, is worth **+0.0343 ΔMAE net of placebo (p=0.0164), 4.3× the symmetric arm**, while the shared game total is a placebo-indistinguishable **null (p=0.377)**. **Still not wired, and the reason is size not doubt:** +0.0343 is 11% of the replay's ±0.310 detection floor |
| `advanced_stats_*` (air yards / EPA / CPOE) | ✅ 2021-25 | ❌ | ❌ | ❌ | **5** | **JUSTIFIED — corrected 08-17 (was UNEXAMINED).** Preregistered, graded, published null (`advanced_efficiency_study.json`, 4 of 12 cells beat control). Rule 3d passes; the study records its own join population. **Trigger:** a different construction (per-position weight, or a higher `MIN_VOL` — both named by the study as suspected causes of the QB miss), or a 4th leak-free fold. Register 15a |
| `historical_props_*` | ✅ 2023-25 | ❌ | ❌ | ❌ | **7** | ✅ **GRADED 08-17** (was: refusing on a false claim). `clears: false`. The 0.93-0.97 Spearman is an in-season-information artifact, not skill — the arm sums all 18 weeks. The leak-free week-1 arm is also a null (register 15c). **Trigger:** repair `any_td` (decimal-odds corruption), then re-run both. Register 15b/15c |
| `own_projections_2026` | ✅ | ✅ Thu | ✅ | ✅ | **8** | complete |
| `multi_source_projections_2026` (ffanalytics) | ⏳ probe failing, no rows yet | ⚠️ **NOT scheduled, and that is the open decision** | ❌ | ❌ | **2** | **NEW 2026-08-19 (A), walked because Cory said *"read directions in repo about how to get data make sure we are doing it right"* — and this row exists because the rule below says a store may not get a capture job until 4-8 have answers. **1. WHY DON'T WE HAVE IT — measured, not assumed, and the answer is embarrassing: we read `ffanalytics` THREE TIMES (RESOURCES.md: 08-14 survey, 08-14 real-source read, 08-15 re-check) and took only its METHODS. Nobody took its DATA.** Consequence measured the same day: `proj_mean == proj_sleeper` EXACTLY for 609 of 609 priced players. **2. CAN WE GET IT — ✅ YES, ANSWERED 2026-08-19: 1,358 rows from 5 of 12 sources, AND THE THREE THAT MATTER COVER THE EXACT GAP WE COULD NOT FILL.** Per-source, measured (run 32212505971): **CBS 442** (QB 77 / RB 100 / WR 100 / TE 100 / **K 33 / DST 32**), **ESPN 416** (42/100/150/60/**32/32**), **FFToday 390** (50/95/131/50/**32/32**) — three real projection sets. **FantasyPros 60 and Walterfootball 50 return EXACTLY TEN PER POSITION, which is a truncated leaderboard, not a projection set, and they are NOT counted as usable sources.** Seven return zero: FantasySharks, FleaFlicker, NumberFire, FantasyFootballNerd, NFL, RTSports, FantasyData — **not yet diagnosed per-source, and a zero is a bug report until diagnosed (Rule 3e); the probe is credible only because five siblings returned positives in the same run.** **SO THE HONEST HEADLINE IS FOUR SOURCES, NOT TWELVE:** Sleeper (already on the board) + CBS + ESPN + FFToday. ⚠️ **AND THE MOST VALUABLE PART IS THE ONE NOBODY ASKED FOR: all three new sources carry K AND DST**, which is precisely the population register 2e (reopened 08-19) says we have nothing for — 74 of 74 kickers and defenses on the Gaussian fallback, all 32 defenses sharing one volatility ratio. The sources that worked cover the gap the component pipeline cannot. **⚠️ FantasyPros at 60 rows needs its own look: we already hold 426 FP players on the board via a different path, so ffanalytics' FP scraper is returning something much thinner than FP actually publishes — probably a free-tier page. Not a reason to doubt the other three.** Sandbox remains 403-at-CONNECT for every host, per NETWORK.md; this is Actions-only. Sandbox: every projection host 403s at CONNECT (fantasysharks / draftsharks / fantasypros / numberfire / fftoday, measured 08-19), consistent with `NETWORK.md`. Actions: **two failed attempts, both recorded rather than retried blindly** — run 32210403268 hung >30min in `setup-r` (cancelled); run 32211747087 died in 4s on `remotes::install_github` hitting the GitHub REST API with a rate-limited bundled PAT. Third attempt installs from a `git clone`, which touches no API. **A 403 is a policy answer and is not retried (NETWORK.md); a hang and a token failure are not policy and are.** **3. SHOULD WE CAPTURE CONSISTENTLY — YES, AND URGENTLY, FOR THE REASON THIS FILE ARGUES BEST: history cannot be backfilled.** These are 2026 PRESEASON projections; once the season starts they are gone. **The proof that this matters is P113, filed today and ungradeable until 2027 precisely because nobody captured multi-source history before** — the loss this file warns about, already realised once. **4. PREDICTING — no. 5. SHOULD WE — Cory RULED YES on 2026-08-19 (*"I will want to use mean average of all sources"*), and separately ruled *"wait for 12"* rather than shipping the 3-source mean already available from the board's own unused columns. 6/7. GRADED — P113, grade-by 2027-01-15, and the grade-by is late for a stated reason: there is no 2026 realised season to score 2026 projections against yet. 8. LOOP — P113's result decides whether cross-source spread replaces the band-constant ceiling (register 61), which is the one remaining candidate for per-player upside after P112 showed outcomes cannot supply it.** **Owner A for the ingest, C for the join (dispatched 08-19). Recheck 08-21.** |
| `sleeper_hist_rows` / `fp_hist_rows` | ⏳ code committed, not yet dispatched | one-time backfill, not weekly | ❌ | ❌ | **3** | **NEW 2026-08-18 (register D13/P38).** **Step 1 — why didn't we have it:** MEASURED, not assumed — no pre-2026 Sleeper or FantasyPros projection was ever archived (`model_accuracy_backtest.py`'s own docstring, written 08-15); the raw fetch happened live inside `sleeper_hist_proj.py`/`exp_fp_hist_proj.py`'s leak-gate checks and was discarded ("if it is not on stdout it does not exist" — that file's own words). **Step 2 — can we get it:** yes, already proven — both graders already fetch it live for 2023-2026 to run their leak gates; the rows existed in memory and were thrown away, not unreachable. **Step 3 — should we capture it consistently:** NO, and that's the correct answer here, not a stall — this is a ONE-TIME HISTORICAL BACKFILL (2023-2025, seasons that already happened) via `egress_main()` runs, not a recurring feed; the CURRENT season is already captured consistently through the existing `own_projections_2026` chain (step 8, complete) above. **Stops at 3 deliberately, for now:** wiring into a prediction (step 4, the shared-population three-way grade against `own_v6` via `model_accuracy_grade.grade()`) is P37, explicitly a SEPARATE ask from P38 — the schema and persistence code are ruled and committed (`sleeper_hist_proj.py` C TERRITORY-GRANT; `exp_fp_hist_proj.py`'s `ROWS_OUT` predates this ruling), but neither has actually been dispatched from `main` yet, so no rows are on disk. Owner **A** for dispatch + P37; recheck when both are committed. |

**Two chains are complete. As of 2026-08-17 the "no recorded reason" count is
ONE** — `component_stats_*`, graded only indirectly. `routes_*` was the last
store stopping with no reason at all and now has a measured one (register 14). Session D walked the other two: `snap_counts` was recorded as a
step-6 stop and is a step-4 stop **with** a reason (register 13), and
`advanced_stats_*` was recorded as UNEXAMINED and is a published, graded null
(register 15a). **Neither was a missing reason. Both were reasons this file had
not reconciled with the code.**

**And one store turned out to be worse than unexamined.** `historical_props_*`
holds 12,559 player-weeks of **paid** data and has **never been graded** — not
because anyone decided not to, but because the artifact that grades it carries a
stale refusal naming three stores that exist (register 15b). That is a fourth
failure mode, and the sharpest one:

> **step 6 was reached, the answer was affordable, and the command was simply
> never re-run.** Nothing in the chain distinguishes "we decided not to grade
> this" from "the grader last ran before the data arrived", because both leave
> the same empty cell.

`draft/tests/test_refusal_artifacts_are_not_stale.py` now sweeps every committed
artifact for that shape: **no artifact may declare a file missing that is
present.** It is red today, deliberately, and `repo_parity`-marked so it can
never block a board publish.

**Justified stops are not failures** — a stop at step 5 with a measurement behind
it is the standard working. The problem is never a NO; it is a NO nobody wrote
down.

**But a measurement only justifies the stop it actually covers, and Vegas did
not.** Session D re-opened it on 2026-08-17
(`draft/audit/vegas_oracle_row18_2026-08-17.md`). The +0.23 came from an oracle
reading the **combined game total** and handing it to **both** teams — 208 of 208
games in each graded season share one multiplier — so it cannot separate a
45-point offence from the 3-point one it played (r² 0.465 / 0.447 against team
points). The store's own `_note` calls it a *"team* game-total ceiling"; the code
computes a game total. **A spread-derived implied team total —
`total_line/2 + spread_line/2`, which this store exists to provide — is not in
the class that number bounds.** The stop was recorded against a bound that does
not reach the feature.

That is the third failure mode this file has to name, alongside "no reason
written" and "a reason with no trigger": **a reason written, with a real
measurement behind it, that does not cover the decision it is filed under.** It
is the hardest of the three to spot, because everything about it looks finished.
The tell was available in the published result and unread — the oracle scored
**worse applied fully (+0.132) than at half (+0.228)**, which is what an input
pointed at the wrong team half the time looks like.

## THE RULE FOR NEW DATA, SO THIS DOES NOT REGROW

**No store gets a scheduled capture job until steps 4-8 have ANSWERS** — and
`"not yet, here is the prereg and the trigger"` is a complete answer, which is
the whole point. The rule bans **unowned** capture, not unwired capture. A job
whose steps 4-8 read "nobody has decided" is the defect; a job whose steps 4-8
read "measured null, re-test at 3 seasons" is the standard working.

Read it the other way and it says stop collecting history because we have not
finished thinking — which would trade a runner-minute for a season we can never
get back.

And the reverse: **when a store reaches a prediction, step 6 becomes mandatory.**
A store that feeds a projection with nothing grading its contribution is the same
shape as a weight set by an experiment that could not fail — we cannot say
whether it helps, hurts, or does nothing.

**This paragraph used to name `snap_counts` as that example, and it was wrong.**
Session D checked it on 2026-08-17
(`draft/audit/snap_counts_row13_2026-08-17.md`): snap counts reach **no board
field** — 0 of 56 keys across 682 rows — so the store is at step 4, not step 6,
and there is no contribution to grade. `capture_registry.py:138` had it right the
same day; this file and two register rows were written against the wrong version
and nothing compared them.

**Which is the lesson worth keeping, and it is about this file.** The table above
is the artifact D's lane is judged on, and it asserted a wiring the board
contradicted. **The claim is now checked rather than trusted** —
`draft/tests/test_data_lifecycle_predicts_column.py` reads the "→ predicts"
column against the real board, with a known-positive control proving the
detector can find fields that are genuinely there. A step number in this table
is now a testable claim, the same way `test_defect_register.py` made the
register's owner column one.

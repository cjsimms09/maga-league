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
| `component_stats_*` | ✅ 2021-25 | ✅ | ✅ (own_v6) | via weekly points | 6-7 | **UNEXAMINED** — graded only indirectly |
| `snap_counts_*` | ✅ 2021-25 | ✅ Wed | ✅ (projections) | ❌ | **6** | **UNEXAMINED** — feeds predictions, nothing grades its contribution |
| `routes_*` | ✅ 2021-25 | ✅ Wed | ❌ | ❌ | **4** | **UNEXAMINED** — captured weekly, reaches nothing |
| `weekly_volatility` | ✅ | ❌ | ❌ | ❌ | **4** | prereg'd (`VOLATILITY-WIRING-PREREG.md`), post-draft — **justified, dated** |
| `team_pace_*` | ✅ 2021-25 | ❌ | ❌ | ❌ | **5** | **JUSTIFIED** — the study returned a published NULL |
| `vegas_lines_*` | ✅ 2021-26 | ❌ | ❌ | ❌ | **5** | **JUSTIFIED, refined 08-18 (D, register 18b)** — perfect-foresight ceiling +0.238 weekly MAE at the true λ*=0.60 (the original grid's 0.5 was its own minimum; anyone holding +0.23 was approximately right). D's asymmetry finding: DUD games carry 5-10× the value of shootouts and want λ≈0.80 — the open question is asymmetric APPLICATION, preregistered post-draft |
| `advanced_stats_*` (air yards / EPA / CPOE) | ✅ 2021-25 | ❌ | ❌ | ❌ | **4** | **UNEXAMINED** — study ran, wiring never decided |
| `historical_props_*` | ✅ 2023-25 | ❌ | ❌ | ❌ | **4** | **UNEXAMINED** — season-total arm was graded, then stopped |
| `own_projections_2026` | ✅ | ✅ Thu | ✅ | ✅ | **8** | complete |

**Two chains are complete. Four stores stop at step 4 or 6 with no recorded
reason.** Those four are the register's new rows.

**Justified stops are not failures** — pace and Vegas both stop at step 5 with a
measurement behind them, which is the standard working. The problem is never a
NO; it is a NO nobody wrote down.

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
`snap_counts` feeds `projections.py` today and nothing grades its contribution —
so we cannot say whether it helps, hurts, or does nothing. That is the same shape
as a weight set by an experiment that could not fail.

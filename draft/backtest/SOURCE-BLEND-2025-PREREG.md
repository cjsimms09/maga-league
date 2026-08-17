# SOURCE-BLEND-2025 — Sleeper vs FantasyPros vs blend, preregistered

**Written 2026-08-17, BEFORE any blend number exists.** Cory has asked this
question since 08-16 and it has never been run:

> *"are we using fantasy pros data correctly, have we actually looked if a blend
> or 50/50 mix of both is better"*

**It is now runnable.** The blocker was the claim that Sleeper has no per-player
history. That claim was false — `sleeper_hist_proj.json` (committed to `main` as
`0f9ecbe2`) shows **2025 passed every leak gate**, and FantasyPros is graded for
2023–25 in `exp_fp_hist_proj.json`.

**Nothing in this document is a result. Any number that exists before this file
is committed is not admissible.**

---

## THE QUESTION, IN ONE LINE

On 2025, over one matched population, under our house scoring: does a blend of
Sleeper and FantasyPros beat either source alone at ranking players?

## WHY IT MATTERS RIGHT NOW

The board's `proj_mean` is `sleeper_baseline × (1 + opportunity_adj)` —
`proj_baseline == proj_sleeper` for **422 of 422** players, and `build.py:1003`
says so in its own words. **FantasyPros is displayed on the board and enters
nothing.** That is not a decision anyone made; it is a default nobody examined.

## ARMS — fixed here, before the run

| arm | definition |
|---|---|
| **SLEEPER** | Sleeper's 2025 preseason projection, house-scored |
| **FP** | FantasyPros' 2025 preseason projection, house-scored |
| **BLEND-50** | `0.5 × Sleeper + 0.5 × FP` — the exact mix Cory named |
| **BLEND-W** | `w × Sleeper + (1−w) × FP`, `w ∈ {0.25, 0.75}` — reported, NOT tuned |
| **NAIVE** | previous-season points. **The known-positive control.** |

**BLEND-W exists to show the shape of the curve, not to pick a winner.** If the
best cell is at the edge of `{0.25, 0.5, 0.75}` the grid did not bracket the
optimum and the run says so rather than reporting the edge as an answer — the
defect found in `exp_ceiling_replicate` and again in `exp_weekly_env` on 08-17.

## POPULATION — the single most important control

**One matched population across every arm.** A player is graded only if he has a
Sleeper projection, an FP projection, and a realized 2025 total. Any player
missing any of the three is excluded **from all arms equally**, and the count is
reported.

This is not optional. Today's Sleeper (486 graded) and FP (464 graded) figures
come from *different* player sets, which is why a head-to-head off them is
inadmissible. `model_accuracy_backtest.py` already computes
`head_to_head_shared_population`; use it.

## METRICS — primary named first, so it cannot be chosen after the fact

1. **PRIMARY: Spearman ρ within position.** Drafting is a ranking problem.
2. **SECONDARY: MAE.** Reported per position and pooled.
3. **REPORTED, NOT DECIDING: bias.** FP and Sleeper have opposite signs
   (Sleeper QB **+22.1**, FP TE **−12.5**) and a blend is expected to cancel
   some of it. Cancelling bias is a *reason* a blend might win, not the win.

## THE DECISION RULE — stated before the numbers

**The blend wins only if it beats BOTH single sources on the PRIMARY metric, in
at least 3 of 4 positions, on the matched population.** Anything less is
reported as "no separation" and the board keeps its current source.

**One season is one season.** Even a win is a single-season result on n≈450, so
the shipping recommendation is capped at: *adopt for 2026 and re-test when 2023
or 2024 becomes gradeable.* No result from this run justifies a change during
draft week (08-22).

## GATES THAT MUST PASS BEFORE ANY ACCURACY NUMBER

1. **Leak gates already passed** for Sleeper 2025 (`clean`). 2023 and 2024
   failed on `leaked_markers` and are **excluded** — not repaired, not argued
   with.
2. **NAIVE must lose.** If previous-season points beats both professional
   sources, the harness is broken, not the sources. This is the run's
   known-positive control and its failure voids the run.
3. **Scoring parity.** Both sources are house-scored from statlines through the
   same path. If either arrives as a pre-scored total under a foreign scoring
   table, that arm is refused rather than converted.
4. **The join is reported, not assumed.** Row counts in, matched, dropped —
   with the reason for each drop bucket.

## WHAT VOIDS THE RUN

- Any arm computed on a different population than the others.
- A blend weight chosen after seeing results and then reported as the finding.
- `NAIVE` winning (see gate 2).
- Egress failure on either source — that is a fact about the runner, not about
  the sources, and the run is VOID rather than negative.

## WHERE IT RUNS

Both APIs are blocked from the sandbox (measured 2026-08-17: `CONNECT tunnel
failed, response 403` for `api.sleeper.app` and `api.fantasypros.com`), and
reachable from GitHub Actions. **This runs as a workflow, dispatched from `main`
so its verdict commits** — the 08-16 Sleeper probe ran from a worktree branch and
its answer was discarded by the push guard, which is how this question stayed
open an extra day.

## OWNERSHIP

`draft/backtest/` is **TERRITORY: A**. The relay wrote this preregistration and
parked the module request; A builds or delegates it. **The prereg is committed
first either way** — that is the point of it.

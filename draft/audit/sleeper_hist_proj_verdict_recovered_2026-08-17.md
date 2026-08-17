# The Sleeper-history verdict existed for a day and nobody read it

**Recovered 2026-08-17 by the relay from GitHub Actions run 31977423381
(job 95238890537), dispatched 2026-08-16 22:49 UTC. Conclusion: success.**

Cory, 2026-08-17: *"where are we on fantasy pros info???? and the test between
fantasy pros, sleeper, and mix or blend?"*

The answer was already computed. It was never written down.

## WHAT HAPPENED

`sleeper-hist-proj.yml` ran twice on 08-16 and both runs succeeded. The workflow
commits its verdict by `git push origin HEAD:main` — and it carries a guard:

> `Dispatched from 'worktree-agent-a6061ab5cb007b310', not main — the answer is
> in the step summary above and is deliberately NOT committed.`

**The guard is correct.** A feature-branch dispatch must not push to `main`. But
the consequence is that a spent fetch produced an answer that lived only in a log,
and three files kept asserting the opposite. **This is not a bug in the guard; it
is a missing step after it** — nobody was told to go read the run.

## THE FINDING THE PROBE WAS BUILT TO GET

**Sleeper serves historical projections.** `/projections/nfl/regular/{season}`
returned rows with stats for all three seasons:

| season | rows with stats | verdict |
|---|---|---|
| 2023 | 6,691 | **leaked_markers** |
| 2024 | 7,571 | **leaked_markers** |
| 2025 | 8,625 | ✅ **clean — every gate passed** |

Three committed records asserted this was impossible — `exp_fp_hist_proj.json`
("structurally unmeasurable until Jan 2027"), `projection_skill_backtest`
("permanently unmeasurable"), `SOURCE-WEIGHT-PRIOR-PREREG` ("NOT constructible
offline") — and, per the probe's own docstring, **none of them ever asked the
API.** That is Cory's "we can't get it is not an answer" rule, vindicated.

**The leak gate worked, in both directions.** 2024 marker: a QB with a 290.12
prior, projected **40.18**, realized −0.84 — the "projection" already knew he
would miss the season. 2025 marker: a back with a 230.3 prior, projected
**203.5**, realized 29.3 — the projection did NOT know. The first is leakage; the
second is a real forecast. A gate that rejects two of three seasons and accepts
the third on the correct evidence is a gate that can fail.

**The season argument is honored:** pairwise identical fractions 0.94%–1.18%.

## THE HEAD-TO-HEAD IS NOW CONSTRUCTIBLE — AND IS NOT YET A RESULT

2025 gate diagnostics (Sleeper) beside `exp_fp_hist_proj.json` (FantasyPros):

| pos | Sleeper ρ / MAE / bias | FP ρ / MAE / bias |
|---|---|---|
| QB | .7941 / 58.30 / **+22.11** | .7515 / 63.70 / +15.45 |
| RB | .7538 / 37.21 / +5.78 | **.7649** / 37.63 / −0.72 |
| WR | .7724 / 34.85 / +13.07 | .7621 / **31.05** / −3.88 |
| TE | **.8060** / 22.13 / **−0.70** | .7824 / 22.50 / −12.48 |

**DO NOT REPORT THIS AS "SLEEPER BEATS FP".** Two reasons, both disqualifying:

1. **The populations do not match** — 486 graded players vs 464. They are not the
   same people. This repo already knows the fix: `model_accuracy_backtest.py`
   computes `head_to_head_shared_population` precisely so a comparison lands on a
   matched denominator.
2. **These are LEAK-GATE diagnostics, not a grade.** The probe says so in its own
   output: *"A three-way grade becomes licensable UNDER ITS OWN SEPARATE
   PREREGISTRATION — no number is computed here."* Using a gate's diagnostic as a
   result is the same class of error as reading a check that cannot fail.

**What it does support, and it matters:** the two sources are CLOSE, and neither
dominates. Sleeper edges rank correlation at 3 of 4 positions; FP is markedly
better calibrated on bias at 3 of 4. **Different strengths, similar accuracy, is
the textbook case where a blend beats either alone** — which is exactly the
question Cory has been asking since 08-16.

## WHAT IS ACTUALLY NEEDED — one prereg and one run

1. **Re-dispatch `sleeper-hist-proj.yml` FROM `main`** so the verdict commits.
   A's call; it pushes to `main`.
2. **Write the three-way grading prereg** the probe demands: Sleeper vs FP vs
   blend, on 2025, **matched population**, weights fixed before the numbers.
3. **Run it.** Both sides' inputs exist. There is no missing data.

**The blend arm is no longer blocked.** `proj_mean_blend.json`'s `no_control`
refusal rested on Sleeper having no per-player history. It does — for 2025.
That refusal should be revisited, not deleted: it was correct on the evidence it
had, and it is now superseded by evidence nobody had gone to collect.

## THE PROCESS DEFECT, SEPARATELY

**A spent fetch whose answer lives only in a log is a fetch we have to pay for
twice.** The workflow should either write its verdict to the step summary AND
fail loudly enough that someone retrieves it, or upload it as a run artifact that
a later job can commit from `main`. Filed as register row 23.

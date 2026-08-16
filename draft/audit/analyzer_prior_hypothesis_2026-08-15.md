<!-- TERRITORY: A -->
# CORY'S ANALYZER HYPOTHESIS, BACKTESTED — 2026-08-15

Cory, verbatim: *"League analyzer should make record projections based on that
teams actual matchup (once they're locked on sleeper) using projected points
we have for that matchup. Not saying as a statement but my hypothesis."*

Preregistration: draft/backtest/EXP-ANALYZER-PRIOR-PREREG.md (commit a0c70705,
before any result). Runner: exp_analyzer_prior_sim.js; means builder:
exp_analyzer_prior_means.py; artifact: exp_analyzer_prior.json; tests:
draft/tests/test_exp_analyzer_prior.py (17, all offline). All committed data,
deterministic seeds, zero network.

## The hypothesis splits in two, and half already ships

1. **"based on that team's actual matchup"** — ALREADY TRUE. `projectStandings`
   (src/routes/standings.js) simulates every remaining week on the real
   schedule, actual head-to-head pairs via `LO.weeklyMatchups`. Nothing to fix.
2. **"using projected points we have"** — the real gap. Future-week scores are
   drawn from each team's HISTORICAL realized mean, shrunk toward the LEAGUE
   mean (K=4). Projections enter nowhere in-season. This is what the backtest
   tested: same simulator, same K=4 schedule, same sd, same seeds — only the
   shrink TARGET changes from league mean (ARM A, shipped) to a
   projection-derived team mean (ARM B).

Since no provider archived real 2023–25 preseason projections (established
earlier today: draft/audit/projection_skill_backtest_2026-08-15.md), the
leak-free projection stand-in is the measured champion baseline — the 0.7/0.3
recency blend over each team's actual 15 draft picks, best-lineup summed.
2023: no prior stores exist → ARM B unmeasurable (filed, not faked). 2024:
prior degenerates to 2023-totals-alone (the blend's own fallback). 2025: the
full blend.

## Integrity gates that make the numbers citable

- **Parity 36/36**: ARM A reproduced the shipped `projectStandings`
  bit-for-bit (same seed, same draws) in every season × checkpoint cell. ARM A
  *is* the production model, not an approximation of it.
- **Centering neutrality, proven**: ARM B_raw (uncentered prior) equals ARM B
  cell-for-cell — a mean shift shared by all teams cancels in every H2H draw —
  so the flagged centering designed-guess is outcome-neutral and the
  absolute-scale confound (no K/DEF rows, bench zeros) never touches results.
- Suites: `python3 -m pytest draft/tests -q` → **2182 passed, 6 skipped**;
  `bash scripts/js-sweep.sh` → **248 entry points, all green** (one transient
  red on trashtalk.test.js from a live-Sleeper 403 mid-sweep; direct rerun and
  full re-sweep both green — unrelated to this experiment, which is offline).

## VERDICT (preregistered decision rule): no detectable improvement

Pooled over the 24 B-measurable cells (2024+2025 × weeks 1–12), paired
sign-flip permutation, 20k resamples:

| metric | better | pooled Δ (B−A) | p | call |
|---|---|---|---|---|
| playoff-set hits | higher | **0.000** | 1.00 | tie |
| exp-wins MAE | lower | **+0.144 wins/team** | **0.007** | B significantly WORSE |
| Brier (made playoffs) | lower | +0.0004 | 0.98 | null |

Preregistered early window (W1–4, where the hypothesis predicted the most):
hits +0.125 (p=1.0), MAE +0.311 worse (p=0.12), Brier +0.019 worse (p=0.53).
Even in its own best window the prior does not win.

Controls behaved: ARM A averaged 3.03 hits/4 across all 36 cells vs naive
current-standings 2.86 and the random floor 1.6; every arm's Brier sits far
under the constant-p floor 0.24. "Beats" would have meant something; nothing
beat A.

### The split that explains the verdict — prior QUALITY is the whole story

| season (prior flavor) | A hits | B hits | A MAE | B MAE | A Brier | B Brier |
|---|---|---|---|---|---|---|
| 2024 (last-season-alone, rookie-blind) | 3.17 | 3.08 | 1.258 | **1.569** | 0.1204 | 0.1258 |
| 2025 (true 0.7/0.3 blend) | 3.00 | **3.08** | 1.087 | **1.064** | 0.1092 | **0.1045** |

2025 — the only season where the stand-in is the actual champion-baseline
blend — B edges A on ALL THREE metrics, with the gain concentrated exactly
where the hypothesis predicted: W1 (hits 2 vs 1, Brier .278 vs .303) and W2
(hits 3 vs 2, Brier .126 vs .166). 2024's degenerate prior (its worst roster
prior, 39 pts/wk, belonged to a team that drafted 2024 rookies the 2023 store
can't see) poisons the pool and produces the significant MAE loss. The pooled
verdict is honest and stands; the mechanism it reveals is: **a good projection
prior helps for about two weeks; a bad one hurts for four**.

### Crossover

Benefit of B over A, pooled per week, is gone by **W3 for playoff-set hits and
W1 for exp-wins MAE** (Brier flickers negative mid-season, never
significantly). Under the K=4 schedule the prior still carries 80% of the
weight at W1 and 50% at W4 — far more weight, for far longer, than its
measured shelf life. Any future blend calibration should treat the projection
prior as a W1–W2 asset only (K≈1–2 territory), not a month-long one.

### ARM C — the per-week availability ceiling (admitted leak)

No 2023–25 player→NFL-team or bye table exists on disk, so the pure-bye
per-matchup arm is underivable offline. ARM C used season-Y player-week store
presence instead — byes AND injuries, i.e. future information a checkpoint
could never know — as a diagnostic CEILING. Result: **worse than both A and
B** (MAE +0.221 vs A, p=0.0001; Brier +0.012, p=0.15). Even holding leaked
future availability, masking the lineup sum per week injects more noise than
signal (a starter's absent week zeroes his slot; reality backfills with
replacement-level scoring). The per-matchup half of the score model is not
where value lives — the schedule (already shipped) is the per-matchup signal
that matters.

## Production wiring — recorded, NOT proposed

The preregistered decision rule was not met, so no production change is
licensed by this experiment. Two findings still belong to B's file as data:

1. **Doc/code mismatch**: the comment in `projectStandings` says preseason
   callers pass `opts.projMeans {rid: mean}` — **nothing in the function reads
   `opts.projMeans`**. The hook is documentation without implementation.
2. **throughWeek=0 leaks**: `teamStrength(season, throughWeek > 0 ? throughWeek
   : weeks[weeks.length - 1])` means a throughWeek=0 call silently scores from
   the FULL season — the comment's promised projMeans path is what should run
   there instead.

If January 2027's grading of the real, daily-frozen Sleeper 2026 projections
(draft/data/proj_series.json) shows genuine skill — the 2025-blend row above
is the existence proof that a GOOD prior helps early — the wiring both fixes
would share is one guarded block in `projectStandings`, after `strength` is
built (described here for B/A to apply, never applied from this lane):

```js
if (opts.projMeans) for (const rid of Object.keys(strength)) {
  const t = strength[rid], pm = Number(opts.projMeans[t.rid]);
  if (Number.isFinite(pm)) {
    const w = t.gp / (t.gp + K);          // K≈1-2 per the measured crossover, not 4
    t.mean_shrunk = w * t.mean + (1 - w) * pm;
  }
}
```

with the caller passing projection-derived weekly means for the current
rosters. Until that grading exists, the shipped league-mean shrink stays — it
just measurably beat the best projection prior 2023–25 could offer.

## Limitations (stated in the prereg, restated with the result)

- The stand-in is not a real projection: opening-roster vintage (trades and
  waivers invisible), rookie-blind, K/DEF-blind. It is the best leak-free
  instrument available and it LOSES to the shipped prior pooled — but a
  genuinely skilled projection source is untested by construction, and the
  2025 split says the question reopens the day one is measurable.
- Checkpoints within a season share the realized outcome; the 24 "cells" are
  far fewer effective samples. The p-values carry that caveat both ways.

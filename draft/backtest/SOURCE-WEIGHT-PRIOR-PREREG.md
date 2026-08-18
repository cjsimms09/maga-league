<!-- TERRITORY: A -->
# SOURCE-WEIGHT PRIOR — PREREGISTRATION (2026-08-15)

**The ruling this executes.** Cory, on the proposal to build a source-weight
prior from the FP-archive measurement, verbatim: **"Yes! If it works."** That
is a CONDITIONAL application ruling — the REC-1 pattern: applied under a
recorded ruling, but only if the thing survives its own preregistered gates.
"If it works" cuts both ways: a failed gate files an honest negative and
touches nothing.

**What this preregisters.** The construction rule, every gate, every
threshold, the shrinkage schedule, and the wiring target for a per-position
prior over the REC-2 source set `{sleeper, fantasypros}` — written and
committed BEFORE `source_weight_prior.py` or any composite number exists.

**Honesty about what "before" means here.** The prior's INPUTS are
previously-published committed aggregates (`exp_fp_hist_proj.json`,
`proj_series.json`, both already quoted in audit documents); their component
values are known. What did not exist when this file was committed is the
COMBINATION: the construction formula, the gate verdicts, the fold results,
and the posterior machinery. This prereg fixes those so the combination
cannot be tuned to pass its own gates. (The commit order is the proof, as
with EXP-FP-HIST-PROJ and EXP-ANALYZER-PRIOR.)

---

## 1. Inputs — committed files only, no fetches

- `draft/backtest/exp_fp_hist_proj.json` — the authenticity-gated FP archive
  grade: `fp_cells` (per-position n/MAE/bias/Spearman, 2023/24/25, OUR
  scoring) and `head_to_head_shared_population` (2024: FP vs naive_prev;
  2025: FP vs naive_prev AND recency_blend).
- `draft/data/proj_series.json` — the daily freeze; the LAST snapshot per
  source dated ≤ 2026-08-22 (the same pre-draft cutoff REC-2 preregistered).
- `draft/data/player_positions.json` — position lookup for the divergence
  join.

Anything else is out of bounds. In particular: no new FantasyPros or Sleeper
fetches, and no reading of any 2026 outcome (none exists).

## 2. Construction rule (fixed)

Per position P in {QB, RB, WR, TE}:

1. **FP error scale**: `MAE_fp(P)` = unweighted mean of the three yearly
   `fp_cells[P].mae`. `bias_fp(P)` = unweighted mean of the three yearly
   biases.
2. **MSE estimates via the declared normal approximation**: for a normal
   error with mean b and sd σ, MSE = σ² + b². We estimate
   `MSE_fp = (1.2533 × MAE_fp)²` (the zero-mean inversion, declared as an
   approximation; the bias term is small relative to MAE in every cell) and
   `var(P) = max(MSE_fp − bias_fp², 0.25 × MSE_fp)` (floor so a large bias
   cannot produce a degenerate variance).
3. **Sleeper level prior**: `gap(P)` = median over same-player joins of
   (sleeper − fantasypros) season points in the two sources' last pre-draft
   `proj_series` snapshots. `bias_sleeper(P) = bias_fp(P) + gap(P)` — the
   archive prices FP's level error; the measured 2026 divergence transports
   it to Sleeper. `MSE_sleeper = var(P) + bias_sleeper(P)²` (shared-variance
   assumption, justified by within-position rank agreement ρ 0.93–0.97;
   declared, and symmetric — whichever source's implied bias is smaller gets
   the larger weight, the rule does not know which source it favors).
4. **Prior weights**: `w_src(P) ∝ 1 / MSE_src(P)`, normalised over the two
   sources.
5. **Prior strength**: `n0(P) = round(t² × mean yearly fp_cells[P].n)` with
   `t = 0.5` fixed here (class-transfer discount, the `transferability²`
   discipline already in `src/evidence_weight.js`; the archive is
   FP-specific and season-grain, the target is a two-source weight).

## 3. Gates — all offline, thresholds fixed here

- **G1 — skill-sign persistence (the class claim).** In EACH h2h year
  independently (2024, 2025), FP's MAE beats every measured baseline at ALL
  four positions. Required: 8/8 position-year cells (2024 has naive_prev
  only; 2025 has naive_prev and recency_blend — the blend is the binding
  baseline). One miss fails the gate.
- **G2 — bias-sign persistence (leave-one-year-out, 3 folds).** For each
  fold: fit `bias_fp(P)` on two years; wherever the fitted |bias| > 5 pts,
  the held-out year's bias must carry the SAME SIGN. A position with fitted
  |bias| ≤ 5 makes no claim in that fold (exempt, named). Any sign flip on a
  claiming cell fails the gate.
- **G3 — error-scale transfer (leave-one-year-out, 3 folds).** Per position
  and fold, the two-year-fit MAE must predict the held-out year's MAE within
  ±40% relative error. (±40% MAE ≈ factor-2 MSE ≈ the difference between a
  50/50 and a 33/67 two-source weight — the coarsest resolution at which the
  prior is still worth carrying.) Any cell outside the band fails the gate.
- **G4 — divergence-input health (degrades, does not fail).** Same-player
  pre-draft joins per position: n ≥ 25 at QB/RB/WR, n ≥ 12 at TE; both
  snapshots dated ≤ 2026-08-22 and within 3 days of each other. A position
  failing G4 gets `gap := 0` — its weight prior degrades to
  equal-professional and says so — the archive-derived expected-error and
  bias-prior content still stands.
- **G5 — a prior, not a verdict (structural, enforced by test).**
  (a) With no prior supplied, REC-2's `grade_frozen_sources` output is
  byte-identical to today's. (b) With January-sized measured cells
  (n = 57–141, the archive's own h2h n range), the posterior weights land
  within 0.05 of the pure measured weights at every position — measured
  evidence must dominate the moment it exists. Enforced as test arms, not
  a run-time verdict.

**Verdict rule**: G1 AND G2 AND G3 pass → the prior is constructed and wired
(Section 5). Any of G1–G3 fails → the artifact records `status:
"failed-gate"` with the failing cells, learning_loop.py is NOT wired, and
the honest negative is the deliverable.

## 4. What the coordinator's per-player gate becomes, and why

The ideal held-out test — "the FP-informed weighting beats flat and
single-source per player on the held-out season" — is NOT constructible
offline: only aggregate FP measurements are committed (per-player archive
rows were deliberately not retained), and gate 1 forbids new fetches. The
translation preregistered here: G1 is the single-source comparison (FP vs
each baseline, per position, in each year measured — not fitted); G2/G3 are
the out-of-sample tests of the prior's two transported claims (bias sign,
error scale) under leave-one-year-out. The per-player blend validation this
cannot provide becomes available in January 2027 (both sources' per-player
2026 snapshots are frozen; outcomes arrive weekly) — REC-2's measured pass
IS that confirmation, and Section 5's shrinkage hands over to it.

## 5. Shrinkage schedule and wiring (fixed targets)

- **Posterior rule** (implements REC-2's January combine): per source,
  `MSE_post = (n0 × MSE_prior + n × MSE_measured) / (n0 + n)`; posterior
  weights ∝ 1/MSE_post. With `n0 ≈ 0.25 × mean cell n` (≈ 17–45 by
  position) and January cells at n = 57–141, measured evidence outweighs
  the prior 2–6× the day it lands — **the handoff is January's first
  measured cell**, named here.
- **In-season drift monitor** (the incoming evidence stream before January):
  the player-week loop's per-arm grades. The prior predicts the sleeper
  WEEKLY arm grades with POSITIVE bias at WR and TE (the transported gap;
  weekly grain ≠ season grain, declared). Contradiction rule: cumulative
  sleeper-arm bias at WR or TE NEGATIVE with n ≥ 30 in any calibration
  snapshot → the artifact flags `contradicted-in-season` on its next weekly
  regeneration. QB is excluded from the monitor by name (the weekly arm
  carries Sleeper's known 4-pt-passing-TD negative bias — a different,
  already-documented quantity).
- **Wiring** (what "applied" means under this ruling): the prior block lands
  inside REC-2 in `draft/data/model_update_recommendations.json`, is
  regenerated every Tuesday by the scheduled weekly runner, and
  `grade_frozen_sources` consumes it in its January combine. **proj_mean
  stays single-source Sleeper — untouched.** What WOULD flip the
  composition: REC-2's January posterior plus a reviewed ruling from Cory —
  a separate decision file, exactly as REC-2's acceptance already states.
  This ruling authorizes the prior's construction and its consumption by the
  recommendation machinery, not a composition change.

## 6. Artifacts

- `draft/backtest/source_weight_prior.py` — builder + gates, pure functions.
- `draft/backtest/source_weight_prior.json` — the constructed prior OR the
  failed-gate record, gate evidence included either way.
- `draft/tests/test_source_weight_prior.py` — every gate two-armed (a
  passing fixture AND a fixture that must fail), G5's both arms, and the
  regeneration == artifact pin.

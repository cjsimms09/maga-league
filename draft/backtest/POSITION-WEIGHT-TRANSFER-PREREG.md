<!-- TERRITORY: A -->
# PREREGISTRATION — DOES A PER-POSITION FORECAST WEIGHT TRANSFER ACROSS SEASONS?

**Written and committed BEFORE the runner exists and before any number is
produced.** If a result appears in the same commit as this file, that is the
signal that this discipline broke and the result should be distrusted.

**Cory, 2026-08-17:** *"Let's test position weighted idea then."*

His idea, from earlier the same day, was concrete: Sleeper's WR projections run
**+13.63** biased while its other positions do not, so why should one global
weighting rule apply to every position — *"Can we adjust for this?"*

---

## 0. THE THING THIS STUDY IS NOT, STATED BEFORE ANYTHING ELSE

**This does NOT answer "should `proj_mean` weight Sleeper against FantasyPros
differently per position."** That question is blocked and stays blocked. There
is no per-player Sleeper or FantasyPros projection series for 2023, 2024 or
2025 — Sleeper never published one and `proj_series.json` starts 2026-08-09;
FantasyPros' per-player rows were graded in CI and deliberately not retained,
and re-fetching is CI-only egress that answers 403 from here. That is recorded
in four committed places and `proj_mean_blend.py`'s `constructibility_gate`
re-checks it every run.

**Why this study is being run anyway, and why now.** `A3` — Amendment 2's
position-weighted arm — was DROPPED for **two independent reasons**, and one of
them has just dissolved:

> **(1)** no per-player Sleeper/FP series exists. **STILL TRUE.**
> **(2)** *"only ONE season is predictable leak-free from the committed stores
> (2025 needs 2023+2024; grading 2024 would need 2022, which is not
> committed), so a position weight could only ever be fitted on the season it
> grades."* **NO LONGER TRUE** — `nflverse_weekly_points_{2021,2022}.json` were
> rebuilt offline on 2026-08-17 from the committed component stores, licensed
> by an exact reproduction of the committed 2023 store (5,371 player-weeks,
> **0** disagreements). 2023, 2024 and 2025 are now all predictable leak-free.

`test_position_weighted_arm_is_dropped_not_fitted_on_itself` fired on that
change **by design** — it asserts `seasons_predictable_leak_free == [2025]`
specifically so that a second gradeable season forces a deliberate
re-evaluation instead of leaving A3 dropped behind a stale comment. This is
that re-evaluation.

**So the question here is the MECHANISM, not the ship:** *does a per-position
weight between two forecasters carry any information that survives to a season
it was not fitted on?* If it does not survive even between our own arms — where
we hold complete per-player data for every season — then the idea is dead
regardless of whether a Sleeper/FP series ever arrives, and the blocked
question stops being worth waiting for. If it does survive, the mechanism is
real and the only thing standing between us and using it is data we could go
capture.

**No outcome of this study may change `proj_mean`.** Declared here, before the
run, so it cannot be argued afterwards. The arms are not Sleeper and are not
FantasyPros; a mechanism result licenses a *future* test, never a live swap.

---

## 1. THE QUESTION, IN ONE SENTENCE

Fitting the blend weight **separately per position** on seasons Y−2 and Y−1,
does it rank players in season Y better than fitting **one global weight** the
same way?

The comparison is *position-specific vs global*, **not** *weighted vs
unweighted*. That is the whole idea under test: a global weight is already
allowed to be non-equal, so any credit position-weighting gets must come from
the positions differing from each other, not from weighting existing at all.

---

## 2. DESIGN

**Holdout: SEASON, not player.** Weights are fitted on 2023 and 2024 and
applied to 2025. No player-week from the graded season contributes to any
weight. This is precisely the holdout Amendment 2 named as *"the transfer that
matters"* and the existing `_cross_fit_weighted` probe explicitly could not do
(it is a player holdout inside one season — the friendly case, since both folds
share that season's shocks).

**Arms.** Both parents come from the offline-constructible own-model lineage
rebuilt by `_probe_models`, per season. The headline pair is declared here, in
advance, to stop pair-shopping:

> **HEADLINE PAIR: `own_v6` × `recency_blend`.** Chosen because own_v6 is the
> promoted model and recency_blend is the simplest arm that is not a component
> of it in the same way v3/v4/v5 are, so the pair is the least-correlated one
> available with a promoted member.

Every other pair from the fixed model list is also reported, under FDR control
at q = 0.10, and is explicitly **secondary** — a secondary pair winning while
the headline does not is reported as a null with an interesting cell, never as
a finding.

**Metric.** Spearman rho per position (QB/RB/WR/TE), the repo's standard for
ranking skill, since a draft board is an ordering. MAE reported alongside but
never as the decision metric — a blend can improve MAE by shrinking toward the
mean while ranking no better, which is the specific failure mode this repo has
already recorded once.

**Minimum n.** A position cell needs `MIN_N` players (the module's existing
constant) or it is reported as `null`, never as a small number.

---

## 3. THE DECISION RULE, FIXED IN ADVANCE

**POSITION-WEIGHTING IS SUPPORTED only if ALL of:**

1. On the headline pair, per-position weights beat the single global weight in
   **≥ 3 of 4** positions on 2025 Spearman; **and**
2. the pooled (all-positions) paired bootstrap CI on
   `rho(per-position) − rho(global)` **excludes zero**; **and**
3. the **shuffled-position negative control** (§4) does *not* also clear (1).

**Anything else is a NULL and is published as one.** A null here means A3 stays
dropped, permanently and for a *stated* reason rather than a data-availability
accident, and the Sleeper/FP series stops being something worth chasing for
this purpose.

---

## 4. CONTROLS, DECLARED BEFORE THE RUN

- **Shuffled-position control (the one that decides it).** Apply each position's
  fitted weight to a *different* position, under a fixed permutation. If
  scrambled weights do as well as the real assignment, then what looked like
  "position-specific information" is just "a weight that isn't 0.5", and the
  idea fails on its own terms. This control is the reason the study is worth
  running at all.
- **Answer-key ceiling, labelled as leaking.** Fit per-position weights on 2025
  itself and grade on 2025. Reported ONLY as a ceiling, always flagged
  `leaks: true`, never compared to anything as evidence. Its job is to show how
  much of any apparent gain is the leak — Amendment 2 (b) predicted this arm
  would be "the strongest-looking number in this study and would mean nothing",
  and that prediction is now checkable instead of merely asserted.
- **Equal-weight reference.** 0.5/0.5, so both fitted arms can be read against
  doing nothing.
- **Better-parent reference.** The better single parent on the graded season.
  If neither blend beats it, the blending question is moot before the
  position question is reached.

---

## 5. LIMITATIONS, DECLARED BEFORE SEEING ANY RESULT

1. **Not the shipped question.** §0. This prices a mechanism.
2. **Correlated parents.** Every own-model arm from v3 up consumes
   `recency_blend` internally, so these pairs are far more error-correlated
   (~0.94 measured previously) than two independent professional forecasts.
   This is the **hostile** case for blending — diversification is what makes
   averaging work. Consequence, declared now: a **positive** here is stronger
   than it looks, and a **null** is weaker evidence against the idea than it
   looks, and the write-up must say so in both directions.
3. **Two fit seasons is the design minimum.** Two points define the fit with
   zero degrees of freedom left over to check stability. A weight that transfers
   from 2023+2024 to 2025 has been shown to transfer *once*.
4. **`board_ages()` is as-of-2026 for every season.** The age feature is
   therefore offset by (2026 − Y) years in the earlier fits. It is a constant
   shift per season, not outcome data, so it cannot leak the answer — but it is
   a real misspecification that is *worse for the fit seasons than for the
   graded one*, and it must be reported rather than discovered later.
5. **2021 and 2022 weekly stores are REBUILT, not fetched.** Offline re-scoring
   of the committed component stores, licensed by an exact 2023 reproduction
   (0 disagreements over 5,371 player-weeks). Absent players stay absent, never
   zero. If that reproduction ever stops being exact this study is void.
6. **One graded season.** 2025 is the only season with two *fitted* predecessors
   under this design. n = 1 season for the transfer claim itself.

---

## 6. WHAT GETS COMMITTED

- `draft/backtest/position_weight_transfer.py` — the runner.
- `draft/backtest/position_weight_transfer.json` — the artifact, carrying every
  cell including the ones that fail, plus the controls.
- `draft/audit/position_weight_transfer_2026-08-17.md` — the verdict.
- Tests in `draft/tests/`, each gate two-armed (a test that can only pass is
  not a gate).
- `test_position_weighted_arm_is_dropped_not_fitted_on_itself` updated to
  assert the **new** truth — that A3 is dropped for reason (1) alone now that
  reason (2) has dissolved — so the tripwire keeps working rather than being
  silenced.

**Refusal is a valid outcome and requires no further permission.**

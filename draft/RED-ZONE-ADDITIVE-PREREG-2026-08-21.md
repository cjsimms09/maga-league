# THE RED-ZONE AXIS, SECOND ATTEMPT — ADDITIVE THIS TIME, AND THE REASON IS MEASURED

**Session D, 2026-08-21. Owner D. `no_fit_guard` applies — a FALSE files as
loudly as a TRUE, and nothing below moves after a number is seen. No MAE,
correlation or α has been computed for this arm at the time this file is
committed.**

---

## 0 · WHY THERE IS A SECOND ATTEMPT AT ALL

**P292 graded the multiplicative red-zone tilt FALSE, decisively** — pooled
MAE **9.07** against the baseline's **4.57**, worse in all four folds. That
would normally retire an axis.

**It did not, and register 191 is why.** The correlation gate P292 ran as a
formality turned out to carry the finding: **ρ = 0.74 against the baseline and
0.74 against P286's usage-interaction arm.** Every other axis this programme
has tested came back a costume — P286 at ρ=0.9957, the current five weekly
arms at ρ≈0.997. **Red-zone opportunity is the only axis D has measured that
the champion does not already contain.**

Register 191 then priced what that is worth: at this project's weekly error sd
of ~7, ρ=0.74 buys **+0.40 MAE points** of free averaging headroom in a
five-arm blend, where ρ=0.98 buys 0.00. **The axis has room; the transform
spent it.**

**The mechanism was named, not guessed.** `rz_multiplier = rz_rate /
pos_mean_rz_rate` is a ratio against a *tiny, right-skewed* denominator (RB
0.56, WR 0.18, TE 0.14 opportunities/game), so **17.3% of graded player-weeks
hit the ×3 clip ceiling outright** and the tilt tripled baselines wholesale.
That is register 59/P260's error class — a ratio-to-population-mean used as an
absolute scale.

## 1 · THE FIX, AND WHY IT IS BETTER-MOTIVATED THAN "TRY ADDITIVE"

    pred = baseline_pg + α × (rz_rate − pos_mean_rz_rate)

Three properties the multiplicative form lacked:

* **It lives in outcome units.** α is *fantasy points per marginal red-zone
  opportunity per game*, so the correction is bounded by football rather than
  by an arbitrary clip.
* **It is a DEVIATION term, and that is the real argument.** `baseline_pg` is
  the player's prior-season PPG, which **already contains last season's
  red-zone role**. The trailing within-season `rz_rate` therefore does not
  measure his red-zone usage — it measures **how far this season's usage has
  moved from what last season implied.** That is a role-change signal, which
  is a genuinely different quantity from the one the multiplicative arm
  scaled, and it is the reason to expect anything at all.
* **A player at his position's average gets zero correction**, by
  construction. The multiplicative form multiplied him by
  `rate/pos_mean` ≈ 1 only by coincidence of the ratio.

**α is chosen by leave-one-season-out** over a declared grid
`(0.0, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0)` points per marginal opportunity —
fitted on the other three seasons, evaluated on the held-out one, exactly as
`opponent_arm.py`'s λ grid does. **α = 0.0 is in the grid on purpose:** it is
"do nothing", and if LOSO selects it, that is the honest answer and files as
one (DS9's own limitation note — best-of-K's TE winner was λ=0.00).

## 2 · POPULATION — deliberately IDENTICAL to P292

Same eligible player-weeks, same `MIN_PRIOR_WEEKS=3` trailing rule, same
leak-free `rz_rate_series`, same folds (2022-2025), same `baseline_pg`.
**Reused by import from `target_quality_tilt.py`, not reimplemented** (Rule
11), so this is a paired comparison against P292 rather than a new study that
happens to look similar. Any difference in result is the transform and only
the transform.

## 3 · THE BAR, FIXED BEFORE THE RUN

**Primary: pooled ΔMAE vs `baseline_pg` ≥ +0.10 points**, and positive in
**≥3 of 4** folds.

**+0.10 is deliberately the SAME bar P286 and P292 used, not a softer one.**
This arm has an obvious excuse for a lower threshold — it is a marginal
correction rather than a new signal — and taking that excuse after two FALSEs
on the same axis would be bar-shopping. It keeps the sibling studies
comparable.

**Correlation gate, re-measured and NOT inherited:** ρ(additive arm,
`baseline_pg`) must be **< 0.98**. **Register 191 states the trap explicitly
and it applies to me: ρ=0.74 was measured on the MULTIPLICATIVE arm, and an
additive form could easily collapse toward the baseline it is added to.** A
small α makes the arm *nearly the baseline*, which would score well on MAE and
be worthless in a blend. **If ρ ≥ 0.98 this files as a costume even if the MAE
bar clears** — that is the whole point of the gate and the reason this study
exists.

**Reported alongside, not as the bar:** whether MAE ≤ ~5.2, register 191's
blend break-even. If the primary bar clears, this is automatic; it is recorded
so the blend-relevant number is on the page either way.

**What a null looks like, declared now:** LOSO selects α=0.0 · pooled ΔMAE
below +0.10 · a fold split worse than 3-1 · or ρ ≥ 0.98. Any one files FALSE.

**Blind expectation, on the record:** I expect a **small positive at best, and
a null is more likely than not.** The deviation argument in §1 is real but the
signal is thin — most players' red-zone role does not move much within a
season, so the correction is near zero for the bulk of the population.
**Stated so a null cannot be retold as "we always knew", and a hit cannot be
retold as "as predicted".**

## 4 · THREE-PART FILING STANDARD

* **LEARNING TARGET:** whether the one decorrelated axis this programme has
  found can be made accurate enough to carry into Tier 2 — the decision is
  whether red-zone opportunity stays a live Tier-1 candidate or the axis
  retires with its decorrelation unexploited.
* **SKILL DESIGN:** paired against P292 on an identical population by import,
  so the transform is the only moving part; LOSO-selected α with "do nothing"
  in the grid; the same +0.10 bar as the sibling studies; and a re-measured
  correlation gate that can fail the arm on its own even when MAE passes.
* **CONSEQUENCE ROUTE:** TRUE → red-zone becomes the first qualifying Tier-1
  arm and register 191's step-3 dependency has a candidate; the ship decision
  is A's, since `weekly_own_projection.py` is TERRITORY: A. FALSE → **the axis
  retires for 2026** with its decorrelation recorded as measured-but-
  unexploitable, and register 191's conclusion narrows to "no qualifying arm
  exists" rather than "one is being built".

## 5 · WHAT RUNS NEXT

`draft/backtest/red_zone_additive.py`, built after this file is committed,
writes `draft/backtest/red_zone_additive.json`. Tests in
`draft/tests/test_red_zone_additive.py`, including a **Rule 3e known-positive**:
a synthetic player given a large planted rz_rate surplus must receive a
correction of exactly `α × surplus`, and one at the position mean must receive
exactly zero. Result in `draft/audit/red_zone_additive_2026-08-21.md`.

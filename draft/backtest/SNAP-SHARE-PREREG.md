# SNAP-SHARE — PREREGISTRATION (committed before the arm exists)

_TERRITORY: D. Register 13. Written 2026-08-17._

## The question

`snap_counts_*` is captured weekly 2021-25 (35,705 player-weeks, join 0.9919)
and reaches **zero** board fields. Does prior-season snap share predict
next-season fantasy points **beyond prior-season points**?

## Construction

- `snap_share(Y)` = mean weekly `pct` over season Y, players with ≥8 weeks.
- Outcome: season Y+1 total points, our scoring.
- **Partial Spearman**: rank-residualise next-points and snap-share against
  **prior-season points**, correlate residuals. Nothing fitted.
- Folds **2021→22, 2022→23, 2023→24, 2024→25**. All four usable — the
  fingerprint split is a float32 artifact (`scoring_fingerprint_artifact`).
- **Absent stays absent.** No imputation. Join survival recorded per fold.

## Bar

Partial ρ **> 0 and beats the 400-draw permutation null in ALL FOUR folds.**

**And the props lesson applies:** the arm must also beat `naive_prev` — prior
season points carried forward — on the same population. **A signal that cannot
beat carry-forward is not a signal**, and last time I reported one before
checking that.

## Calibration — declared now

- **Expect partial ρ +0.05 to +0.20.** Snap share is an opportunity measure;
  most of its information should already be in points.
- **Above +0.40 is a leak report**, not a result.
- **THE LIKELY KILLER, named in advance:** collinearity with volume. TPRR died
  this way — ρ(TPRR, targets) 0.74-0.82, so it duplicated rather than
  complemented. **ρ(snap_share, prior points) is measured and reported before
  the verdict is read**, and above ~0.75 the same verdict applies.
- At or below the null = no incremental signal at season grain.

## If null, the trigger is chosen now

> Re-test at **weekly grain** (snap share's own variance is the interesting
> part — the store already carries `share_volatility`), or **per-position**
> (RB committee splits are where snap share should matter most).

**Nothing installs either way.** Measuring is not shipping; wiring is A's and
Cory's, post-08-22.

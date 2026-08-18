# SNAP SHARE — a null, and the second opportunity metric to die the same way

_TERRITORY: D. Register 13. Preregistered in `SNAP-SHARE-PREREG.md`, committed
first. Result: `snap_share_arm.json`._

**`clears: false`.** Snap share does not add to prior-season points.

| fold | n | partial ρ | null p95 | beats | raw ρ | naive_prev ρ | **collinearity** |
|---|---|---|---|---|---|---|---|
| 2021→22 | 354 | +0.140 | +0.079 | ✅ | +0.698 | 0.774 | **+0.840** |
| 2022→23 | 344 | +0.060 | +0.079 | ✗ | +0.598 | 0.707 | **+0.811** |
| 2023→24 | 362 | **−0.020** | +0.086 | ✗ | +0.603 | 0.737 | **+0.829** |
| 2024→25 | 358 | +0.139 | +0.090 | ✅ | +0.674 | 0.760 | **+0.819** |

Bar was all four folds. 2 of 4, and one fold is negative.

## The mechanism, named in the prereg before the run

**ρ(snap share, prior-season points) = 0.81–0.84 in every fold.** Snap share is
four-fifths rank-explained by the points it was meant to complement. Residualise
that out and little remains.

**And raw snap share never beats carry-forward:** raw ρ 0.60–0.70 against
`naive_prev`'s 0.71–0.77, every fold. The props lesson applied — a signal that
cannot beat carry-forward is not a signal.

## The generalisation, which is the useful part

**Two independent opportunity metrics have now died identically.**

| metric | ρ to the volume measure it should complement | verdict |
|---|---|---|
| TPRR (routes) | 0.74–0.82 vs targets | null, register 14 |
| snap share | **0.81–0.84** vs prior points | null, this |

**Season-grain opportunity metrics in this project are ~80% redundant with
volume.** That is now a measured pattern across two stores, not a hunch — and it
predicts the same fate for any third metric built the same way. **Measure the
collinearity first**; it costs one line and would have called both results in
advance.

## Rule 3d on my own null

- **Varied?** Yes — `pct` spans 0.000–1.000, 101 distinct values.
- **Arrived?** Yes, recorded per fold. 68–84 of ~430 lost, all at the Y+1 points
  join — players who had snaps and then did not play again. **Attrition, not a
  crosswalk failure**; absent stays absent.
- **Could it fire?** Yes — two folds beat the null, and the control is strong.

## Trigger (declared in the prereg, before the number)

> Re-test at **weekly grain** — the store already carries `share_volatility`,
> and snap share's *variance* is the untested part — or **per-position**, where
> RB committee splits should matter most.

**The weekly job keeps running.** Rule 3c. **Nothing installs.**

## NOISE-FLOOR RE-READ (added 2026-08-17, after the floor was measured per-n)

The zero-trait p95 for the partial statistic scales sharply with sample size —
**+0.157 at n=100, +0.128 at n=150, +0.100 at n=300, +0.074 at n=400**
(`collinearity_check.noise_floor`). Every fold below is re-read against the floor
for **its own n**, which an earlier single-n figure got wrong.

| fold | n | partial | floor(n) | reads as |
|---|---|---|---|---|
| 2021→22 | 354 | +0.140 | +0.086 | **above** |
| 2022→23 | 344 | +0.060 | +0.089 | at/below floor |
| 2023→24 | 362 | −0.020 | +0.084 | at/below floor |
| 2024→25 | 358 | +0.139 | +0.085 | **above** |

**The verdict does not change.** `clears: false` stands (2 of 4, one negative). **But a correction to how I first characterised these:** I called the two positive folds noise-floor draws using a single n=300 figure. At n≈354 the floor is **+0.085**, so +0.140 and +0.139 clear it by a real margin. They are genuine positive folds that failed to replicate in the other two — which is a weaker claim than 'signal' and a stronger one than 'noise'.

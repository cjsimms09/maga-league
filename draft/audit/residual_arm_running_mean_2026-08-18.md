# THE RUNNING-MEAN-RESIDUAL FIT — CLEAN NULLS, AND ONE REAL NEGATIVE

_TERRITORY: D. Preregistered in `RESIDUAL-ARM-RUNNING-MEAN-PREREG.md`,
committed first. Result: `residual_arm_fit.json`. Filed after A's
"fit on the historical folds now" go-ahead turned out not to be
constructible as specified — see
`draft/audit/residual_arm_sleeper_blocker_2026-08-18.md`._

> **⚠️ EVERY NUMBER BELOW IS AGAINST THE RUNNING-MEAN BASELINE, NOT SLEEPER.**
> Sleeper has no per-player projection history for 2023-25 anywhere in this
> repo — measured, not assumed. This is a different, honestly-labelled study
> that tests the same hypothesis on data that exists.

## THE RESULT — nothing clears, and RB/vegas is a real negative

| position | arm | pooled ΔMAE | seasons + | CI | clears |
|---|---|---|---|---|---|
| QB | vegas | −0.0067 | 0/3 | [−0.0087, +0.0032] | ❌ |
| **RB** | **vegas** | **−0.0391** | 0/3 | **[−0.0402, −0.0007]** | ❌ |
| RB | usage | 0.0000 | 0/3 | [0, 0] | ❌ |
| WR | vegas | 0.0000 | 0/3 | [0, 0] | ❌ |
| WR | usage | 0.0000 | 0/3 | [0, 0] | ❌ |
| TE | vegas | +0.0030 | 2/3 | [−0.0154, +0.0084] | ❌ |
| TE | usage | 0.0000 | 0/3 | [0, 0] | ❌ |

**RB/vegas is a genuine negative — the CI excludes zero on the harmful
side.** Applying the game-environment tilt to RB predictions against the
running-mean baseline makes them worse, with real statistical support, not
just a null.

**Every `[0, 0]` CI is a fold that fit λ=0 in all three leave-one-out folds**
— at λ=0 the arm is arithmetically identical to the baseline, so every
bootstrap draw scores the same by construction. Verified this is the correct
behaviour, not a bug, by checking the underlying per-fold fits (§3).

**BEST-OF-K: `do_nothing` wins at every position except TE**, where `vegas`
nominally wins but the field-margin p-value is 0.45 — not distinguishable
from a no-skill panel.

## 1. THE POPULATION IS REAL

The usage arm's `[0,0]` rows are not a coverage gap: `tgt_share` was present
for **100% of eligible RB/WR/TE rows** in 2023 (568/568, 839/839, 265/265),
checked directly rather than assumed. The null is measuring the signal, not
a missing join.

## 2. A REAL DEFECT WAS CAUGHT AND FIXED BEFORE THIS SHIPPED

The first version of the bootstrap CI computed a single "representative" λ
(the median across the three leave-one-out folds) and resampled at that
fixed value. **This silently discarded real per-fold variation.**
RB/vegas fits λ = 0.5 / 0.0 / 0.0 across its three folds — a genuinely
nonzero value in one fold — but `median([0.5, 0, 0]) = 0`, so the first CI
came back exactly `[0, 0]` regardless of what the correctly-computed pooled
ΔMAE (−0.0391) actually said.

**Caught by the CI being implausible, not by inspection** — Rule 3d, applied
to my own output before it was reported as a finding. Fixed by bootstrapping
each season's held-out fold **at that season's own fitted λ**, then pooling
across seasons and draws — the CI now reflects the actual walk-forward
procedure instead of a shortcut through it.

**Both shapes are now regression-tested**: a fold with a real nonzero λ must
not collapse to `[0, 0]` (the bug, reproduced directly on RB/vegas); a
position that genuinely fits λ=0 everywhere correctly *should* show `[0,0]`
(the control, on WR/vegas) — so the test cannot be satisfied by just banning
zero-width CIs outright.

## 3. THE PER-FOLD FITS, FOR THE RECORD

| position/arm | 2023 λ | 2024 λ | 2025 λ |
|---|---|---|---|
| QB/vegas | 0.15 | 0.00 | 0.00 |
| RB/vegas | **0.50** | 0.00 | 0.00 |
| RB/usage | 0.00 | 0.00 | 0.00 |
| WR/vegas | 0.00 | 0.00 | 0.00 |
| WR/usage | 0.00 | 0.00 | 0.00 |
| TE/vegas | 0.25 | 0.15 | 0.15 |
| TE/usage | 0.00 | 0.00 | 0.00 |

**TE/vegas is the only arm to fit nonzero in every fold**, and it still does
not clear — 2 of 3 seasons positive (the bar needs 3), and the CI includes
zero.

## 4. WHAT THIS MEANS, PLAINLY

**Two of five Tier-1 signals, tested against a real (non-Sleeper) baseline,
produce nothing worth shipping — and one produces a real, measured harm.**
That is not the same finding as "Tier-1 breadth doesn't work" — three signals
(air-yards/EPA, pace, props) are untested, and the champion here is a weaker
baseline than Sleeper, so a signal that cannot beat even the running mean is
a strong null, but a signal that beats the running mean would not
automatically beat Sleeper either.

**The honest read:** this run does not validate or refute
`RESIDUAL-ARM-PROPOSAL.md`'s core thesis. It tests two of five candidate
signals against a stand-in champion, and the answer is "not these two, not
against this baseline." The Sleeper-residual version — the study that was
actually asked for — remains unconstructible until 2026 completes.

## 5. WHAT THIS DOES NOT COVER

- **Three of five Tier-1 axes untested**: air-yards/EPA, pace, props. `pace_arm.py`
  already exists and is the cheapest next addition.
- **Leave-one-season-out, not literal week-by-week walk-forward** — declared
  in the prereg, same simplification this lane has used all night.
- **QB has no usage arm** — `component_stats_*` carries no QB usage signal.
- **Not wired anywhere.**

## 6. WHAT P94/P95 STILL MEAN

**Unaffected.** Both predictions are about the Sleeper-residual λ_QB/λ_RB,
which this run does not test. Filing them stays blind and stays correct;
this study answers a different, adjacent question and is labelled as such
everywhere it appears.

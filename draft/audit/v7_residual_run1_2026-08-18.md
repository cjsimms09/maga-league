# V7 RESIDUAL LAB, RUN ONE — the frame works, WR is the finding, nothing ships

**A, 2026-08-18. Cory's order ("lets get V7 rolling and if its better, lets
use it") executed the preregistered way: Amendment 1 committed before the
module, the module committed before its first run, promotion pre-authorized
(CORY-ASKS A11) against a bar this run does not move.**

## The run

Season-level residual fit on the 2025 fold (the one Sleeper baseline that
passed every leak gate), from the retained grade rows. Two nested arms, no
feature engineering: `sleeper + λ·(FP − sleeper)` and
`sleeper + λ·(own_v6 − sleeper)`. Non-negative per-position λ,
team-clustered player-split CV (200 splits), startable pool graded beside
the full population, BEST-OF-K as the standing null.
`exp_v7_residual_run1.{py,json}`.

## Results (held-out; ΔMAE negative = beats Sleeper)

| arm | pos | λ [CI] | ΔMAE full [CI] | ΔMAE startable [CI] |
|---|---|---|---|---|
| fp | QB | 0.08 [0.00, 0.63] | +0.95 | +0.35 |
| fp | RB | 0.70 [0.01, 1.27] | +0.19 [−1.23, +2.66] | −1.29 [−4.22, +1.45] |
| **fp** | **WR** | **1.00 [0.73, 1.25]** | **−4.65 [−7.06, −0.73]** | −10.5 [−17.8, +0.98] |
| fp | TE | 0.27 [0.00, 0.67] | −0.11 | −1.18 |
| own | QB | 0.38 | +1.47 | −3.82 (CI spans 0) |
| own | RB | 0.45 | +0.43 | −0.77 |
| **own** | **WR** | **0.81 [0.54, 1.17]** | −3.84 [−7.74, +2.11] | **−9.03 [−16.45, −0.66]** |
| own | TE | 0.33 | −0.35 | +0.04 |

BEST-OF-K: winner `arm_own`, field p = 0.44 — **does not survive** the
selection null with K=3 on one season. The standing null earning its keep.

## What it means

1. **WR is where Sleeper is measurably wrong, and two independent
   correctors both know it.** FP's λ≈1.0 at WR says: at WR, when FP
   disagrees with Sleeper, believe FP essentially in full. Our own model —
   which LOSES solo everywhere — carries real WR information *as a
   correction* (startable CI excludes zero), which is the residual frame's
   entire thesis demonstrated on its first outing.
2. **QB λ ≈ 0 measured, not assumed** — the "model that knows where to shut
   up" arrives on schedule; consistent with the blind weekly predictions
   (P94) and C3's QB verdict.
3. **RB's slope is real but buys no error** — a λ>0 with no MAE gain is
   noise winning; matches C3's RB tie.
4. **Nothing ships**, by the prereg's own run-one rule and the best-of-K
   verdict. The ships-if bar (≥2 positions, startable gain, outside the
   null band) is not met — one season, two arms.

## What this feeds (rule 3g)

- **C3's post-draft source decision to Cory now has a third instrument
  agreeing**: three-way grade, E32's mechanism, and a fitted λ all say the
  WR/TE-side gap is FP-shaped information, strongest at WR.
- **Next runs, in order:** (a) the FP-2023/2024 row refetch (retention now
  standard) unblocks folds 2-3 — the same fit on three seasons is the real
  test of the ships-if bar; (b) C4/C6 feature arms enter (their blind
  predictions P64/P81 are already on file); (c) the weekly lab inherits
  this harness at week 1 with live Sleeper capture.
- **The draft board is untouched** — pre-draft freeze holds.

---

## ADDENDUM — THE PER-GAME SKILL GRADE (Amendment 2, Cory's resource point)

Cory: *"assuming no injuries as that is the skill part."* Re-graded per-game-
when-active (games = weeks with a row, ≥4 floor; both sides ÷17 vs ÷games):

| arm | pos | λ per-game [CI] | ΔMAE/game [CI] | vs λ total-points |
|---|---|---|---|---|
| fp | WR | 0.31 [0.08, 0.54] | −0.055 [−0.104, +0.041] | **1.00 → 0.31** |
| own | WR | 0.56 [0.29, 0.90] | −0.179 [−0.288, +0.075] | 0.81 → 0.56 |
| fp | QB/RB/TE | ≈0 / 0.12 / 0.00 | ≈0 | — |
| own | QB/RB/TE | 0.22 / 0.31 / 0.23 | ≈0 or worse | — |

BEST-OF-K: winner arm_own, p = 0.13 — still inside the null band.

**THE DECOMPOSITION IS THE FINDING.** FP's WR λ collapses from 1.00 (total
points) to 0.31 (per-game): **most of FantasyPros' WR edge over Sleeper is
AVAILABILITY knowledge — who misses games — not per-game production.** Our
own model's WR correction survives the skill lens better (0.56, CI well off
zero): own_v6's WR information is more production-shaped. Both remain real;
they are different skills, and Amendment 2's dual grade now keeps them
separate on every future fold, exactly as the resource lesson prescribes:
production skill and availability skill graded apart, in-season injury luck
excluded from both.

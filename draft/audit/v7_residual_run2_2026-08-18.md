# V7 RESIDUAL LAB, RUN TWO — three folds, and the first replicated NULL

**A, 2026-08-18. Module committed before execution; Amendments 1-3 applied;
blind predictions in the module docstring, graded below.**

## The run

Three season folds (2023/2024/2025), baseline = FantasyPros preseason under
league scoring, re-scored from the RETAINED statline rows the refetch
committed tonight (`fp_hist_rows.json` — register 23's fix paying off on its
first use). First feature arms: prior-season usage (targets+receptions,
z-scored within position) and prior-season efficiency (WOPR + EPA
composite). Full grading stack: total + per-game-when-active + P@12/24 +
per-fold BEST-OF-K + across-fold replication.

## Result: 0/3 folds, both arms, BOTH grades

No position, no arm, no grade produces λ CI>0 with a held-out error gain in
even one fold, let alone the required two. The per-game best-of-K goes
further: **the champion (FP alone) beats the arm field outright in 2024
(p=0.0005) and 2025 (p=0.014)** — adding these features made the number
WORSE, survivably so.

## Blind predictions, graded

- **usage λ>0 at RB/WR — FALSE.** My prediction. FantasyPros' preseason
  projection already prices a player's own prior-season volume in full;
  there is nothing left for the raw share to add.
- **efficiency λ≈0 everywhere — TRUE**, as prior art (pace_arm,
  advanced_efficiency_study) predicted. Mean-reversion holds at season
  grain too.

## What this buys (a null worth as much as a hit — the prereg's own words)

1. **"Add prior-year volume/efficiency to the projection" is now a CLOSED
   question at season grain, three folds deep.** Nobody needs to propose it
   again; the ledger-class answer is on disk.
2. **The lab's live hopes are now sharply ranked:** (a) the source-delta
   arms — run one's WR finding (FP and own-as-correction both carry real WR
   information vs Sleeper) remains the only positive signal the lab has
   produced; (b) C4/C6's STRUCTURED features (backfield competition,
   QB-context attachment — information FP plausibly does NOT price, unlike
   raw volume), blind predictions P64/P81 already filed; (c) the weekly lab
   from week 1, where P94/P95 wait.
3. **The harness is proven end-to-end at three folds** — the exact machinery
   the ships-if bar needs, exercised on a null before anything wanted to
   ship through it. This is BEST-OF-K's "build it while the answer is
   boring," done.

Draft board untouched. Ships-if: not approached, correctly.

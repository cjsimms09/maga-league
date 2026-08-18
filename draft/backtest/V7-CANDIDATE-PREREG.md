# PREREG — own_v7: the candidate set from the 2026-08-18 resource review

TERRITORY: A — written before any candidate was fitted. Cory: *"let's implement
or at least study the best ideas from these resources and see if our model
could benefit in future. Close the loop."* This file IS the loop-closure: every
surviving idea from the nine-resource review, as a fitted-and-graded candidate
with a decision rule and dates — nothing adopted by vibe, nothing lost in a
chat scroll.

own_v6 stays the promoted model until something here beats it under §3.
own_v7 work is DISPLAY-SAFE throughout: proj_ownmodel feeds nothing on the
board (verified element-wise, D14), so building now touches nothing Cory
drafts from on 08-22.

## 1. The candidates — each traced to its source and its prior evidence

| id | candidate | source | prior evidence |
|---|---|---|---|
| C1 | **Fitted per-position age curves** (piecewise around a position peak; Cory's peaks RB 23-26 / WR 26-28 / QB 28-33 / TE 26-29 as initialization ONLY — slopes and peaks fitted on our 2021-25 stores) | ML-skill page + Cory | v2 carries a linear age term; curve shape unfitted |
| C2 | **Ridge regularization** on the v2 base (alpha tuned INSIDE the walk-forward — only on data prior to the predicted season) | algorithm chart | N≈150/position with correlated features → unstable OLS coefficients |
| C3 | **Fitted recency weights, per position** (replace hand-set RECENCY_WEIGHTS 0.7/0.3) | validation dump made A look | the incumbent constant was never fitted — the repo's most-burned class |
| C4 | **Backfield-competition + team-change offseason features, RB arm** | position_predictor (closed ~40% of its market gap, mid-board) | independent ablated result |
| C5 | **NGS/efficiency features restricted to WR** (drop from RB/TE arms) | position_predictor ablation + our own advanced_stats null | two independent nulls agree |
| C6 | **QB-context repricing for receivers** (receiver features conditioned on fitted QB quality; in-season: depth-chart QB change triggers reprice) | Cory's interaction list | not previously modeled |
| C7 | **Availability as a separate gate** (games-played model gating the points model — the position_predictor shape) | position_predictor + our backwards games_expected row | existing defect row gains a design |

Declared NON-candidates, with reasons: tree models (wrong branch at our N —
memorize noise, kill exact attribution); the 0.003 hand-set age slope (borrowed
constant); "~40% synergy" (unfalsifiable as stated); expert re-weighting (graded
tie, expert_skill_grading.json).

## 2. Grading — the D13 harness, plus the metric the review added

Walk-forward on committed stores, 2025 held out (2024 secondary), our scoring,
same-population head-to-head vs own_v6 AND vs Sleeper/FP:

1. **Full-board**: Spearman + MAE per position (the D13 metrics, unchanged);
2. **Top-tier precision** — P@12 and P@24 per position (position_predictor's
   headline: a model can lose the full board and win the draftable zone, and
   the draftable zone is the only zone Cory picks in);
3. Candidates enter ONE AT A TIME on top of v6 (ablation, not a stew), then
   the best-k composite is checked against the sum of its parts.

## 3. Decision rule, fixed now

A candidate ships into own_v7 only if it improves ≥1 position on BOTH metric
families without degrading any other position beyond noise on either — and
position-specific adoption is allowed (C5 is explicitly per-position). The
composed own_v7 must beat own_v6 at ≥2 positions to take the promoted name.
The BLEND decision (does own_vX reach proj_mean) stays D14's — post-draft,
Cory's call, now graded on BOTH metric families since top-tier precision may
flip the RB answer while full-board says stay.

## 4. Predictions, so the ledger can hold us to it

- P-v7a: fitted recency weights (C3) beat 0.7/0.3 at ≥2 positions. Grade by 09-05.
- P-v7b: top-tier precision flips at least one position's blend answer vs
  full-board Spearman (most likely RB). Grade by 09-01.
- P-v7c: C4's offseason features improve RB mid-board (ranks 13-36) more than
  RB top-12, mirroring position_predictor. Grade by 09-05.

(Relay: ledger these three with owner A.)

## 5. Dates

Build C1-C5 by **08-24**; C6-C7 by **08-28**; grading as candidates land;
composite ruling by **09-05**; blend re-open (D14) reads the results. 2020 is
excluded from any extended historical window on sight (COVID-corrupt ECR).
Owner: A. Recheck 08-25.

## 6. Grades as they land (added after each run — never edited above this line)

**2026-08-18 — C1 and C3 graded (`v7_candidate_grade.py`), both NO SHIP:**

- **C2** closed earlier the same day: Ridge gaps 0.000–0.014 across the alpha
  grid, a null on 4 parameters (`ridge_arm_fit.json`).
- **C1 (fitted age curves): NO SHIP — the leak-free curve shape DEGRADES v6.**
  Refit on transitions ending ≤2024 (the committed `age_curve_2026.json`
  includes 2024→25 and would leak), mean-normalized per position, applied to
  QB/RB/WR (207 players). RB loses on everything (ρ −0.012, MAE +2.2,
  P@12 −0.083) and MAE rises at all three featured positions. v2's linear age
  term already owns whatever signal the curve shape carries. The curves stand
  as DESCRIPTION (the QB-decline correction, WR peak 22); as a FEATURE they
  are dead.
- **C3 (fitted recency): NO SHIP — the component-level gap vanishes at the
  system level.** Leak-free w (QB .475 / RB .8 / WR .6 / TE .6), the whole
  stack rebuilt per-position. QB — the position whose blend-level gap was
  0.115 — comes out slightly WORSE (ρ 0.723→0.711); TE marginally better on
  family 1 only; 0 of 4 clear §3. The market and composite arms swamp the
  blend input — P50's "the champion already carries it," measured again by a
  different route. **P-v7a graded FALSE (ledger P62).**

Standing after this pass: **C1, C2, C3 dead. Live: C4 (C builds, post-P38
grant), C5 (WR-only NGS restriction), C6, C7.** P-v7b (top-tier precision
flips a blend answer) stays OPEN — its subject is the source-blend decision,
not these arms; observed so far P@12 moved at exactly one cell in two arms.

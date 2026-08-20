# V8 RUN ONE — PREREG: does the WR source-disagreement signal replicate?

**A, 2026-08-18, committed before the module first runs.** Cory: *"lets do
it."* This is the V8 program's first study, chasing the ONE signal that
survived any V7 gate.

## The claim under test, with its provenance

V7 run one (2025, Sleeper fold, `exp_v7_residual_run1.json`): where our
model disagrees with the market at WR, the disagreement predicts the
market's error —

| arm (2025) | WR λ | WR ΔMAE full | WR ΔMAE startable |
|---|---|---|---|
| fp-as-correction of Sleeper | 1.00 [0.73, 1.25] | **−4.65 [−7.06, −0.73]** | −10.54 [−17.77, +0.98] |
| own-as-correction of Sleeper | 0.81 [0.54, 1.17] | −3.84 [−7.74, +2.11] | **−9.03 [−16.45, −0.66]** |

One fold. It did not ship because it was one fold. This study is the
second fold — and if it holds, the two folds carry DIFFERENT market
sources, which is stronger than the same test twice: the claim becomes
"own-vs-market disagreement at WR predicts the market's residual,
whoever the market is."

## Design

**Folds.** CONFIRMATORY: 2024 — market = FantasyPros
(`fp_hist_rows.json` via run two's `fp_baseline`, 3/3
authenticity-gated), own = own_v6 backcast built by the SHARED harness
(`v7_candidate_grade.build_stack(graded=2024, priors=(2022, 2023))` —
the exact map the secondary fold already grades). CONDITIONAL: 2023,
same recipe shifted back (`priors=(2021, 2022)`) — **this backcast has
never been built; if it fails to build, the failure is REPORTED as a
result line, never silently dropped, and 2023 contributes nothing.**
2025 is not re-run; its numbers are the table above.

**Frame** (V7 run one's, unchanged): y = actual − market ·
x = own_v6 − market · per-position non-negative λ = max(0, Σxy/Σx²) on
the fit half · team-clustered player-split CV, 200 splits, teams from
`component_stats_{fold}`'s majority team per player (declared here:
players with no component row cluster under "UNK" as one team) · dual
grade (total; per-game-when-active, ≥4 games, market/17) · startable
pools QB/TE 24, RB/WR 48 by market ordering · P@12/P@24 on CV
predictions · best-of-K with the champion in the field.

**Ship gate — the §3 families, because a WR-only adoption is what would
ship.** The corrected map (market + λ_cv·x at WR ONLY, all other
positions untouched) is graded through `v7_candidate_grade.verdict`
against the raw market baseline. Error correlation vs baseline is
REPORTED per the standing costume rule — noting here in advance that a
correction arm correlates with its own baseline by construction, so for
this design the number is transparency, not a kill switch; the kill
switches are the families, the replication, and best-of-K.

## Blind predictions (filed as P98 in the ledger, this commit)

1. **WR replicates on 2024**: λ CI > 0 AND full-pool ΔMAE CI < 0 on the
   total grade.
2. **Per-game attenuation is mild for own**: own-as-correction's WR λ
   retains ≥ half its total-grade value under the per-game grade (run
   one measured own's signal as production-shaped, 0.56 vs fp's
   collapse to 0.31).
3. **QB stays dead**: λ ≈ 0 (CI including 0) at QB on every fold.

## SHIPS-IF (A11 binds promotion to this bar, no second ask)

The WR correction ships to the live board iff ALL of:
1. 2024 replicates (blind prediction 1 exactly);
2. the WR-only corrected map improves WR on BOTH §3 families
   (Spearman+MAE and P@12/P@24) with NO position degrading beyond
   noise, on the 2024 frame AND on the 2025 Sleeper frame (built from
   `sleeper_vs_fp_rows_2025.json`, same corrected-map recipe);
3. the corrected map survives best-of-K (not inside the null band).

Ship form if met: board WR projection = sleeper + λ_ship·(own_v6 −
sleeper), λ_ship = the 2025 fold's own-arm CV mean (0.81), implemented
in `draft/build.py`'s pipeline with full paperwork (register row, brief
update, decision-contract note), never a client-side patch. If ANY leg
fails, nothing ships and the result is filed like every other grade.

Module: `exp_v8_source_disagreement.py`, committed before first run.
Artifact: `exp_v8_source_disagreement.json` (+ `_pergame`). Audit:
`draft/audit/v8_run1_2026-08-18.md`.

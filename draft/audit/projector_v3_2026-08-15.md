<!-- TERRITORY: A -->
# PROJECTOR v3 — PREREGISTERED CANDIDATE AGAINST THE REC-3 BAR — 2026-08-15

v2's honest negative stands in `draft/data/model_update_recommendations.json`
(REC-3): it lost at QB on both metrics and at TE on Spearman against the
0.7/0.3 recency blend. v3 is the next candidate, built beside v2 — no shipped
projector code, no engine CFG default, and no v2 file is touched. Promotion
remains a written decision for Cory even on a clean pass.

## 1. The bar (Cory-ratified, quoted, not weakened)

From REC-3, verbatim rule: *"promotion of ANY own model (v1, v2, or successor)
into the composition requires beating BOTH naive baselines (naive_prev AND
recency_blend) at ALL four positions on BOTH metrics (MAE and Spearman) in the
leak-free walk-forward protocol, then a reviewed promotion decision file for
Cory — never an automatic flip."* Strict inequalities; ties lose; an
unmeasurable cell fails the bar.

## 2. Preregistered protocol (fixed before the 2025 comparison was run)

The commit that adds this section, `draft/backtest/own_model_v3.py` and
`draft/tests/test_own_model_v3.py` precedes the commit that adds
`draft/backtest/model_accuracy_v3.json`. Commit order is the proof.

**Evaluation — `own_model_v2.py`'s harness, imported, not re-implemented:**

- graded season **2025**, weeks 1–17 — the ONLY held-out season the committed
  stores allow (they start at 2023; 2025 is the only season with two strictly
  prior stores). There is no leave-one-year-out mode to invoke: the harness's
  walk-forward has exactly one leak-free arm, and this is it.
- population: per position (QB/RB/WR/TE per `draft/data/player_positions.json`),
  players with ≥1 weekly row in the 2025 store and a forecast; MIN_N = 10.
- metrics: MAE, mean signed bias, Spearman within position.
- models head-to-head on the SHARED population: `own_v3`, `own_v2`,
  `walk_forward_v1`, `naive_prev`, `recency_blend`. v3's coverage is
  constructed to equal v2's exactly, so the shared denominator is identical to
  `model_accuracy_v2.json`'s and every non-v3 cell must reproduce that
  artifact **bit for bit** (asserted by test).
- verdict: `promotion_verdict` — REC-3 applied to `own_v3`.

**The candidate.** v3 = per-position convex ensemble of three leak-free
opinions:

| opinion | construction | information set |
|---|---|---|
| `v2` | own_model_v2's fitted OLS, unchanged code, unchanged 2023→2024 fit | weekly stores ≤ 2024, board ages |
| `blend` | 0.7·total₂₀₂₄ + 0.3·total₂₀₂₃ (declared; missing 2023 ⇒ total₂₀₂₄) | weekly stores ≤ 2024 |
| `market` | the league's own **preseason 2025 snake draft** (150 picks, 10 teams, no keepers, `league_history.json`), reduced to position rank by pick_no, priced through the **2024** realized position-rank→points curve; ranks past the curve clamp to its tail | an event completed before 2025 week 1 |

Weights (v2, blend, market), drafted players — position-specific structure is
the deliberate lever:

    QB (0.25, 0.25, 0.50)   RB (0.25, 0.25, 0.50)
    WR (0.50, 0.25, 0.25)   TE (0.35, 0.35, 0.30)

Undrafted players: (w_v2·v2 + w_blend·blend)/(w_v2+w_blend). Clamp at 0,
round 2dp.

**Information set per prediction of season 2025, explicit:** weekly points
stores 2023–2024; v2 coefficients fitted only on the 2023→2024 transition;
the declared 0.7/0.3 blend; the 2025 league draft — a preseason-frozen human
forecast containing zero realized-2025 information; the 2024 realized
rank→points curve; board ages (2026 arithmetic back-projection, inside v2's
features only); the positions record. Nothing from any 2025 game enters any
feature. `_assert_no_leak` guards the stat side; the draft side is guarded by:

**The marker gate (authenticity, EXP-FP-HIST-PROJ G2's logic).** A genuinely
preseason draft contains high picks whose seasons then died. Gate: the 2025
draft must contain ≥1 pick with overall pick_no ≤ 75 at QB/RB/WR/TE whose
realized 2025 total is ≤ 30. Realized totals are consumed ONLY as
verification. Fail ⇒ artifact status `no_markers`, nothing graded — refusal
is the artifact.

**Tuning discipline, stated honestly.** Ensemble weights were tuned only on
the 2023→2024 training transition (features 2023 + the 2024 league draft →
realized 2024), where the frozen configuration beats naive on both metrics at
all four positions (QB 71.67/0.6596 vs 81.36/0.6019; RB 40.37/0.7771 vs
44.62/0.7420; WR 37.06/0.7286 vs 41.34/0.7196; TE 26.10/0.7159 vs
27.63/0.7139). The market signal was separately validated on BOTH pre-2025
drafts (rank-vs-outcome Spearman, drafted players only: 2023 QB 0.43 / RB
0.43 / WR 0.65 / TE 0.28; 2024 QB 0.27 / RB 0.54 / WR 0.38 / TE 0.48). No
2025 evaluation was run during design. Named residual risk: which opinion
anchors which position is additionally informed by v2's already-published
2025 table — public prior art, exactly as v2 was designed off v1's published
failure — so the 2025 arm below is one honest shot, not a search.

**The 2024 arm is deliberately absent** from v3's artifact: the weights were
tuned on 2024 outcomes, so any 2024 grade of v3 is in-sample and reporting
one would manufacture a flattering second sample.

**Not re-litigated** (standing negatives honored): pace-of-play (NULL), age
tie-breaks (NULL), the FP-archive Week-1 source prior (failed its G3/G5
gates — REC-2 stays blocked until January 2027), the 2025-replay projector
comparison. The FP-archive benchmark IS used as context: FP's measured edge
over the blend is 3–9 MAE points per position, so that is v3's realistic
headroom — any v3 number beating FP's 2025 cells by a wide margin would be
treated as a leak until proven otherwise.

**Named data-needs (absent from committed disk, not faked):** per-player
FantasyPros archived preseason projections (only summary metrics were
committed in `exp_fp_hist_proj.json` — the per-player rows are the strongest
absent market feature); per-week usage (targets/carries) and TD counts; team
assignment history; any pre-2023 store (the one-year training transition is
the binding limit of this whole program).

## 3. Results — 2025 arm, shared population

*Pending — this section is filled by the single preregistered run in the
commit that adds `model_accuracy_v3.json`, whatever it says.*

## 4. Verdict against REC-3

*Pending — one bold sentence after the run.*

## 5. Failure analysis / promotion diff

*Pending.*

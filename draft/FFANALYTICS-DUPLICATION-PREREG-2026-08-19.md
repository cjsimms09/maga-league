# PREREGISTRATION — duplicate ffanalytics' model and diff it against ours

**A, 2026-08-19, filed and committed BEFORE the module runs.** Draft is 08-22.

Cory: *"we obviously can't do it ourselves, we need to look at other models and
duplicate"* → then, after I published a description of it: ***"what about the
model from the repos??? have we tested them"***.

**No. I read `calc_projections.R` and described it in `DUPLICATE-A-REAL-MODEL-2026-08-19.md`.
I never ran it. A review is not a test, and §1's table was already wrong in two
rows because I read our own FIELD NAMES instead of our code (register 103).**
This document exists so the actual test is preregistered rather than narrated
after the fact.

---

## 1. WHAT IS BEING DUPLICATED, AND WHY NO R IS NEEDED

R is not installed here. It does not have to be: `projections_table()`'s value
layer is four functions, all fully specified in the source I already pulled.
Re-implemented in Python and **controlled against our own existing artifact**
(see §4).

| ffanalytics | line | what it is |
|---|---|---|
| `wilcox.loc` | L85-95 | **Hodges–Lehmann**: median of all pairwise averages (plus the values). Returns the plain **mean** when n ≤ 2. |
| `whdquantile` | L38-80 | weighted **Harrell–Davis** quantile: Kish effective n = (Σw)²/Σw², Beta-CDF cell weights, `Σ wᵢ·x₍ᵢ₎` |
| `weighted.sd` | L7-21 | weighted standard deviation |
| `default_baseline` | L173 | VOR reference rank **QB13 · RB35 · WR36 · TE13 · K8 · DST3** |
| `default_weights` | L106-110 | per-source weights; **five sources at 0.000** |
| the emit | L497-508 | `points_vor`, `floor_vor`, `ceiling_vor` → **`rank`, `floor_rank`, `ceiling_rank`** |

⚠️ **NOTED BEFORE RUNNING, because it changes what the comparison means:
`wilcox.loc` accepts a `w` argument AND NEVER USES IT.** Read the body — `w` is
in the signature and appears nowhere in the calculation. **So ffanalytics'
CENTRE is unweighted Hodges–Lehmann; only the sd and the quantiles are
weighted.** If our diff had shown a weighting effect on the centre I would have
had a bug, not a finding.

## 2. THE INPUT, AND WHY IT IS A FAIR COMPARISON

`draft/data/multisource_projections.json` — **481 players, per-source season
points already scored under THIS league's table from raw stat lines** (CBS,
ESPN, FFToday; 281 players carry all three). That is exactly ffanalytics'
`source_points()` output stage, so both models consume identical inputs and any
difference is the ESTIMATOR, not the data.

## 3. THE TWO PREDICTIONS

**P135 — the VOR BASELINE dominates the ESTIMATORS.** Swapping only the centre
and band estimators (Hodges–Lehmann + weighted Harrell–Davis, replacing plain
mean + `mean ± 1.28σ`) will move FEWER players in the overall top 50 by ≥3
ranks than swapping only the VOR baseline (QB13/RB35/WR36/TE13/K8/DST3,
replacing ours) does.

**Reasoning stated up front so it can be wrong:** three sources agreeing at
Spearman 0.93–0.97 leave the centre little room to move, while our RB
replacement is **170.5** against their **139.3** — a 31-point shift applied to
every back, in a VOR that compares across positions.

**FALSE if** the estimator swap moves as many or more top-50 players than the
baseline swap.

**P136 — the three-ranking design is NOT cosmetic.** In ffanalytics' own output,
`ceiling_rank` will differ from `rank` by ≥5 positions for **at least 25 of the
top 100** players.

**FALSE if** fewer than 25 differ that much — which would mean their ceiling
ranking collapses onto their value ranking, and **our shipped `+0.45 × ceiling`
is harmless rather than wrong.** That is the outcome that would undercut what I
told Cory this morning, and it is why this prediction is here.

## 4. CONTROLS — the run is void if any fails

1. **REPRODUCTION (the strong one).** My implementation, run with OUR settings
   (plain mean, equal weights), must reproduce `multisource_projections.json`'s
   committed `mean` for every player to within 0.01. **If the harness cannot
   reproduce numbers that already exist, no difference it reports is real.**
2. **`pbeta` known values.** No scipy here, so the regularised incomplete beta
   is hand-rolled: it must satisfy `I_x(1,1) = x`, `I_0.5(a,a) = 0.5`, and
   `I_x(a,b) = 1 − I_{1−x}(b,a)` to 1e-9.
3. **`wilcox.loc` known values.** `[1,2,3] → 2` (symmetric); `n ≤ 2` returns the
   plain mean, per the R source.
4. **`whdquantile` bracketing.** Every quantile must lie within `[min(x),
   max(x)]`, and with equal weights on a large symmetric sample the 50%
   quantile must approximate the median.
5. **Baseline sanity.** Each position's VOR reference must be the player at
   exactly that positional rank, and no reference may be a player who is absent
   from the pool.

## 5. WHAT THIS CANNOT SETTLE, AND THE GUARD

**It compares CONSTRUCTIONS on today's board. It does not grade either against
outcomes** — that needs the seat replay and a season, and it is not what Cory
asked. A board that differs is a finding about the model, not about who is right.

**REPORT ONLY. It writes no board field and ships nothing.** `no_fit_guard`
holds: nothing is selected from this, before or after Saturday. If the
duplication produces a better-looking board that is an argument to grade it in
September, not to ship it on the 22nd.

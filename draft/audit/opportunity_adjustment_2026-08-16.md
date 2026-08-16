<!-- TERRITORY: A -->
# THE OPPORTUNITY ADJUSTMENT — GRADED (2026-08-16)

_Preregistered in `draft/backtest/OPPORTUNITY-ADJ-PREREG.md`, committed
before the runner existed (`469a37b2`). Runner
`draft/backtest/opportunity_adj_grade.py`, artifact
`draft/backtest/opportunity_adj_grade.json`, tests
`draft/tests/test_opportunity_adj_grade.py` (21, green)._

---

## THE ANSWER, FIRST

**It does not improve ordering. It measurably degrades the projection's level.
And it is live on the board Cory drafts from in six days.**

Graded leak-free on 2023, 2024 and 2025 against realized points under the
frozen table, with the shipped adjustment code and three reconstructed
baselines:

- **ORDERING (Spearman, what a draft board consumes): NEUTRAL in 17 of 18
  position × baseline cells.** Every pooled effect is |Δρ| ≤ 0.05 and most are
  ≤ 0.005 — a hundredth of the ordering the baseline already has. The single
  cell that clears its CI (draftable TE on `recency_blend`, +0.0365
  [+0.0044, +0.0831]) is one of eighteen and is not replicated by the same
  cell on the other two baselines.
- **LEVEL (MAE and bias): it HURTS, in 18 of 18 cells, every CI excluding
  zero.** Pooled ΔMAE +1.19 to +8.03 points; in the draftable region +4.66 to
  +10.47. Bias moves **upward by +4 to +17 points** everywhere. The layer is a
  one-sided inflator.
- **It is not right in direction — it is barely distinguishable from noise of
  the same size.** A shuffled adjustment (identical magnitudes, randomly
  reassigned within position) scores Δρ = −0.002 against the real
  adjustment's +0.002. The one-sided permutation p is between 0.10 and 0.88 in
  25 of 27 season cells. **The adjustment is adding noise-shaped scale, not
  player-specific ordering information.** That is the serious finding the
  brief asked to be named if it appeared, and it appeared.
- **Where it hurts worst: RB.** RB is the only position with a negative pooled
  Δρ on all three baselines (−0.0007, −0.0006, −0.0163) and the weakest
  residual signal (partial ρ 0.02–0.10 vs TE's 0.13–0.37).

**And a structural finding that needs no CI at all:** `composite_z()` computes
a composite for **WR/TE and RB only**. Every QB, K and DEF gets
`opportunity_adj` **exactly 0.0000** (MEASURED: 88 QB, 44 K, 32 DEF rows on
the live board). So the layer adds **+32.7 points to the average top-12 RB,
+31.2 to the average top-12 WR, +18.3 to the average top-12 TE, and +0.0 to
every QB.** It moves **QB1 from overall rank 10 to overall rank 16** and shifts
**2.2 percentage points of top-12 VORP mass off QB** (§5). Nothing has ever
graded that transfer.

**Nothing ships.** The prepared diffs are in §7; the item is in
`DECISIONS-NEEDED.md`. Cory rules.

---

## 1. PRIOR VERIFICATION — searched first, and the claim in the brief is right

Repo-wide search of `draft/audit/**`, `draft/audits/**`, `draft/backtest/**` on
this branch **and** on `claude/fantasy-football-research-926y6z`:

| document | what it does with the layer | is it a grade? |
|---|---|---|
| `draft/audits/value_frameworks_2026-08-13.md` | Characterises it (359/576 non-zero, median 1.5 pts, p90 20.8, max 45.0; cap binds asymmetrically) and states the open question in as many words: *"is ±15% the right cap"* | **No** |
| `draft/audit/rule12_result_2026-08-11.md` | Proves the **arithmetic** — `proj_mean = proj_baseline × (1 + opportunity_adj)`, 11/11 exact | **No** — identity, not skill |
| `draft/audit/engine_ablation_2026-08-16.md` | Has an `opportunity` arm; classifies it **EARNS** | **Partly, and it says so** |
| `model_accuracy_v2..v6.json` | Grade own_model arms | **No** — different object |

**The engine ablation deserves its own paragraph, because it is the one thing
that looks like a prior validation and is not one.** Its own §6 says: *"The
season scorer keeps the shipped, opportunity-adjusted `proj_mean`, so the
`minus_opportunity` arm is partly graded by the layer it removes — the delta is
biased TOWARD keeping the layer."* Its replay cell reads *"not
period-computable (lookahead)"*. So its EARNS verdict is a simulation graded by
its own ruler, and the honest independent frame was declared unavailable.

**That declaration is wrong for this layer, and correcting it is what made this
study possible.** `opportunity_metrics()` is a pure function of an nflfastR
play-by-play frame; nflverse serves 2021–2024 pbp; the shipped code runs on it
unmodified. The layer **is** period-computable at the projection level. The
ablation's verdict was about its own simulation replay frame, not about the
adjustment, and this document does not contradict its sim numbers — it supplies
the independent check that document said it lacked.

**Conclusion: no grade against realized points existed. This is the first.**

---

## 2. WHAT COULD AND COULD NOT BE RECONSTRUCTED — the honest constraint, first

Checked before any metric existed, per the brief. **The answer is split, and
the split governs how every number below may be read.**

### 2a. The ADJUSTMENT — exactly reconstructible, leak-free. ✅

Not a reimplementation. The runner **imports `draft/projections.py` read-only**
and calls `opportunity_metrics()` and `composite_z()` themselves, on real
play-by-play, with the shipped constants (`opportunity_cap` 0.15,
`recency_weights` [0.7, 0.3]) read from `draft/config/league_config.json`. The
gsis→sleeper rekey uses `nfl_data_py.import_ids()` — the identical call
`draft/build.py:_id_crosswalk()` makes.

| graded season | pbp seasons used | pbp rows | players with metrics | gsis translated | untranslated |
|---|---|---|---|---|---|
| 2023 | 2022 + 2021 | 99,356 | 793 | 776 | 17 |
| 2024 | 2023 + 2022 | 99,099 | 766 | 757 | 9 |
| 2025 | 2024 + 2023 | 99,157 | 752 | 740 | 12 |

For scale, the live 2026 board's own provenance reads `pbp_rows: 98263,
players_with_metrics: 761, gsis_translated: 739` — the reconstruction is the
same instrument at the same coverage. `_assert_no_leak()` raises on any prior
season ≥ the graded season; it is exercised in both arms by test.

The one restated line — `adj = max(−cap, min(cap, (z/2)·cap))` — is proven
against `blend()` itself by test, and against the **live board**: 376 rows
reproduce `opportunity_adj` exactly and 301 more land inside the known
`opportunity_z`-stored-at-2dp rounding window (the defect
`rule12_result_2026-08-11.md` already recorded). **Zero mismatches.**

### 2b. The shipped BASELINE — NOT reconstructible. ❌ REFUSED.

`proj_baseline` is Sleeper's preseason projection scored under our table.
**No Sleeper preseason projection was ever archived before 2026-08-09**
(`draft/data/proj_series.json`, first snapshot 2026-08-09; the point is REC-2's
whole reason for existing). FantasyPros' historical archive — the one
authenticity-gated substitute, which **passed** all three years in
`exp_fp_hist_proj.json` — is **unreachable from this environment**:
`www.fantasypros.com` and `api.fantasypros.com` both return proxy 403, and that
fetch is CI-only by design. No archived preseason ADP for 2023–25 exists on
disk (`external_adp_series.json` is 6 rows, all 2026).

**So this is NOT a grade of the shipped `proj_baseline → proj_mean` step.** It
is a grade of the shipped *adjustment* applied to three reconstructed
baselines, and the reconstruction is named on every number:

| baseline | definition | what it stands in for |
|---|---|---|
| `naive_prev` | realized points in Y−1 | the repo's own naive baseline |
| `recency_blend` | 0.7·pts(Y−1) + 0.3·pts(Y−2) | the config's own recency weights |
| `market_curve` | the league's **own completed draft** for Y → within-position pick order → the Y−1 positional points curve | a genuine preseason market, frozen before the season |

**Which way this biases, stated before the results.** All three carry *less*
usage information than a professional preseason projection, whose job is
largely to price usage. **An adjustment that adds usage information looks
BETTER here than it can be on the shipped Sleeper baseline. Every positive
number below is an upper bound; the negative ones are not.** That asymmetry is
why this study is worth running at all: it can refute more strongly than it can
confirm — and what it found was a refusal, on the side where the instrument was
generous.

**One reconstruction was needed on the outcome side too, and it is proven.**
`nflverse_weekly_points_*.json` starts at 2023, so grading 2023 needed realized
2022 and 2021. Those were built through the **same path** the committed stores
used (`grade.weekly_points_table` + our scoring table + the `import_ids`
crosswalk). The path was proven by rebuilding **2023** with it and diffing
against the committed store: **5,648 player-weeks, 0 disagreements, 0
one-sided, identical scoring fingerprint `bd8f3e50bd67a9ce`**. A disagreement
would have refused the rebuilt priors rather than graded on them
(`_prove_parity()` raises).

---

## 3. WHAT THE ADJUSTMENT ACTUALLY IS, ON THE LIVE BOARD

`public/draft_data.json`, 677 rows.

### 3a. Distribution by position

| pos | n | non-zero | min | p10 | median | p90 | max | pinned at +cap |
|---|---|---|---|---|---|---|---|---|
| QB | 88 | **0** | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0 |
| RB | 150 | 114 | −0.0709 | −0.0497 | 0.0000 | +0.1369 | **+0.1500** | 11 |
| WR | 236 | 169 | −0.0679 | −0.0522 | 0.0000 | +0.1222 | **+0.1500** | 12 |
| TE | 127 | 91 | −0.0696 | −0.0521 | 0.0000 | +0.1086 | **+0.1500** | 6 |
| K | 44 | **0** | — | — | 0.0000 | — | — | 0 |
| DEF | 32 | **0** | — | — | 0.0000 | — | — | 0 |

**The cap binds only upward.** Range is −0.071 to +0.150: the composite is
bounded below (you cannot have negative target share), so `z` is right-skewed
and the −15% floor is unreachable while the +15% ceiling is hit by 29 players.
**This is not a two-sided correction. It is a bonus with a small penalty
attached.**

### 3b. It moves the players who matter, and it moves them a lot

Mean |proj_mean − proj_baseline| is **21.04 points inside the top 60** and
**1.78 points everywhere else**. The whole effect lives in the draftable region.

| name | pos | overall rank | baseline | mean | Δ | adj |
|---|---|---|---|---|---|---|
| Jahmyr Gibbs | RB | 1 | 299.90 | 344.88 | **+44.98** | 0.150 |
| Bijan Robinson | RB | 2 | 292.90 | 336.83 | +43.93 | 0.150 |
| Puka Nacua | WR | 3 | 259.00 | 297.85 | +38.85 | 0.150 |
| Christian McCaffrey | RB | 4 | 256.00 | 294.40 | +38.40 | 0.150 |
| Jonathan Taylor | RB | 5 | 254.30 | 292.44 | +38.14 | 0.150 |
| Brock Bowers | TE | 9 | 202.50 | 232.87 | +30.37 | 0.150 |

### 3c. At the top of the board it is a CONSTANT — it cannot order anything

| pos | top-12 pinned at +cap | top-24 | top-48 |
|---|---|---|---|
| RB | **8/12 (67%)** | 10/24 (42%) | 11/48 (23%) |
| WR | **9/12 (75%)** | 9/24 (38%) | 10/48 (21%) |
| TE | 4/12 (33%) | 5/24 (21%) | 5/48 (10%) |

Two thirds of the elite RBs and three quarters of the elite WRs carry the
**identical** +0.15. Among them the layer's ordering content is exactly zero;
all it does is multiply that whole tier by 1.15.

### 3d. It is mostly a monotone function of the baseline it is adjusting

`ρ(opportunity_z, proj_baseline)` = **+0.756 RB / +0.762 WR / +0.845 TE**.
Mean adjustment by baseline-rank decile:

    RB  +0.126 +0.085 +0.067 +0.030 +0.005 -0.019 -0.015 -0.011 -0.028 -0.039
    WR  +0.124 +0.087 +0.052 +0.031 +0.017 +0.012 -0.017 -0.030 -0.024 -0.042
    TE  +0.117 +0.097 +0.042 +0.034 +0.011 +0.005 -0.018 -0.024 -0.046 -0.044

Within a position, therefore, the layer is close to a **convex re-scaling of
the baseline** — it stretches the top up and pushes the tail down. Within-
position rank churn is correspondingly small: mean |Δrank| 1.15 RB / 1.99 WR /
0.97 TE.

---

## 4. THE GRADE — ordering first, and separately

Leak-free, 2023 + 2024 + 2025, weeks 1–17, position from that season's nflverse
roster, paired bootstrap over players (2,000 resamples, seasons pooled as
blocks), 95% percentile CI. **Δ is always (adjusted − base) on the identical
player set.** `n` is player-seasons.

### 4a. ORDERING — Spearman. This is the primary metric.

**Full graded population:**

| baseline | pos | n | **Δρ** | 95% CI | verdict |
|---|---|---|---|---|---|
| naive_prev | RB | 316 | **−0.0007** | [−0.0046, +0.0034] | NEUTRAL |
| naive_prev | WR | 466 | **+0.0024** | [−0.0011, +0.0061] | NEUTRAL |
| naive_prev | TE | 266 | **+0.0043** | [−0.0003, +0.0098] | NEUTRAL |
| recency_blend | RB | 334 | **−0.0006** | [−0.0041, +0.0032] | NEUTRAL |
| recency_blend | WR | 488 | **+0.0008** | [−0.0014, +0.0031] | NEUTRAL |
| recency_blend | TE | 277 | **+0.0024** | [−0.0004, +0.0057] | NEUTRAL |
| market_curve | RB | 141 | **−0.0163** | [−0.0433, +0.0105] | NEUTRAL |
| market_curve | WR | 158 | **+0.0000** | [−0.0287, +0.0309] | NEUTRAL |
| market_curve | TE | 42 | **+0.0481** | [−0.0497, +0.1764] | NEUTRAL |

**Draftable region only** (top-48 RB, top-48 WR, top-24 TE by baseline — where
the board is actually consumed):

| baseline | pos | n | **Δρ** | 95% CI | verdict |
|---|---|---|---|---|---|
| naive_prev | RB | 144 | +0.0009 | [−0.0191, +0.0210] | NEUTRAL |
| naive_prev | WR | 144 | +0.0227 | [−0.0086, +0.0560] | NEUTRAL |
| naive_prev | TE | 72 | +0.0339 | [−0.0009, +0.0808] | NEUTRAL |
| recency_blend | RB | 144 | −0.0056 | [−0.0263, +0.0176] | NEUTRAL |
| recency_blend | WR | 144 | +0.0041 | [−0.0180, +0.0280] | NEUTRAL |
| recency_blend | TE | 72 | **+0.0365** | **[+0.0044, +0.0831]** | **HELPS** |
| market_curve | RB | 141 | −0.0163 | [−0.0447, +0.0112] | NEUTRAL |
| market_curve | WR | 144 | +0.0030 | [−0.0327, +0.0399] | NEUTRAL |
| market_curve | TE | 42 | +0.0481 | [−0.0574, +0.1808] | NEUTRAL |

**Read it honestly: one HELPS in eighteen cells at α=0.05 is what chance
produces.** It is TE, and TE is where every other diagnostic also leans
positive (§4c), so it is the one place worth a follow-up — but it is not, on
this evidence, a positive result.

**For context on the size:** the baseline's own ρ is 0.64–0.78. The
adjustment moves it by 0.002. The roster-construction study's archetype effects
— which the brief called small — were fractions of a weekly point on a ~2-point
total edge; this is the same order of nothing, on the ordering axis.

### 4b. LEVEL — MAE and bias. Reported separately, because they disagree with nothing: they are uniformly bad.

**ΔMAE, pooled, 95% CI — positive means the adjustment made the error WORSE:**

| baseline | pos | ΔMAE (all) | 95% CI | ΔMAE (draftable) | 95% CI |
|---|---|---|---|---|---|
| naive_prev | RB | **+3.18** | [+1.73, +4.61] | **+6.98** | [+3.86, +10.00] |
| naive_prev | WR | **+3.46** | [+2.48, +4.55] | **+10.47** | [+7.52, +13.54] |
| naive_prev | TE | **+1.45** | [+0.53, +2.40] | **+6.39** | [+3.11, +9.55] |
| recency_blend | RB | **+2.54** | [+1.24, +3.87] | **+5.99** | [+3.16, +9.09] |
| recency_blend | WR | **+2.73** | [+1.81, +3.72] | **+8.75** | [+5.69, +11.80] |
| recency_blend | TE | **+1.19** | [+0.37, +2.11] | **+4.66** | [+1.36, +7.95] |
| market_curve | RB | **+5.38** | [+2.37, +8.42] | **+5.38** | [+2.48, +8.49] |
| market_curve | WR | **+6.90** | [+4.39, +9.73] | **+7.70** | [+4.83, +10.78] |
| market_curve | TE | **+8.03** | [+3.35, +12.68] | **+8.03** | [+3.15, +12.75] |

**18 of 18 cells worse, every CI excluding zero.** This is the most robust
result in the study.

**And the mechanism is bias, not scatter.** Bias (arm − realized) per season:

| baseline | pos | 2023 base→adj | 2024 base→adj | 2025 base→adj |
|---|---|---|---|---|
| naive_prev | RB | +10.6 → **+17.3** | −0.1 → **+7.0** | +9.3 → **+17.0** |
| naive_prev | WR | +10.0 → **+16.6** | +9.1 → **+15.7** | +12.2 → **+18.7** |
| naive_prev | TE | +4.8 → **+8.6** | +1.3 → **+5.3** | +2.5 → **+6.4** |
| market_curve | WR | — | +21.9 → **+38.4** | +29.6 → **+46.5** |

The adjustment adds **+4 to +17 points of systematic over-projection**, in
every position, in every season, on every baseline. It never once corrected a
level; it always inflated one.

**Why, structurally:** mean `adj` on the board is only +0.020, but `adj`
correlates +0.76 to +0.85 with the baseline, so `E[base·adj] ≫ E[base]·E[adj]`
— the multiplier is concentrated exactly where the points are. Measured on the
live board:

| pos | top-12 mean added | top-24 | top-48 | as % of baseline (top-12) |
|---|---|---|---|---|
| QB | **+0.00** | +0.00 | +0.00 | **0.0%** |
| RB | **+32.67** | +24.81 | +15.51 | 13.7% |
| WR | **+31.21** | +25.37 | +18.71 | 14.7% |
| TE | **+18.31** | +14.66 | +8.25 | 12.0% |

### 4c. Top-K precision

Almost entirely unmoved. Of **73 computable base→adj pairs (3 baselines × 3
seasons × 3 positions × K ∈ {12,24,48}, minus cells with n < K): 58 identical,
8 improved, 7 worsened.** A coin flip on the 15 that moved, and no K, position
or baseline concentrates them — the largest single move in either direction is
one player (1/12 = 0.083). The only faint lean is TE, which takes 4 of the 8
improvements. Notable individual cells: 2024 RB p@12 **0.500 → 0.417** (naive),
2024 WR p@24 **0.625 → 0.542** (market_curve), against 2024 TE p@12
0.417 → 0.500 (recency) and 2023 TE p@12 0.583 → 0.667 (recency).

---

## 5. DIRECTION OR MAGNITUDE? — the decomposition (brief §3)

### 5a. Shuffled control — same magnitudes, randomly reassigned within position

200 permutations per season × position × baseline.

| baseline | pos | Δρ actual (pooled) | Δρ shuffled (pooled) | one-sided permutation p, per season |
|---|---|---|---|---|
| naive_prev | RB | −0.0007 | −0.0011 | 0.505 · 0.555 · 0.245 |
| naive_prev | WR | +0.0024 | −0.0012 | 0.185 · 0.335 · 0.160 |
| naive_prev | TE | +0.0043 | −0.0025 | 0.155 · **0.050** · 0.185 |
| recency_blend | RB | −0.0006 | −0.0016 | 0.400 · 0.535 · 0.385 |
| recency_blend | WR | +0.0008 | −0.0022 | 0.160 · 0.350 · 0.180 |
| recency_blend | TE | +0.0024 | −0.0023 | 0.255 · 0.265 · 0.100 |
| market_curve | RB | −0.0163 | −0.0125 | 0.880 · 0.570 · 0.195 |
| market_curve | WR | +0.0000 | −0.0163 | **0.035** · 0.570 · 0.455 |
| market_curve | TE | +0.0481 | +0.0060 | 0.375 · 0.380 · 0.085 |

**Randomly reassigning the adjustment costs about 0.003 rho. Applying it
correctly gains about 0.002.** The real adjustment beats its own shuffle by
roughly half a thousandth of a rank correlation, and 25 of 27 permutation
p-values sit between 0.10 and 0.88. **This is the brief's "serious finding"
case: the layer is adding noise-shaped scale, not player-specific
information.**

### 5b. Rank-surrogate control — and a warning about how to read it

The surrogate (identical magnitudes re-assigned in descending baseline order)
returns **Δρ = 0.0000 in every cell**. That is a **definition, not a
measurement**: `base × (1 + s)` with `s` monotone in `base` is a strictly
increasing function of `base`, so Spearman is unchanged exactly. It is pinned
by test (`test_rank_surrogate_cannot_change_spearman_and_the_study_must_say_so`)
precisely so nobody later reads that row as evidence.

What it *does* establish is the decomposition: since ~76–85% of the
adjustment's variance is a monotone function of the baseline, and that entire
component contributes **exactly zero** ordering, **all of the layer's ordering
effect comes from its residual component — and that residual is worth +0.002
rho.** The rest of the ±15% is doing nothing to ordering at all. It is doing
the level damage in §4b.

### 5c. Partial-rank test — baseline-free: does the usage signal know the residual?

Spearman between `opportunity_z` and realized, both with the baseline's rank
linearly removed:

| baseline | pos | 2023 | 2024 | 2025 |
|---|---|---|---|---|
| naive_prev | RB | +0.033 | +0.059 | +0.101 |
| naive_prev | WR | +0.162 | +0.067 | +0.231 |
| naive_prev | TE | **+0.261** | +0.131 | **+0.373** |
| recency_blend | RB | +0.090 | +0.044 | +0.022 |
| recency_blend | WR | +0.129 | +0.076 | +0.194 |
| recency_blend | TE | **+0.248** | +0.079 | +0.210 |
| market_curve | RB | **−0.187** | −0.050 | +0.149 |
| market_curve | WR | +0.338 | −0.040 | +0.024 |
| market_curve | TE | +0.261 | **−0.113** | **+0.385** |

**There IS a real signal, and it is ordered TE > WR > RB.** It is positive in
7 of 9 naive/recency cells across all three seasons. But it is weak (0.02–0.37,
n=3 seasons, no CI quotable at this granularity), and — critically — **it does
not survive the trip through the shipped transform**, because the transform
caps at ±15%, is 76–85% collinear with the baseline, and pins the entire elite
tier at a constant.

**So the honest decomposition is: a weak real signal, applied through a
functional form that destroys most of it and adds a level error on the way
out.**

---

## 6. THE CROSS-POSITION LEVEL EFFECT — measured, not graded

Because the layer is RB/WR/TE-only and rises with baseline rank, it moves value
*between* positions. Measured on the live board by importing `draft/vorp.py`
read-only and re-running `replacement_levels`/`apply_vorp`/`assign_tiers` on a
copy with `proj_mean := proj_baseline`.

**Replacement levels:** QB +0.00, RB **+9.72**, WR **+10.62**, TE **+15.55**,
K +0.00, DEF +0.00.

**Top-12 VORP mass** (the quantity dollars are proportional to):

| pos | shipped | adjustment-off | Δ | Δ% | share shipped | share off |
|---|---|---|---|---|---|---|
| QB | 158.0 | 158.0 | +0.0 | +0.0% | 7.1% | **9.3%** |
| RB | 986.0 | 730.6 | **+255.4** | +35.0% | 44.4% | 43.2% |
| WR | 846.3 | 599.2 | **+247.1** | +41.2% | 38.1% | 35.4% |
| TE | 231.8 | 204.8 | +27.0 | +13.2% | 10.4% | **12.1%** |

**The layer transfers ~2.2 pp of the auction budget off QB and ~1.7 pp off TE,
onto WR (+2.7 pp) and RB (+1.2 pp).**

**Board ordering:** mean |Δ overall rank| **7.45** across the board, **6.08
inside the top 60**, and **51 of the top 60 change position**. **QB1 moves from
overall rank 10 to 16.** Largest top-60 moves (adjustment-off → shipped):

    Josh Jacobs      RB  63 -> 41 (+22)   Jeremiyah Love  RB  24 -> 45 (-21)
    Brian Thomas     WR  76 -> 57 (+19)   Rashee Rice     WR  36 -> 51 (-15)
    Kyren Williams   RB  49 -> 32 (+17)   Sam LaPorta     TE  37 -> 50 (-13)
    Travis Etienne   RB  53 -> 36 (+17)   Drake Maye      QB  28 -> 40 (-12)

Top-24 composition: shipped {RB 9, WR 12, TE 2, QB 1} vs adjustment-off
{RB 11, WR 9, TE 3, QB 1}.

**NO CLAIM IS MADE ABOUT WHETHER THIS TRANSFER IS RIGHT.** Grading a
cross-position dollar allocation needs the money history, not this instrument
— that was preregistered as out of scope. What IS established here is the
magnitude, and that it is large and ungraded.

---

## 7. WHERE IT HURTS, AND THE PREPARED DIFFS — none applied

**Named, per the brief:**

1. **RB is the worst position for it.** Only position negative on all three
   baselines in the full population (−0.0007 / −0.0006 / −0.0163), negative on
   two of three in the draftable region, and lowest residual signal
   (partial ρ 0.02–0.10, with market_curve 2023 at **−0.187**). The RB
   composite is `opportunity_share × 10 + rz_share` — carries, not receiving —
   and it is the one that knows least.
2. **The whole draftable region for level.** ΔMAE +4.66 to +10.47 there, worst
   of any slice, because the adjustment is concentrated precisely there.
3. **The elite tier for ordering.** 67% of top-12 RB and 75% of top-12 WR carry
   the identical +0.15, so within the tier a drafter actually chooses inside,
   the layer is provably inert.
4. **QB, structurally.** Not because the layer hurts QBs directly — it never
   touches them — but because it inflates the three positions it does touch and
   nothing rebalances.

**Prepared diffs, described, NOT applied (§8 of the prereg; nothing ships):**

- **D1 — drop RB from the composite.** `draft/projections.py:composite_z`, the
  `elif p["position"] == "RB":` branch → `continue`. One branch. Leaves WR/TE
  where the residual signal actually lives. *Evidence: §4a, §5c. Caveat: RB's
  Δρ CI includes zero, so this is "remove the arm with no measured benefit and
  the worst residual", not "remove a proven harm".*
- **D2 — centre the adjustment.** After `composite_z`, subtract the
  population-weighted mean of `adj` within position before applying, so the
  layer reorders without inflating. Removes the entire §4b bias result by
  construction and is the diff most directly licensed by the evidence
  (18/18 cells, every CI clear). *Blast radius: every `proj_mean`, therefore
  VORP, tiers and dollars. Not a draft-week edit without a ruling.*
- **D3 — shrink the cap.** The measured residual signal is ~0.002 rho of
  ordering; ±0.15 buys ~30–45 points of level movement to deliver it. A cap in
  the 0.03–0.05 range keeps the (weak) ordering content at a fraction of the
  level damage. *Un-preregistered as a sweep — this study grades the shipped
  cap only, so D3 would need its own prereg before any number is attached.*
- **D4 — do nothing, and record that the layer is ungraded-on-Sleeper.** The
  fully defensible option. Every result here is on reconstructed baselines
  biased **toward** the layer, and REC-2 grades the real thing in January 2027.

**Recommendation to Cory:** **D4 for the 22nd, D2 preregistered for after.**
Six days out, no diff to the value side of a board he has been running mocks on
is worth a measured-in-noise ordering gain — and the one change the evidence
does strongly license (D2, the bias) is the one with the widest blast radius.
The finding to *act* on now is not a code change: it is that **QB1 sits at
overall rank 16 instead of 10 because of an ungraded layer**, and Cory should
know that when he drafts.

---

## 8. WHAT THIS CANNOT ANSWER

- **Whether the adjustment helps on Sleeper's own preseason baseline.**
  Structurally unmeasurable until January 2027 (REC-2, already armed). This is
  the honest headline caveat and it is why §7 recommends D4.
- **Whether ±0.15 is the right cap.** This grades the shipped cap. A sweep
  needs its own preregistration.
- **Anything about QB, K or DEF**, where the layer is identically zero.
- **Whether the §6 cross-position transfer is right.** Magnitude only.
- **Three seasons.** Every CI here is a 3-season CI and several effects sit
  inside noise. Where they do, this document says so rather than rounding
  toward a verdict.

---

## 9. REPRODUCE

    python3 draft/backtest/opportunity_adj_grade.py     # writes opportunity_adj_grade.json
    python3 -m pytest draft/tests/test_opportunity_adj_grade.py -q   # 21 passed

Needs network (nflverse pbp 2021–2024, `nfl_data_py.import_ids`,
`import_seasonal_rosters`, `import_weekly_data`) and `pandas`/`pyarrow`.
`PBP_DIR` at the top of the runner points at the cached parquet.

**Suite at the time of writing:** `pytest draft/tests -q -m "not repo_parity"`
→ **1 failed, 2174 passed, 6 skipped**. The failure is
`test_core_needs_no_reviewer.py::test_NO_WORKFLOW_MAKES_A_MODEL_JOB_DEPEND_ON_THE_REVIEWER`
(`config-check.yml` references the reviewer job) — **pre-existing on this
branch and unrelated to this work**, which touches no workflow. Reported, not
hidden.

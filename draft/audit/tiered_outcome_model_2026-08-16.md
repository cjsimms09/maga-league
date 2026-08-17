# TERRITORY: C

# TIERED OUTCOME MODEL — verdict, 2026-08-16

Preregistration: `draft/backtest/TIERED-OUTCOME-PREREG.md` (commit `dc025c1f`,
committed **before** the model existed).
Code: `draft/backtest/tiered_outcome_model.py` · artifact:
`draft/backtest/tiered_outcome_model.json` · tests:
`draft/tests/test_tiered_outcome_model.py` (25, 4 of them store-gated).

---

## THE ANSWER

**Cory's thesis is half right, and the half that is right is not the half a
model can sell him.**

**Late rounds really are where league-winners come from.** Of the 170
player-seasons drafted at pick 61 or later across 2023–25 (rounds 7–15 in a
10-team league), **21 — 12.4% — finished the season as LEAGUE-WINNERs** (top
half of the startable field at their position). That is a large, real rate. He
is right that the studs are there.

**Nothing we built finds them, and P(LEAGUE-WINNER) is among the WORST of the
rankings tested.** Ranking those late-round players by the tiered model's
`P(LEAGUE-WINNER)` and taking the top 10 each season captured **3 of 21**.
Pure chance captures **3.71**. The model is at chance in the exact cell it was
built for.

**The room already beats it.** The league's OWN DRAFT ORDER within rounds 7–15
captured **7 of 21** — roughly twice chance, and more than every model measured
over the same three seasons (and, in 2025 where both exist, more than own_v6:
2 against 1). Cory's league-mates, in aggregate, order late-round players better
than our projections do.

**The class distribution adds nothing to the mean it came from.** Within
position, `P(LEAGUE-WINNER)` ranks players at Spearman **0.967–0.999 (mean
0.990)** against the same model's own expected points — and gives an
**identical** Spearman against realized points to four decimals, at every
position in every season, because within a position the two are a monotone
transform of each other. The preregistered REDUNDANT bar (≥0.95) fires.

**Calibration is the one result that came out well, and it has a hole in
exactly the wrong bucket.** Four of five reliability buckets land inside their
observed 90% Wilson interval. The fifth is the top one: the model says **55%**
and delivers **46%** (CI 0.367–0.548) — over-confident precisely where a
drafter would act on it. One miss is under the preregistered MISCALIBRATED
threshold of two, so the headline does not fire on the primary arm — **but both
declared sensitivity arms fire it.**

**VERDICT: REDUNDANT / NULL. Nothing ships.** No board, model, projection or
config change is proposed from this experiment.

---

## 1. THE KEY CELL — Cory's thesis, tested directly

Population: player-seasons **drafted at pick ≥ 61** in the league's own
completed drafts, 2023/2024/2025, that also clear the shared population rule
(a prior-season stat row and a scored week in the graded season).

| | 2023 | 2024 | 2025 | total |
|---|---|---|---|---|
| late-round players in the cell | 59 | 57 | 54 | **170** |
| of whom finished LEAGUE-WINNER | 8 | 5 | 8 | **21 (12.4%)** |

Hits in the top 10 of **each season's own** ranking, summed (30 picks in total;
**chance = 3.71**):

| ranking | hits@10 | hits@20 (chance 7.4) |
|---|---|---|
| **market — the league's own draft order** | **7** | **9** |
| tiered model, expected points | 5 | 7 |
| recency_blend (0.7/0.3) | 4 | 7 |
| naive_prev | 3 | 6 |
| **tiered model, P(LEAGUE-WINNER)** | **3** | 7 |
| own_v6 — *2025 only, chance 1.48* | 1 *(of 8 available)* | 2 |

Paired bootstrap, 2,000 draws, resampling players **within each season** and
re-ranking inside it, of `P(LEAGUE-WINNER)` minus the market:

- k=10: mean **−4.14**, 90% CI **[−8, 0]**
- k=20: mean **−3.49**, 90% CI **[−7, 0]**

So the model is not *provably* worse than the market — the interval touches
zero — but it is directionally worse and nowhere near the preregistered
CONFIRMED bar, which required beating **every** mean baseline with a CI
excluding zero.

**Per season, so nobody has to take the sum on trust:** hits@10 for
`P(LEAGUE-WINNER)` were 3 (2023), 0 (2024), 0 (2025); for the market 3, 2, 2.
The model's entire late-round performance is one good season.

**Widened to every undrafted player** (the secondary cell the prereg promised):
1,074 player-seasons, 30 LEAGUE-WINNERs, base rate 2.8%, chance@10 = 0.84.
Expected points 3, `P(LEAGUE-WINNER)` 2, recency_blend 2, naive_prev 2, own_v6
1 (2025 only, chance 0.33). Bootstrap of `P(LEAGUE-WINNER)` against the best
(expected points): +0.09, CI [−3, 3]. Nothing separates anything.

**A note on how "pooled" is computed, because it changes the answer.** Ranking
all three seasons in ONE list — the other reading of "pooled" — gives
`P(LEAGUE-WINNER)` 1 hit and the market 2, because a single list lets whichever
season the model was most confident in eat the entire top-k. A drafter drafts
once a year, so the verdict is taken on the per-season sum. Both are in the
artifact (`one_list_across_seasons_not_used_for_the_verdict`); the choice is
visible rather than buried, and
`test_pooling_seasons_into_one_list_is_not_the_same_as_summing_them` pins it.

---

## 2. CALIBRATION — good, except where it matters

Pooled over 1,245 graded player-seasons:

| P(LEAGUE-WINNER) bucket | n | mean predicted | observed | observed 90% CI | inside? |
|---|---|---|---|---|---|
| [0.00, 0.05) | 844 | 0.012 | 0.010 | 0.005–0.017 | ✅ |
| [0.05, 0.10) | 125 | 0.072 | 0.088 | 0.055–0.139 | ✅ |
| [0.10, 0.20) | 111 | 0.142 | 0.171 | 0.120–0.238 | ✅ |
| [0.20, 0.35) | 86 | 0.268 | 0.279 | 0.207–0.364 | ✅ |
| **[0.35, 1.00]** | **79** | **0.554** | **0.456** | **0.367–0.548** | **❌** |

The three middle buckets are honest to a couple of points, which is genuinely
good for a 13-feature fit on ~1,000 rows. **The top bucket is over-confident and
it is the only bucket anybody would ever draft on**: 79 players were told they
had better than a one-in-three shot at a league-winning season, the model's
average claim on them was 55%, and 46% delivered. The preregistered
MISCALIBRATED headline needs two buckets to miss, so it does not fire here — the
rule is applied as written, not bent — but a reader should not take "calibration
bar met" as "calibrated where it counts."

**And the calibration verdict is NOT robust to the tier definition.** Under
sensitivity **S2** (flex slots dropped, K = QB 10 / RB 20 / WR 20 / TE 10) and
under sensitivity **S1** (absent season ⇒ 0 points ⇒ BUST), **two buckets miss
in each and the artifact reports MISCALIBRATED.** `vorp.py` documents that the
flex allocation is a step function which moves on a 2% projection nudge, so this
is exactly the fragility it warns about, landing on a calibration result. Read
the calibration as *"clean in the middle under one particular slot split, and
over-confident at the top under all three."*

---

## 3. DOES P(TOP TIER) ADD ANYTHING OVER THE MEAN? — the honest null

Within-position Spearman between `P(LEAGUE-WINNER)` and a mean:

| against | QB | RB | WR | TE | mean |
|---|---|---|---|---|---|
| **the tiered model's own expected points** | 0.997 | 0.999 | 0.999 | 0.967 | **0.990** |
| naive_prev | 0.956 | 0.948 | 0.952 | 0.930 | **0.947** |
| recency_blend | 0.937 | 0.945 | 0.947 | 0.917 | **0.937** |

**The decisive fact is not a threshold, it is an identity.**
`P(LEAGUE-WINNER)` and expected points produce **identical** within-position
Spearman against realized points — 0.5425 / 0.6619 / 0.7695 / 0.7194 in 2023,
and so on in every season, to four decimals — because within a position they are
a monotone transform of each other. For the job of ordering players at a
position, **the four-class distribution and the single mean it implies are the
same object.** That is the null, stated as plainly as it can be.

**How the bar was applied, including where it was ambiguous.** The prereg said
REDUNDANT fires at ≥0.95 pooled against "the best mean baseline". Against the
model's own implied mean that is 0.990 — far over. Against the two external mean
baselines it is 0.947 and 0.937 — just **under**. The coded rule takes the
maximum over all three and fires REDUNDANT; where the reading was ambiguous the
call was taken **against our own model**, not for it. Nothing turns on which
reading you prefer: the ~0.94 against an external mean leaves about 12% of rank
variance unexplained, and that residual buys **no measured advantage anywhere** —
it loses the late-round cell, loses top-12/24/48 precision, and ties on overall
ordering.

---

## 4. OVERALL ORDERING AND THE DRAFTABLE REGION

The tiered model is **not** a bad projection — it just is not a *different* one.
Pooled within-position Spearman of its expected points vs realized:
**QB 0.624 · RB 0.742 · WR 0.751 · TE 0.715**.

Per season, best cell in bold:

| season | model | QB | RB | WR | TE |
|---|---|---|---|---|---|
| 2023 | tiered expected pts | 0.543 | **0.662** | **0.770** | 0.719 |
| | recency_blend | 0.550 | 0.653 | 0.764 | **0.726** |
| | naive_prev | **0.552** | 0.646 | 0.748 | 0.716 |
| | market | 0.533 | 0.637 | 0.693 | 0.558 |
| 2024 | tiered expected pts | 0.585 | **0.795** | 0.712 | 0.692 |
| | recency_blend | **0.655** | 0.760 | 0.716 | **0.711** |
| | naive_prev | 0.603 | 0.755 | **0.721** | 0.702 |
| | market | 0.630 | 0.741 | 0.656 | 0.499 |
| 2025 | tiered expected pts | **0.746** | **0.816** | **0.788** | 0.753 |
| | recency_blend | 0.721 | 0.785 | 0.758 | 0.787 |
| | own_v6 | 0.723 | 0.787 | 0.761 | **0.794** |
| | naive_prev | 0.709 | 0.778 | 0.753 | 0.752 |
| | market | 0.509 | 0.685 | 0.653 | 0.528 |

Top-N precision on VORP (mean over the three graded seasons):

| ranking | top12 | top24 | top48 |
|---|---|---|---|
| **market** | 0.278 | **0.431** | **0.563** |
| recency_blend | 0.278 | 0.403 | 0.486 |
| naive_prev | **0.278** | 0.403 | 0.465 |
| tiered P(LEAGUE-WINNER) | 0.194 | 0.361 | 0.479 |
| tiered expected points | 0.194 | 0.375 | 0.472 |
| own_v6 *(2025 only)* | 0.250 | 0.458 | 0.479 |

**The same shape today's Sleeper-vs-FP grade found, arriving from a different
direction:** the market loses the overall rank correlation at every position in
every season — often badly, TE 0.499 to 0.558 — and wins the draftable region
anyway. Whatever our projections are better at, it is not the part of the list
anybody drafts from.

**One suggestive cell that is NOT a claim.** On 2025, the tiered model's
expected points out-correlates own_v6 at QB (0.746 vs 0.723), RB (0.816 vs
0.787) and WR (0.788 vs 0.761), and loses at TE (0.753 vs 0.794). That is a
13-feature ordinal logistic against the promoted model. **It is not a clean
head-to-head and must not be read as one:** own_v6 covers 387 of the 422 graded
players here, the population is this experiment's, not the own-model harness's
shared denominator, and its committed QB cell (0.7225) reproduces exactly while
its RB cell does not (0.7872 here vs 0.7968 committed) — which is precisely the
denominator difference showing itself. A real comparison would have to run
inside `model_accuracy_backtest`'s harness, and that is A's file.

---

## 5. WHAT OPENFPL ACTUALLY IS — read vs inferred

**READ, from the repository** (`README.md`, `play.ipynb`, `plug.txt`,
`models/`, `data/samples.csv`, `models/cv1_MID/search.txt`):

- `play.ipynb` loads per-position, per-fold saved models, predicts, inverse-
  transforms through one `yscaler`, and takes `np.median` across every fold ×
  candidate. Output column: `prediction` — **one continuous number**.
- `models/` = `xscaler.save`, `yscaler.save`, `features.save`, and 25
  directories `cv{1..5}_{GK,DEF,MID,FWD,AM}`. `features[position]` selects a
  **different feature subset per position**.
- `search.txt` candidates are `method-xgboost` and `method-randforest`, scored
  by one scalar `error` (~2.40 FPL points), chosen by an evolutionary
  population search (their K-Best Search framework).
- `plug.txt` pins `xgboost, scikit-learn, pandas, joblib` — **no classifier, no
  calibration library.**
- `samples.csv` features are lagged rolling windows at 1/3/5/10/38 gameweeks
  over the player, his team and his opponent — leak-free by construction.
- The README defines Zeros / Blanks / Tickers / Haulers **as column headings of
  an RMSE table.**

**INFERRED (and labelled as inference):** OpenFPL does **not** predict a
distribution over outcome classes. Its four tiers are **evaluation strata on
the realized outcome** — the test set is partitioned by what actually happened
and RMSE is reported inside each partition. The idea that transfers is *report
error inside the outcome bands that matter, because a global error number is
dominated by the many low-scoring observations and hides whether you can hit the
haulers.* Predicting the distribution over those bands is **our** step; the
framing that OpenFPL "predicts a distribution over outcome classes" is not what
the code does, and no part of this verdict credits OpenFPL with it.

**NOT READ:** the paper (arXiv 2508.09992) — unreachable from this sandbox. No
claim here rests on it.

**Where we deliberately diverge from OpenFPL and why:** OpenFPL fits a separate
model *and* a separate feature subset per position on a very large sample. At
1,245 graded player-seasons we pool positions with features z-scored within
(position, season) plus position intercept shifts, which borrows strength across
positions. A per-position gradient-boosted ensemble at this N would fit noise and
the CI would swallow the answer either way — said in the prereg, before the
answer was known.

---

## 6. THE TIERS, AND WHY THESE CUTS

Four ordered classes within position, on positional finish rank among the full
realized field, cut at `2K`, `K`, `ceil(K/2)` where `K` is the league's own
starting-slot count at that position (QB 10 · RB 21 · WR 29 · TE 10, flex split
quoted from `vorp.py`'s measured 2026 board).

Every boundary is a league-structural fact, not a distributional convenience.
`vorp.py` defines replacement level as *"the Nth-ranked player at each
position"*, so **the STARTER/REPLACEMENT boundary IS replacement level, by
construction** — the tiers and the board's own VORP scale agree by design rather
than by coincidence. Realized 2025 cut points, for a feel:

| | QB | RB | WR | TE |
|---|---|---|---|---|
| points at the LEAGUE-WINNER cut | 364.9 | 225.3 | 164.4 | 150.4 |
| points at replacement (rank K) | 336.3 | 167.4 | 144.1 | 135.8 |
| field size | 77 | 142 | 216 | 118 |

Class counts in the graded seasons run BUST 284–302 · REPLACEMENT 57–64 ·
STARTER 28–32 · LEAGUE-WINNER 31–34 — no degenerate cell, and
`test_no_tier_is_degenerate_in_any_graded_season` keeps it that way. **These
frequencies were computed after the prereg was committed, not before it was
written.**

**One number in the prereg does not match the artifact, and it is not a change
of mind.** The prereg quotes the derivation gate as 5,371 (2023) and 5,298
(2024) player-weeks; the module reports 5,055 and 4,984. The prereg's figures
came from the check over weeks 1–18 that licensed the 2022 label season; the
shipped gate restricts to **weeks 1–17**, the graded span every label and
feature in this experiment uses. The gate's verdict is identical under either
span — max absolute difference **0.00** — so nothing turns on it, and the prereg
was not edited.

---

## 7. SAMPLE SIZE, STATED PLAINLY

1,245 graded player-seasons; **21 late-round LEAGUE-WINNERs in total.** Every
number in § 1 rests on 21 events. A one-player swing moves hits@10 by a full
unit. The bootstrap intervals are integers wide because the statistic is a
count. **No effect reported here is outside noise, and none is dressed up as if
it were.** What survives the noise is the direction all six rankings agree on:
nothing beats chance except the market, and the model built for this cell is at
chance.

---

## 8. SENSITIVITIES (both preregistered)

| arm | late-cell LEAGUE-WINNERs | chance@10 | P(LW) hits@10 | best baseline | calibration |
|---|---|---|---|---|---|
| **primary** (K = 10/21/29/10) | 21 | 3.71 | 3 | market, 7 | 1 bucket misses |
| **S2** dedicated slots only (10/20/20/10) | 15 | 2.65 | 1 | market & expected pts, 4 | **2 miss → MISCALIBRATED** |
| **S1** absent season ⇒ 0 points ⇒ BUST | 21 | 3.69 | 3 | market, 7 | **2 miss → MISCALIBRATED** |

S1 barely moves the late-round cell (170 → 171 players), and that is itself
informative: a player drafted at pick 61+ almost always recorded at least one
scored week, so the survivorship exclusion (133–163 players per season, all
counted in the artifact) does not live in the late-round cell. It does move
calibration and redundancy (Spearman vs recency_blend falls to 0.913).

---

## 9. WHAT I COULD NOT DO

- **Sleeper is UNMEASURABLE, not unmeasured.** No pre-2026 Sleeper or
  FantasyPros projection was ever archived (`proj_series.json` starts
  2026-08-09) and a retroactive fetch leaks (exp33). The mandate asked for a
  Sleeper comparison; there is no honest one to make and none is proxied.
- **own_v6 exists for 2025 only** — its chain needs two prior weekly-points
  stores and 2021/2022 have none. It is rebuilt here by calling A's own
  `own_model_v6.build_v6` (never reimplemented); it covers 387 of the 422 graded
  2025 players, and the 35 without a forecast are ranked last and counted. Its
  1 hit@10 is a ONE-season sum against a chance of 1.48 and must not be read
  beside a three-season sum of 7 — every cell in the artifact carries a
  `seasons_contributing` field so that cannot happen silently.
- **2023 is the earliest gradeable season.** Labels exist for 2022–2025, so the
  first test season needs 2022 to train on.
- **Age is excluded**, not merely missing: the only age source is the 2026
  board, whose membership post-dates the graded seasons, so its missingness
  pattern leaks (routed to A, § 10).
- **ADP is not a feature**, only the split variable and a baseline: there is no
  2022 league draft on disk, and making it a feature would have cost the 2022
  training season and the 2023 test season.
- **The stat stores are A-lane files** that live on the relay branch. This
  branch may not commit them, so the module resolves them through
  `TIERED_STORE_DIR` when they are not beside it, and the four store-dependent
  tests skip rather than fail. On the merged tree there is no override and
  nothing skips. The committed artifact was produced with the stores present at
  relay commit `882028b6`.
- **A z-scoring bug in an uncommitted first run is worth declaring**, because it
  moved published-looking numbers: features were z-scored within position but
  *pooled across training seasons*, where the prereg says within (position,
  season). Fixed to match the prereg before anything was committed. The
  correction moved redundancy vs recency_blend 0.954 → 0.937, calibration misses
  0 → 1, and left the late-round cell unchanged at 3 vs the market's 7.

---

## 10. THINGS FOUND ON THE WAY — routed, not buried

1. **`component_stats_2025.json` and `nflverse_weekly_points_2025.json`
   disagree.** Re-scoring the component store reproduces the points store
   **exactly** for 2023 (5,055 shared player-weeks over weeks 1–17, max diff
   0.00) and 2024 (4,984, max diff 0.00) — but for 2025 it carries **1,067
   player-weeks the points store does not have**, and **120 of the 4,685 shared
   rows differ, 101 of them by exactly −2.0**: a `fum_lost` the points store
   scores and the component store dropped. Cause is visible in provenance:
   2021–24 came from `player_stats_*.parquet`, 2025 from
   `stats_player_week_2025.parquet`. Both are A-lane stores. Nothing here
   depends on it (2025 labels come from the points store), but v5/v6's component
   arms are FITTED on component stats, so for 2025 they are fitted on a slightly
   different season than the one they are graded against. **Routed → ROUTES
   TO:A.**

2. **A weekly-points store for 2021 and 2022 is BUILDABLE OFFLINE, today.** The
   standing limitation "own_v6 exists only for 2025 because 2021/2022 have no
   weekly-points store" is true of the STORE, not of the DATA: the component
   stores for 2021 and 2022 carry every offensive scoring component, and
   re-scoring them reproduces the committed store **bit for bit** on both
   seasons where both exist (10,039 player-weeks, max diff 0.00). It would give
   A's projection programme a second and third graded season, which is the
   binding constraint on that whole programme. **Filed → `DECISIONS-NEEDED.md`
   with the described diff. NOT BUILT — recommendation is to build it AFTER the
   22nd, since it cannot change the draft board and nothing about it decays.**

3. **`own_model_v2.board_ages()` leaks, mildly.** It reads ages from the 2026
   board, and a player who retired after the graded season is simply absent — so
   "has an age at all" is information from after the season being graded. Low
   severity for own_v6 (graded on 2025, one year out), and it is A's file, so
   nothing was touched. It matters more if the projection programme gains 2023
   and 2024 as graded seasons, i.e. exactly if item 2 is built. **Routed →
   ROUTES TO:A.**

4. **Pre-existing red on main, unrelated to this work:**
   `draft/tests/test_core_needs_no_reviewer.py::test_NO_WORKFLOW_MAKES_A_MODEL_JOB_DEPEND_ON_THE_REVIEWER`
   fails because `.github/workflows/config-check.yml` references
   `OPENAI_API_KEY`. Nothing in this experiment touches a workflow; recorded so
   the suite count in this report is not read as a regression.

---

## 11. IF ANYONE WANTS TO REVIVE THIS

The result that would change the verdict is not a better classifier. It is a
feature the mean does not already contain. Everything fitted here —
prior-season points, per-game rate, opportunity, target share, WOPR, air-yards
share, EPA, TD rate — is information the mean projections already digest, which
is exactly why `P(LEAGUE-WINNER)` ends up a monotone transform of them.

The convergence worth noting: **Kalshi's season-long threshold ladders are this
same object, priced by a market rather than fitted by us** —
`draft/data/kalshi/season_ladders_2026-08-16.json`, 351 ladders, P(≥750) /
P(≥1000) / P(≥1250) receiving yards. They cannot be backtested (they settle in
2027) and **nothing here is built on them**, but they are a source of tier
probabilities that does not come from our own mean — which is the one thing this
experiment could not supply for itself. And the market being the only thing in
this study that beat chance in the late rounds is, at minimum, consistent with
looking there next.

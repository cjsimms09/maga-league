# TERRITORY: C

# PREREGISTRATION — tiered outcome model (OpenFPL-shaped), 2026-08-16

**This file is committed BEFORE any model is fitted and before any grading
number exists.** Commit order is the proof. `draft/backtest/tiered_outcome_model.py`,
its tests and its results artifact land in a LATER commit. Nothing below may be
edited once a result exists; a change of mind becomes a new preregistration with
its own commit, and the old one stays.

---

## 0. WHAT OPENFPL ACTUALLY DOES — read before this design was written

Mined from the repository itself (`github.com/daniegr/OpenFPL`, README +
`play.ipynb` + `plug.txt` + `models/cv1_MID/search.txt`). The arXiv paper
(2508.09992) is unreachable from this sandbox and was NOT read.

**READ (verbatim from the repo):**

- `play.ipynb` loads, per position in `['GK','DEF','MID','FWD','AM']` and per
  cross-validation fold `cv1..cv5`, a set of saved models, predicts, inverse-
  transforms through a single `yscaler`, and takes `np.median(...)` across all
  fold × candidate models. The output column is literally named `prediction` —
  **one continuous number per player-gameweek.**
- `models/` contains `xscaler.save`, `yscaler.save`, `features.save` and 25
  directories `cv{1..5}_{GK,DEF,MID,FWD,AM}`. `features.save` is indexed
  `features[position]`, so each position uses a DIFFERENT SUBSET of the shared
  scaled feature matrix.
- `models/cv1_MID/search.txt` shows the candidates are `method-xgboost` and
  `method-randforest` scored by a single scalar `error` (~2.40 on FPL points),
  selected by an evolutionary population search (the K-Best Search framework).
- `plug.txt` pins `xgboost`, `scikit-learn`, `pandas`, `joblib` — **no
  classifier, no calibration library, nothing probabilistic.**
- `data/samples.csv` columns are rolling windows of a player's own history at
  horizons `1, 3, 5, 10, 38` gameweeks (fpl points, minutes, influence,
  creativity, threat, xg, xa, xgchain, xgbuildup, key passes, bps…) plus team
  and opponent aggregates at the same horizons. Every feature is a LAGGED
  aggregate; construction is leak-free by shape.
- The README's four names are defined there as: *Zeros*: non-playing and 0 FPL
  points, *Blanks*: ≤2, *Tickers*: 3 or 4, *Haulers*: ≥5 — and they appear in
  the README only as **column headings of an RMSE table.**

**THEREFORE (inference, stated as inference):** OpenFPL does **not** predict a
distribution over outcome classes. It is a per-position regression ensemble
predicting a mean. The four tiers are **evaluation strata on the REALIZED
outcome** — the test set is partitioned by what actually happened and RMSE is
reported inside each partition. The transferable idea is therefore *"stop
reporting one global error number; report error inside the outcome bands that
matter, because a global RMSE is dominated by the many low-scoring
observations and hides whether you can hit the haulers."*

**This preregistration deliberately goes further than OpenFPL**, because the
question Cory asked ("fantasy is won by drafting stud players in later rounds")
needs P(top tier), which no mean can express. That step is OURS, not OpenFPL's,
and the artifact must not credit OpenFPL with it.

---

## 1. UNIT, LABEL AND POPULATION

**Unit:** one player-season, positions QB/RB/WR/TE only. K and DEF are
structurally ungradeable from the offense-only weekly stores (same refusal
`model_accuracy_backtest.py` makes).

**Label (realized outcome):** season fantasy points, weeks 1–17 (the league's
`last_scored_leg`), under OUR scoring table, from
`draft/backtest/nflverse_weekly_points_{2023,2024,2025}.json`.

**Label season 2022 is DERIVED, under a gate.** The weekly-points stores start
at 2023. `component_stats_{2021..2025}.json` carries exactly the offensive
scoring components, so a season total can be recomputed with
`draft.scoring.score_stat_line`. **GATE (checked before this file was written,
outcome recorded here):** re-deriving every 2023 and 2024 player-week from
`component_stats` and scoring it with the store's own scoring table reproduces
the committed `nflverse_weekly_points_*` store **exactly — max absolute
difference 0.0 over 5,371 (2023) and 5,298 (2024) player-weeks.** The
derivation is therefore proven on the two seasons where both exist, and 2022 is
admitted as a label season. Had it not matched, 2022 would have been refused
and the test seasons would have dropped to {2024, 2025}.

*Recorded at the same time, not load-bearing here:* the same check on **2025
does NOT match** — `component_stats_2025.json` was fetched from a different
nflverse release (`stats_player_week_2025.parquet`) than 2021-24
(`player_stats_*.parquet`); it carries 1,126 player-weeks the points store does
not, and 110 player-weeks differ by exactly −2.0 (a `fum_lost` the points store
scores and the component store dropped). 2025 labels come from the POINTS
STORE, which is unaffected. Reported as a store discrepancy, not used.

**Population (the shared denominator, identical for the tiered model and every
baseline):** a player-season Y is in the population iff

1. the player recorded ≥1 offensive stat row in season Y−1 (so he is
   preseason-knowable — this is what makes every feature available), AND
2. the player recorded ≥1 scored week in season Y (so a realized total exists),
   AND
3. the player has a position in QB/RB/WR/TE from his season Y−1 rows.

**Rookies are excluded by construction** (no Y−1 row) and counted.
**Players with a Y−1 row and NO season-Y row are EXCLUDED and counted** — the
same survivorship rule, and the same admission of optimistic bias, that
`model_accuracy_backtest.py` already carries. Absent is never zero.

**Declared sensitivity S1 (survivorship):** re-run with rule 2 dropped and a
missing season-Y total treated as 0 points → tier BUST. Reported beside the
primary, never instead of it.

---

## 2. THE TIERS — the definition, fixed here

Four ordered classes, adapted from OpenFPL's four, **within position**, on
**positional finish rank** in season Y among ALL players at that position with
≥1 scored week that season (the full realized field, not our population — so
the definition does not move when the population does).

Let `K_pos` = the league-wide number of STARTING slots at that position. This is
the same structural quantity that defines replacement level: `draft/vorp.py`
says *"The Nth-ranked player at each position is replacement level"*, so the
STARTER/REPLACEMENT boundary below **is** replacement level, by construction and
not by coincidence. `K_pos` is quoted from the committed board's measured flex
allocation (`draft/vorp.py` module docstring: *"Measured on the 2026 board (10
teams, 1 FLEX, so 10 slots split RB+1/WR+9/TE+0)"*):

| pos | dedicated | flex | **K_pos** |
|-----|-----------|------|-----------|
| QB  | 1×10 = 10 | +0   | **10** |
| RB  | 2×10 = 20 | +1   | **21** |
| WR  | 2×10 = 20 | +9   | **29** |
| TE  | 1×10 = 10 | +0   | **10** |

Tiers, by positional finish rank `r`:

| tier | rule | QB | RB | WR | TE | OpenFPL analogue |
|------|------|----|----|----|----|------------------|
| **LEAGUE-WINNER** | `r ≤ ceil(K/2)` | 1–5 | 1–11 | 1–15 | 1–5 | Haulers |
| **STARTER** | `ceil(K/2) < r ≤ K` | 6–10 | 12–21 | 16–29 | 6–10 | Tickers |
| **REPLACEMENT** | `K < r ≤ 2K` | 11–20 | 22–42 | 30–58 | 11–20 | Blanks |
| **BUST** | `r > 2K` | 21+ | 43+ | 59+ | 21+ | Zeros |

**Why these cuts and not percentiles.** Every boundary is a league-structural
fact, not a distributional convenience: `2K` is "twice the league's starting
demand" (past it, a waiver-wire body is a substitute), `K` is the last starter
(= replacement level), and `K/2` is "top half of the startable field at the
position" — a player who was better than the median starting slot all year.
The multiplier is the same at every position; only the league's own slot count
differs, which is exactly the structure a positional model should respect.
Nothing here was chosen by looking at how many players land in each box, and
nothing here may be adjusted afterward.

**Declared sensitivity S2 (flex allocation):** `vorp.py` itself documents that
the flex split is a step function that moves on a 2% projection nudge, so the
whole grid is re-run with dedicated-slots-only `K` = QB 10 / RB 20 / WR 20 /
TE 10. Reported beside the primary.

---

## 3. WALK-FORWARD DESIGN, AND WHAT IS LEAK-FREE

Label seasons available: **2022 (derived), 2023, 2024, 2025.**
Fit on labeled seasons ≤ Y−1 only; predict Y. Test seasons:

| test season Y | fitted on | features drawn from |
|---|---|---|
| 2023 | 2022 | 2022 (+2021) |
| 2024 | 2022, 2023 | 2023 (+2022) |
| 2025 | 2022, 2023, 2024 | 2024 (+2023) |

An assertion in the module refuses any fit whose training seasons are not
strictly < the test season, and refuses any feature season ≥ Y.

**Features — preseason-available only, all from season Y−1 (and Y−2):**
prior-season points, points per game, games with a row; two-seasons-ago points
plus a `has_y2` indicator; mean target share, WOPR, air-yards share; rushing /
receiving / passing EPA per game; opportunities (targets + carries) per game;
and touchdowns per opportunity (the regression-to-mean signal). Every feature
is z-scored **within (position, season)** so a pooled fit is coherent and
season-level drift is removed.

**Age is EXCLUDED, on purpose.** The only age source in this repo is
`own_model_v2.board_ages()`, which reads ages *as of 2026* from the committed
board — and board MEMBERSHIP is post-2023 information (a player who retired in
2024 is simply absent). Its missingness pattern therefore leaks the future into
a 2023 or 2024 fit. It is left out rather than used with an indicator.

**ADP / the league draft is NOT a feature.** It is (a) the split variable that
defines the late-round cell and (b) a baseline to beat. Reason stated in
advance: `draft/data/league_history.json` carries a completed draft for 2023,
2024 and 2025 but **none for 2022**, so making it a feature would cost the 2022
training season and the 2023 test season. The market is a stronger comparison
than it is a regressor here.

---

## 4. MODEL CLASS — and why nothing deeper

**Proportional-odds ordinal logistic regression**, one pooled fit with the four
ordered classes and position intercept shifts, ridge-penalised (λ = 1.0 on
standardized features, fixed here, not tuned), fitted by Newton–Raphson MLE in
numpy. Deterministic — same inputs, same bits.

~350 players per season over three test seasons is roughly 1,000 graded rows
and, at the tier that matters, on the order of 10–20 late-round LEAGUE-WINNERs
in total. **A deep model, or a gradient-boosted ensemble with a tuned depth, is
not defensible at this N** — it would fit the noise and the CI would swallow
the result either way. The ordinal link also encodes the one thing we know for
free: the classes are ORDERED, so a single β vector with three cutpoints is the
right number of parameters, not four independent class scores.

**Expected points from the class distribution:** `E[pts] = Σ_k p_k · m_k`,
where `m_k` is the mean realized season total of tier k at that position **in
the TRAINING seasons only**. Leak-free by construction.

---

## 5. BASELINES — what exists, and what does not

- `recency_blend` — 0.7×(Y−1) + 0.3×(Y−2) realized totals; the league config's
  own declared, not-fitted weights.
- `naive_prev` — the Y−1 total, unchanged.
- `walk_forward_v1` — the `proj_ownmodel` algorithm (`lab_projections.walk_forward`).
- `market` — the league's own completed draft order (2023–25), the mean
  opinion a drafter actually faced.
- `own_v6` — **2025 only.** Its pipeline needs two prior weekly-points stores;
  2021/2022 have none, so it cannot be built for 2023 or 2024. Stated, not
  worked around. If it cannot be run at all from the committed stores, the cell
  reports `unavailable`, never a substitute.
- **Sleeper — DOES NOT EXIST for any graded season.** No pre-2026 Sleeper or
  FantasyPros projection was ever archived (`proj_series.json` starts
  2026-08-09) and a retroactive fetch leaks (exp33). The mandate asked for a
  Sleeper comparison; the honest answer is that it is UNMEASURABLE, and it is
  reported as unmeasurable rather than proxied.

---

## 6. GRADING — the metrics, fixed here

1. **Overall ordering.** Spearman of the model's expected points vs realized
   season points, within position, per test season and pooled.
2. **Draftable region.** Top-12 / 24 / 48 precision on VORP: each candidate's
   forecast is converted to VORP by subtracting that position's `K_pos`-th
   ranked realized total from season Y−1 (leak-free), players are ranked
   overall on VORP, and precision is the share of the predicted top-N that
   lands in the realized top-N by VORP.
3. **THE KEY CELL — late rounds.** Restricted to players **drafted in the
   league at pick 61 or later** (10 teams ⇒ rounds 7–15). Rank by
   `P(LEAGUE-WINNER)`; rank each baseline by its mean projection. Metric: how
   many true LEAGUE-WINNERs each ranking captures in its top 10 and top 20,
   pooled over 2023–25, with a 90% bootstrap CI on the DIFFERENCE (resampled
   over players, paired). Secondary: the same cell widened to include
   undrafted players in the population.
4. **Calibration.** Reliability of `P(LEAGUE-WINNER)` in fixed buckets
   [0, .05), [.05, .10), [.10, .20), [.20, .35), [.35, 1], pooled over test
   seasons: n, mean predicted, observed rate, Wilson 90% interval.
5. **The honest null.** Spearman of `P(LEAGUE-WINNER)` against the best mean
   baseline, within position, per season.

---

## 7. THE BAR — declared now, in advance

- **CONFIRMED (Cory's thesis supported):** in the late-round cell, ranking by
  `P(LEAGUE-WINNER)` captures strictly more true LEAGUE-WINNERs at k=10 than
  EVERY mean baseline, pooled across 2023–25, **and** the 90% bootstrap CI of
  the paired difference against the best baseline excludes 0.
- **REDUNDANT (the honest null):** if within-position Spearman between
  `P(LEAGUE-WINNER)` and the best mean baseline is ≥ 0.95 pooled, the model is
  declared redundant with the mean **regardless of any metric it wins** — it is
  then the same information re-expressed, and the verdict says so plainly.
- **MISCALIBRATED (headline, not footnote):** if in ≥2 of the 5 reliability
  buckets the observed rate falls outside the Wilson 90% interval of the
  predicted rate, the model is declared miscalibrated and that is the lead of
  the verdict, ahead of any accuracy claim.
- **NULL otherwise.** A null is a complete and acceptable outcome and ships as
  cleanly as a positive would. Nothing is re-cut to rescue it.

**No model, board, projection or config change ships from this experiment under
any verdict.** A real finding becomes a `DECISIONS-NEEDED.md` item with a
described diff; Cory rules.

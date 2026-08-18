# MOVEMENT-VS-OUTCOME — PREREG (task 21, filed before any outcome exists)

**A, 2026-08-18.** Cory un-gated the post-draft queue (*"keep going no
date gates"*). Outcomes do not exist until games are played, so this
study's GRADE waits on data — but the design, the store, the price basis
and the blind predictions are all fixed tonight, before a single result
could influence them. That is the point of filing now: when outcomes
land, grading is mechanical and nothing can be steered.

## Question

Does MOVEMENT in market prices predict outcomes beyond the level of the
latest price? Two separable claims, graded separately:

  * **M1 (calibration)** — the later price is better calibrated than the
    earlier one: Brier(latest pre-outcome mid) < Brier(earliest mid) over
    all graded (player, stat, threshold) cells. This is "movement is
    informative", the standard result.
  * **M2 (momentum/sharp-money)** — movement predicts BEYOND the latest
    price: in logistic regression outcome ~ latest_mid + (latest_mid −
    earliest_mid), the movement coefficient's CI excludes zero. Under an
    efficient market it is zero — the latest price already contains the
    movement's information.

## Price basis (learned from this store's own first build, the same night)

Study price = **bid/ask MID where both sides exist**, from
`draft/data/kalshi/movement_series.json` (built by
`market_movement_series.py`). NEVER last-trade: the first build's top
"movers" were 0.00→0.83 jumps that were first trades on untraded rungs
printing last=0.00 while the book sat at 0.68/0.81 (JCHASE1 rec_yd 1000,
caught before the store shipped). A cell enters the study only when its
earliest AND latest snapshots both carry a two-sided book. One-sided and
untraded cells are visible in the store and excluded from the grade, with
the exclusion count reported.

## Population and grading

  * Season-threshold cells (the ladders): graded when the 2026 regular
    season ends (or earlier for cells mathematically clinched/dead, with
    the early-grade flagged). Outcome = 1 iff the player's final stat ≥
    threshold, from the committed nflverse weekly stores.
  * Weekly-market cells: a second adapter over
    `weekly_markets_*.json` (join key = market ticker) enters the store
    when weekly captures have ≥ 2 snapshots for the same market; graded
    week by week from week 1. Until that adapter exists this prereg
    covers season ladders only — extending it to weekly cells changes no
    bar and needs no amendment, only the adapter.
  * Minimum population to grade at all: 30 cells passing the price basis
    with |movement| > 0.02. Below that the grade is NOT RUN, reported as
    such (a 12-cell logistic fit is a coin with extra steps).

## Blind predictions (ledger P99, same commit)

  1. **M1 TRUE** — later prices are better calibrated (this is the
     boring, load-bearing check: if it fails, the capture itself is
     suspect, not the market).
  2. **M2 FALSE** — movement does NOT predict beyond the latest price
     (CI includes zero). Filed knowing it is the unexciting side: an
     efficient-market null on a thin retail book is still my honest
     prior, and a TRUE here would be a real, usable edge — which is
     exactly why the prediction must be filed before anyone sees a
     result.

## What ships on each outcome

  * M2 FALSE (predicted): nothing ships; the latest Kalshi mid remains
    the market-implied input for any future arm, movement retired as a
    signal candidate with a two-claim graded null.
  * M2 TRUE (surprise): movement enters the weekly lab as a Tier-1
    candidate arm behind its own fresh prereg — it does NOT ship to
    anything directly from this study.

Grade-by for P99: **2027-01-12** (season-ladder outcomes final), with
weekly cells graded incrementally from week 1 if the adapter lands.
Artifacts: `movement_vs_outcome_grade.json` when run; audit
`draft/audit/movement_vs_outcome_<date>.md`.

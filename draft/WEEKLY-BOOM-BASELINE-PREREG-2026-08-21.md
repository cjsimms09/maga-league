# THE WEEKLY BOOM BASELINE — THE NULL EVERY BOOM FEATURE MUST BEAT

**Session D, 2026-08-21. Owner D. Filed against `ROUTES.md`'s 2026-08-20
relay dispatch, ASK 2 of the "two runnable-today builds" row: "P(top-12
positional week) as a measured base rate per position × season, 2021-25,
from the nflverse weekly stores — the null every weekly-boom feature must
beat, committed BEFORE any feature grades against it. One JSON, one blind
P-row declaring which position's boom rate you expect most stable."**

**`no_fit_guard` applies. No boom rate has been computed at the time this
file is committed** — only population counts and position labels, recorded
in §1 below. The blind call in §4 is made against nothing.

---

## 0 · THIS ITEM WAS PARKED ON A BLOCKER I GOT WRONG, AND THE CORRECTION IS THE REASON IT IS UNPARKED

On 2026-08-20 I replied to this ASK in ROUTES with: *"real blocker found,
not guessed at — 'top-12 positional week' needs a position label for every
player who scores in `nflverse_weekly_points_202X.json`, and no clean
full-NFL-universe position crosswalk exists in this repo."* I named the two
sources I had checked (`LO.inferPositions()`, survivor-biased to this
league's own roster history; `dispersion_baseline_grade.py`'s, current-board
only) and concluded the population could not be labeled.

**That was wrong, and the source I missed is the one the store is built
from.** `nflverse_weekly_points_<season>.json`'s own `_note` reads: *"REBUILT
OFFLINE from the committed component store, not fetched… Population is
inherited from the co[mponent store]."* So `component_stats_<season>.json`'s
per-player-week `pos` field covers the scoring population **by construction**
— measured, all five seasons: **5401/5401 · 5351/5351 · 5372/5372 ·
5298/5298 · 6108/6108 = 100.0%.**

**The 100% is a tautology, not a validation, and is recorded here as one** —
the two files share a population by definition, so this number could not have
come out any other way. That is exactly why it settles the question: there is
no join to lose.

**What my blocker got RIGHT, for a reason I never stated:** the component
store's own `provenance.position_groups` is `["QB", "RB", "WR", "TE"]`.
**There is no K and no DEF in this population at all.** So a boom baseline
covering all six fantasy positions genuinely is not buildable from this
store — I stated a narrow true thing as a blanket false one, and parked four
positions' worth of buildable work on it.

**Scoped accordingly: QB/RB/WR/TE only, K/DEF declared out of scope with the
reason, not silently omitted.**

## 1 · POPULATION, MEASURED BEFORE ANY RATE (Rule 3i — look at the distribution first)

Scoring player-weeks by position, 2024, from the join above: **WR 2,132 ·
RB 1,414 · TE 1,088 · QB 664.** Over 18 weeks that is roughly **118 WR · 79
RB · 60 TE · 37 QB per week** — every position comfortably deeper than the
top-12 cut this study ranks on, so no position's boom set is truncated by a
thin field.

## 2 · THE DEGENERATE READING, NAMED SO NOBODY QUOTES IT

**The UNCONDITIONAL "P(top-12 positional week)" over the whole population is
mechanically `12 / N_players_that_week` and carries no information.** It is
~32% at QB, ~20% at TE, ~15% at RB, ~10% at WR purely because those are the
population sizes in §1 — nothing about football. It will be reported in the
artifact **labeled as the degenerate quantity it is**, because a number this
easy to compute and this easy to misread will otherwise be recomputed by
someone else and quoted as a finding.

**The useful null is CONDITIONAL**, and that is what §3 defines.

## 3 · THE NULL, FIXED BEFORE THE RUN

**Boom** = a player-week ranking in the **top 12** at his position that week,
by this league's own scoring (the committed `nflverse_weekly_points_<season>`
values, not a re-derivation). Ties broken by the store's own ordering; tie
frequency reported.

**Tier** = the player's **prior-season (Y−1) PPG rank at his position**,
bucketed: **T1 = 1-12 · T2 = 13-24 · T3 = 25-36 · T4 = 37+**. Eligibility for
a tier requires **≥4 recorded weeks in Y−1** (`MIN_GAMES`, reused from
`own_model_v5.py` via the same import path `game_script_usage_interaction.py`
and `target_quality_tilt.py` already use — Rule 11, not re-invented).

**The null table: `P(boom | position, tier, season)`** — for each target
season Y ∈ {2022, 2023, 2024, 2025}, over every eligible player's every
recorded week in Y. **2021 cannot be a target season** (no 2020 store on
disk for its Y−1 tier) — the same fold constraint `p151`, the game-script
study and the target-quality study all carry, for the same reason, stated
again rather than inherited silently.

**This is the null a weekly-boom feature must beat:** any feature claiming to
predict a boom week must do better than "look up what tier he finished in
last season."

## 4 · THE BLIND CALL (the P-row this ASK asked for)

**Stability metric, declared before the numbers exist:** for each position,
the **range (max − min) of the T1 boom rate across the four target seasons**.
Lowest range = most stable.

**PREDICTION: QB is the most stable; RB is the least.**

Reasoning, recorded so a right answer for a wrong reason is visible as one:
QB has the smallest population (§1), the most entrenched week-to-week
starters, the least committee/timeshare churn, and the highest structural
top-12 share — so a prior-season top-12 QB should convert to top-12 weeks at
a rate that moves little year to year. RB carries the most injury and
committee turnover of the four, so its T1 group should be the one whose boom
rate swings most between seasons.

**Declared honestly as a coin-flip-adjacent call between QB and TE:** TE is
the most top-heavy position and a plausible alternative answer — a small
elite group converting very consistently. **If TE wins, this prediction is
FALSE and files as FALSE**, not as "close."

## 5 · THREE-PART FILING STANDARD

* **LEARNING TARGET:** establishes the base rate any future weekly-boom
  feature is graded against, and measures which position's boom behavior is
  stable enough that a prior-season tier is already a strong predictor
  (where a feature has least room) versus unstable (where it has most).
* **SKILL DESIGN:** the blind call in §4 is a direction-only prediction made
  against zero computed rates, with its own stability metric fixed first and
  its most likely alternative answer named — so a near-miss cannot be
  retold as a hit.
* **CONSEQUENCE ROUTE:** the table ships as `draft/backtest/
  weekly_boom_baseline.json` and becomes the mandatory comparison for any
  boom feature, whichever way the blind call lands. A TRUE tells the ceiling
  program to hunt boom features at RB first (most room); a FALSE relocates
  that priority to wherever the measured instability actually is.

## 6 · WHAT RUNS NEXT

`draft/backtest/weekly_boom_baseline.py`, built after this file is committed,
writes `draft/backtest/weekly_boom_baseline.json`. Tests in
`draft/tests/test_weekly_boom_baseline.py`, including a **Rule 3e
known-positive**: a synthetic season where one planted player is top-12 every
week must come back at boom rate 1.0, and a planted never-scorer at 0.0 — a
harness that cannot produce those two is not measuring booms.

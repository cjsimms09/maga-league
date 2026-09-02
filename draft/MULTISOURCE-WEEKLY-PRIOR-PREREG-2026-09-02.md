# PREREG — a weekly prior built from four outside sources, written before any week is graded

**D, 2026-09-02. A's ask (ROUTES `2026-09-02 · A → D`), register 478, P365.
Tier-1 single-axis arm under `BLEND-SEARCH-DESIGN.md` §2.**
**Nothing here was informed by an outcome. Only COVERAGE was measured, deliberately,
and it is reported in full below so the feasibility claim can be checked without
the arm having been run.**

## 0. Why this can be written now

Register 478 dispatched `ffanalytics-probe` with `week=1` (run `33580917204`,
2026-09-02 01:52Z) and committed **1,902 raw stat-line rows** to
`draft/data/ffanalytics_raw_projections_w1.csv`. Four sources return real weekly
rows. `multisource_projections.py`'s `STAT_MAP` (21 stat columns) and
`scoring.py` re-price them under **our** table, which is the standing rule —
*"always our engine, never a provider's"* — and the only thing that makes four
providers comparable to each other at all.

Cory's season goal, as a number: **beat Sleeper AND FantasyPros on weekly
start/sit at 3 of 4 positions.** A mean of four outside weekly opinions is the
most direct challenger to that bar we have never had.

## 1. PREMISES, CHECKED — and two were not what the routing said

| claim as routed | measured |
|---|---|
| four weekly sources | **TRUE** — CBS 434 · ESPN 414 · FleaFlicker 406 · FanDuel 588 rows |
| scorable via `multisource_projections.STAT_MAP` | **TRUE** — 21 stat columns, 529 player-positions scored under our table |

**(a) THE FOURTH SOURCE IS LABELLED `FanDuel`, NOT `NumberFire`, IN THE COLUMN
CODE WILL FILTER ON.** The row carries BOTH: `data_src = "FanDuel"` (ffanalytics'
scraper label) and `source = "NumberFire"` (the site's own name). Register 478
and A's ask both call it NumberFire. **Anything written as
`data_src == "NumberFire"` returns ZERO rows and looks like a source that went
dark** — the exact silent-null shape register 442 already misdiagnosed once on
these same providers. This arm filters on `data_src`.

**(b) `multisource_projections.py`'s own header names "CBS, ESPN, FFToday and
Sleeper".** That is the SEASONAL set and it is not this one: **FFToday returns 0
weekly rows** (season totals only, the mirror image of CBS/ESPN) and FleaFlicker
is not in that sentence at all. The module is reused for `STAT_MAP`, `norm_name`
and `num` — not for its source list.

**(c) CBS emits a `FB` position (4 rows).** Folded to RB, because our table has
no fullback slot and dropping them would silently shrink one source's RB pool.

## 2. COVERAGE, measured — the only thing measured before sealing

Scored through the module's own `STAT_MAP` + `scoring.score_stat_line`, joined
to the live board by `norm_name` + position (the module's own join):

| | |
|---|---|
| player-positions scored | **529** |
| by all four sources | **258** · by three 65 · two 78 · one 128 |
| board skill players matched to ≥1 source | **449 of 676** |

**On the population that matters — the board's own top N by `proj_ownmodel`:**

| | ≥1 source | all four |
|---|---|---|
| top 100 | **100 (100%)** | **96 (96%)** |
| top 150 | 148 (99%) | 144 (96%) |
| top 200 | 192 (96%) | 183 (92%) |

Per position within the top 200: **QB 33/33 · RB 51/54 · WR 66/69 · TE 42/44.**
The 227 unmatched board players are the deep tail nobody starts — the same shape
the props coverage probe found, and for the same reason.

## 3. THE ARM

`multisource_weekly_v1`: prior = **the unweighted mean of the four sources'
scored weekly points** for a player, through the unchanged v1 formula, as one
arm beside `v1_blend_pull3` (explorer cap ≤3/week).

* **Unweighted, deliberately.** Any weighting fitted on outcomes would make this
  Tier-2 and it would need a best-of-K correction it cannot afford at one arm.
* **Fallback where a player is unmatched: `proj_mean / 17`**, per A's ask. That
  is full-population coverage by construction, so the arm never abstains and is
  directly comparable to `v1_blend_pull3` on the same slots.
* **A player covered by ONE source still gets the mean of one.** Not an
  abstention, and §5's null 2 is what stops that being scored as skill.

## 4. THE PREDICTION (P365)

**From week 2 onward, on this league's scoring and the same Tuesday grader,
`multisource_weekly_v1` beats BOTH `sleeper_weekly` and `fantasypros_weekly` on
start/sit decision accuracy at 3 of 4 positions — and does NOT beat
`v1_blend_pull3` on pooled weekly MAE.**

The direction is the point and it is the same shape P347 got right on the
market: **four independent opinions average into a good ORDERING and a mediocre
point estimate.** Cory's bar is the ordering.

**FALSE if** it clears Cory's bar at ≤2 positions, **or** if it also beats
`v1_blend_pull3` on MAE — the latter would mean the four-source mean is simply a
better projection and the arm is not the single axis this claims, at which point
it needs re-deriving before it is believed.

## 5. NULLS

- **Constructed null 1 — SHARED POPULATION.** Every comparison runs on slots all
  compared arms price. The fallback gives this arm full coverage, so a
  coverage advantage can never be scored as accuracy.
- **Constructed null 2, the load-bearing one — SOURCE-COUNT MATCHED.** 128
  player-positions have exactly one source and 258 have four. If the arm's
  margin lives entirely in the four-source players, the finding is *"more
  opinions help"*, not *"these opinions help"*. Reported split by source count.
- **Constructed null 3 — SHUFFLED SOURCES.** Permute the four scored values
  across players within (week, position). Kills *"any four numbers of roughly
  the right scale, averaged, would have ordered this well"*.
- **BEST-OF-K is owed and not skipped:** one arm, K=1, no selection to correct.
  This line is the record that it was not quietly dropped when it joins a blend.

## 6. CORRELATION GATE (required by §2)

Report Spearman ρ between `multisource_weekly_v1` and each shipped arm on the
same slots. **ρ > 0.85 against `v1_blend_pull3` means this is the board's own
blend under a new name** — four outside sources and our blend may simply track
the same consensus — and the arm is reported as a **duplicate regardless of its
margin.**

## 7. FOLDS AND GRADE DATES, fixed now

Forward weeks only; there is no historical multi-source weekly capture to fold
on, so nothing here is a backtest and nothing is held blind.

* **First live week: 2.** Week 1 is excluded — its capture is the register-478
  dispatch, taken after week 1's board was already priced.
* **First grade: the Tuesday grader after week 4** (three graded weeks), report-only, shadow beside the MAE rule.
* **Decision grade: after week 8.** Ordering claims need weeks; calling it at
  three is how a promotion rule gets fooled, and register 199's own gate says
  three weeks at small K cannot clear a null at any effect size.

## 8. ⚠️ THE DEPENDENCY, STATED NOW RATHER THAN DISCOVERED ON A GRADE DAY

**There is no weekly capture cadence, and this arm cannot be graded without
one.** `ffanalytics-probe.yml`'s schedule passes `FFA_WEEK: ${{ inputs.week ||
'0' }}`, so **every scheduled run fetches season totals**; the week-1 file exists
only because A dispatched `week=1` by hand. Register 478 routes the cadence to
**C** and the arm to D. That is the correct split and this is the D half.

**If no weekly capture lands before a Tuesday, that week is simply not graded
for this arm** — an absence, never a zero, and never a backfill: these are live
weekly opinions and a retroactive fetch would be a different number (exp33). A
week missed is gone, exactly as `proj_series` is.

**Concretely: if the cadence is not live by the week-2 capture window, P365's
first live week slips to the first week that IS captured, and this document is
amended with the new week rather than the grade being quietly taken later.**

## 9. WHAT WOULD MAKE ME ABANDON THIS BEFORE GRADING

If the four sources turn out to be republishing one upstream feed — if ρ between
any two of them exceeds 0.98 on shared players — then "four independent
opinions" is false and the arm is one opinion with three echoes. That is
measurable from the week-1 file alone, **it is deliberately NOT measured here**,
and it is the first thing the grade reports.

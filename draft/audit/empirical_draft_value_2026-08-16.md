<!-- TERRITORY: A -->
# THE EMPIRICAL DRAFT-VALUE STUDY — what actually happened, 2023–2025 — 2026-08-16

> **STAGE 1 OF 2. This commit contains §§0–3 only: the data inventory and the
> complete preregistration.** Every definition, threshold, window, exclusion
> rule and stopping rule below was fixed and committed BEFORE any result was
> computed. Stage 2 appends §§4–11 (the graded tables and the verdict) without
> editing a word of §§0–3. House precedent: `draft/audit/edge_hunt_2026-08-16.md`,
> `draft/audit/advanced_metrics_study_2026-08-16.md`.
>
> **A null is a publishable result here and will be published at full volume.**
> "Preseason signal explains little of hindsight value" is the single most
> likely headline and it is pre-committed as an acceptable answer.

## 0. Cory's mandate, verbatim (2026-08-16)

> "Stop worrying about 6 days.. I want the best possible draft strategy and
> board we can have based off the last 3 seasons. I don't feel like we've even
> looked into what that is.."

He is right about the gap. Every draft study on this branch is
**our-model-shaped**: `model_accuracy_v*.json` asks whether our projection
ranks well; `roster_construction_2026-08-16.md` asks whether an archetype beats
our policy; `draft_replay_2025_vs_actual.md` asks whether the tool out-drafts
Cory; `historical_props_study_2026-08-16.md` asks whether a market beats
own_v6. **Nobody has asked the raw empirical question: across 2023, 2024 and
2025, what actually happened?**

This study is an OUTCOMES study, not a model study. own_v6 appears exactly once
— as the last row of one table in §9 — and never as the thing being graded.

---

## 1. DATA INVENTORY — what exists, verified, with the gaps named first

Everything below was verified by reading the committed bytes on this branch,
not by trusting a filename.

### 1.1 The gaps, stated first because they bound everything

**GAP 1 — THERE IS NO NATIONAL HISTORICAL ADP FOR 2023/2024/2025 IN THIS REPO,
AND NONE IS FETCHABLE FROM THIS SANDBOX.** This is the single biggest
determinant of what this study can answer, so it is the first line of the
inventory.

- `draft/backtest/archived_adp.py` is a **probe for finding** archived boards
  (Wayback CDX search). It is not stored ADP. It contains no season's board.
- `draft/data/external_adp_series.json` (the D3 archive) covers **2026 only** —
  6 snapshots, 2026-08-11 → 2026-08-16. Zero rows for 2023/2024/2025.
- `draft/data/adp_series.json` is the HOME staleness instrument, capped at 300
  players / 60 days, current season only.
- `draft/data/bbm/` holds one Underdog BBM IV (2023) **round-4 finals** subset.
  Its `projection_adp` column is `NA` in every sampled row, its `player_id` is
  an Underdog UUID with no name and no crosswalk in the repo, and a finals
  field is survivorship-selected by construction. Unusable as an ADP source,
  and it covers one season of three.
- `draft/adp.py:fetch_adp(fmt, teams, year)` **does** take a `year` parameter
  against FantasyFootballCalculator, and that is a genuine route to real
  historical 10-team half-PPR ADP. **It is egress-blocked from this sandbox:**
  probed live this session, `fantasyfootballcalculator.com:443` returns
  `403 Forbidden` at the agent proxy (three attempts, logged in the proxy's
  own `recentRelayFailures`). It is reachable from CI, where this repo already
  fetches. **This is a recorded, actionable gap, not a dead end** — see §11.

**GAP 2 — DRAFT-SLOT DATA EXISTS, BUT IT IS ONE 10-TEAM LEAGUE, AND ITS FIRST
THREE ROUNDS ARE KEEPER ROUNDS.** Verified pick-by-pick:

| season | main-draft picks | keepers | keeper pick numbers | open-market picks |
|---|---|---|---|---|
| 2023 | 150 | 30 | 1–30 (a separate 30-pick keeper-ledger draft mirrors picks 1–30 of the main draft) | 120 |
| 2024 | 150 | 23 | 2–30 | 127 |
| 2025 | 150 | 20 | 1–27 | 130 |

**In this league the open draft effectively begins around pick 28–31.** Rounds
1–3 are administered keeper prices (a retained player's round cost), not an open
market clearing. Any "value by draft slot" curve from this data therefore
describes rounds 4–15 as a market and rounds 1–3 as a keeper ledger. That is
stated at every table in stage 2 and is not smoothed over.

**GAP 3 — AGE COVERAGE IS SURVIVORSHIP-BIASED.** The only committed age source
is `public/draft_data.json`, which carries `age` **as of 2026** for players on
the 2026 board. Age in season Y is recoverable as `age_2026 − (2026 − Y)`, but
only for players who are still on a board in 2026 — i.e. conditioned on having
survived to 2026. Coverage is measured and reported per position in stage 2, and
every age result is labelled with it. No age result will be headlined.

**GAP 4 — THREE SEASONS IS A SMALL SAMPLE AND THAT IS NOT FIXABLE HERE.** 450
draft picks total, ~390 of them at QB/RB/WR/TE, ~317 of them open-market. Every
per-slot cell has exactly 3 observations. Round-level cells have 30. Every
number in stage 2 carries an n and a CI, and any effect whose CI covers the null
is reported as "not distinguishable from noise" in those words.

### 1.2 What exists and is verified good

| artifact | verified content |
|---|---|
| `draft/backtest/nflverse_weekly_points_{2023,2024,2025}.json` | Realized weekly points, weeks 1–22, `coverage.complete = true`, `missing = []` for all three. Keyed by Sleeper player id. Distinct players in weeks 1–17: 570 / 582 / 570. |
| `draft/backtest/component_stats_{2021..2025}.json` | Weekly component + usage stats, 18 weeks each, REG only, QB/RB/WR/TE. Players: 611 / 589 / 559 / 570 / 616. Carries `pos`, `team`, `tgt`, `tgt_share`, `rush_att`, and the scoring components. |
| `draft/backtest/advanced_stats_{2021..2025}.json` | Weekly EPA / air yards / CPOE / RACR / WOPR / `ay_share`. Players: 648 / 619 / 587 / 597 / 616. |
| `draft/data/league_history.json` | Cory's real league, 2023/2024/2025 complete drafts, 150 picks each, 10 teams × 15 rounds, snake, with `is_keeper` and `roster_id`. Roster: `QB RB RB WR WR TE FLEX K DEF` + 6 BN. `playoff_week_start = 16`, `last_scored_leg = 17`. |
| `draft/data/player_positions.json` | 1863 players — WR 713, RB 431, TE 349, QB 229, K 109, DEF 32. Exactly one drafted pid across three seasons has no position (`12530`, a 2025 pick); it is named and counted, never silently dropped. |
| `draft/backtest/nflverse_draft_picks.json` | 397 NFL draft picks 2021–2025, QB/RB/WR/TE, with `sleeper_id`. **Period-correct by construction** — every career-outcome column dropped at build time. Usable as draft capital / experience. |
| `draft/backtest/historical_props_week1_{2023,2024,2025}.json` | Week-1 player prop consensus (833 players in 2024), name-keyed, from the paid odds API. Preseason-available for that season. Requires a name→pid crosswalk. |
| `draft/backtest/vegas_lines_2021_2026.json` | Per-game closing spread/total, 2021–2026, from nflverse schedules. Week-1 rows are preseason-available. |

### 1.3 Scoring — confirmed, not assumed

The frozen table (`fetch_component_stats.frozen_scoring_table`, one fingerprint
pinned across all three weekly stores) and the league's own
`scoring_settings` in `league_history.json` **agree**:

```
rec 0.5   pass_td 6.0   pass_yd 0.04   rush_yd 0.1   rec_yd 0.1
rush_td 6.0   rec_td 6.0   pass_int -2.0   fum_lost -2.0   2pt 2.0
```

**0.5 PPR, 6-point passing TDs, 1 point per 25 passing yards.** Confirmed for
2023, 2024 and 2025 (2023's stored `pass_yd` is `0.03999999910593033`, the
float32 representation of 0.04 — same rule).

**Scoring window: weeks 1–17.** The league's season ends at week 17
(`last_scored_leg = 17`, playoffs weeks 16–17). Week 18 is excluded from every
total in this study. This matches `draft_replay_2025.py:LAST_SCORED_WEEK`.

---

## 2. PREREGISTRATION — universal rules

Fixed before any result was computed.

### 2.1 Universe and exclusions

- **Seasons:** 2023, 2024, 2025. Prior-season features may read 2021–2024 only,
  never season Y.
- **Positions:** QB, RB, WR, TE. **K and DEF are excluded from every curve and
  every model**, and their pick counts are reported in stage 2 rather than
  dropped in silence (they are streamed/mirrored positions; the replay harness
  mirrors them so they cancel).
- **The one unknown-position pid** (`12530`, 2025) is reported by pick number
  and excluded from position-conditional tables only.

### 2.2 Survivorship — the rule, stated before it bites

A drafted player with **zero** weekly rows in season Y (never took an offensive
snap that season) is **MISSING DATA, excluded from the primary arm and counted
in a named table**. Never zeroed.

A drafted player with ≥1 weekly row is included at the true sum over weeks 1–17
of the rows he has. Weeks he missed contribute nothing — that is the real
fantasy cost of an injury and is not a survivorship problem.

**Both arms are run and both are reported:**
- **Arm E (primary, per the mandate):** exclude-and-count.
- **Arm Z (secondary, the drafter's-eye view):** never-played players zeroed,
  because a pick that returns nothing did in fact return nothing to the roster.

Where E and Z disagree in sign, the disagreement is the finding and is reported
as such.

### 2.3 Uncertainty

- Every rate carries a **Wilson 95% interval**; every mean and every correlation
  carries a **95% bootstrap percentile interval, 2000 resamples**.
- Bootstrap resampling is **clustered by season** for anything pooled across
  seasons (resample seasons with replacement, then players within season), so a
  pattern present in one year cannot masquerade as a three-year finding.
- **Stability rule, fixed now:** a shape or effect is called a FINDING only if
  (a) its pooled 95% CI excludes the null AND (b) it has the same sign in at
  least 2 of the 3 seasons. Anything meeting (a) but not (b) is reported as
  "one-season, not replicated". Anything failing (a) is reported as "not
  distinguishable from noise" in those words.
- **Multiplicity:** the univariate feature screen in §3.4 runs many tests.
  Benjamini–Hochberg FDR at **q = 0.10** is applied across the full family of
  (feature × position) univariate tests. Both raw and BH-adjusted verdicts are
  printed.

### 2.4 Leakage

No feature used to predict season Y may derive from season Y. The feature
builder reads only `component_stats_{Y-1, Y-2}`, `advanced_stats_{Y-1, Y-2}`,
`nflverse_weekly_points_{Y-1, Y-2}` (or the component stores scored under the
frozen table for 2021/2022), `nflverse_draft_picks.json` (period-correct), and
the league draft record for season Y (the draft itself is a preseason event).
A test asserts the study never opens a season-≥Y outcome store on the feature
path.

**One feature is quarantined:** `team_change` (a player's season-Y NFL team
differs from Y−1) is knowable in the real world by draft day, but the only
committed source for the season-Y team label is `component_stats_Y`, an
in-season file. It is therefore **excluded from the primary leak-free model**
and reported alone, flagged, in a sensitivity row.

---

## 3. PREREGISTRATION — the six questions, operationalised

### 3.1 Q1 — the real value curve

**Instrument:** `pick_no` 1–150 from Cory's real 2023/2024/2025 drafts.
**Outcome:** realized weeks 1–17 points, Arm E primary.

**Granularity, fixed now:** the **round** (15 rounds × 10 picks × 3 seasons =
30 observations per round) is the primary unit. Per-`pick_no` values are
published as a raw scatter and are **never** the basis of a claim — each has
n = 3.

Reported per round: n, mean, median, sd, min, max, 95% bootstrap CI on the
mean, and the same three numbers per season for the stability rule. Keeper and
open-market picks are reported both pooled and split; the split is the honest
version for rounds 1–3.

**Positional curves:** for each position, realized points as a function of the
*k*-th player at that position taken in that season's draft, pooled with CIs.

### 3.2 Q2 — where the cliffs actually are

**The ordering is realized, not drafted:** within each season and position,
rank the **draftable universe** (all players at that position with ≥1 game in
season Y) by realized weeks 1–17 points, descending.

Two independent cliff detectors, both preregistered, both reported even when
they disagree:

1. **Local-drop flag.** Over ranks 1–48 (RB, WR) and 1–30 (QB, TE), flag rank
   *k* where `pts(k) − pts(k+1)` exceeds **2.0 ×** the median adjacent drop in
   that position-season window. A flagged rank is called a cliff only if it is
   flagged in **≥ 2 of 3 seasons** (the stability rule).
2. **Two-segment breakpoint.** Fit a continuous two-segment piecewise-linear
   regression of realized points on rank over the same window, choosing the
   breakpoint that minimises SSE. Bootstrap the breakpoint (season-clustered,
   2000 resamples) for a 95% CI.

**Comparison to the shipped board.** The live board computes
(`public/draft_data.json:replacement`) starter counts **RB 21, WR 29, QB 10,
TE 10** and replacement points **RB 189.10, WR 173.27, QB 341.72, TE 151.95**.
Two comparisons, both reported, and the distinction is stated at the table
because it is the thing most likely to be misread:

- **(a) Rank comparison (the meaningful one):** is the rank the board uses as
  replacement (RB21/WR29/QB10/TE10) where the realized curve actually breaks?
  This is a like-for-like comparison of ranks.
- **(b) Level comparison (the misreadable one):** realized points at that rank
  in each season, next to the board's number. **The board's replacement is a
  number in PROJECTION space; the realized value is a number in OUTCOME
  space.** They differ by the projection's own bias, so a gap here is not by
  itself an error in the board. Reported with that caveat attached, never
  headlined without it.

### 3.3 Q3 — hit and bust rates

**Two definitions, both preregistered, both reported.**

**Definition A — relative to slot (the mandate's framing).**
`expected(round r)` = mean realized points of all skill picks in round *r* in
the **other two seasons** (leave-one-season-out, so no season is graded against
a curve fitted on itself).
- **HIT** = realized ≥ **1.25 ×** expected(r)
- **BUST** = realized ≤ **0.60 ×** expected(r)
- otherwise **NEUTRAL**
Never-played picks are excluded (Arm E) and counted; Arm Z counts them as
busts.

**Definition B — absolute, league-relevant.** A pick is a **STARTER** if the
player finished season Y at or above his position's league starter rank
(RB ≤ 21, WR ≤ 29, QB ≤ 10, TE ≤ 10 — the board's own starter counts) among
players with ≥1 game. Otherwise **NOT A STARTER**.

Reported by position, by round, and by position × round-band (1–3 / 4–6 / 7–10
/ 11–15), with Wilson 95% intervals and n at every cell.

**The folk-wisdom test, stated in advance:** "take running backs early" is
operationalised as — in rounds 1–6, is the RB starter rate (Definition B)
higher than the WR starter rate, and is the RB mean realized-points advantage
distinguishable from zero under the stability rule? Both directions are
publishable.

### 3.4 Q4 — what separated hits from busts

**Feature set (all leak-free unless flagged):**

| feature | source | note |
|---|---|---|
| `prior_pts` | weekly points Y−1 | the naive anchor |
| `prior_ppg` | weekly points Y−1 / games | rate, not volume |
| `prior_games` | weekly points Y−1 | durability proxy |
| `prior2_pts` | weekly points Y−2 | two-year signal; absence flagged, not zeroed |
| `age_Y` | 2026 board age − (2026−Y) | **GAP 3** — partial, survivorship-biased |
| `tgt_share` | component Y−1 | mean over weeks played |
| `wopr`, `ay_share` | advanced Y−1 | opportunity share |
| `rec_epa_pg`, `rush_epa_pg`, `pass_epa_pg`, `cpoe`, `racr` | advanced Y−1 | efficiency |
| `opp_pg` | component Y−1 | (targets + rush attempts) per game — **volume** |
| `pts_per_opp` | derived Y−1 | points per opportunity — **efficiency** |
| `draft_round`, `nfl_exp` | `nflverse_draft_picks.json` | period-correct |
| `team_change` | component Y vs Y−1 | **QUARANTINED** (§2.4), sensitivity only |

**Three outcomes, three sample sizes, all reported:**
- **(a)** `realized_Y` — continuous, every player with a Y−1 profile (largest n,
  no market involved).
- **(b)** `resid_vs_naive` = `realized_Y − prior_pts` — did the feature predict
  the CHANGE, above the naive carry-forward. Large n, market-free.
- **(c)** `resid_vs_slot` = `realized_Y − expected(round)` — the literal "beat
  their slot" outcome, on the ~317-pick open-market subset. **Smallest n,
  widest CIs, and pre-declared as the arm most likely to return nothing.**

**Method:** per position — (i) univariate Spearman ρ with season-clustered
bootstrap 95% CI, under BH FDR q = 0.10; (ii) standardized-coefficient OLS
with all leak-free features, coefficients in points per 1 sd, with bootstrap
CIs. The volume-vs-efficiency question is answered by the head-to-head of
`opp_pg` against `pts_per_opp` in both arms.

### 3.5 Q5 — the ideal board in hindsight, and how much was reachable

**Hindsight board:** within each season, players ranked by realized weeks 1–17
points (Arm E universe).

**Capture metric, fixed now.** For an ordering *X*, a position *p* and the
league's starter count *K(p)* (RB 21, WR 29, QB 10, TE 10):

```
capture(X, p) = Σ realized(top K(p) by X) / Σ realized(top K(p) by hindsight)
```

`capture = 1.0` means the ordering found the perfect starter set;
`capture` at the random-draw floor means it found nothing. A **random floor**
is computed by drawing K(p) players uniformly from the draftable pool, 2000
times, and reporting its mean and 95% interval. **The headline number of this
whole study is how far the best preseason ordering sits between that floor and
1.0.**

**Orderings tested (in this order, deliberately):**
1. **The market** — Cory's league's own draft order. Real, preseason, not ours.
2. **Naive prior-season points** — the free baseline every projection must beat.
3. **Week-1 prop-implied points × 17** — a real betting market, name-crosswalked
   with the repo's existing normaliser; coverage reported, misses counted.
4. **own_v6 walk-forward, market arm removed** — **benchmark only, last row,
   never the subject.** Reused unmodified from `draft_replay_2025.py`.

### 3.6 Q6 — positional allocation by round, derived from outcomes

From the leave-one-season-out empirical curve, build `E[points | round, pos]`
for every (round 1–15 × position) cell, **with its n and CI printed in the same
table**. Then enumerate every feasible allocation of the 13 skill picks across
15 rounds (K and DEF forced into rounds 14–15, mirroring Cory's actual
behaviour) subject to roster feasibility (≥1 QB, ≥2 RB, ≥2 WR, ≥1 TE, ≥1 flex-
eligible extra) and onesie caps QB ≤ 2, TE ≤ 2, and score each allocation as the
sum of its cells' expected values.

**This instrument's limitations are declared before it runs, not after:**
- Cells are thin — ~390 skill picks over 60 cells, ~6–7 per cell. The CI on a
  cell will frequently be wider than the difference between allocations.
- It assumes a pick at (round, pos) returns the cell mean **regardless of who
  else drafted** — no availability, no cascade, no opponent response. It is a
  marginal-value table, not a draft simulation.
- **Pre-committed reconciliation rule:** `roster_construction_2026-08-16.md`
  found no archetype beats the shipped policy, with deltas that are fractions
  of a weekly point. If this instrument disagrees, the disagreement is reported
  at full volume AND interrogated — and unless the disagreement survives its
  own CI, **the archetype simulation is the instrument trusted**, because it
  models availability and this one does not. That preference is fixed NOW, in
  advance, so it cannot be chosen after seeing which way the answer went.

### 3.7 Stopping rule and what ships

- Every number in stage 2 is produced by one committed, tested module and one
  committed artifact. Nothing is hand-computed.
- **No model, board, config or policy change ships from this study.** Any real
  finding becomes a `DECISIONS-NEEDED.md` item with a described diff, and Cory
  rules. That is the house rule and it is restated here so stage 2 cannot drift.

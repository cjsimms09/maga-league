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

---
---

# STAGE 2 — THE RESULTS (questions 1–6)

_Appended 2026-08-16. §§0–3 above are unchanged from the preregistration commit.
Produced by `draft/backtest/empirical_draft_value.py` →
`draft/backtest/empirical_draft_value.json`, tests in
`draft/tests/test_empirical_draft_value.py`._

## 4. THE ANSWER, FIRST

**1. The prize is smaller than anyone in this repo has been assuming, and we can
now put a number on it.** Cory's league's own draft board — the market, with no
model in it at all — captured **82–87% of the perfect-hindsight starter set** at
every position. Perfect foresight, from the moment the draft ended, was worth
**14.2 points per team per week** more than the board the room actually produced.
That is the ENTIRE remaining prize at the draft, and no instrument can claim more
than a slice of it.

**2. Nothing we have beats the market. Not our model, not the betting market,
not last year's points.** Measured on identical footing:

| preseason ordering | QB | RB | WR | TE | points/team/week left vs perfect |
|---|---|---|---|---|---|
| random draw from the pool (floor) | .351 | .324 | .354 | .315 | — |
| naive: last season's points | .790 | .752 | .817 | .775 | 19.46 |
| **own_v6 walk-forward** (benchmark) | .769 | .781 | .826 | .774 | 18.88 |
| week-1 betting props ×17 | .733 | .834 | .844 | .794 | 17.44 |
| **the market — the league's own draft order** | **.815** | **.841** | **.874** | **.824** | **14.16** |
| perfect hindsight | 1.000 | 1.000 | 1.000 | 1.000 | 0 |

**The market beats own_v6 at all four positions, and beats every other ordering
tested at all four positions.** own_v6 beats the free naive baseline at RB
(+.029) and WR (+.009) and loses to it at QB (−.021) and TE (−.001). Read that
plainly: against the market, our projection is not where the edge is.

**3. Where the leverage actually is: rounds 1–6, and after that the draft is
close to flat.** Rounds 1–6 returned 186.8 / 196.8 / 186.7 points per pick in
2023 / 2024 / 2025. Rounds 7–15 returned 128.7 / 140.0 / 131.5. Same gap, ~55
points, all three years. **Within rounds 7–15 no round's 95% interval excludes
any other round's mean** — those nine rounds are, on this evidence,
interchangeable in expectation.

**4. The most actionable single finding: from round 7 on, running backs and
receivers are systematically BELOW replacement, and tight end is the only
position where a late pick is not measurably a loss.** Sixteen (round, position)
cells have a value-over-replacement interval lying entirely below zero. Twelve
of them are RB or WR in rounds 8–15. Round-15 RB is **−142.1 points below
replacement [−163.3, −94.7]**. Only two cells sit entirely above replacement:
round-1 WR (+49.1) and round-2 QB (+64.3, and those four picks are keepers).

**5. "Take a running back early" is not supported in this format.** In rounds
1–6, RB outscored WR by 20.0 points per pick — **95% CI [−36.1, +65.7]**, and
the sign flips (2023 −39.7, 2024 +41.6, 2025 +55.5). Starter rates are a
coin-flip apart: RB 64.2%, WR 66.2%. **Not distinguishable from noise.**

**6. Paying up for a quarterback did not pay.** The first three QBs off the
board went at picks 15–47 and averaged 312.2; the eighth-and-later QBs went at
picks 57–150 and averaged 257.8. Difference +46.6, **95% CI [−47.1, +140.5] —
not distinguishable from noise**, and 2025 flipped (late QBs won by 14.5). By
name: 2024's best fantasy QB (Joe Burrow, 443.8) went at pick 61; the QB taken
at pick 115 that year (Jayden Daniels) returned 401.6. In 2025 Dak Prescott at
pick 112 returned 367.1 against Josh Allen's 412.6 at pick 15. **This is an
independent, outcomes-side confirmation of the withdrawal recorded in
`WAR-ROOM-SAID-TAKE-EARLY-QB.md`** — that document voided the early-QB doctrine
on a design defect; this study finds no evidence for it in the results either.

**7. What separated the players who returned value: volume, and only volume.**
Opportunity (targets + carries per game) predicts next-season points about as
well as last season's points do and far better than any efficiency metric —
WR opportunity ρ = **0.704** against points-per-opportunity ρ = **0.322**; TE
0.712 against 0.126 (the latter not distinguishable from noise). And in the
residual arm, **last season's efficiency predicts DECLINE**: WR points-per-
opportunity ρ = **−0.284 [−0.368, −0.189]**, TE **−0.294**, all three seasons
the same sign, surviving FDR.

**8. Nothing predicted beating your draft slot, with exactly one exception.**
Across every feature and every position, the "beat the slot" residual returned
noise — except **RB NFL draft capital, ρ = −0.427 [−0.669, −0.091]**, three
seasons the same sign, FDR-surviving: running backs whom NFL teams drafted
earlier beat their fantasy slot. Everything else at every position: not
distinguishable from noise.

**No model, board, config or policy change ships from this document.** §11 lists
what goes to `DECISIONS-NEEDED.md` for Cory's ruling.

---

## 5. Q1 — THE REAL VALUE CURVE

**Survivorship first, because it turned out to be a non-issue and that deserves
saying rather than assuming.** Across 450 picks over three seasons, **exactly
one** drafted skill player never took a snap: Joe Mixon, 2025 pick 68 (round 7).
Arm E (exclude) and Arm Z (zero) are therefore numerically almost identical —
every starter rate is unchanged to three decimals, the round-7 mean moves 147.1
→ 142.0. **Every finding in this document holds under both arms.** Non-skill
accounting: K/DEF picks 20 / 19 / 21 per season, excluded throughout; one 2025
pick (pick 64, Cory's own seat, player id `12530`, 49.8 points over 7 games) has
no entry in `player_positions.json` and is excluded from position-conditional
tables only — a small committed-data gap, named in §11.

### 5.1 By round (Arm E, pooled 2023–25, n = 30 per round except where K/DEF thin it)

| round | n | mean | 95% CI | median | sd | min | max | keepers | open-market mean | 2023 / 2024 / 2025 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 30 | 208.3 | [179.9, 240.1] | 207.4 | 76.0 | 40.3 | 357.8 | 28 | 235.3 (n=2) | 197.4 / 199.9 / 227.8 |
| 2 | 30 | 226.9 | [186.8, 267.8] | 221.4 | 103.7 | 48.1 | 428.3 | 25 | 189.8 (n=5) | 230.0 / 209.1 / 241.6 |
| 3 | 30 | 188.7 | [153.8, 228.3] | 180.4 | 70.5 | 21.1 | 334.5 | 19 | 165.8 (n=11) | 166.2 / 223.7 / 176.1 |
| 4 | 30 | 170.3 | [116.5, 230.3] | 161.8 | 85.8 | 49.9 | 425.6 | 1 | 170.6 | 225.2 / 168.3 / 117.3 |
| 5 | 30 | 180.0 | [142.8, 226.5] | 172.3 | 95.3 | 10.7 | 485.4 | 0 | 180.0 | 159.4 / 211.0 / 169.6 |
| 6 | 30 | 166.3 | [133.9, 199.6] | 160.2 | 70.0 | 41.2 | 351.1 | 0 | 166.3 | 142.6 / 168.7 / 187.6 |
| 7 | 28 | 147.1 | [117.1, 180.6] | 155.8 | 82.5 | 8.3 | 443.8 | 0 | 147.1 | 140.5 / 161.7 / 136.8 |
| 8 | 30 | 126.7 | [100.2, 153.1] | 136.6 | 53.3 | 6.0 | 239.3 | 0 | 126.7 | 152.1 / 117.5 / 110.4 |
| 9 | 29 | 135.2 | [102.4, 172.6] | 115.4 | 74.6 | 26.3 | 336.3 | 0 | 135.2 | 118.7 / 119.5 / 165.9 |
| 10 | 28 | 127.0 | [99.5, 165.9] | 108.7 | 71.7 | 13.6 | 381.7 | 0 | 127.0 | 156.5 / 118.2 / 107.3 |
| 11 | 24 | 136.1 | [97.3, 176.3] | 114.9 | 93.5 | 10.1 | 350.6 | 0 | 136.1 | 115.6 / 159.5 / 131.3 |
| 12 | 23 | 156.8 | [90.3, 226.0] | 98.6 | 117.1 | 0.0 | 401.6 | 0 | 156.8 | 99.3 / 210.1 / 153.4 |
| 13 | 12 | 114.6 | [42.2, 191.3] | 111.7 | 100.0 | 2.7 | 347.8 | 0 | 114.6 | 41.8 / 144.3 / 155.0 |
| 14 | 16 | 131.9 | [92.6, 179.6] | 131.4 | 90.9 | 30.8 | 336.9 | 0 | 131.9 | 134.4 / 126.2 / 134.6 |
| 15 | 18 | 111.6 | [60.7, 163.1] | 105.6 | 86.3 | 7.5 | 324.3 | 0 | 111.6 | 149.4 / 94.5 / 75.4 |

**Read it with GAP 2 in hand.** Rounds 1–3 are 72 keepers out of 90 picks; that
band is a keeper ledger and not a market clearing, which is also why round 2
(226.9) outscores round 1 (208.3) — a keeper's round cost is set by his prior
year's draft slot, not by this year's market. The open-market draft is rounds
4–15.

**The one shape that survives the stability rule:** rounds 1–6 beat rounds 7–15
by **58.1 / 56.8 / 55.2** points per pick in 2023 / 2024 / 2025 — the same gap,
the same sign, all three years. **Within rounds 7–15, nothing separates.** Every
round from 7 to 15 has a mean inside every other one's 95% interval. Round 12's
mean (156.8) exceeds round 7's (147.1); round 13's interval is 149 points wide
on n = 12.

### 5.2 By positional order — the k-th player at that position taken

The instrument that produced finding 6. Mean realized points, pooled, with the
mean pick number that ordinal actually cost:

| k | QB (pick) | RB (pick) | WR (pick) | TE (pick) |
|---|---|---|---|---|
| 1 | **391.7** (15.7) | 231.2 (1.3) | 180.4 (2.7) | 187.6 (12.3) |
| 2 | 321.7 (24.0) | 292.3 (2.3) | 173.7 (5.7) | 130.0 (24.0) |
| 3 | 223.2 (37.7) | 101.7 (3.7) | 229.8 (7.3) | 157.1 (41.3) |
| 4 | 346.4 (42.0) | 206.1 (7.0) | 282.6 (9.7) | 112.1 (45.3) |
| 5 | 277.0 (45.0) | 261.2 (9.0) | 127.5 (12.7) | 135.2 (51.7) |
| 6 | 303.0 (50.3) | 236.0 (13.7) | 202.4 (14.0) | 126.2 (59.7) |
| 7 | 340.7 (56.3) | 224.1 (17.0) | 162.2 (15.0) | 99.5 (66.3) |
| 8 | 253.1 (67.0) | 137.8 (18.3) | 165.4 (17.0) | 65.2 (70.7) |
| 9 | 251.6 (82.3) | 140.9 (20.3) | 193.2 (19.3) | 139.3 (79.3) |
| 10 | **343.3** (104.3) | 205.4 (23.0) | 191.9 (21.0) | 121.3 (88.3) |
| 11 | 123.8 (110.7) | 258.9 (24.3) | 150.9 (23.3) | 111.5 (105.3) |
| 12 | 235.9 (117.0) | 248.9 (26.3) | 136.0 (26.0) | 114.1 (119.0) |
| 13 | 269.9 (120.7) | 236.4 (28.7) | 167.5 (28.0) | 115.8 (134.3) |
| 14 | **348.1** (129.3) | 207.3 (31.7) | 142.8 (31.3) | 123.0 (136.5) |

**RB and WR ordering inside the first fourteen is not a curve, it is noise.**
RB3 (mean pick 3.7) returned 101.7; RB11 (mean pick 24.3) returned 258.9. WR5
(pick 12.7) returned 127.5; WR4 (pick 9.7) returned 282.6. Every one of those
cells is n = 3 and the intervals overlap almost completely — do not read the
ordering, read the flatness.

**QB is the exception, and it points the other way from the market.** QB10 (mean
pick 104) returned 343.3 and QB14 (mean pick 129) returned 348.1, against QB1's
391.7 at pick 15.7. Verified by name in §4 finding 6.

---

## 6. Q2 — WHERE THE CLIFFS ACTUALLY ARE

Realized-points curves over the draftable universe (≥1 game played), pooled
across the three seasons.

| position | pooled two-segment breakpoint | 95% CI | per season | local-drop flags stable in ≥2 of 3 seasons | pool size |
|---|---|---|---|---|---|
| QB | 5 | [4, 18] | 18 / 9 / 15 | 1, 2, 21, 25 | 76 / 73 / 77 |
| RB | **8** | **[4, 11]** | 4 / 7 / 11 | 1, 2, 4, 6, 8, 15, 26 | 140 / 134 / 137 |
| WR | **6** | **[4, 8]** | 4 / 5 / 8 | 1, 2, 3, 4, 6, 8, 43 | 186 / 201 / 201 |
| TE | 8 | [4, 11] | 11 / 10 / 4 | 1, 4, 5, 6, 9, 12, 14 | 98 / 100 / 104 |

**RB and WR each have exactly one real cliff and it is very early.** WR breaks
at rank 6 (CI [4, 8]) and RB at rank 8 (CI [4, 11]) — both stable, both
replicated by the independent local-drop detector. **QB's breakpoint is not
identified**: three seasons put it at 18, 9 and 15 and the bootstrap interval
runs [4, 18], which is the whole window. TE's is [4, 11], borderline.

**After that first cliff, the curves are gentle — and for WR, nearly flat where
it matters.** Pooled WR realized points: WR9 = 195.3, WR29 = 155.0. **Twenty
ranks of receiver cost 40 points, two points per rank.** RB is steeper: RB9 =
223.3, RB21 = 170.8, about 4.4 points per rank. This is the mechanical reason
finding 3 is true.

### 6.1 The board's replacement levels against reality

| position | board starter rank | board replacement (PROJECTION space) | realized at that rank, 2023 / 2024 / 2025 | pooled realized | gap |
|---|---|---|---|---|---|
| QB | 10 | 341.72 | 320.7 / 333.2 / 336.3 | 330.1 | **+11.6** |
| RB | 21 | 189.10 | 171.1 / 174.0 / 167.4 | 170.8 | **+18.3** |
| WR | 29 | 173.27 | 162.6 / 158.4 / 144.1 | 155.0 | **+18.3** |
| TE | 10 | 151.95 | 119.1 / 117.3 / 135.8 | 124.1 | **+27.9** |

**⚠️ READ THE CAVEAT BEFORE THE NUMBERS.** The board's replacement is a level in
**projection space**; the realized column is **outcome space**. They differ by
the projection's own optimism, so a positive gap at every position is expected
and is not by itself an error. What matters for a board that ranks players by
`projection − replacement` is not the level of the bias but its **spread across
positions**, because that spread flows straight into cross-position VORP.

**That spread is 16.3 points: QB +11.6 at one end, TE +27.9 at the other.** TE's
replacement is the most inflated of the four, which pushes every tight end's
VORP down relative to every running back's and receiver's by roughly ten to
sixteen points of season projection. Whether that is a defect or an artifact of
comparing spaces cannot be settled by this study — it requires grading the
projection's per-position bias directly, which is a model study and deliberately
out of scope here. **It goes to `DECISIONS-NEEDED.md` as a question, not a
patch** (§11).

**On the ranks themselves, the board is placed reasonably.** The board puts RB
replacement at rank 21 and the RB cliff is at rank 8 with the curve already
gentle by 21; WR replacement at 29 sits deep into WR's flat region. Neither
starter count lands on a shelf, which is the thing that would have made the
level fragile.

---

## 7. Q3 — HIT AND BUST RATES

**⚠️ THE PREREGISTERED DEFINITION A IS BROKEN AT QUARTERBACK, AND THAT IS
REPORTED RATHER THAN QUIETLY REPAIRED.** §3.3 fixed `expected(round)` as the
mean over **all** skill picks in that round, position-blind. Because 6-point
passing touchdowns put QB scoring on a different scale (mean 281.4 against RB
145.9), almost any quarterback clears 1.25× a position-blind round mean: the QB
"hit rate" comes out at **77.1%** and the bust rate at 8.3%. That is a
measurement of the scoring format, not of quarterbacks. The preregistration was
wrong; it is left as written and **Definition B carries the section.**

### 7.1 Definition B — did the pick finish as a league starter (RB≤21, WR≤29, QB≤10, TE≤10)

| round band | n | starter rate | 95% CI | per season |
|---|---|---|---|---|
| 1–3 | 90 | **74.4%** | [64.6, 82.3] | .633 / .800 / .800 |
| 4–6 | 90 | **51.1%** | [41.0, 61.2] | .500 / .600 / .433 |
| 7–10 | 115 | **33.9%** | [25.9, 43.0] | .385 / .256 / .378 |
| 11–15 | 93 | **21.5%** | [14.4, 30.9] | .161 / .219 / .267 |

Monotone in every season; the 1–3 and 4–6 intervals do not overlap, nor do 4–6
and 7–10. **This is the study's most solid single curve.**

### 7.2 By position and band — where the variance actually lives

| band | QB | RB | WR | TE |
|---|---|---|---|---|
| 1–3 | 71.4% (n=7) | 73.7% (n=38) | 75.0% (n=40) | 80.0% (n=5) |
| 4–6 | 33.3% (n=15) | 51.7% (n=29) | 55.9% (n=34) | 58.3% (n=12) |
| 7–10 | 60.0% (n=5) | 28.2% (n=39) | 38.6% (n=57) | 21.4% (n=14) |
| 11–15 | 38.1% (n=21) | **8.6%** (n=35) | 15.4% (n=26) | 45.5% (n=11) |

**Late running backs are the worst picks in the draft, and it replicates
exactly.** Rounds 11–15 RB produced 1 starter from 12 picks in 2023, 1 from 10
in 2024, 1 from 13 in 2025 — 3 of 35, 8.6% [3.0, 22.4]. The same cell's bust
rate under Definition A is **57.1%**, the highest in the study.

**Tight end is where the late-round exception lives**, at 45.5% — but n = 11
(2 of 3, 0 of 4, 3 of 4) and the split by season is not stable. **Suggestive,
not a finding.**

**Early RB versus early WR (the folk-wisdom test, preregistered):** rounds 1–6,
RB mean 189.4 (n=67) against WR 169.4 (n=74). Difference **+20.0, 95% CI
[−36.1, +65.7]**; per season −39.7 / +41.6 / +55.5; starter rates 64.2% against
66.2%. **Not distinguishable from noise.** Two of three seasons favour RB, so
the pooled point estimate leans that way, but the interval covers zero by a
wide margin and 2023 runs hard the other way. **In this scoring format, on this
evidence, there is no early-RB premium.**

Keeper picks returned 214.2 points and started 75.3% of the time; open-market
picks returned 147.1 and started 37.1%. That is what a keeper league looks like
working correctly and is not a finding about drafting.

---

## 8. Q4 — WHAT SEPARATED HITS FROM BUSTS

n = 1152 player-seasons with a prior-season profile. Feature coverage is
reported in the artifact and is the thing to check before quoting any row:
`prior_pts` 100%, `tgt_share`/`wopr` 85.8%, **`age_Y` 72.6% (GAP 3,
survivorship-biased)**, `draft_round`/`nfl_exp` 36.5% (2021–25 NFL draftees
only), `cpoe` 18.9%, `pass_epa_pg` 21.4%.

### 8.1 Volume beats efficiency, and it is not close

Spearman ρ against realized season-Y points (all FDR-surviving, all three
seasons same sign):

> **[CORRECTED 2026-08-16, later the same session — see §18.](#18-correction-the-fdr-screen-was-broken-when-stage-2-shipped)**
> "all FDR-surviving" is true of every cell in this table EXCEPT **TE points
> per opportunity (ρ = 0.126, p = 0.052)**, which does not survive BH at
> q = 0.10 — consistent with the cell's own label, which already read "noise".
> The sentence is kept as written per the house no-delete habit. Every other
> FDR claim in §§4–11 was re-verified against the fixed screen and holds.

| position | opportunity/game | prior-season points | target share | WOPR | **points per opportunity** |
|---|---|---|---|---|---|
| WR | **0.704** [0.629, 0.766] | 0.728 | 0.714 | 0.718 | 0.322 [0.211, 0.428] |
| TE | **0.712** [0.622, 0.782] | 0.726 | 0.705 | 0.691 | **0.126 [−0.042, 0.281] — noise** |
| RB | **0.659** [0.547, 0.751] | 0.704 | 0.532 | 0.510 | 0.243 [0.111, 0.372] |
| QB | 0.228 [0.057, 0.376] | 0.623 | — | — | 0.319 [0.114, 0.497] |

**Opportunity is worth as much as last year's points and roughly twice what
efficiency is worth at every pass-catching position.** At tight end,
efficiency's predictive content is indistinguishable from zero.

### 8.2 The residual arm — what predicts the CHANGE, above naive carry-forward

This is the arm that answers "what separated the ones who beat expectations".

**Everything about last season mean-reverts, at every position.** `prior_pts`
against `realized − prior_pts`: QB **−0.433** [−0.540, −0.301], WR **−0.367**
[−0.488, −0.199], TE **−0.324** [−0.443, −0.188], RB **−0.319** [−0.470,
−0.154]. All four, all three seasons, all FDR-surviving.

**Last season's EFFICIENCY predicts decline specifically.** WR points-per-
opportunity **−0.284** [−0.368, −0.189]; TE **−0.294** [−0.463, −0.094]; RB
**−0.213** [−0.323, −0.061]; WR receiving EPA/game **−0.254**. Volume mean-
reverts too but less (WR opportunity −0.236 against efficiency −0.284, and WR
`racr` −0.135). **Practical translation: a receiver who was efficient on modest
volume last year is a worse bet than his points suggest; a receiver who was
inefficient on heavy volume is a better one.**

**Age shows up in exactly one place, and it is real there.** WR `age_Y` against
the residual: **ρ = −0.249 [−0.374, −0.125]**, three seasons the same sign,
FDR-surviving. RB (−0.183 [−0.377, 0.013]) and TE (−0.173 [−0.349, 0.026]) lean
the same way without clearing the bar; QB is flat (0.002). **Carry the coverage
caveat with it** — 72.6% coverage, conditioned on being on a 2026 board.

**Multivariate (standardized OLS, points per 1 sd, season-clustered bootstrap
CIs):** R² of 0.47–0.60 on the level arm, 0.21–0.30 on the residual arm. The
multicollinearity among the volume features is severe (RB `wopr` +283.3 with
`tgt_share` −268.1, intervals hundreds of points wide) and **the multivariate
coefficients should not be quoted individually** — only two survive their own
interval on the residual arm: RB `prior_pts` **−81.8** [−124.8, −24.8] (mean
reversion again) and RB `racr` **+10.4** [+0.2, +24.6].

### 8.3 Beating your slot — the arm preregistered as most likely to return nothing

It returned almost nothing, as expected.

| position | n | anything? |
|---|---|---|
| QB | 44 | **nothing.** Largest ρ is `prior2_pts` 0.244 [−0.159, 0.635]. |
| RB | 121 | **`draft_round` ρ = −0.427 [−0.669, −0.091]** (n=56), 3/3 seasons, FDR-surviving. Also `racr` +0.236 [0.063, 0.403]. |
| WR | 138 | **nothing.** Largest is `cpoe` 0.496 on n=19, CI [−0.466, 0.869]. |
| TE | 38 | **nothing.** Every interval covers zero. |

**One finding out of ~60 tests: running backs with better NFL draft capital beat
their fantasy draft slot.** That is consistent with the level arm, where NFL
draft round is a real predictor of points at RB (−0.386), WR (−0.367) and TE
(−0.519) — but it is the only feature that survives once the market's own price
is netted out.

### 8.4 Team change — quarantined, and it says nothing

Read from `component_stats_Y` (§2.4), so it is a sensitivity row and nothing
more. Residual-vs-naive difference for players who changed NFL teams: QB −19.6
[−59.1, +15.8], RB −10.7 [−36.5, +11.3], WR −9.2 [−22.4, +3.6], TE +0.3
[−16.3, +20.6]. **All four intervals cover zero.** The signs lean negative at
three positions; that is all that can be said.

---

## 9. Q5 — THE IDEAL BOARD, AND HOW MUCH OF IT WAS REACHABLE

The headline table is in §4. Method and the things that could invalidate it:

- `capture(X, pos) = Σ realized(top K by X) / Σ realized(top K by hindsight)`,
  K = the board's own starter counts. Hindsight top-K sums per season, for
  scale: QB 3610 / 3957 / 3667, RB 4410 / 4891 / 5005, WR 5894 / 5579 / 5277,
  TE 1535 / 1535 / 1565.
- **The market is handicapped in this comparison and still wins.** Its pool is
  only the 46–54 players per position the league actually drafted, so a player
  who broke out from undrafted is unreachable to it while the naive ordering can
  reach him. It beat naive anyway, at all four positions.
- **Week-1 props are a LOWER BOUND and the reason is a defect in a committed
  artifact.** The anytime-TD column in `historical_props_week1_*.json` is
  corrupted — Christian McCaffrey's 2024 `any_td` is **4.21** and a cornerback's
  is 1.68; those cannot be expected touchdowns for one game. This is the decimal-
  odds corruption `fetch_historical_props.py` now guards against
  (`AMERICAN_IMPOSSIBLE_BAND`, whose own comment names "the 21-33x corruption
  the 2026-08-16 anytime-TD column shipped with") — **the guard landed in the
  fetcher, the committed week-1 stores predate it and still carry the bad
  values.** The props ordering here therefore uses only the point-quoted markets
  (`pass_yd`, `pass_td`, `rush_yd`, `rec_yd`, `rec`) and **carries no rushing or
  receiving touchdowns at all**, which understates goal-line backs and red-zone
  receivers. Name-crosswalk coverage: 242 / 236 / 227 players matched per
  season. Its QB number (.733) is the arm most damaged by the exclusion.
- own_v6 is `draft_replay_2025.build_projections` imported unmodified — 481 /
  500 / 508 projected players per season, market arm removed because that arm's
  input IS the league draft being compared against.

**Hindsight value is not concentrated enough to rescue a projection, either.**
The top-K starter set holds only 37.7–39.2% of a position's total realized
points at QB; the top 5 hold ~21%. There is no small set of players that, found
in advance, wins the season by itself.

**So the bound on the whole exercise, stated as plainly as it can be:** the room
already extracts ~85% of the reachable value with no model at all. The remaining
15% is worth 14.2 points per team per week — and **every preseason instrument in
this repo, ours included, currently sits FURTHER from hindsight than the room
does.** That is the honest null this study preregistered as a likely outcome,
and it arrived.

---

## 10. Q6 — POSITIONAL ALLOCATION BY ROUND

**The preregistered form of this instrument is degenerate and the repair is
declared, not hidden.** §3.6 said to score allocations by summing
`E[points | round, pos]`. Run as written, that allocator drafts fifteen
quarterbacks: under 6-point passing TDs a round-15 QB cell averages 241.0 raw
points against a round-15 RB cell's 28.8. Raw points are the wrong currency for
a positional question. The table below therefore carries both the preregistered
raw mean and `vor_mean`, the cell measured against the position's **pooled
realized replacement** (§6.1: QB 330.1, RB 170.8, WR 155.0, TE 124.1 — outcome
space on both sides of the subtraction). **This is a post-hoc repair of a
preregistration that was wrong.**

**The instrument cannot separate allocations, exactly as §3.6 warned.** Mean
cell n = 6.5, median cell 95% interval width = **79.0 points** — wider than
almost every difference anyone would want to act on. Of the fifteen rounds,
**the best position is separable from the runner-up in exactly one** (round 15,
TE, on n = 3 — a curiosity, not a finding).

**What IS separable is the sign, and it is the section's real output.** Sixteen
cells with n ≥ 3 have a value-over-replacement interval lying entirely below
zero, and only two lie entirely above:

| entirely ABOVE replacement | entirely BELOW replacement |
|---|---|
| R1 WR **+49.1** [11.5, 90.1] (n=12) | R5 RB −77.3, R6 QB −81.2, R7 TE −36.2, R8 RB −63.1, R9 WR −39.9, R10 RB −47.2, R10 WR −38.7, R11 RB −63.8, R12 RB −74.2, R12 WR −51.8, R13 RB −113.5, R14 RB −87.2, R14 WR −42.6, R15 QB −89.1, **R15 RB −142.1**, R15 WR −71.6 |
| R2 QB **+64.3** [26.8, 98.3] (n=4, all keepers) | |

**Twelve of the sixteen below-replacement cells are RB or WR in rounds 8–15.**
Every RB cell from round 8 to round 15 is significantly below replacement.
**Not one TE cell after round 7 is** — TE's late cells are indistinguishable
from replacement rather than measurably below it, which is the same asymmetry
§7.2 found from a different direction.

### 10.1 Reconciliation with the archetype simulation — the rule was fixed in advance

`roster_construction_2026-08-16.md` found no construction archetype beats the
shipped policy, with deltas that are fractions of a weekly point. **This
instrument does not contradict it. It is unable to contradict anything**, and
its own intervals say so: with a median cell interval of 79 points per season
(≈4.6 per week), it cannot resolve a difference of fractions of a weekly point
even in principle. Per §3.6's pre-committed rule, **the archetype simulation
remains the instrument trusted** — it models availability, cascade and opponent
response, and this one models none of them.

The two instruments agree on the only thing both can see: there is no large
allocation edge sitting unclaimed.

---

## 11. WHAT THIS CONTRADICTS, WHAT IT COULD NOT ANSWER, AND WHAT GOES TO CORY

### 11.1 Contradicted or corroborated

- **CORROBORATES the early-QB withdrawal.** `WAR-ROOM-SAID-TAKE-EARLY-QB.md`
  voided the doctrine on a design defect (a control that could not field a
  quarterback in 198 of 200 rooms). This study finds no outcome-side support for
  it either: early-versus-late QB is +46.6 points, CI [−47.1, +140.5], sign
  flipped in 2025. Two independent instruments, same answer.
- **DOES NOT CONTRADICT the roster-construction audit** (§10.1), and could not
  have.
- **PRESSURES the assumption behind every projection-improvement effort on this
  branch.** The market beats own_v6 at all four positions and beats every
  ordering tested. Nothing here says own_v6 is bad — it says the room's own
  board is better, and that is where the burden of proof now sits.
- **NEW, and mildly uncomfortable: the TE replacement gap** (§6.1, +27.9 against
  QB's +11.6). Not adjudicated here on purpose.

### 11.2 What could NOT be answered, and why

1. **Value by NATIONAL draft slot.** No historical ADP exists in-repo and FFC is
   egress-blocked from this sandbox (GAP 1). Everything slot-shaped in this
   document is Cory's own 10-team league, n = 150 per season, rounds 1–3
   keeper-administered.
2. **Anything about rounds 1–3 as a market.** They are 72 keepers out of 90.
3. **Whether the board's replacement LEVELS are wrong**, as opposed to
   differently biased across positions — that needs a per-position projection-
   bias grading, which is a model study.
4. **Whether a properly-built props board beats the market.** The anytime-TD
   column is corrupted in the committed week-1 stores, so the props arm here
   carries no rushing or receiving touchdowns and is a lower bound.
5. **Age effects with confidence.** 72.6% coverage, conditioned on surviving to
   a 2026 board.
6. **Anything at n < 12.** Reported as "insufficient n" rather than estimated.

### 11.3 Going to `DECISIONS-NEEDED.md` (described diffs, Cory rules, nothing shipped)

- **(a) Re-fetch the week-1 / full historical props stores** through the fixed
  `fetch_historical_props.py`, whose `AMERICAN_IMPOSSIBLE_BAND` guard would have
  refused the bad column. Diff: re-run the fetcher for 2023–25 and replace the
  three `historical_props_week1_*.json` (and check the full-season stores for the
  same corruption). Cost: real API credits. **Nothing that reads `any_td` from
  those stores should be trusted until this is done.**
- **(b) Fetch real historical ADP in CI**, where FFC is reachable, via
  `adp.fetch_adp("half-ppr", 10, year)` for 2023/2024/2025. Diff: one workflow
  step plus a committed store. This would let §§5–7 be redone against a national
  market instead of one league, which is the single largest upgrade available to
  this study.
- **(c) The TE replacement question** (§6.1). Diff: none proposed. The question
  is whether the projection's per-position bias should be measured and, if it is
  real and differential, corrected before `projection − replacement` is used to
  rank across positions.
- **(d) `player_positions.json` is missing player `12530`**, drafted at 2025 pick
  64 in Cory's own seat, who scored 49.8 points over 7 games. Diff: add the
  entry. Trivial, but it silently drops a real pick from position-conditional
  analysis.

### 11.4 Reproduce it

```
python3 draft/backtest/empirical_draft_value.py     # ~2 min, writes the artifact
python3 -m pytest draft/tests/test_empirical_draft_value.py -q
```

---
---

# STAGE 3 — PREREGISTRATION ADDENDUM (additions A and B)

_Appended 2026-08-16 after §§4–11 were committed. Cory added two questions
("do all in that order") that need exactly the outcomes data this study already
assembles, so they are folded in here rather than run as a parallel study._

**This commit contains §§12–14 only: the inventory these two additions hinge on,
and their complete preregistration. No result for either addition exists yet.**
Stage 4 appends §§15–16 without editing §§0–14. Everything in §2 (survivorship,
uncertainty, leakage, the stability rule, BH at q = 0.10) applies unchanged.

---

## 12. INVENTORY FOR ADDITION A — what an absent player-week actually means

The coordinator's instruction was explicit: *"Absent != zero applies with full
force here — a player with no row may have been injured, benched, or simply not
in the store, and conflating those three would invent an injury signal that is
really a coverage artifact. Establish which it is before drawing any
conclusion."* This section is that, and it found a defect.

### 12.1 ⚠️ THE 2025 WEEKLY-POINTS STORE CANNOT BE USED TO COUNT GAMES

Row presence in the two independent stores was compared player-week by
player-week, skill positions only, weeks 1–17:

| season | player-weeks in BOTH stores | only in `nflverse_weekly_points` | only in `component_stats` |
|---|---|---|---|
| 2023 | 4775 | 0 | 0 |
| 2024 | 4770 | 0 | 0 |
| **2025** | **4564** | **0** | **884** |

2023 and 2024 agree **exactly**. 2025 does not, and the mechanism is visible in
a second measurement — the count of rows worth exactly 0.0 points:

| season | skill player-weeks | rows worth exactly 0.0 |
|---|---|---|
| 2023 | 4775 | 297 (6.2%) |
| 2024 | 4770 | 306 (6.4%) |
| **2025** | **4564** | **6 (0.1%)** |

**The 2025 store's build path drops zero-point rows.** Its row presence
therefore measures "scored something", not "played" — 884 player-weeks and 54
whole skill players are missing relative to the component store.

**Does this invalidate stage 2? No, and that was checked rather than assumed.**
Every one of the 54 missing 2025 players scored ≤ 2.7 points under component
scoring, most are unmapped `gsis:` ids with no position, and **not one of them
would crack any position's league starter set**. The stage-2 universes, curves,
cliffs and starter rates are unaffected. (2023 has one such player at 0.0 points
and no position; 2024 has none.)

**But it makes games-played counts from that store non-comparable across
seasons, and a naive availability study run on it would report a fake 2025
injury spike.** So, preregistered: **this addition counts games from
`component_stats_{Y}` for all three seasons**, which is the store that agrees
with the points store where both are sound.

This is a **material defect in a committed artifact** and goes to
`DECISIONS-NEEDED.md` (§16).

### 12.2 Byes are absent rows, and the schedule is on disk

Maximum observed games in weeks 1–17 is **16** — a bye is an absent row, so a
perfectly available player shows 16, not 17. (One 2025 player shows 17, having
played for two teams across two different bye weeks.) `historical_byes.json`
covers **only 2023 and 2024**, so this addition derives each team's bye
directly from `vegas_lines_2021_2026.json` — the weeks 1–17 in which a team
has no scheduled game — which covers all three seasons exactly (272 games =
17 weeks × 16 games per season).

### 12.3 What the data CANNOT separate, stated before any result

Injury, healthy scratch, depth-chart burial and simply not being on a roster are
**indistinguishable** in these stores. `DATA-INVENTORY.md` lists
`import_injuries` and `import_snap_counts` as REACHABLE upstream, but **neither
is committed to this repo**, and network egress is blocked here (§1.1 GAP 1).

**Therefore every measure in Addition A is called AVAILABILITY, never injury**,
and no result will be phrased as an injury finding. This matters most for the
long left tail of the games distribution — 42–47 skill players per season
recorded exactly one game, and those are overwhelmingly depth players who were
never going to play, not injuries.

---

## 13. PREREGISTRATION — ADDITION A: availability and games played

### 13.1 Definitions (fixed before any result)

- `games(pid, Y)` — weeks 1–17 with a row in `component_stats_Y`.
- `team_games(pid, Y)` — weeks 1–17 in which a team the player recorded a row
  for had a scheduled game (union across teams if he moved), from `vegas_lines`.
- `availability(pid, Y) = games / team_games`, in [0, 1].
- `ppg(pid, Y) = points / games` (league scoring, weeks 1–17).
- The identity everything rests on: **`points = games × ppg`**.

### 13.2 A1 — how much of hit/bust is just availability

**Bust attribution, preregistered.** For every drafted skill pick that was NOT a
league starter under Definition B (§3.3), classify:

- **ABSENCE-DRIVEN** — `availability ≤ 0.75` (missed ≥ ~4 games) AND
  `ppg × 16` would have ranked at or above the position's starter cut. He was
  good enough and did not play.
- **PRODUCTION-DRIVEN** — `availability > 0.75`. He played and was not good
  enough.
- **BOTH** — `availability ≤ 0.75` and `ppg × 16` still misses the cut.

Reported by position and round band with Wilson 95% intervals.

**Variance decomposition.** On picks with points > 0, using
`log(points) = log(games) + log(ppg)`:
`Var(log points) = Var(log games) + Var(log ppg) + 2·Cov(log games, log ppg)`.
Shares reported per position, season-clustered bootstrap CIs.

**The "if nobody got hurt" counterfactual.** Recompute §7.1's starter-rate-by-
round-band table with `ppg × 16` substituted for realized points. The difference
between the two tables is availability's share of what the draft actually
produced. **This is the headline number for Addition A.**

### 13.3 A2 — does availability persist (the gating question)

- Spearman(`availability` in Y−1, `availability` in Y) per position, over players
  with a row in both seasons; season-clustered CI; stability rule.
- Spearman(`availability` in Y−1, `points` in Y − `points` in Y−1) — does last
  year's availability predict the residual, above the naive carry-forward.
- **Preregistered interpretation rule, fixed now so it cannot be chosen after
  the fact:** at any position where the persistence interval covers zero,
  **no availability model can help a draft at that position, and that is the
  finding.** It is published at full volume either way.

### 13.4 A3 — availability by position and age

- Mean `availability` and `P(availability ≤ 0.75)` per position, Wilson intervals.
- **RB versus WR durability** (the folk wisdom): difference in mean availability
  and in `P(availability ≤ 0.75)`, season-clustered CI, stability rule.
- Spearman(`age_Y`, `availability`) per position — carrying GAP 3's 72.6%
  survivorship-biased coverage, and not headlined.
- Both populations reported separately: **all skill players** (the honest
  population, but full of depth players who were never going to play) and
  **drafted picks only** (n ≈ 388, the population a drafter actually faces).

### 13.5 What Addition A explicitly does NOT claim

It does not model injury, cannot separate injury from benching (§12.3), and does
not propose an availability projection. `roster_construction_2026-08-16.md`
limitation #6 ("no injury modeling, biased AGAINST depth-heavy archetypes") is
the reason this was asked; whether that limitation actually explains
`robust_rb`'s finish is a question about that simulator, not about these
outcomes, and it is **out of scope here** — this addition only establishes
whether the ingredient such a model would need (persistence) exists at all.

---

## 14. PREREGISTRATION — ADDITION B: where the format mismatches the market

### 14.1 What can and cannot be asked, given GAP 1

GAP 1 stands: **there is no historical consensus ADP in this repo and none is
fetchable here**, so "did consensus ADP misprice this format" cannot be put to
consensus ADP directly. Two things can be measured, and they are what this
addition does:

1. **The format delta itself** — how much this league's scoring reorders players
   relative to the market's scoring, measured on realized outcomes. **This needs
   no ADP at all**, which is why it is worth doing.
2. **Which format the room's own board was pricing.** The room reads national
   ADP. If the league's draft order tracks MARKET-format outcomes better than
   LEAGUE-format outcomes, the room is pricing the wrong format, and that gap is
   the exploitable edge — measurable with the draft order this study already has.

### 14.2 The two tables — exactly two substitutions

- **LEAGUE** = the frozen table (0.5 PPR, 6-point passing TD).
- **MARKET** = the frozen table with `rec: 0.5 → 1.0` and `pass_td: 6.0 → 4.0`,
  **and nothing else changed.**

Every difference reported is attributable to those two rules and to nothing
else. That is the point of changing only two keys.

### 14.3 One source for both sides

Both tables are scored from `component_stats_Y` through
`fetch_component_stats.scored_weekly_points`. Parity was verified before
preregistering: component-scored under the frozen table reproduces the committed
weekly-points store **exactly** for 2023 and 2024 (max |diff| = 0.0 over 547 and
556 common players). **2025 diverges — 102 players by more than 0.5 points,
maximum 10.0** (the committed 2025 store's rebuild path undercounts 2-point
conversions; pinned as a named finding in `test_component_stats.py`). Because
both sides of every comparison below come from the same component source, that
divergence **cancels inside the comparison**.

### 14.4 Measures — per season and position, pooled with season-clustered CIs

- **`Δrank(pid)` = rank under LEAGUE − rank under MARKET** within position
  (negative = this format promotes him). Reported over each position's top 40 by
  MARKET rank: mean signed Δrank, and counts of players moving ≥5 ranks each way.
- **Starter-set turnover** — how many of the MARKET top-K are absent from the
  LEAGUE top-K, K = the board's starter counts (RB 21, WR 29, QB 10, TE 10).
- **Positional value share** — each position's share of the summed top-K starter
  points, under each table, and the shift between them.
- **Value-over-replacement shift** — `mean(top-K points) − replacement points`
  per position under each table, and the change. This is the number that
  translates into a board.
- **Which format the room priced (the actionable test).**
  Spearman(`pick_no`, LEAGUE-format realized rank) versus
  Spearman(`pick_no`, MARKET-format realized rank), per position and season;
  difference with a season-clustered CI. **A positive difference means the room's
  board tracked the market's format better than its own.**
- **Named movers** — the ten largest promotions and demotions per position, by
  name, so the mechanism is checkable by eye and not just by statistic.

### 14.5 Scope fence — do not duplicate the QB arbitrage pass

A separate agent is running the QB scoring arbitrage in depth (points → VORP →
pick guidance, including whether the edge survives QB's 341.72 replacement
level). **This addition reports the all-position outcomes view and stops short
of QB pick guidance.** Where a QB number appears it is one row of a
four-position table, never a recommendation.

### 14.6 Stopping rule

Unchanged from §3.7. Both additions are measured by one committed, tested module
and one committed artifact. **No model, board, config or policy change ships.**
Real findings become `DECISIONS-NEEDED.md` items with described diffs, and Cory
rules.

---
---

# STAGE 4 — RESULTS FOR ADDITIONS A AND B

_Appended 2026-08-16. §§0–14 unchanged. Produced by
`draft/backtest/empirical_draft_value_additions.py` →
`draft/backtest/empirical_draft_value_additions.json`, tests in
`draft/tests/test_empirical_draft_value_additions.py` (15 tests)._

## 15. ADDITION A — AVAILABILITY

### 15.0 The answer, first

**A1. Availability is a large share of what the draft produced, but it is NOT
what makes late picks fail.** If every drafted player had played a full 16
games at his own per-game rate, the starter rate would have risen by **10.8 to
15.6 percentage points in every round band** — a big, uniform lift. But the
*composition* of failure changes completely with round: **34.8% of misses in
rounds 1–3 are pure absence, against 9.6% in rounds 11–15.** Early picks fail
because they get hurt; late picks fail because they were not good enough.

**A2. Availability does persist, so the ingredient an availability model would
need does exist — modestly, and not at quarterback.** Restricted to players who
already had a real role (the arm that matters — see §15.3), Spearman(availability
Y−1 → Y) is **RB 0.274 [0.132, 0.413], WR 0.243 [0.088, 0.385], TE 0.310
[0.122, 0.481]** — all three seasons the same sign at all three positions —
and **QB 0.215 [−0.050, 0.441], not distinguishable from noise.**

**A3. The RB-durability folk wisdom is not supported.** Among drafted picks, mean
availability is RB 0.817 against WR 0.846 — difference **−0.029, 95% CI
[−0.099, +0.033]**. Not distinguishable from noise, in either population.
**And availability explains LESS of the season-points variance at running back
(26.5%) than at receiver (43.6%), tight end (41.5%) or quarterback (63.1%).**

**A4. Age does not predict availability at any position.** QB −0.102, RB +0.074,
WR −0.029, TE +0.031 — every interval covers zero.

### 15.1 What "availability" is and is not, restated at the table

Every number below counts games from `component_stats_{Y}` (§12.1), credits a
player against his own team's schedule (§12.2), and **cannot distinguish an
injury from a healthy scratch or a depth-chart burial** (§12.3). Nothing here is
an injury finding.

### 15.2 A1 — the decomposition

**Attribution of every drafted skill pick** (n = 388; ABSENCE = missed ≥4 games
AND his own rate over 16 games would have made him a league starter; PRODUCTION
= played >75% and was not good enough; BOTH = missed games and would have missed
the cut anyway):

| round band | n | starter | production | absence | both | **pure-absence share of the misses** |
|---|---|---|---|---|---|---|
| 1–3 | 90 | 74.4% | 7.8% | 8.9% | 8.9% | **34.8%** [18.8, 55.1] |
| 4–6 | 90 | 51.1% | 24.4% | 12.2% | 12.2% | **25.0%** [14.6, 39.4] |
| 7–10 | 115 | 33.9% | 39.1% | 7.8% | 19.1% | **11.8%** [6.4, 21.0] |
| 11–15 | 93 | 21.5% | 44.1% | 7.5% | 26.9% | **9.6%** [4.7, 18.5] |

| position | n | pure-absence share of misses | mean availability |
|---|---|---|---|
| TE | 42 | **34.8%** [18.8, 55.1] | 0.854 |
| WR | 157 | 18.3% [11.4, 28.0] | 0.846 |
| RB | 141 | 11.9% [6.6, 20.5] | 0.817 |
| QB | 48 | 7.4% [2.1, 23.4] | 0.832 |

**The "if nobody got hurt" counterfactual** — §7.1's table recomputed with
`ppg × 16` in place of realized points:

| round band | actual starter rate | if everyone played 16 | lift | per season (actual → if-16) |
|---|---|---|---|---|
| 1–3 | 74.4% [64.6, 82.3] | 85.6% [76.8, 91.4] | **+11.1** | .633→.833 / .800→.800 / .800→.933 |
| 4–6 | 51.1% [41.0, 61.2] | 66.7% [56.4, 75.5] | **+15.6** | .500→.600 / .600→.733 / .433→.667 |
| 7–10 | 33.9% [25.9, 43.0] | 46.1% [37.3, 55.2] | **+12.2** | .385→.487 / .256→.436 / .378→.459 |
| 11–15 | 21.5% [14.4, 30.9] | 32.3% [23.6, 42.3] | **+10.8** | .161→.258 / .219→.344 / .267→.367 |

**The lift is real and uniform, and it does not change the shape of the draft.**
Even in perfect health, rounds 11–15 return a starter only about a third of the
time and rounds 1–3 about six times out of seven. **Availability is a level
effect on the whole draft, not the explanation for the late-round cliff.**

**Variance decomposition** on `log(points) = log(games) + log(ppg)`, drafted
picks, share attributable to games played:

| position | n | games' share of log-variance | 95% CI | mean games | mean ppg |
|---|---|---|---|---|---|
| QB | 47 | **63.1%** | [36.4, 78.3] | 13.6 | 20.8 |
| WR | 157 | 43.6% | [20.2, 62.2] | 13.6 | 10.6 |
| TE | 42 | 41.5% | [22.5, 72.4] | 13.7 | 9.2 |
| **RB** | 141 | **26.5%** | [14.5, 40.2] | 13.1 | 10.5 |

**This runs directly against the folk wisdom.** Running back — the position
everyone treats as the injury-risk position — is the position where availability
explains the *least* of what a pick returned. The reason is visible in the same
row: RB per-game production varies enormously between picks, so `ppg` dominates.
At quarterback, where drafted passers are all roughly similar per game,
availability is nearly two-thirds of the variance.

### 15.3 A2 — persistence, and the robustness arm that halved it

**Unrestricted, over all skill players** — Spearman(availability Y−1 →
availability Y): QB 0.524 [0.335, 0.685], RB 0.506 [0.397, 0.597], WR 0.421
[0.336, 0.498], TE 0.579 [0.472, 0.663]. All FINDINGS.

**⚠️ THAT NUMBER IS INFLATED AND IT WOULD HAVE BEEN A FAKE FINDING.** Over all
skill players, "availability" is dominated by **roster status, not durability** —
mean availability across all skill players is only 0.51–0.63, because that
population is mostly depth. A fourth receiver inactive twelve weeks in both
seasons contributes a large positive correlation that has nothing to do with
getting hurt. So a **post-hoc robustness arm** (labelled as post-hoc; it is not
in §13.3) restricts to players whose prior-season availability was already
≥ 0.75:

| position | n | ρ unrestricted | **ρ established players only** | 95% CI | seasons same sign | verdict |
|---|---|---|---|---|---|---|
| RB | 168 | 0.506 | **0.274** | [0.132, 0.413] | 3/3 | **FINDING** |
| WR | 260 | 0.421 | **0.243** | [0.088, 0.385] | 3/3 | **FINDING** |
| TE | 111 | 0.579 | **0.310** | [0.122, 0.481] | 3/3 | **FINDING** |
| QB | 70 | 0.524 | 0.215 | [−0.050, 0.441] | 3/3 | **not distinguishable from noise** |

**Roughly half the unrestricted correlation was roster churn. What survives is a
real but modest durability signal at RB, WR and TE, and nothing at QB.**

**Does last year's availability predict the residual above naive carry-forward?**
Unrestricted it is negative everywhere (QB −0.425, WR −0.351, RB −0.311, TE
−0.288, all FINDINGS) — but that is **the same mean reversion §8.2 already
found**, not new information: a player who was fully available last year has
more to give back. Restricted to established players it survives only at RB
(−0.168 [−0.320, −0.003]) and TE (−0.209 [−0.387, −0.030]), and washes out at
WR and QB.

**So, against §13.3's preregistered interpretation rule:** the persistence
ingredient EXISTS at RB, WR and TE and does NOT exist at QB. An availability
model is not ruled out for a draft — but at ρ ≈ 0.25–0.31 it would be a weak
input, and §15.2 shows the thing it would buy is a level shift on all rounds
rather than a fix for the late-round cliff.

### 15.4 A3 — position and age

| population | QB | RB | WR | TE |
|---|---|---|---|---|
| **drafted picks** mean availability | 0.832 [0.734, 0.920] | 0.817 [0.775, 0.856] | 0.846 [0.800, 0.891] | 0.854 [0.799, 0.903] |
| drafted picks P(missed ≥4 games) | 29.2% [18.2, 43.2] | 29.8% [22.9, 37.8] | 24.8% [18.7, 32.1] | 28.6% [17.2, 43.6] |
| all skill players mean availability | 0.512 | 0.607 | 0.632 | 0.584 |

**RB minus WR availability: −0.029, CI [−0.099, +0.033]** among drafted picks
(per season −0.083 / −0.002 / −0.002), **−0.025 [−0.082, +0.031]** across all
skill players. **Not distinguishable from noise in either population.** Running
backs drafted in this league did not miss meaningfully more games than
receivers.

**Age against availability**: QB −0.102 [−0.268, 0.059], RB +0.074 [−0.060,
0.213], WR −0.029 [−0.130, 0.084], TE +0.031 [−0.163, 0.240]. **Nothing at any
position**, and carrying GAP 3's coverage caveat besides.

### 15.5 What this does and does not say about `robust_rb`

`roster_construction_2026-08-16.md` limitation #6 ("no injury modeling, biased
AGAINST depth-heavy archetypes") is why this addition was commissioned. What is
established here: **the persistence an availability model would need exists at
RB/WR/TE and is weak (ρ ≈ 0.25–0.31)**, and **availability is a uniform
+11 to +16 point level effect across all round bands, not a late-round-specific
one**. A simulator that added availability would therefore move every archetype
in the same direction rather than selectively rewarding depth — which is
evidence *against* the hypothesis that missing injury modelling is what sank
`robust_rb`, though it does not settle it. **Whether it settles it is a question
about that simulator, not about these outcomes, and it is out of scope here per
§13.5.**

---

## 16. ADDITION B — WHERE THIS FORMAT MISPRICES AGAINST THE MARKET'S

### 16.0 The answer, first

**B1. Half-PPR barely reorders anyone WITHIN a position.** Mean signed Δrank
over each position's top 40 is **0.02 to 0.06 ranks**, every interval covering
zero, and the starter set turns over by **0 to 2 players out of K per position
per season**. The largest single mover in three seasons is seven ranks.

**B2. The format's real effect is BETWEEN positions, and it is worth 8–14
points of season value-over-replacement.** Relative to the market's format,
this format changes each position's mean VOR over its starter set by:

| position | VOR shift (this format − market's), per season | mean | seasons same sign |
|---|---|---|---|
| QB | −0.4 / +12.2 / +3.6 | **+5.1** | 2 of 3 — **sign flips, not stable** |
| RB | −5.3 / −1.2 / −1.8 | **−2.8** | 3 of 3 |
| WR | −6.5 / −7.2 / −11.5 | **−8.4** | 3 of 3 |
| TE | −16.6 / −5.7 / −5.2 | **−9.2** | 3 of 3 |

**A board priced for full PPR overstates elite receivers and tight ends by
roughly 8–9 points of season VOR in this league, every year, and understates
nothing.** That is the format mispricing, stated in the currency a board
actually uses.

**B3. Six-point passing touchdowns do NOT create quarterback value in VOR
terms — they inflate the whole position equally.** QB replacement rises from
264.7 / 283.0 / 285.7 under the market's format to **320.7 / 333.2 / 338.9**
under this one (+53.1 points on average), and the top-10 QB mean rises by
**+58.3**. Net change in QB mean VOR: **+5.1, with the sign flipping across
seasons.** In *raw points* QBs go from 18.6% to 24.0% of all starter points; in
*value over replacement* almost nothing happens. (Scope fence, §14.5: the QB
pricing mechanics are a separate agent's pass. This is the outcomes-side
statement and it stops here.)

**B4. No evidence the room priced the wrong format — but the test has almost no
power, and that is the honest reading.** Spearman(pick_no, MARKET rank) minus
Spearman(pick_no, LEAGUE rank) is +0.009 / +0.006 / +0.005 / −0.016 at QB / RB /
WR / TE, with intervals like [−0.33, +0.42]. **Because B1 found the two
orderings are nearly identical, this test cannot distinguish them.** It is
looking within positions, and B2 shows the mispricing lives between them.

### 16.1 Positional share of starter points

| position | share under THIS format | share under the market's | shift |
|---|---|---|---|
| QB | 0.240 | 0.186 | **+5.4 pts** |
| RB | 0.304 | 0.307 | −0.3 |
| WR | 0.357 | 0.395 | **−3.8 pts** |
| TE | 0.099 | 0.113 | −1.4 |

Read alongside B3: the raw-points share moves a lot at QB and the VOR does not.
**This is exactly the trap a points-based board falls into**, and it is the same
trap §10 found in the Q6 allocator.

### 16.2 Who moves, by name — the mechanism, checkable by eye

**Promoted by this format** (fewer receptions, more yardage per catch, or more
passing TDs): 2025 Tee Higgins (WR22 → WR15), 2023 Deebo Samuel (14 → 9), 2023
DK Metcalf (19 → 15), 2024 Jameson Williams (23 → 19); at RB the pure runners —
2023 David Montgomery (18 → 14), 2024 Jonathan Taylor (18 → 14), 2023 Gus
Edwards (22 → 19); at TE 2023 Taysom Hill (15 → 10); at QB the pocket passers —
2025 Jared Goff (11 → 8), 2023 Matthew Stafford (15 → 13).

**Demoted by this format** (reception-dependent): 2023 Garrett Wilson (WR23 →
WR30, the largest move in the study), 2025 Stefon Diggs (14 → 20), 2023 Adam
Thielen (15 → 19), 2025 Keenan Allen (29 → 33); at RB the pass-catchers — 2023
Austin Ekeler (25 → 29), 2023 Jaylen Warren (20 → 24); at QB the runners — 2024
Justin Fields (30 → 33), 2024 Anthony Richardson (23 → 26), 2025 Cam Ward
(22 → 24).

**The mechanism is exactly what the two rule changes predict**, which is the
point of changing only two keys (§14.2) — and it is a check that the rescoring
is not inverted, pinned in
`test_market_scoring_moves_the_right_players_in_the_right_direction`.

### 16.3 What Addition B could NOT answer

**It still cannot say what CONSENSUS ADP did**, because GAP 1 stands: there is no
historical consensus ADP in this repo and none is fetchable from this sandbox.
Everything above is the format delta measured on realized outcomes plus the
room's own draft order. **DECISIONS-NEEDED item (b) — fetching real historical
ADP in CI — is what would close this**, and it would close it for §§5–7 at the
same time.

---

## 17. ADDENDUM TO §11 — what the two additions add to the queue

- **(e) `nflverse_weekly_points_2025.json` drops zero-point rows** (§12.1): 884
  skill player-weeks and 54 whole skill players missing relative to the
  component store; 6 exactly-zero rows against 297 and 306 in the two prior
  seasons. **Stage 2 is unaffected** (checked: no missing player would crack any
  starter set) **but any games-played or availability derivation from that store
  is wrong, and would report a 2025 injury spike that never happened.** Diff:
  rebuild the 2025 store through the path that produced 2023/2024, or document
  the store as scored-rows-only and route every availability consumer to the
  component store. Pinned red-on-change by
  `test_2025_points_store_drops_zero_point_rows`.
- **(f) The availability question is now scoped, not answered.** Persistence
  exists at RB/WR/TE at ρ ≈ 0.25–0.31 and not at QB; the effect it would buy is
  a uniform +11 to +16 point starter-rate lift across all round bands. Diff:
  none proposed. Whether that is worth building before the 22nd is Cory's call,
  and this study's own read is that it is not — it does not change the shape of
  the draft.
- **(g) The format mispricing is real, stable and quantified** (§16.0 B2):
  a full-PPR-priced board overstates WR by ~8.4 and TE by ~9.2 points of season
  VOR in this league, three seasons out of three. Diff: none proposed here —
  the board already builds its own projections under the frozen table, so the
  exposure is to any EXTERNAL ranking or ADP consumed at draft time. The
  question for Cory is whether that exposure exists anywhere in the live
  pipeline and, if so, whether a per-position correction of this size should be
  applied to it.

### 17.1 Reproduce the additions

```
python3 draft/backtest/empirical_draft_value_additions.py    # ~12s
python3 -m pytest draft/tests/test_empirical_draft_value_additions.py -q
```

---
---

## 18. CORRECTION — the FDR screen was broken when stage 2 shipped

_Appended 2026-08-16, after §§4–17. Recorded here rather than by editing the
sections above, per the house no-delete habit._

**What was wrong.** `spearman_p` fed the Benjamini–Hochberg screen through a
hand-rolled series for the regularized incomplete beta, and that series was
simply incorrect. It returned **p = 0.017 for ρ = 0.02 on n = 44**, where the
true value is **0.90**. Every p it produced was far too small and the errors
were not even monotone in ρ.

**How it presented, and why that is the lesson.** A too-small p makes BH more
permissive, so the failure did not look like a failure. It looked like a strong
study: **186 of 187 tests "survived FDR"**. A multiplicity screen that rejects
almost nothing is evidence about the screen, not about the data, and that should
have been the tell before the arithmetic was checked.

**How it was caught.** By evaluating the function on inputs whose answers can be
checked by hand — not by anything in the results looking wrong. That check is
now two tests (`test_incomplete_beta_against_closed_form_cases`,
`test_spearman_p_known_values`), the second of which is explicitly the
regression test for this bug.

**The fix.** The standard continued-fraction incomplete beta (modified Lentz),
verified against closed-form cases — `I_0.3(1,1) = 0.3`, `I_0.5(0.5,0.5) = 0.5`,
`I_0.5(2,3) = 0.6875` — and against t-distribution landmarks (t = 2.228, df = 10
→ p = 0.050; t = 2.0, df = 10 → p = 0.0734).

**What changed in the results: the screen, and nothing that was published.**

| | broken screen | fixed screen |
|---|---|---|
| BH family size | 187 | 187 |
| survivors at q = 0.10 | **186** | **89** |

**Every FDR claim made in §§4–11 was re-verified against the fixed screen and
every one still holds** — the published findings sit at |ρ| ≈ 0.21–0.73 on
n = 56–433, with true p-values from 0.009 down to below 1e-5, comfortably inside
BH at q = 0.10. **Exactly one cell changed status**: TE points-per-opportunity
(ρ = 0.126, p = 0.052) no longer survives, which agrees with what §8.1 already
said about it in words ("not distinguishable from noise") and with its bootstrap
interval [−0.042, 0.281]. **No verdict, no headline and no queue item moves.**

**Why nothing else is at risk.** Every verdict in this study is decided by the
season-clustered bootstrap interval plus the stability rule (§2.3), not by a
p-value; BH was declared as a secondary multiplicity screen and reported
alongside, never as the deciding test. That design is the reason a broken
p-value could not corrupt a finding — but it is also what let the broken screen
sit unnoticed, so it is written down here rather than quietly fixed.

The stage-2 artifact committed at `3eb7954e` carries the broken
`bh_q10_survives` column; the artifact at this commit carries the corrected one.

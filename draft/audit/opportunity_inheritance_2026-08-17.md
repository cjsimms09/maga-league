<!-- TERRITORY: A -->
# OPPORTUNITY INHERITANCE — can we predict who walks into volume? — 2026-08-17

> **STAGE 1 OF 2. This commit contains §§0–6 only: the inventory and the
> complete preregistration.** Every definition, arm, threshold, exclusion and
> stopping rule below was fixed and committed BEFORE any result was computed.
> Stage 2 appends §§7–14 without editing a word of §§0–6. House precedent:
> `draft/audit/empirical_draft_value_2026-08-16.md`,
> `draft/audit/edge_hunt_2026-08-16.md`.
>
> **A null is the expected outcome and will be published at full volume.** This
> territory has already returned two nulls (§0.2) and the grading bar (§6) is
> the most punishing one on this branch.

## 0. The mandate, and why the obvious version of it is already dead

### 0.1 Cory, verbatim (2026-08-17)

> "I also feel like we need to study 2nd year players and rookies more.. how can
> we predict breakout for 2nd year or opportunities (upside for rookies) these
> are the kinds of players that can win you leagues with late round picks"

and, on the second mechanism, verbatim:

> "you need to draft upside or **injury opportunity**"

and on this study's framing:

> "vacated opportunity: yes! Very much yes the whole thing"

### 0.2 THE AGE FLAG IS DEAD, TWICE — this study does not build a third one

1. **Rookie capital prior** — `DECISIONS-NEEDED.md` § ROOKIE CAPITAL PRIOR,
   corrected 2026-08-16. Pooled optimal-arm `cory_gap_change` **+1.6** against a
   preregistered bar of ≥25% / ≥16.4 points; **0 seats** of league-position lift.
   Its original "+25.1, it clears" claim was a data-integrity error, corrected.
2. **Year-2 escalator** — a naive "second year gets a bump" flag, graded in the
   same league-benchmark replay. Did not clear its bar or its own measurement.

**Therefore `years_exp == 1` is not proposed as a feature anywhere in this
study.** Youth appears in exactly one place: as the *control term* inside the
interaction test of §4.3, because the whole point of that test is that the main
effect is already known to be null. If the interaction is null too, that is the
answer and nothing further is proposed.

### 0.3 Why the mechanism is probably opportunity rather than age

Three measurements from `draft/audit/empirical_draft_value_2026-08-16.md`, all
of which point away from age and toward inherited volume:

- **RB NFL draft capital (ρ = −0.427 [−0.669, −0.091]) is the ONLY feature that
  predicted beating a draft slot, at any position**, out of ~60 tests.
- **Volume ≫ efficiency everywhere.** WR opportunity ρ = 0.704 against
  points-per-opportunity 0.322; TE 0.712 against 0.126 (noise).
- **Prior-season efficiency predicts DECLINE** (WR pts/opp ρ = −0.284
  [−0.368, −0.189] on the residual arm). The young, efficient, low-volume player
  is a *worse* bet, not better — the classic trap.

### 0.4 TWO MECHANISMS, and they are different questions

- **REALIZED VACANCY (§3–§4).** A player left. The volume is on the table before
  the season starts. Arithmetic from roster movement.
- **CONTINGENT VACANCY (§5).** The starter is still there; if he misses time
  someone inherits his volume. Cory's "injury opportunity". Vacated-volume
  arithmetic cannot see it, because nothing has vacated yet. The empirical
  study's own finding that **34.8% of misses in rounds 1–3 are pure absence**
  (against 9.6% in rounds 11–15) says this channel is large — every one of those
  is a contingent vacancy that resolved, with someone inheriting starter volume
  at a late-round price.

---

## 1. WHAT ALREADY EXISTS — read before building, so nothing is re-derived

### 1.1 `conditional_value.py` already prices the handcuff. Its verdict, restated

`draft/audit/conditional_value_2026-08-16.md` measured this class from the
committed component stores (2021–25) and **its conclusions are taken as given
here, not recomputed**:

| already established | value |
|---|---|
| P(a top-24 RB1 misses ≥1 game in a season) | **44%** (120 starter-seasons) |
| mean games missed per RB1 season | 1.02 → **0.95 expected missed starts per 15-week fantasy season** |
| backup points/week in the exact weeks his RB1 was absent | **12.5** (n = 111 elevated weeks, sd 7.6) |
| same backup with the starter present | 6.7 |
| measured wire RB level / startable bar (RB28) | 7.8 / **11.5** |
| **handcuff premium to the starter's owner** | **+4.5 season points** (class rate); +0.9 to the field |
| **WR handcuff premium** | **≈ 0** — elevated WR2s score 10.5/wk against a WR wire level of 11.1. A WR's absence spreads across the route tree, it does not land on one man. |

Its ruling-level conclusion: *"A handcuff is worth ~5–10× more to Cory than to
the room … **but the absolute premium is small: 5–10 season points.** That is a
14th/15th-round price, never a mid-round one."*

**What that audit did NOT answer, and what this study adds.** Its premium is
computed for **the owner of the starter**, using the **class** miss rate and a
**pooled** elevated-production number. It never asks:

1. whether a *specific* starter's absence is **forecastable at draft time**
   (it uses each starter's own historical rate without ever testing that the
   rate predicts anything);
2. whether the **inheritor is identifiable in advance** — a contingent vacancy
   is unbuyable if you cannot name who gets it;
3. whether contingent opportunity **finds late-round league-winners**, which is
   a different question from what a handcuff is worth to the man who already
   owns the starter.

Those three are §5. **`handcuff_premium()` and `covariance_increment()` are
imported read-only and are not reimplemented.**

### 1.2 The honest prior against this whole arm, and the reason to doubt it

`roster_construction_2026-08-16.md` found **`robust_rb` — literally the "draft
RB depth" archetype — CI-clear WORST in all four configurations.** That is a
direct hit on the contingent thesis.

**But that study's own limitation #6 names the reason to discount it here:
"no injury modeling, biased AGAINST depth-heavy archetypes."** Nobody gets hurt
in that simulator, so depth can never be rewarded in it. This arm fills exactly
that gap, which is why a positive result here would be *informative* rather than
a contradiction of settled work. Recorded now, before the answer is known, so it
cannot be produced afterwards as an excuse.

---

## 2. DATA INVENTORY — verified by reading the committed bytes

### 2.1 What exists

| artifact | verified content |
|---|---|
| `draft/backtest/component_stats_{2021..2025}.json` | 18 weeks each, REG only, QB/RB/WR/TE. Per player-week: `pos`, `team`, `tgt`, `tgt_share`, `rush_att`, `pass_att`, and the scoring components. Distinct players 601 / 574 / 548 / 556 / 607 in weeks 1–17. |
| `draft/backtest/advanced_stats_{2021..2025}.json` | Per player-week `rec_air_yd`, `ay_share`, `wopr`, `racr`, `rec_epa`, `rush_epa`, `pass_epa`, `cpoe`. |
| `draft/backtest/nflverse_draft_picks.json` | 397 NFL picks 2021–2025, QB/RB/WR/TE, with `sleeper_id`. Period-correct by construction (career-outcome columns dropped at build). |
| `draft/data/league_history.json` | Cory's real drafts 2023/24/25, 150 picks each. |
| `draft/backtest/tiered_outcome_model.py` | The graded cell, the LEAGUE-WINNER labels, the market ordering, the hits@k machinery. **Imported, not reimplemented.** |
| `draft/backtest/conditional_value.py` | `handcuff_premium`, `covariance_increment`, `starter_missed_weeks`, `backup_conditional_production`. **Imported read-only.** |

**Team abbreviations are stable across all five seasons** — the same 32 codes in
every store, verified by set comparison. No crosswalk is needed and none is
invented.

### 2.2 THE GAPS, stated first because they bound everything

**GAP A — THERE ARE NO RED-ZONE OR GOAL-LINE SPLITS IN ANY COMMITTED STORE.**
The mandate names "red-zone touches" as a vacated quantity. The component store
carries `tgt`, `rush_att`, `pass_att`, `rec_td`, `rush_td` and nothing
positional-on-the-field. **Red-zone vacancy is NOT MEASURED and is not proxied
by touchdowns** — a vacated touchdown is an outcome, not an opportunity, and
substituting it would manufacture exactly the efficiency signal §0.3 says is a
trap. Named as absent.

**GAP B — THERE IS NO HISTORICAL NFL DEPTH CHART IN THIS REPO.**
`depth_chart_order` exists only on `public/draft_data.json`, which is the **2026**
board. Every depth-chart statement in this study is therefore a **PROXY**:
within-team, within-position rank by season Y−1 opportunity. It is labelled
`depth_proxy` at every use and is never called a depth chart.

**GAP C — SEASON-Y TEAM LABELS COME FROM AN IN-SEASON FILE.** Who left a team
before season Y is, in the real world, preseason knowledge — free agency and the
NFL draft are complete by August. But the **only committed source** of a
player's season-Y team is `component_stats_Y`, an in-season store. This is
precisely the `team_change` quarantine of
`empirical_draft_value_2026-08-16.md` §2.4. It is handled by running three arms
(§3.2), one of which touches no season-Y data at all, and **no verdict in this
study rests on a quarantined arm alone.**

**GAP D — A PLAYER'S TEAM IN SEASON Y IS NOT KNOWN LEAK-FREE, AND THE COST IS
MEASURED.** Assigning a player to his Y−1 modal team (the leak-free choice)
is wrong for **28.9% / 29.4% / 28.1%** of players present in both seasons
(2023 / 2024 / 2025; n = 412 / 411 / 438). That is a large misassignment rate
and it attenuates every leak-free inheritance measure toward zero. Reported at
every table.

**GAP E — `nflverse_weekly_points_2025.json` DROPS ZERO-POINT ROWS** (6 zero
rows against 297 / 306 in 2023 / 2024; 884 skill player-weeks and 54 players
missing relative to the component store — `empirical_draft_value_2026-08-16.md`
§12.1). **Its row presence means "scored something", not "played".**
Therefore: **every presence, games-played and absence count in this study is
taken from `component_stats_{Y}`**, for all three seasons, never from the points
store.

**GAP F — DRAFT-CAPITAL COVERAGE IS 2021–25 DRAFTEES ONLY.** UDFAs and players
drafted before 2021 have **no capital record**. They are ABSENT, never zero, and
never imputed. In the graded cell the coverage is 17 / 24 / 27 of 59 / 57 / 54.

**GAP G — THREE SEASONS, AND THE GRADED CELL RESTS ON 21 EVENTS.** Every number
carries an n and a CI; the hits@k statistic is a count, so its bootstrap
intervals are integers wide. Said in advance, not as a post-hoc excuse.

### 2.3 THE STRUCTURAL FINDING THAT REFRAMES CORY'S QUESTION — found during inventory, before any result

**The pick-61+ graded cell contains ZERO NFL rookies, by construction.**

The shared population rule (`tiered_outcome_model._rows_for_season`) requires a
prior-season stat row. No rookie has one. Measured:

| season | cell size | NFL rookies in cell | 2nd-year | 3rd-year | no capital record |
|---|---|---|---|---|---|
| 2023 | 59 | **0** | 10 | 7 | 42 |
| 2024 | 57 | **0** | 8 | 10 | 33 |
| 2025 | 54 | **0** | 7 | 6 | 27 |

Meanwhile **the league actually drafted 10 / 13 / 14 NFL rookies at pick 61+**
across the three seasons — 37 picks that the graded cell cannot see.

**Consequence, declared before grading:** the bar handed to this study
(beat chance 3.71 and beat the market's 7, on 170 player-seasons) **cannot grade
the rookie half of Cory's mandate at all.** Rookies get their own declared cell
in §6.3, with its own chance floor and its own n, and it is small enough that it
is preregistered as underpowered.

---

## 3. PREREGISTRATION — the departure inference rule

### 3.1 THE RULE, stated explicitly as required

> **Player *q* DEPARTED team *T* for season *Y* iff *q* recorded ≥ 1
> `component_stats` row for *T* in weeks 1–17 of season *Y−1*, AND recorded
> **zero** `component_stats` rows for *T* in weeks 1–17 of season *Y*.**

His vacated volume is exactly the volume he recorded **for T** in Y−1 — a
mid-season trade inside Y−1 therefore splits his volume across two teams
correctly, because the store's `team` field is per player-week.

### 3.2 ITS FAILURE MODES, and the three arms that bracket them

The rule's clause "zero rows for T in Y" is satisfied by four *different* real
events, and the store cannot tell them apart:

| real event | is it a vacancy? | can the store see it? |
|---|---|---|
| (a) signed / traded elsewhere; appears in Y on another team | **yes** | yes — he has rows under a different `team` |
| (b) retired | **yes** | no — indistinguishable from (c) and (d) |
| (c) **missed all of season Y through injury** | **NO — he is not a departure** | no |
| (d) on the roster but never took an offensive snap (practice squad, healthy scratch, buried) | partly | no |

**(c) is the dangerous one and it is a genuine leak**: "was injured for all of
season Y" is season-Y information, and letting it inflate vacated volume would
build a signal partly out of the future.

**Three arms, all reported, primary declared now:**

- **Arm V-ALL** — (a)+(b)+(c)+(d) all count as departures. The most complete
  vacancy measure and the most exposed to the (c) leak. **QUARANTINED** (GAP C).
- **Arm V-MOVED** — only (a) counts; anyone absent from season Y entirely is
  treated as **still present**. This removes the (c) injury leak completely and
  under-counts retirements. **QUARANTINED** (GAP C), and the honest bracket on
  V-ALL from below.
- **Arm V-INSEASON** — **strictly leak-free; touches no season-Y byte.** *q*'s
  Y−1 volume for T counts as vacated iff his last row for T came **≥ 4 team
  games before T's last Y−1 game** — he stopped playing for them during Y−1 and
  never came back. Captures in-season trades and season-ending injuries; **blind
  to every offseason departure**, which is most of them.

**PRE-COMMITTED READING RULE.** V-ALL and V-MOVED are the arms that can test the
hypothesis; V-INSEASON is the arm that can be trusted without a caveat. **A
finding is reported as a FINDING only if it survives in V-MOVED (the
injury-clean arm) as well as V-ALL.** A result present only in V-ALL is reported
as "present only in the arm that can absorb season-Y injury information", in
those words. **No headline rests on a quarantined arm alone**, and the graded
cell of §6 is scored on all three arms with all three numbers printed.

### 3.3 The vacated quantities

Per (team T, season Y), summed over weeks 1–17 of Y−1, over departed players:

- `vac_tgt`, `vac_rush_att`, `vac_pass_att`, `vac_air_yd`
- `vac_opp = vac_tgt + vac_rush_att` — the volume currency of §0.3's finding
- each as a **share** of T's own Y−1 total: `vac_tgt_share`, `vac_rush_share`,
  `vac_ay_share`, `vac_opp_share`
- **`vac_rz_*`: NOT MEASURED (GAP A).** No substitute is used.

### 3.4 The inheritor side

Per player p, season Y, all from ≤ Y−1:

- `team_proxy(p, Y)` = p's **Y−1 modal team**. Leak-free, wrong 28–29% of the
  time (GAP D). A sensitivity arm uses p's season-Y team (quarantined).
- `depth_proxy(p, Y)` = p's rank within (team_proxy, position) by Y−1
  opportunity — 1 = the team's Y−1 leader at his position. **A proxy, not a
  depth chart** (GAP B).
- `own_share_y1` = p's own share of his Y−1 team's positional opportunity.
- `open_above` = the Y−1 opportunity held by players at his position on that
  team who rank ABOVE him on `depth_proxy` **and departed** — the volume
  specifically over his head that is now gone. This is the sharpest form of
  "inherited opportunity" and is the primary per-player feature.
- `nfl_exp = Y − draft_season` (0 = rookie), `nfl_draft_round`,
  `nfl_draft_overall`. Absent for UDFAs and pre-2021 draftees (GAP F).

---

## 4. PREREGISTRATION — does inherited opportunity predict the breakout?

Universe: every player with a Y−1 component row and a season-Y outcome, seasons
2023/2024/2025 — the same shared population the graded cell is drawn from.
Uncertainty discipline is inherited verbatim from
`empirical_draft_value_2026-08-16.md` §2.3: **season-clustered bootstrap,
2000 draws, 95% percentile intervals; BH FDR at q = 0.10 across the full family
of (feature × position) univariate tests; the stability rule** (a FINDING needs
its pooled CI to exclude the null AND the same sign in ≥ 2 of 3 seasons).

### 4.1 Absent ≠ zero, restated for this study

- A player with **no season-Y component row** is MISSING and excluded from the
  primary arm, counted in a named table (Arm E). The secondary arm zeroes him
  (Arm Z). Both reported; a sign disagreement between them IS the finding.
- A player with **no draft-capital record** is ABSENT from capital-conditional
  tables, never assigned round 8 or any other filler.
- **A player with no vacancy on his team has `vac = 0.0`, and that is a real
  zero, not missing** — the team genuinely lost nothing. Stated so the
  distinction is not applied mechanically where it does not belong.

### 4.2 H1 — the main effect

Spearman ρ of each vacated/inherited feature against, per position:

- **(a) `realized_Y`** — the level.
- **(b) `resid_vs_naive = realized_Y − pts_y1`** — the CHANGE above naive
  carry-forward. **This is the arm the hypothesis lives in**: inherited
  opportunity is a claim about improvement, not about level.
- **(c) `resid_vs_slot`** on the drafted subset — pre-declared, as in the
  empirical study, as the arm most likely to return nothing.

### 4.3 H2 — THE INTERACTION. This is the hypothesis

The naive flags failed, so the question is conditional: **is a young player
entering VACATED volume different from a young player who is not?**

Two operationalisations, both preregistered, both reported even if they disagree:

**(a) Regression.** Standardized OLS of `resid_vs_naive` on
`{pts_y1, opp_pg_y1, young, vac, young × vac}` per position, where
`young = 1[nfl_exp ≤ 2]` and `vac = open_above` (§3.4). Coefficients in points
per 1 sd, season-clustered bootstrap CIs.

**(b) 2 × 2 contingency.** `young` × `high_vac` (above/below the pooled median
of `open_above` among players with any capital record), cells reporting the
LEAGUE-WINNER rate with Wilson 95% intervals, plus the difference-in-differences
with a season-clustered bootstrap CI.

> **THE BAR FOR "THE INTERACTION BEATS YOUTH ALONE", FIXED NOW:**
> the interaction term's 95% CI must **exclude zero**, AND the youth main
> effect's CI must **cover** zero (i.e. the effect genuinely lives in the
> conditional and not in the flag). If both exclude zero, the finding is
> reported as "youth also has a main effect here", which would **contradict**
> the two prior nulls and must then be reconciled with them explicitly rather
> than celebrated.

### 4.4 What is NOT built

No `years_exp == 1` indicator is proposed as a board feature under any outcome
(§0.2). `young` exists only as the control term inside §4.3.

---

## 5. PREREGISTRATION — CONTINGENT VACANCY (the "injury opportunity" arm)

Everything in §1.1 is taken as established. These are the three questions it
left open. **Every absence count comes from `component_stats_{Y}`** (GAP E), and
a player is credited against **his own team's** scheduled games (a bye is an
absent row, so a fully available player shows 16, not 17).

### 5.1 B1 — is the starter's absence risk forecastable at draft time?

Today's `empirical_draft_value_2026-08-16.md` §15.0 already measured
availability persistence among players with a real role: **RB 0.274
[0.132, 0.413], WR 0.243 [0.088, 0.385], TE 0.310 [0.122, 0.481], QB 0.215
[−0.050, 0.441] (noise)** — and found **RB-durability folk wisdom NOT
supported** (RB−WR mean availability −0.029 [−0.099, +0.033]). **Those numbers
are the starting point and are not re-derived.**

What is added is the **decision-relevant** form, which a Spearman does not give
you. For starters only (`depth_proxy == 1` at his position on his Y−1 team):

```
P(misses >= 4 team games in Y | missed >= 4 in Y-1)   vs
P(misses >= 4 team games in Y | missed 0-1 in Y-1)
```

per position, Wilson 95% intervals, difference with a season-clustered bootstrap
CI, and the stability rule.

> **PRE-COMMITTED INTERPRETATION RULE.** At any position where that difference's
> CI covers zero, **absence is not forecastable at that position and no
> contingent-opportunity model can be built there.** That is the finding, and it
> is published at full volume either way. A ρ of 0.24–0.31 leaves the great
> majority of variance unexplained; whether what remains is enough to move a
> draft pick is exactly what this test decides, and the answer is allowed to be
> no.

### 5.2 B2 — is the INHERITOR identifiable in advance? (the arm that decides everything)

For every (team, position, season Y) in which the Y−1 leader at that position
(`depth_proxy == 1`) missed ≥ 4 of his team's Y games:

- **the actual inheritor** = the player at that position on that team with the
  largest season-Y opportunity **in the weeks the leader was absent**;
- **the predicted inheritor** = the man `depth_proxy == 2` named from Y−1 alone.

Report the **hit rate** (predicted == actual) per position with Wilson 95%
intervals, and the hit rate of a "top-2 guess" (actual ∈ {depth 2, depth 3}).

> **PRE-COMMITTED INTERPRETATION RULE.** If the depth-2 hit rate's Wilson
> interval covers the 1/(eligible bodies) chance rate, **the inheritor is not
> identifiable in advance and the contingent arm is unbuyable at the draft**,
> regardless of how large the premium is. A premium you cannot address a pick to
> is not a strategy. Chance is computed per cell from the actual number of
> eligible bodies, never assumed.

### 5.3 B3 — the combined contingent score

```
contingent(p, Y) = open_above_present(p, Y)      # Y-1 volume held ABOVE him by
                                                  # men who are STILL THERE
                 x  P_miss(starter | his Y-1 absence, position class rate)
                 x  P_inherit(p)                  # from B2's measured hit rate
```

- `open_above_present` uses only Y−1 volume and Y−1 depth — **fully leak-free**.
- `P_miss` uses the class rate from §1.1 (0.064/game for RB1s) adjusted by the
  starter's own Y−1 absence **only if §5.1 says that is forecastable**;
  otherwise the class rate alone, and the reason is printed.
- `P_inherit` is B2's measured depth-2 hit rate for that position, or **the
  chance rate if B2 returns a null**, in which case the whole score degenerates
  to a constant × volume and is reported as such.

`handcuff_premium()` from `conditional_value.py` is imported and used unchanged
wherever a season-points premium is quoted.

---

## 6. PREREGISTRATION — GRADING, and the bar

### 6.1 The cell

Exactly `tiered_outcome_model`'s late-round cell, reproduced by importing that
module and pinned by a test:

- population: player-seasons drafted at **pick ≥ 61** in the league's own
  completed 2023/2024/2025 drafts that clear the shared population rule;
- **n = 59 / 57 / 54 = 170**, **LEAGUE-WINNERs 8 / 5 / 8 = 21 (12.4%)** —
  reproduced exactly this session, matching `tiered_outcome_model.json`;
- metric: **hits@10 inside each season's own ranking, summed** (a drafter drafts
  once a year; the one-list-across-seasons variant is reported separately and is
  not the verdict, per that module's own rule);
- **chance = 3.71**; **the market — the league's own draft order — = 7**; the
  tiered model's expected points = 5; its `P(LEAGUE-WINNER)` = 3; own_v6 = 1
  (2025 only, chance 1.48, never summed beside a three-season number).

### 6.2 THE BAR, fixed now

Rankings graded (each on all three vacancy arms of §3.2):

| # | ranking |
|---|---|
| R1 | `vac_opp_share` — team-level vacancy alone |
| R2 | `open_above` — vacancy specifically over his head |
| R3 | `young × open_above` — the interaction as a score |
| R4 | `naive_prev` + vacated overlay (the practical board form) |
| R5 | `contingent` (§5.3) |
| R6 | `naive_prev` + contingent overlay |
| R7 | best combined leak-free score |

> **A ranking is a FINDING only if BOTH hold:**
> **(i) summed hits@10 > 7** — it strictly beats the market's own draft order;
> **(ii)** its paired, season-clustered bootstrap difference against the market
> (2000 draws, resampling players within each season and re-ranking inside it —
> `tiered_outcome_model._bootstrap_diff_summed`, imported) has a **90% CI
> excluding zero**.
>
> **hits@10 > 3.71 but ≤ 7** is reported as **"beats chance, loses to the room"**
> and **ships nothing**.
> **hits@10 ≤ 3.71**, or a CI covering zero, is a **NULL** and is published as
> one, in those words.
>
> hits@20 (chance 7.4, market 9) is reported alongside for every ranking, and is
> **not** an alternative bar — it cannot rescue a ranking that failed at 10.

### 6.3 The rookie cell — declared separately, and declared underpowered

Because the primary cell contains **zero rookies** (§2.3), rookies are graded in
their own cell:

- population: NFL draft classes 2023/2024/2025 (from `nflverse_draft_picks.json`)
  drafted by Cory's league at **pick ≥ 61** — **10 / 13 / 14 = 37** picks;
- outcome: the same LEAGUE-WINNER label from `tier_labels`, over the full
  realized field, so the definition does not move;
- rankings: (a) NFL draft capital alone, (b) vacancy on his NFL team, (c)
  capital × vacancy, (d) the league's own pick order (the market) as the rival;
- **chance is computed from this cell's own base rate and printed**;
- **PRE-DECLARED UNDERPOWERED.** n = 37 with a handful of events. Any hits@k
  difference here is a one- or two-player swing. **No result from this cell can
  be a FINDING under §6.2's bar**; it is reported for direction and its n is
  printed at every cell. If the number of rookie LEAGUE-WINNERs is < 5 the cell
  is reported as **UNGRADEABLE** rather than estimated.

### 6.4 Stopping rule

- Every number in stage 2 is produced by **one committed, tested module and one
  committed artifact**. Nothing is hand-computed.
- **No board, model, config, projection or policy change ships from this study.**
  A real finding becomes a `DECISIONS-NEEDED.md` item with a described diff, and
  Cory rules. Restated here so stage 2 cannot drift.
- Files: `draft/backtest/opportunity_inheritance.py` →
  `draft/backtest/opportunity_inheritance.json`, tests in
  `draft/tests/test_opportunity_inheritance.py`. Stay-out list respected:
  nothing in `draft/build.py`, `draft/own_model_v*.py`, `draft/own_projections.py`,
  `draft/vorp.py`, `draft/projections.py`,
  `draft/backtest/fetch_component_stats.py`, `draft/tools/fetch_*.py` or
  `.github/workflows/*` is edited; all are imported read-only or not at all.

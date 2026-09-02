# PREREG — the props weekly arm on 2023-25, written before any fold is read

**D, 2026-08-27. Register 361, P347. Tier-1 single-axis arm under `BLEND-SEARCH-DESIGN.md` §2.**
**Nothing in this document was informed by an outcome. Only COVERAGE was measured, deliberately, and it is reported in full below so that the feasibility claim can be checked without the arm having been run.**

## 0. Why this can be written now

`historical_props_{2023,2024,2025}.json` were paid for out of Cory's A12 spend
and sit committed: **35,326 player-week rows across 54 weeks**, reproduced
exactly. `weekly_props_arm.py` is built and wired into `weekly_own_grade.py`.
Its input folder is empty, so the arm has never been graded on anything.

## 1. FIVE PREMISES, CHECKED — and two of them were not right

The routing note that opened this work said six of the arm's eight default
markets are present *"under the SAME short field names"*. Counted:

| | |
|---|---|
| fetcher stat keys (`fetch_weekly_props.py` `MARKET_TO_STAT`) | `pass_yd pass_td pass_int rush_yd rush_td rec rec_yd rec_td` |
| historical store markets | `any_td rec rec_yd rush_yd pass_td pass_yd` |
| **overlap by name** | **FIVE**: `pass_td pass_yd rec rec_yd rush_yd` |
| in store, not in fetcher | **`any_td`** |
| in fetcher, not in store | `pass_int rec_td rush_td` |

**It is five, not six**, and the sixth — `any_td` — is the one that matters
most: it covers **35,136 of 35,326 rows (99.5%)** while the five that do map
are thin (`rec_yd` 10,026 · `rec` 9,267 · `rush_yd` 4,697 · `pass_td` 1,683 ·
`pass_yd` 1,674). The routing note names `any_td` as "the coarser TD signal" in
the same breath as counting it in the six, so both statements are in it; this
one is the operative one.

**Two more things the note called a converter that are not mechanical:**

1. The arm reads `players[pid].points` — a single pre-priced implied-points
   number. The store carries raw market values. Converting means **pricing**
   markets into this league's scoring, which is the fetcher's job and is a
   modelling step, not a copy.
2. The store is keyed by **player NAME** (`"A.J. Terrell"`), with inconsistent
   formats in the same file (`"A.J Brown"`, `"A. Erickson"`). Everything else
   is keyed by id.

## 2. Coverage, measured — and my own first number was wrong

Joining names to ids against the 2026 board alone gave **21.2%**, and a
first pass at started slots said **22.7% of them had no name on disk**. Both
were artifacts of using one name source. The disk carries **six**, totalling
4,267 id→name pairs (`sleeper_name_index.json` alone has 2,189). Re-measured
against the union (numbers as the committed probe prints them —
`python3 draft/backtest/props_coverage_probe.py`; an ad-hoc pass gave 3,720
because a different source won four ids, and the tool's figure is the one that
reproduces):

| | started slots 2023-25 | covered by a props row that week |
|---|---|---|
| **all positions** | 4,860 | 3,716 (**76.5%**) |
| **offensive (QB/RB/WR/TE)** | 3,775 | 3,716 (**98.4%**) |
| QB | 540 | 528 (98%) |
| RB | 1,305 | 1,280 (98%) |
| WR | 1,381 | 1,367 (99%) |
| TE | 549 | 541 (99%) |
| K | 538 | **0** |
| DEF | 538 | **0** |

**Ids with no name anywhere on disk: 5 of 4,860 (0.1%).** The probe's own
control C1 pins the point: the union covers 3,716 slots where the board alone
covers 2,686. The crosswalk is not
a blocker. **K and DEF are structurally out of scope** — props do not quote
them — and that is 1,076 slots, 22% of all starts, which the arm can never
price and which the grade must therefore exclude rather than score as misses.

## 3. THE ARM

`props_weekly_v1`: for each (season, week), implied points per player from the
historical prop lines, priced under this league's scoring, for the offensive
players a market covered that week. Players with no market that week are **not
predicted** — an abstention, not a zero.

## 4. THE PREDICTION (P347)

**On 2023-25, on the offensive started slots the arm can price, `props_weekly_v1`
beats `own_weekly_v1` on start/sit decision accuracy — and does NOT beat it on
MAE.** The direction is the point: a market line is a sharp ordering signal and
a poor point estimate, so I expect the decision instrument to move and the
error instrument not to.

**FALSE if** the decision margin is inside the null band, **or** if MAE also
improves — the latter would mean the pricing step is doing the work rather than
the market, and the arm would need re-deriving before it is believed.

## 5. NULLS, and the one that kills the most

- **Primary instrument:** `start_sit_vs_random.py`'s construction — each choice scored against random LEGAL alternatives — restricted to weeks the arm covers. Margin reported in points left on the bench.
- **Constructed null 1, the important one: ABSTENTION-MATCHED.** The arm predicts only covered players. Compare against `own_weekly_v1` **evaluated on exactly the same slots**, never on its full population — otherwise the arm's coverage choice is scored as skill.
- **Constructed null 2: SHUFFLED LINES.** Permute prop lines within (week, position). Kills "any per-player number ordered by position would have done this".
- **Constructed null 3: `any_td` ALONE.** The 99.5%-coverage market on its own. If the full pricing does not beat it, the five thin markets are decoration.
- **BEST-OF-K is owed and not skipped:** this is one arm, so K=1 and there is no selection to correct for. When it joins a Tier-2 blend the K correction applies and this line is the record that it was not quietly dropped.

## 6. CORRELATION GATE (required by §2)

Report Spearman rho between `props_weekly_v1` and each shipped arm on the same
slots. **A rho above 0.85 against any existing arm means this is an old axis
under a new name**, and the arm is reported as a duplicate regardless of its
margin.

## 7. FOLDS, fixed now

Three season-holdout folds: fit/price on two seasons, grade on the third,
rotating. No week appears in both sides of a fold. **Grade dates: first read
2026-09-06.** Until then the folds are not opened.

## 8. PROVENANCE STAMP (the routing note's REC, adopted)

Every hydrated snapshot carries `source: "hydrated_from_historical"` and the
originating store's sha, never `markets_confirmed_live`. A backtest fold must
not be able to masquerade as a live capture.

## 9. WHAT WOULD MAKE ME ABANDON THIS BEFORE GRADING

If the pricing step cannot be built without a free parameter tuned on
2023-25 outcomes, the arm is not Tier-1 and this prereg is withdrawn rather
than amended — a pricing model fitted on the same seasons it is graded on has
no null that means anything.


---

## ADDENDUM — 2026-08-27, folds hydrated, nothing graded

The pricing step §9 warned might need a tuned free parameter **does not**:
`draft/tools/props_season_projection.py` already carries `line_to_points` and
`_any_td_rate`, both derived from the frozen scoring table alone. No parameter
is fitted on 2023-25 outcomes, so the abandon condition in §9 is not triggered
and this prereg stands as written.

`draft/tools/hydrate_weekly_props_from_historical.py` wrote **54 week-snapshots,
22,757 priced player-weeks**, into **`draft/data/props_backtest/`** — not
`draft/data/props/`, which is the live 2026 capture path. Directory separation
is a stronger form of §8 than the provenance field alone: a field says "this is
hydrated", a separate directory means a live reader never sees a fold. The
field is stamped anyway.

Coverage re-measured **through the arm's own loader** rather than asserted:
**3,727 of 3,775 offensive started slots, 98.7%**. That is marginally higher
than §2's 98.4% because `props_season_projection.normalize_name` resolves a few
names the coverage probe's own normalizer did not. Both numbers are
reproducible; §2's is the probe's and this one is the shipped join's.

**Nothing has been graded.** §7 fixes the first fold read at **2026-09-06** and
that has not moved.

---

## 11. ⚠️ AMENDMENT, 2026-09-02 — THE 2025 FOLD IS NOT BLIND, AND I FOUND OUT FOUR DAYS BEFORE THE GRADE DATE RATHER THAN AFTER

**Register 463 graded a props arm on 2025 while this prereg was sealed**, and its
results are committed on `main` in `draft/backtest/weekly_arms_2025_backtest.json`.
Found 2026-09-02 while checking, ahead of the 09-06 read, that P347 still had
its inputs. It has its inputs. It no longer has one of its folds.

**WHAT IS PUBLISHED, verbatim from that artifact:**

* `start_sit.props_shared` compares `props` against `own_v6:v1` on the shared
  population, per position, on 2025. **Props wins at all four:** QB 0.5835 vs
  0.5656 · RB 0.8527 vs 0.8018 · WR 0.7985 vs 0.7511 · TE 0.7923 vs 0.7499
  (n_pairs 4,564 / 24,279 / 56,505 / 12,816).
* `pooled_mae` carries `blend_props_pull` at **4.416** against `own_v6:v1` at
  **4.853**, over 17 weeks.

**THAT IS THIS PREREG'S HEADLINE, ON ONE OF ITS THREE FOLDS.** §0 predicts the
props arm BEATS on start/sit and does NOT beat on MAE. The first half is
answered TRUE on 2025. The second is contradicted in DIRECTION — though see the
limit below, because the published MAE is not the pure arm's.

**AND IT IS MATERIALLY THE SAME ARM, not a cousin.** `weekly_arms_2025_backtest.py:props_arm`
and `draft/weekly_props_arm.py` both go prop lines → stat line → our points
through `fetch_weekly_props.implied_points`, and both fold `any_td` in as
expected TDs for RB/WR/TE. They differ only in the crosswalk: 463 joins by
normalized NAME disambiguated by that week's team; the shipped arm joins by
`player_id`. §6's duplicate rule is written for exactly this situation.

### What changes, and what does not

**THE PRIMARY IS RE-SCOPED TO THE 2023 AND 2024 FOLDS, WHICH ARE STILL BLIND.**
Register 463's harness is 2025-only — its artifact stamps `season: 2025`, 17
weeks, and its input is `historical_props_2025.json`. Nothing has read 2023 or
2024 through any props arm. Those two folds remain a real out-of-sample test.

**2025 IS DEMOTED TO CONFIRMATORY AND WILL BE REPORTED AS NOT-BLIND**, with the
numbers above cited, never as though the fold were opened fresh on 09-06.

**THE DATE DOES NOT MOVE.** First read is still 2026-09-06.

### ⚠️ Limits of this amendment, stated rather than discovered later

1. **The published MAE is `blend_props_pull`, not the pure props arm.** A blend
   of props with a pull term is not what §0 predicts about. So the MAE half is
   *indicated* FALSE on 2025, not measured — the pure-arm MAE is still unread on
   every fold, and 2023/2024 will measure it blind.
2. **Knowing the 2025 direction is itself a contaminant of the remaining folds,
   because I now know it.** The mitigation is that §§2-8 are already fixed in
   writing — the population, the four nulls, the abstention matching and the
   duplicate rule were all sealed on 08-27 and none of them moves in this
   amendment. What I cannot do is pretend the expectation is unchanged, so it
   is written down here instead.
3. **A reasonable reader could say this should be withdrawn as a duplicate under
   §6 rather than re-scoped.** I think the two blind folds are worth more than
   the duplication costs — 463 is one season and this is the out-of-sample
   replication of it — but that is a judgement, it is A's to overturn, and the
   default if A says withdraw is that P347 is withdrawn rather than argued.

---

## 12. ⚠️ §11 DECAYED WITHIN THE HOUR — 2024 IS SPENT TOO, AND MY RECOMMENDATION CHANGES WITH IT

§11 was published **2026-09-02 00:03** and says the primary re-scopes to *"the
2023 and 2024 folds, which are still blind."* **The 2024 fold was spent at
00:44 — forty-one minutes later.** `weekly_arms_2024_backtest.json` carries the
same two blocks as its 2025 sibling, and in the same direction:

* `start_sit.props_shared` — **props beats `own_v6:v1` at all four positions
  again**: QB 0.6432 vs 0.6109 · RB 0.8047 vs 0.7531 · WR 0.7652 vs 0.7092 ·
  TE 0.7662 vs 0.7366.
* `pooled_mae` — `blend_props_pull` **4.650** against `own_v6:v1` **5.188**.

This is decay, not an error: the claim was true when written and false 41
minutes later. **It is recorded rather than silently restamped, because a
document whose corrections are invisible cannot be trusted about the ones it
does show.** `draft/data/blind_folds.json` already had it right before I did —
*"2025 spent by register 463, 2024 by register 471; 2023 is the last blind
fold"* — so the authoritative record was correct and this prose was the stale
part.

### ⛔ MY OWN RECOMMENDATION IN §11 NO LONGER HOLDS, AND I AM WITHDRAWING IT

§11 recommended keeping P347 over withdrawing it as a §6 duplicate, and gave
one reason: *"463 is one season and this is the out-of-sample replication of
it."* **That reason is gone.** It is now two seasons, agreeing at 4 of 4
positions in both, against a single remaining blind fold. A one-fold
replication of a twice-measured, consistent result is thin, and I should not
leave yesterday's recommendation standing on an argument that has expired.

**REVISED REC, and A still rules:** grade **2023 alone** on 2026-09-06 exactly
as preregistered — it is genuinely untouched, and a blind fold is worth
reporting even when the answer is expected — then **CLOSE P347 rather than
extend it**. The prediction as written is substantially answered by prior art;
what 2023 adds is confirmation, not discovery, and the row should say so.

### What is actually still unanswered, named but NOT preregistered here

Writing a new prereg after seeing two folds is the contamination this document
exists to prevent, so this is a pointer, not a claim:

1. **The pure arm's MAE has never been measured on any fold.** Both published
   figures are `blend_props_pull`, a blend, which is not what §4 predicts about.
2. **Both folds compare props against `own_v6:v1`, which is no longer the live
   champion** — that is `v1_pull3`, with a blend-prior challenger added
   2026-09-02 (register 474).

Either would need its own prereg, written by someone who has not read the folds,
or written with the contamination declared up front the way this one now is.

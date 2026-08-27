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

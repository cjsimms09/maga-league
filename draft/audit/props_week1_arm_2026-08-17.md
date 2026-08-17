# WEEK-1 PROPS: the fair test, and it beats own_v6 at WR and TE

_TERRITORY: D — data stewardship. Written 2026-08-17._

Preregistered in `PROPS-WEEK1-PREREG.md`, committed in its own commit (`9cbd9fa`)
**before** `props_week1_arm.py` existed. Result: `props_week1_arm.json`.

**`clears: false` on the preregistered bar — but props beat own_v6 on BOTH
metrics at WR and TE, and the arm is a stated LOWER BOUND.** The two positions it
loses are exactly the ones the lower bound penalises hardest.

**And the first run of this arm was wrong.** It reported MAE 249–362 against
own_v6's 23–83. That was not a null; it was a known store defect I walked into
because I had not read a docstring in a file I was reusing from.

---

## 1. THE RESULT

| position | n | props MAE | own_v6 MAE | props ρ | own_v6 ρ | props wins? |
|---|---|---|---|---|---|---|
| QB | 29 | 97.89 | **82.58** | 0.2172 | **0.3251** | ✗ both |
| RB | 46 | 64.66 | **52.20** | 0.6273 | **0.7094** | ✗ both |
| **WR** | 86 | **40.30** | 41.45 | **0.6319** | 0.5909 | **✅ both** |
| **TE** | 37 | **28.91** | 35.13 | **0.7055** | 0.5405 | **✅ both** |

**Bar: beat own_v6 on both metrics at all four positions. `clears: false`.**

**Controls, all from the prereg and all passing:**

| control | result |
|---|---|
| store contains week 1 only | ✅ `weeks=[1]` — the entire leak-free claim rests on this |
| overlap with the full-season store's own week-1 slice | **199 of 230 = 86.5%**, and the full-season slice is fully contained |
| crosswalk loss recorded | **2 of 230 = 0.9%** |

## 2. RULE 3d ON THE FIRST RUN — it was a defect, and it was already written down

**First run:** MAE 362.08 (QB), 275.92 (RB), 282.67 (WR), 248.62 (TE) against
own_v6's 83.14 / 40.01 / 34.16 / 22.61. **A 7–10× level error is a scale bug, not
a bias**, so it was investigated rather than reported.

**Cause, measured:** the week-1 stores carry `any_td` as **decimal odds**, not
expected touchdowns — 2025 values span **0.80–4.21, median 2.69** — and
`line_to_points` prices each at 6.0. Jalen Hurts came out at **46.29 points per
game, 786.9 for the season.**

**And the project already knew.** `empirical_draft_value.props_ordering()`:

> *"⚠️ THE ANYTIME-TD COLUMN IS UNUSABLE AND IS EXCLUDED… the decimal-odds
> corruption `fetch_historical_props.py` now guards against in
> `AMERICAN_IMPOSSIBLE_BAND`; the guard landed in the fetcher, **the committed
> week-1 stores predate it and still carry the bad values.** Using it would
> silently reorder the whole board."*

**I hit a documented defect because I reused a function without reading what its
callers had already learned about the data.** That is the same failure this lane
has spent the day auditing in other people's work, and it is worth recording as
mine: **the docstring that would have saved an hour was two directories away in
the one other module that reads these stores.**

`any_td` is now excluded, with the reason and the cost in the code and in the
artifact.

## 3. THE COST OF THE EXCLUSION, AND WHY IT STRENGTHENS THE RESULT

Without `any_td` this projection carries **no rushing or receiving touchdowns**.
It is a **LOWER BOUND**, the same label `empirical_draft_value` puts on its own
ordering, for the same reason.

**That cuts in a specific direction, and it is the most interesting thing here:**

- **TDs matter least, proportionally, at WR and TE** — where receiving-yard and
  reception props are richest. **Those are the two positions props WIN.**
- **TDs matter most at RB (goal-line work) and QB (rushing TDs absent, and QB
  scoring is TD-dominated).** **Those are the two positions props LOSE.**

So the exclusion penalises precisely the positions that failed. **A fair test with
a repaired `any_td` column should improve RB and QB and leave WR/TE roughly
where they are** — which is a prediction this makes, testable the moment the
store is fixed.

The population also improved when the column went: 528 → 230 players, because 298
had *only* an `any_td` line and therefore no `point`-quoted market at all. Absent
stays absent — they are excluded, not zeroed — and crosswalk loss fell from
**13.1% to 0.9%** because the dropped names were the marginal ones.

## 4. WHAT THIS DOES AND DOES NOT SUPPORT

**Supports:** a market signal available in **August** — before any game — orders
WR and TE better than own_v6 and is closer on level, **while handicapped by
carrying no touchdowns.** That is the first evidence in this project that
betting data might be worth something to a *preseason* board, and it is
categorically different from the full-season arm's 0.93–0.97, which was an
in-season-information artifact.

**Does not support:**

- **Any wiring.** `clears: false`, nothing installs, and the prereg said so before
  the numbers existed.
- **A general claim.** **One season (2025), small n** — QB 29, TE 37, RB 46. The
  2023 and 2024 week-1 stores are on disk and ungraded; extending
  `grade_props_vs_v6` past `GRADED_SEASON` means touching A's model code.
- **The QB/RB losses as final.** They are confounded with the exclusion (§3).
- **Anything about own_v6's quality.** Its ρ here (0.32 QB, 0.59 WR) is on this
  shared population, not its published figures.

## 5. THE BINDING CONSTRAINT IS THE STORE, NOT THE SIGNAL

**Repair `any_td` in the committed week-1 stores** — the fetcher's guard already
exists (`AMERICAN_IMPOSSIBLE_BAND`); the stores predate it. A re-fetch of three
week-1 slates is **48 odds calls** by the store's own `credit_estimate` shape,
against 16,320 for a full season.

**That is the cheapest high-value fetch left in the props agenda**, and it
unblocks: this arm at full strength, `empirical_draft_value.props_ordering()`
(currently a stated lower bound for the same reason), and any future TD-aware
props work. **Parked to C** — fetching is their lane.

## 6. WHAT I CHANGED

- `draft/backtest/props_week1_arm.py` — **new, TERRITORY: D.** It imports the
  scoring table, `week_implied_points`, the crosswalk, the own_v6 reproduction
  and the verdict rule from `props_season_projection.py` (**A's file, untouched**)
  rather than reimplementing them, so the two arms cannot drift.
- `draft/backtest/props_week1_arm.json` — the graded result.
- `draft/tests/test_props_week1_arm.py` — pins the corrupt-market exclusion and
  the two controls, with known-positive controls on both.

## 7. THE TESTS

- **`test_the_corrupt_market_stays_excluded`** — `any_td` must not re-enter the
  projection. **Known-positive control:** the same fixture *with* the column
  produces a projection several times larger, proving the exclusion is doing
  work rather than being decoration.
- **`test_the_week_one_only_control_can_fail`** — feeds the control a two-week
  fixture and requires it to say no. The leak-free claim is the whole basis of
  this arm; a control that cannot fail would make it worthless.
- **`test_absent_stays_absent`** — a player with no `point`-quoted market is
  excluded, never zeroed.

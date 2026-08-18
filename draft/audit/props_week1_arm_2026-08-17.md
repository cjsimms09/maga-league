# WEEK-1 PROPS: the fair test, and it is a NULL

_TERRITORY: D — data stewardship. Written 2026-08-17._

Preregistered in `PROPS-WEEK1-PREREG.md`, committed in its own commit (`9cbd9fa`)
**before** `props_week1_arm.py` existed. Result: `props_week1_arm.json`.

> ## ⚠️ VERDICT AFTER AMENDMENT 2 — THIS IS A NULL, AND §1's WR/TE WIN DOES NOT SURVIVE
>
> The 2025 WR/TE win over own_v6 below is real and reproduces. **It is not
> evidence that week-1 props carry usable signal**, because adding a second,
> simpler comparator kills it: **props beat NEITHER `naive_prev` NOR
> `recency_blend` at ANY position, in EITHER valid season.** Consistency across
> the preregistered read: **QB 0, RB 0, WR 0, TE 0 of 2 valid seasons.** The
> prereg said 1 of 3 kills it.
>
> **A win against one model is not a win against the baseline it should have
> beaten first**, and that is the whole reason Amendment 2 required a second
> comparator before the WR/TE result could be believed. §8 has the numbers and
> the correction.

**`clears: false` on the preregistered bar.** Props beat own_v6 on both metrics
at WR and TE (§1) — **and lose to the simple house baselines everywhere (§8),
which is what settles it.**

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

> ⚠️ **THIS SECTION WAS WRITTEN BEFORE AMENDMENT 2 AND ITS "SUPPORTS" CLAIM IS
> WITHDRAWN — see §8/§9.** It is kept rather than deleted because the reasoning
> was the error, and the error is the point: a win against one model was read as
> evidence about the input, before the trivial baseline had been checked.

**~~Supports:~~ WITHDRAWN.** The original claim here was that a market signal
available in August orders WR and TE better than own_v6, and that this was the
first evidence betting data might help a preseason board. **Amendment 2 refutes
it:** props lose to `naive_prev` and `recency_blend` at every position in both
valid seasons. What survives is narrower and is a question about own_v6, not
about props — §8.

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


---

## 8. AMENDMENT 2 — THE REPLICATION, AND IT KILLS THE HEADLINE

Preregistered before running (`PROPS-WEEK1-PREREG.md`, Amendment 2, commit
`73aef44`): three seasons, house baselines instead of own_v6 — **a weaker bar,
declared as such** — and the read is **consistency, not win rate**.

| season | n | crosswalk loss | cell valid | positions beating BOTH baselines on BOTH metrics |
|---|---|---|---|---|
| 2023 | 220 | **5.4%** | ❌ **invalidated** | — |
| 2024 | 239 | 0.4% | ✅ | **none** |
| 2025 | 228 | 0.9% | ✅ | **none** |

**Consistency: QB 0, RB 0, WR 0, TE 0 — of two valid seasons.** The prereg's
rule was *"1 of 3 kills it"*. This is 0 of 2.

**The 2023 cell was invalidated by the preregistered rule, not by judgement.**
Crosswalk loss 5.4% exceeds the declared 5% ceiling — the name index is built
from today's Sleeper roster and the oldest season matches worst, exactly as
Amendment 2 predicted. The guard fired on its own terms.

### What this means, stated carefully

**Props lose to `naive_prev` — last season's totals carried forward — at every
position, in both valid seasons.** A signal that cannot beat carry-forward is not
a signal, and the WR/TE win over own_v6 in §1 cannot rescue it: **beating one
model while losing to the trivial baseline that model is supposed to beat is a
statement about the comparison, not about the input.**

### AND THE OBVIOUS WORRY IS WRONG — own_v6 is fine

If props beat own_v6 but lose to `naive_prev`, the natural inference is that
own_v6 loses to `naive_prev` too. **Checked, and it does not.** On the
full-season arm's 2025 population:

| position | n | own_v6 MAE | naive | blend | own_v6 ρ | naive | blend | v6 beats both |
|---|---|---|---|---|---|---|---|---|
| QB | 45 | 78.38 | 87.51 | 80.61 | 0.6555 | 0.6148 | 0.6559 | ✗ (ρ ties blend) |
| RB | 78 | **41.84** | 49.52 | 48.26 | **0.7443** | 0.6675 | 0.6964 | ✅ |
| WR | 129 | **35.88** | 40.95 | 39.94 | **0.7019** | 0.6532 | 0.6581 | ✅ |
| TE | 68 | **26.73** | 31.19 | 27.89 | **0.7437** | 0.6719 | 0.7312 | ✅ |

**own_v6 beats both baselines at RB, WR and TE.** So the §1 result is a
**population effect**: this arm's universe is the ~230 players the market prices
with week-1 point-quoted props, and own_v6 scores materially worse there (WR ρ
**0.591**) than on the wider set (WR ρ **0.702**). Props edge it on that narrow,
market-covered subset — while still losing to carry-forward on the same subset.

**That is a real and useful thing to know about own_v6** — its advantage is
thinner on heavily-market-covered players — but it is a question for A about
own_v6, not a case for wiring props.

## 9. CORRECTION TO MY OWN EARLIER REPORT

I described §1 as *"the first real evidence that betting data might be worth
something to a preseason board."* **That claim does not survive Amendment 2 and I
withdraw it.** The evidence for it was a win against a single model; against the
baseline that model is measured on, the arm loses everywhere.

**The method is what caught it**, and it caught it because the amendment was
preregistered *before* the second comparator ran — not chosen after the first
result looked good. The declared consistency rule (1 of 3 kills it) and the
declared crosswalk ceiling (5%) both fired on their own terms.

## 10. WHAT REMAINS TRUE, AND WHAT STILL WANTS DOING

- **The `any_td` store defect is unchanged and still worth fixing** (register
  15c, routed to C, ~48 odds calls). This arm is a stated LOWER BOUND without it,
  and the two positions it loses to own_v6 are the touchdown-dependent ones. **A
  repaired store is the one thing that could still change this verdict** — and
  the re-test trigger is now: *re-run Amendment 2's three folds with TDs
  restored, and require the same consistency bar.*
- **The null is DATED, not permanent** (Rule 3c). One construction, flat ×17, no
  touchdowns, two valid seasons.
- **Nothing installs, and nothing was going to.** `clears: false` on both bars.

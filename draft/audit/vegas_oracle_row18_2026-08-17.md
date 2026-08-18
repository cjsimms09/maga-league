# ROW 18 — the Vegas "+0.23 perfect-foresight ceiling", under Rule 3d

_TERRITORY: D — data stewardship. Written 2026-08-17, session D's first item._

**Nothing was re-run.** Register row 18 says to apply Rule 3d to the ORIGINAL run
before re-running anything, and that is what this is. Every number below comes
from artifacts already committed (`exp_weekly_env.json`,
`exp_weekly_env_features.json`) or from reading `exp_weekly_env.py`. No new
egress; `nfl_data_py` is not installed in this sandbox and was not needed.

---

## WHAT I EXPECTED BEFORE LOOKING

Rule 3d says to state this first so "surprising" is a fact and not a memory. I
expected one of the two classic shapes: **either the oracle input barely varied**
(the ceiling defect again), **or the join dropped most player-weeks** and the
effect was diluted to nothing.

**It was neither.** The input varies more than any other arm in the study, and
the join does not drop rows at all. What I found is a third thing, and it is not
the one row 18 predicted — so row 18's premise gets a correction below, not a
confirmation.

---

## 1. WHAT THE ORIGINAL RUN ACTUALLY DID

**It was never a Vegas test.** `draft/backtest/exp_weekly_env.py` contains no
reference to `vegas`, `spread_line` or `total_line` — verified by grep, zero
hits. **The oracle never opened `vegas_lines_2021_2026.json`**, which is the
store now carrying its result as settled context.

What the ORACLE-TOTAL arm does, in three lines of real code:

| step | code | what it is |
|---|---|---|
| read the answer | `totals[team] = g["points_for"] + g["points_against"]` | `exp_weekly_env.py:158-160` — the **combined final score of the game**, from pbp |
| form a multiplier | `m = totals[team] / mean_total` | `:181-182` — that game's total ÷ the league mean total **that week** |
| apply it | `proj = baseline × (1 + λ(m − 1))` | `:259` — a flat rescale of the player's **prior running mean** |

Graded on 2,179 (2023) and 2,259 (2024) eligible player-weeks, weeks 5–18,
against a baseline MAE of 5.6729 / 5.7369.

The published **+0.23 is the `oracle_total@0.5` pooled row**: ΔMAE +0.2422 (2023)
and +0.2138 (2024), pooled +0.228.

---

## 2. RULE 3d, QUESTION BY QUESTION

### Q1 — DID THE INPUT VARY? **YES. Answered, and it passes.**

Re-derived from the committed `exp_weekly_env_features.json` (544 team-game rows
per season, all 32 teams, `points_for` never null), restricted to the study's own
eval weeks 5–18:

| | 2023 | 2024 |
|---|---|---|
| team-weeks carrying a multiplier | 416 | 416 |
| **distinct multiplier values** | **176** | **172** |
| range | 0.070 – 1.885 | 0.201 – 2.006 |
| sd | 0.311 | 0.282 |

**KNOWN-POSITIVE CONTROL on my own re-derivation:** these reproduce the committed
`multiplier_spread.oracle_total` block **to the digit** in both seasons
(committed: `min 0.07 / max 1.885` and `min 0.201 / max 2.006`). If I were
reading a different quantity than the study read, this would not have matched.

For scale, the oracle is the **widest-varying arm in the experiment** — roughly
3× the spread of `env_points` (0.619–1.524) and 13× `pace_raw` (0.882–1.112).

**This is emphatically NOT the ceiling defect.** The extremes are real games, not
bad rows: `2023_14_MIN_LV` (3–0, m = 0.07), `2023_13_LAC_NE` (6–0, m = 0.125),
`2024_17_SEA_CHI` (6–3, m = 0.201).

### Q2 — DID IT ARRIVE? **NOT ANSWERABLE FROM WHAT THE RUN RECORDED. This is the defect.**

The consuming line is `exp_weekly_env.py:258`, inside `project()`:

```python
m = week_multipliers.get(r["week"], {}).get(r["team"], {}).get(arm, 1.0)
```

Three chained `.get`s ending in a **silent neutral default**. This is not the
silent *inner join* Rule 3d warns about — it is the other half of the same
family, and it is harder to see:

- an inner join **shrinks the population** and at least changes a row count;
- this **keeps the row in the MAE denominator and sets its multiplier to 1.0**,
  so a failed join is arithmetically identical to "this game was exactly average"
  and leaves no trace anywhere in the output.

**The run records no join counter, for any arm.** Not in `exp_weekly_env.json`,
not printed by `main()`. So **the number of eligible player-weeks that actually
received an oracle multiplier is unknown, and no committed artifact can recover
it** — the player-week table is not committed, and re-deriving it needs
`nfl_data_py` (absent here, and re-running is what row 18 says to do second).

And the two sides of the join come from different sources:

- player rows carry weekly **`recent_team`** (`exp_weekly_env.py:212`)
- multipliers are keyed on pbp **`posteam`** (`:61-63`)

These are probably the same abbreviation vocabulary. **"Probably" is exactly what
Rule 3d exists to refuse.** A bye-week, a mid-season trade, or one relocated-team
alias resolves to m = 1.0 with nothing raised and nothing logged.

### Q3 — COULD THE TEST HAVE FIRED? **It fired. Its bar cannot fail in the way that matters.**

The oracle **is** the positive control. Its pass rule, `exp_weekly_env.py:456`:

```python
v["positive_control_passed"] = v["positive_both_seasons"]   # i.e. ΔMAE > 0
```

**The bar is "greater than zero."** That threshold cannot distinguish a
fully-wired oracle from one reaching 5% of its rows — both are positive. The
prereg (§ *Null baseline and ship rule*) says *"If the oracle cannot beat the
baseline, the harness is broken"* and **never declares how much it should buy**,
so there was no calibrated expectation available to fail against.

The mechanics test has the same shape:
`test_oracle_arm_is_the_deliberate_exception_and_is_flagged` asserts
`any(before[t]["oracle_total"] != after[t]["oracle_total"])` — that the oracle
moves **at all**.

This is the ceiling defect one level up. Not a constant input this time, but **a
control whose threshold no realistic breakage could trip.**

### VERDICT ON THE THREE QUESTIONS

**1 of 3 answered.** Q1 passes cleanly, Q2 has no answer and no way to get one
from the record, Q3's control is uncalibrated. Per Rule 3d: **suspected defect,
not finding.**

---

## 3. THE SECOND DEFECT — and it makes +0.23 the wrong number regardless of the join

This one does not depend on Q2 and it is fully measured.

**The oracle multiplier is symmetric within a game, by construction.**
`totals[team] = points_for + points_against` is the same sum for both teams, so
both get an identical `m`. Measured on the committed features artifact, over the
study's own eval weeks:

> **208 of 208 games in 2023, and 208 of 208 in 2024, give BOTH teams the
> identical oracle multiplier. 100%, both seasons.**

So in `2023_14_MIN_LV` — Minnesota 3, Las Vegas 0 — every Vikings player and
every Raiders player alike is multiplied by **0.07**. In a 45–3 game, **both**
sides are multiplied up by ~1.55, including the side that scored 3.

**The oracle knows the game was high-scoring and has no idea which team scored
it.** Against the quantity it is standing in for — a team's own points:

| | 2023 | 2024 |
|---|---|---|
| corr(team points, game total) | **0.682** | **0.669** |
| **r²** | **0.465** | **0.447** |
| sd of team points / sd of game total | 10.01 / 13.66 | 9.79 / 13.09 |

**The "perfect-foresight" input explains under half the variance of the thing it
is a proxy for.** Calling it perfect foresight of the game *environment* is true;
calling it a ceiling on *team*-level information is not.

### The diagnostic that was in the published result and was never read as one

**The oracle is WORSE at full strength than at half:**

| | pooled ΔMAE |
|---|---|
| `oracle_total@1.0` (applied fully) | **+0.132** |
| `oracle_total@0.5` (applied at half) | **+0.228** |

An input that is aimed correctly does **better** applied fully. An input that is
pointed at the wrong team roughly half the time does better **shrunk** — which is
precisely what a 50/50 blend of "right team" and "wrong team" predicts. **The
published +0.23 is the shrunken row**, and it is quoted as the ceiling.

### And this is exactly the information the Vegas store holds and the oracle did not use

`vegas_lines_2021_2026.json`'s own `_note` computes:

```
implied_home = total_line/2 + spread_line/2
```

**That is the per-team implied total — the quantity the oracle was blind to.**
The store contains the fix for the oracle's blindness, and the oracle's bound is
stamped on that store as the store's ceiling. A spread-aware team-level feature
is **not in the class of features the oracle bounds at all.**

---

## 4. WHAT THE +0.23 ALSO DROPS

The run reported three metrics. **MAE is the one on which the oracle looks
weakest, and it is the only one that propagated.**

| | 2023 | 2024 |
|---|---|---|
| ΔMAE (λ 0.5) | +0.242 | +0.214 |
| within-week Spearman | 0.4951 → **0.5304** | 0.5049 → **0.5333** |
| **top-decile hit rate** | 0.3619 → **0.4268** (+6.5 pts, **+17.9% rel**) | 0.4363 → **0.4769** (+4.1 pts, **+9.3% rel**) |

The prereg names top-decile *"the league-winner metric."* On that metric the same
oracle moved a lot. Cory's *"didn't move a single thing? not an ounce?"* is a fair
challenge and **the run's own numbers already answered it** — in a column nobody
carried forward.

---

## 5. MY READ, INCLUDING WHERE ROW 18 IS WRONG

Row 18's premise is that a near-zero oracle usually means the oracle never
reached the model. **I could not confirm that, and I do not currently believe it
is the main problem here.**

Given what was actually run — a game-level total, symmetric across both teams,
applied as a flat rescale of a running mean, graded by L1 on player-weeks whose
error is dominated by *within-team allocation* (which player caught the TD), a
thing no game-level number can ever see — **a +0.23 MAE gain on a 5.67 baseline
(4.0%) is not obviously too small.** It may well be the honest value of that
specific, deliberately lossy channel.

**So the defect is not "the number is wrong." It is:**

1. **The label is wrong.** The `_note` says *"perfect-foresight **team**
   game-total ceiling."* The code computes a **game** total shared by both teams
   (208/208, both seasons). The word "team" is not a typo — it is the difference
   between a bound that applies to the Vegas store and one that does not.
2. **The scope is wrong.** It is quoted as *"context every Vegas feature must be
   read against."* It bounds one channel — game totals, team-blind, multiplicative
   on a running mean. It does not bound spread-derived implied team totals, which
   is the feature the store was built for.
3. **Q2 has no answer** and the record cannot produce one, so per Rule 3d the
   underlying figure is a suspected defect regardless of 1 and 2.
4. **Q3's control could not have failed** at any breakage short of total.

**And the store keeps capturing.** Nothing here is an argument to stop the Vegas
fetch — it is an argument that the reason recorded for *not wiring* it does not
say what it has been read as saying. Rule 3c: a null grades the wiring, never the
store.

---

## 6. WHERE THIS HAS PROPAGATED — 8 sites

The `_note` was written to travel, and it travelled.

| file | what it says |
|---|---|
| `draft/backtest/vegas_lines_2021_2026.json` `_note` | *"Context every Vegas feature must be read against"* — **C's file** |
| `draft/backtest/fetch_component_stats.py:383-384` | writes that `_note` — **C's file** |
| `draft/backtest/fetch_component_stats.py:73` | *"The EXP-WEEKLY-ENV ceiling (+0.23 weekly MAE…)"* — **C's file** |
| `draft/backtest/own_model_v5.py:162-163` | *"perfect-foresight team game totals were worth only ~+0.23"* — **A's file** |
| `DATA-LIFECYCLE.md:81` | Vegas stop at step 5 filed **JUSTIFIED** on this figure — **D's, corrected in this commit** |
| `docs/queued/kalshi-study.md:34` | bounds the Kalshi agenda item |
| `draft/audit/projection_program_2026-08-16.md:98` | *"quoted beside every Vegas claim"* |
| `ROUTES.md:563` | **"Cory's purchase question dies with evidence"** — the figure is bounding a real spending decision |

That last one is why this matters beyond tidiness: **the +0.23 has been used to
tell Cory not to buy historical betting data.** That recommendation may still be
right, but it is currently resting on a bound that does not cover the feature
class in question.

---

## 7. WHAT I CHANGED, AND WHAT I PARKED

**Changed (my files):**

- `DEFECT-REGISTER.md` row 18 → `IN HAND`, with these findings and the next
  action; row 17 gains the Vegas re-test trigger it was missing.
- `DATA-LIFECYCLE.md` — the Vegas row's "JUSTIFIED" cell now says what the
  measurement actually bounds, and carries its re-test trigger.
- `draft/tests/test_vegas_oracle_scope.py` — **new, two checks, both with
  known-positive controls** (§8).

**Parked, not touched — other lanes' files:** the `_note` correction in
`vegas_lines_2021_2026.json` / `fetch_component_stats.py` is **C's**, and
`own_model_v5.py` is **A's**. Requests filed in `ROUTES.md` with the exact
replacement text.

**The re-test trigger for the Vegas store** (row 17, method-type):

> Re-test when a **team-level** implied-total arm is run —
> `implied_home = total_line/2 + spread_line/2` from `vegas_lines_2021_2026.json`,
> against the same eligible set, **with a join-survival counter recorded**. The
> store needed for it now exists (6 seasons, 1,426 games, committed 08-16), so
> this trigger is already unblocked. Post-draft.

## 8. THE TESTS, AND WHY THEY CAN FAIL

`draft/tests/test_vegas_oracle_scope.py`.

1. **`test_oracle_multiplier_is_game_symmetric_not_team_level`** — builds one
   game, 45–3, and asserts both teams receive the same oracle multiplier.
   **Control:** the same fixture asserts a team-level oracle over those rows
   *would* differ (3.0× vs 0.2×), proving the check discriminates rather than
   passing on anything. **This test is designed to fail the day someone makes the
   oracle team-aware** — at which point the `_note`'s word "team" becomes earned
   and every citation in §6 must be revisited together. That is deliberate: brief
   §5 records that a *textual* citation-checker was built and deleted because it
   could not fail honestly. This one is structural, so the code and the claim move
   together.

2. **`test_a_missing_team_rides_the_baseline_and_still_counts_in_mae`** — pins the
   Q2 mechanism: an unjoined player-week is scored at the baseline and stays in
   the MAE denominator, diluting rather than shrinking. **Control:** a joined row
   in the same call does move, so the test distinguishes "arrived" from "silently
   defaulted" rather than asserting both are fine.

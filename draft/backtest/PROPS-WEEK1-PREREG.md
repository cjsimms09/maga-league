# PROPS-WEEK1 — PREREGISTRATION (written 2026-08-17, committed BEFORE the arm existed)

_TERRITORY: D — data stewardship. Register 15b's parked follow-up._

**Commit order is the proof.** This file is committed in its own commit, before
`props_week1_arm.py` exists.

## Why this arm exists

The full-season props arm was graded on 2026-08-17 and returned Spearman
**0.93–0.97** against own_v6's 0.66–0.74. **That is not projection skill.** It
sums prop lines from all 18 in-season weeks, so a week-17 line knows the season
and an injured player simply has no rows — a fact its own module preregistered
(`in_season_information_asymmetry`). It answers *"how much is on the table given
in-season market access"*, never *"should the preseason board change"*.

**This arm asks the question that one structurally cannot: can a market signal
available in AUGUST improve a preseason board?**

`historical_props_week1_{2023,2024,2025}.json` are committed — **2,283
player-weeks, 3,889 quotes, already paid for.** Week-1 lines close **before any
game of that season is played**, which is this project's own leak-free rule for
season-total features (`vegas_lines_2021_2026.json`'s `_note`: *"Leakage rule for
season-Y season-total features: WEEK 1 LINES ONLY — they close before any
season-Y game; deeper weeks are in-season information."*).

## The construction — declared, and deliberately crude

```
proj_season(player) = week1_implied_points(player) × GAMES = 17
```

- **`GAMES = 17` is a DECLARED CONSTANT, not a fitted one**, and the same for
  every player at every position. Nothing here is tuned.
- **It deliberately does NOT model availability.** A player who misses ten games
  is projected as if he played seventeen — **which is exactly the handicap own_v6
  carries**, and is the whole point: both arms are preseason forecasts blind to
  what happens next. The full-season arm's advantage was precisely that it was
  not blind, and that is what made it unusable as a comparison.
- `week1_implied_points` is `props_season_projection.week_implied_points`,
  reused rather than reimplemented, under the same frozen scoring table.

**ABSENT STAYS ABSENT.** A player with no week-1 prop line is **excluded**, never
imputed to a positional mean and never given a zero. The surviving population is
**recorded**, per row 18's lesson.

## Graded season, and what is not graded

**2025 only**, matching the full-season arm so the two are directly comparable.
`grade_props_vs_v6` reproduces own_v6 for `GRADED_SEASON = 2025`; extending it to
2023/2024 means touching A's model code and is out of scope here. **Those two
seasons stay available and are named as the next fold**, not quietly dropped.

## Ship rule — identical to the full-season arm, deliberately

Beat own_v6 on **BOTH** metrics (lower MAE, higher Spearman) at **ALL FOUR**
positions, on the shared population. Anything less is a null for this
construction.

**Nothing installs from this either way.** A positive routes to a separate, gated
decision that is A's and Cory's, post-08-22.

## Preregistered calibration — what result sizes will MEAN

Stated now so "surprising" is a fact and not a memory (Rule 3d), and this arm's
sibling is the reason to be careful: a near-perfect number here would mean the
same leak, not a discovery.

- **Expected Spearman: 0.60–0.80**, i.e. own_v6's neighbourhood. Week-1 lines
  encode real market consensus on role and health, but they are a preseason
  opinion like any other.
- **Above 0.85 is a LEAK REPORT, not a result.** The full-season arm reached
  0.93–0.97 *because* it saw the season. If a week-1-only arm approaches that,
  the first hypothesis is that the store does not contain only week 1 — checked
  by the control below before any number is believed.
- **Below the null / far under own_v6** means August market lines carry less
  than our preseason model, which is a legitimate and useful answer: it would
  close the "should we buy betting data for the board" question with evidence
  rather than with the +0.23 oracle bound that register 18 showed does not cover
  this feature class.
- **MAE is expected to be WORSE than own_v6 at most positions** because of the
  flat ×17: every injured player is projected at full health. A *ranking* win
  with an MAE loss is the most likely honest outcome and would be worth
  reporting as exactly that.

## Controls — required before any number is read

1. **The store must contain exactly one week, and it must be week 1.** Asserted,
   not assumed. This is the leak check the calibration above depends on.
2. **KNOWN-POSITIVE:** the week-1 store's player set must overlap heavily with
   the full-season store's own week-1 slice. If they disagree wildly, one of the
   two fetches is wrong and neither arm means anything.
3. **The crosswalk loss is recorded**, not just the correlation — the
   full-season arm lost 4 of 428 names, and this arm's population is smaller.

## If it is null, the trigger is chosen now

> Re-test when **2023 and 2024 can be graded** (two more folds already on disk),
> and when a **games-played prior** exists to replace the flat ×17 — that
> constant is the crudest part of this design and the most likely reason for an
> MAE loss.

## What this arm does NOT test

- Whether props belong on the board (a wiring decision, A's and Cory's).
- Weekly/in-season prediction — that is the full-season arm, already graded.
- Any construction other than the single one specified above.
- 2023/2024 (named above; not silently excluded).

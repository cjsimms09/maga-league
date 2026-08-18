<!-- TERRITORY: A -->
# WHAT ELSE MOVED WHEN THE CEILING CHANGED — measured, not assumed

**Cory, 2026-08-17:** *"Have we reran all the things we need to since ceiling and
floor have been changed? we cannot rely on old reasons as these 2 things may
change outcome."*

**Short answer: no. Here is one that had not been re-run, with the size of the
move.**

---

## THE DOLLAR MODEL SHIFTED AND NOBODY RE-DERIVED IT

`engine.playerDollars()` turns projection SHAPE into dollars — the figure behind
"which of these two makes me more money", the most prominent number in any
comparison on the board:

```
boom  = ceiling − mean          ← THE INPUT THAT CHANGED
high  = 0.22 × boom             weekly-high equity
entry = 0.08 × mean             top-4-entry equity
rs    = 0.05 × mean             regular-season equity
```

The ceiling used to be `mean + 1.036 × sd` (a Gaussian 85th percentile). It is
now the **measured p90 per (position, band)**. `boom` is that difference, so the
whole decomposition moved. Measured across the 603 players on the shipped board
who carry mean, sd and a ceiling:

| | boom's share of a player's total dollars |
|---|---|
| Gaussian ceiling (old) | **47.2%** median · 46.5% mean |
| measured p90 (now) | **34.9%** median · 34.6% mean |

| | change in the total dollar figure |
|---|---|
| median | **−18.8%** |
| mean | −15.5% |
| players moving more than 10% | **464 of 603** |

**The coefficients are not wrong — they are unexamined.** `playerDollars`'s own
docstring is honest that 0.22/0.08/0.05 are *"placeholders calibrated only for
RELATIVE comparison"*. But they were chosen when `boom` had a different scale, and
the balance between weekly-high equity and entry/RS equity has shifted by about
twelve percentage points underneath them. In a league where weekly high is 37.5%
of the pot, that balance is the thing the number exists to express.

**This is not a bug to fix before Saturday.** It is a re-derivation that is now
owed, and the honest position until then is that the dollar figures are for
RELATIVE comparison only — which is what the code already says and what any
surface showing them must keep saying.

## AND THE BOARD IS MIXED, WHICH THE DOLLAR MODEL DOES NOT KNOW

`proj_ceiling_source` on the shipped board: **530 `measured-2023-25-p90`, 73
`gaussian_z`.** Two different constructions, both called "the ceiling", and
`playerDollars` treats them identically because it reads the field and not the
stamp.

That is defensible — both are a ceiling — but it means the dollar figure means a
slightly different thing for those 73 players, and nothing on the surface says
so. The stamp exists precisely so a consumer CAN tell them apart. Nothing
currently does.

## WHAT THIS IMPLIES FOR EVERYTHING ELSE

The rule, and it is the general one: **anything that reads `proj_ceiling`,
`proj_floor`, `proj_sd` or `weekly_sd` was calibrated against a different
distribution and must be re-checked before its output is trusted.**

Already re-run today: the ceiling weight (three preregistered runs), the phase
grid, the variance modifiers, the money proxy's keeper variance.

**Not yet re-checked, in the order they touch what Cory sees:**

1. **`playerDollars` coefficients** — measured above. Biggest visible surface.
2. **`champodds`** — team weekly variance is built from `weekly_sd`, which is
   derived from `proj_sd`. A championship probability is a distribution
   statement; if the spread moved 12 points of share in the dollar model, the
   odds model deserves the same measurement.
3. **The bench branch's ceiling floor** — `BENCH_CEILING_FLOOR` was retired to
   zero on 08-14 on the old ceiling's arithmetic. Retired is safe; but the
   reasoning that retired it referenced spreads that have since changed.
4. **Anything consuming `proj_floor`** — the floor changed in the same commit as
   the ceiling and has had *less* attention than the ceiling, not more.

**None of these should ship a changed number before 2026-08-22.** Measuring is
not shipping, and the standing rule is about what reaches the board.

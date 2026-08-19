# PREREG — MARGINAL LINEUP VALUE (MLV): the objective as the pick rule
**Relay lane, 2026-08-19. Committed BEFORE the arm is run. Answers `ROSTER-CONSTRUCTION-CALL.md`.**

## 1. THE MECHANISM, IN ONE SENTENCE

Score a candidate by **how much he raises the best legal starting lineup's
value, in the harness's own market-rank units** — not by his rank times a
positional multiplier:

```
marginal(c) = lineupValue(roster + c) − lineupValue(roster)
```

where `lineupValue` is the harness's existing `bestLineup` shape (dedicated
slots then one exact flex) evaluated on market value `(N+1) − pick_no` per man,
using each rostered man's own draft position as his era-correct price.

**Why this answers §7's open question** (*"conversion without paying the
acquisition"*): the Cory-curve pays acquisition because it taxes the POSITION
COUNT — a 4th RB is ×0.25 whether he would start or rot. MLV taxes the
DISPLACEMENT — a 4th RB better than the flex incumbent keeps his full marginal
value (he starts; the incumbent's loss nets off), a 4th RB worse than the
incumbent is worth ~0. Upgrades stay; true bench bodies price at zero. No
constants, no curve, nothing to tune: **the objective is the rule.**

Under Cory's grading ruling ("assuming no injuries, grade skill not luck") this
is not a heuristic: in the skill arm a bench man contributes exactly 0, so the
lineup IS the roster's whole value, and maximizing marginal lineup value is
maximizing the graded objective itself.

## 2. THE ONE CONSTRAINT THAT IS A RULE OF THE GAME, NOT A WEIGHT

When picks remaining == unfilled legality requirements
(QB≥1, RB≥2, WR≥2, TE≥1, K≥1, DEF≥1, RB+WR+TE≥6), candidates are restricted to
positions that reduce a requirement. This is the statement "a roster that
cannot field nine men forfeits those slots", not a tunable term. With Cory's
keepers the initial requirement count is 6 against 12 picks.

## 3. THE BAR — A's table, adopted verbatim, declared before the run

| grading | must beat | meaning |
|---|---|---|
| actual  | **> +2.5**  | beats plain best-available |
| skill   | **> +7.9**  | beats the shipped shape term |
| legality | **30 of 30** | every roster fields a full lineup |

Skill is PRIMARY per Cory's ruling; actual is reported beside it, never
dropped. Win-count clause per P215's convention: skill wins in **≥ 18 of 30**
seat-years, else FALSE even if the mean clears.

## 4. FALSIFIABLE SHAPE — how the mechanism can fail honestly

- **Predicted:** conversion gain retained (mean conversion ≥ owner + 0.04) AND
  acquisition loss cut to better than half the shipped term's (−148 → > −74).
  If MLV wins WITHOUT the conversion gain, the mechanism is not the claimed
  one and will be reported as such.
- **Predicted:** K/DEF land near the human window (mean first-K pick 96–145)
  with NO explicit K/DEF term — the deadline emerges from declining skill
  cliffs. If K/DEF still go at pick ~83–96, dead-end-1's premise question
  stands and MLV has not answered it.
- **No weight ships from this run.** A rules; the flag defaults off.

## 5. WHAT MAY NOT HAPPEN

No constant in the mechanism may be adjusted after seeing a grade. If the bar
fails, the FALSE is filed as plainly as a pass, beside the two dead ends.

---

## 6. GRADED, SAME DAY — the FALSE first

**Preregistered arm (`--objective`): FALSE on its own win-count clause.**
Actual **+19.2** (bar > +2.5 ✓), skill **+10.8** (bar > +7.9 ✓), 30/30 legal ✓
— but skill wins **15/30** against the declared ≥18/30. FALSE, despite both
means clearing. Also the mechanism prediction FAILED: conversion moved
**+0.0004**, not the predicted ≥ +0.04. **The win is ACQUISITION (+20.4 vs the
shipped term's −148), not conversion.** §7's question is answered in reverse:
the humans' conversion was never the thing to buy — displacement-aware picking
matches it for free, and the −148 the curve was paying was never necessary.
And the arm buys ~2 kickers and ~2 defences: optimal under no-injury grading
(bench = 0), not a normal roster.

**Normal-roster variant (`--objective-normal`, K≤1 DEF≤1): clears every bar.**
The cap is from Cory's own brief — *"draft best team while fielding a normal
roster"* — but it was added AFTER the first grade was seen, so it is formally
post-hoc and is labeled so. Measured:

| | actual | skill | legal |
|---|---|---|---|
| shipped shape term | −20.4 (14/30) | +7.9 (16/30) | 30/30 |
| plain best-available | +2.5 | 0.0 | 30/30 |
| MLV preregistered | +19.2 (16/30) | +10.8 (15/30) | 30/30 |
| **MLV normal-roster** | **+45.8 (20/30)** | **+29.3 (18/30)** | **30/30** |

All three seasons positive on BOTH gradings (actual +39.7/+6.1/+91.7; skill
+33.9/+7.9/+46.2). Shape: exactly 1 K, 1 DEF, QB 2.07, RB 4.47, WR 4.57,
TE 1.83. Acquisition **+51.7**, conversion +0.0039. First K at mean pick
**104** (range 102–108; prereg window 96–145 ✓; humans 126). First DEF at mean
**89** — still earlier than the humans' 128, consistent with §4's finding that
forcing onesies later costs points. Honest noise statement: skill sd 77.7,
n=30, so the +29.3 mean is ≈2.1 SE — real but not overwhelming, and P215's own
win-count bar (18/30) passes exactly, with nothing to spare.

**NOTHING SHIPS FROM THESE RUNS.** The flag defaults off; the cap variant needs
its own prereg run by A (one flag, reproduces in seconds) or Cory's ruling.

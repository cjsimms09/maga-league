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

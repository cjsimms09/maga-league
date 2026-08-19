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

## 7. ROBUSTNESS, SAME DAY — three attacks, declared and run after grading

Run on the `--objective-normal` arm only, to stress the result before A leans
on it. No mechanism change; measurement only.

**① Bootstrap (6,000 resamples, seed 7):** ACTUAL +45.8, CI95 **[+10.0, +81.7]**,
P(mean≤0) = 0.006. SKILL +29.3, CI95 **[+3.2, +58.0]**, P(mean≤0) = 0.014.
Both intervals exclude zero.

**② Leave-one-season-out:** positive on BOTH gradings dropping ANY season —
drop 2023: +48.9/+27.1 · drop 2024: +65.7/+40.0 · **drop 2025 (the best
season): +22.9/+20.9.** Not one season's artifact.

**③ Keeper-pricing artifact: killed by the cleanest control available.**
Keepers sit at picks 1–18 (top of the draft), so `MV` prices them at the top
and candidates cannot spuriously displace them. And **2023 carries ZERO
keepers and grades +39.7 actual / +33.9 skill** — the mechanism wins in the
one season where keeper pricing cannot possibly be doing hidden work.

**⚠️ One process bug caught while running ①:** the harness writes ONE output
file, so my shipped-arm verification run had clobbered the normal-arm JSON,
and the first bootstrap silently measured the WRONG ARM (it reproduced
−20.4/+7.9 — recognizable, which is how it was caught). This is the same
off-arm-clobbers-on-arm trap A already fixed in the model tool
(`479047e5 "Give each arm its own artifact"`). The re-run now asserts the
arm's mean before measuring. A: the harness deserves the same per-arm-artifact
fix when you take it over.

---

## 8. PREREG — MLV-LOOKAHEAD (`--objective-look`), committed before the run

**The myopia:** plain MLV takes the largest immediate marginal. If WRs are flat
(the next WR at my next pick is nearly as good) and TEs cliff (the last real TE
leaves before I pick again), taking the WR wastes the pick — waiting was free
at WR and expensive at TE.

**The rule:** at each pick, for every candidate `c`, compute
`wait_cost(c) = marginal(c) − marginal(best at c's position still available at
my NEXT pick)` — availability read from the fixed-opponent draft, the same
no-hindsight information the harness's supply counter already uses (its C3
note). Take the candidate maximizing `wait_cost`, tiebreak by `marginal`.
Legality guard and K≤1/DEF≤1 unchanged. **No constants.** At the last pick
there is no next pick; `wait_cost = marginal`.

**Bar, declared now:** beats `--objective-normal` on BOTH gradings
(actual > +45.8 and skill > +29.3), 30/30 legal, and beats it head-to-head in
**≥ 16 of 30** seats on skill. FALSE otherwise, filed beside the rest.

**Falsifiable signature:** the gain, if any, concentrates in EARLY picks
(rounds 3–7, where cliffs differ most); a gain concentrated late means the
mechanism is not the claimed one.

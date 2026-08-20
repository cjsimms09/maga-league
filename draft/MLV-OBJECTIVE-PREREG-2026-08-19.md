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

**§8 GRADED, SAME DAY: FALSE.** Actual **+50.1** (>+45.8 ✓, all three seasons
positive) but skill **+14.5** against the required >+29.3 — the primary
grading under Cory's ruling, and the bar demanded BOTH. Head-to-head on skill:
lookahead beats plain MLV in **13/30** against the declared ≥16. 30/30 legal.
**The lookahead buys raw-points efficiency by spending picks on cliffy
positions whose per-game rates matter less; the myopic displacement rule keeps
the better STARTERS.** `--objective-normal` remains the recommendation, and
this axis is closed: two arms measured, a clear winner, and the improvement
hypothesis is FALSE on the grading that counts.

---

## 9. LIMITS — Cory: "MLV has massive issues too though." He is right. The list.

**Measured:**
1. **Thin bench is a real, priced cost: ~16.5 pts/season.** Relative
   (skill−actual) gap vs the humans is −16.5 — MLV rosters lose more to
   absence and gain less from weekly lineup optionality than human benches do.
   It is ALREADY CHARGED inside the +45.8 actual (that arm includes injuries
   and byes). But the SKILL arm hides it by construction — Cory's no-injury
   ruling is what makes zero-bench-value optimal, and if he weighs insurance,
   the ruling itself is the lever to revisit, not the mechanism.
2. **High variance: sd 98.8 on actual.** Worst seat −155, 6/30 seats lose by
   50+. This is a MEAN edge (16/30 win by 50+), not a guarantee for any one
   draft night.
3. **Sequencing is not solved.** One lookahead formulation failed on skill
   (§8); that closes the axis I tried, not the question.

**Real and unmeasured:**
4. **Rank-units are not points.** lineupValue sums market ranks; a
   displacement worth 10 rank-points at pick 20 is a different quantity of
   POINTS than at pick 120. The live engine must run this in projected points,
   and the harness result does not automatically license points-units
   behavior. That translation is the single biggest risk in shipping it, and
   it is A's to validate.
5. **Fixed opponents** — nobody re-reacts to our different picks. Shared by
   every arm including the shipped one; still a limit on all of them.
6. **n=30, one league, three seasons.** No out-of-league validation exists or
   can, and 2024 is weak (+6.1, 6/10) in every arm.
7. **No stacking, no correlation, no bye planning** in the mechanism. Byes are
   priced only by the actual grading, never planned for.
8. **Taste: it buys late QB/TE upgrades** (QB mean 2.07) because an upgrade
   always has positive marginal. Defensible under the objective; not how
   humans spend pick 14.
9. **It is an autodraft policy, not a war-room integration.** recommend() is
   roster-blind (register 59); wiring a roster-conditional marginal into a
   ranked list a human reads at 8 seconds a pick is real design work, not a
   flag.

**The honest net:** best measured construction rule on both gradings, with a
real thin-bench cost inside the number, a real variance band around it, and a
units question that must be answered before it touches the live board.

---

## 10. PREREG — NORMAL-WINDOW MLV (`--objective-window`), committed before the run

**Cory: "a better roster equation that makes a normal roster based on league
history and extracts as much value as possible."** Taken literally: the league's
own drafts DEFINE normal. The mechanism:

- MLV cap arm unchanged (marginal lineup value, K≤1/DEF≤1, legality guard).
- **One added rule, read from league history, zero constants: a first K or
  first DEF may not be taken at an overall pick earlier than ANY human owner
  in the league's three recorded drafts has ever taken theirs** (the min over
  30 owner-seasons, per position). Before the window opens those picks fall to
  the next-best marginal — and when all marginals are ~0 (lineup full), the
  tiebreak takes best market value, i.e. natural bench depth. The legality
  guard overrides the window (a legal roster outranks a normal-looking one).

**Why nearly free, predicted before running:** K streamability is .966 — the
board's K value declines slowly, so deferring from pick 85 to the human window
costs little; the freed rounds 9–11 become depth/upgrades, which the ACTUAL
grading (injuries, byes) pays and the skill grading prices at ~0.

**Bar, declared now:** 30/30 legal · K exactly 1, DEF exactly 1 · first-K mean
inside 100–145 · **actual > +45.8** (beats the cap arm — depth must PAY, not
just look normal) · **skill > +25** and head-to-head vs cap arm ≥ 14/30 on
skill (within noise of +29.3; the claim is "normality nearly free", so skill
materially WORSE than the cap arm is FALSE even if actual improves).

**Falsifiable signature:** the actual-arm gain must come from BENCH weeks
(depth covering absences), not from the starters — if starters drive it, the
mechanism is not the claimed one.

**§10 GRADED, SAME DAY: FALSE — and the failure PRICES normality.** Every
shape goal hit: 30/30 legal, exactly 1 K and 1 DEF, first K at mean 110.8
(range 102–121, inside the human window, vs the humans' 126). And the value
collapsed: **actual +32.2 (< +45.8), skill −5.1 (< +25)** — a −13.6/−34.4
swing against the cap arm for the SAME rosters minus timing. The mechanism,
visible in the pick logs: with rounds 9–10 blocked for onesies, the tiebreak
buys bench bodies (worth 0 on skill) and the LAST picks — where the cap arm
buys QB/TE/flex upgrades with real marginals — go to K/DEF instead. **The
upgrades never happen. MLV's early K was never a quirk: taking the onesies the
moment the lineup fills is what FREES the endgame for upgrades.**

**So "a normal roster" has a measured price in this league: ≈ −34 skill /
−14 actual points per season.** Third independent result pointing the same
way (A's two dead ends both made points worse by forcing onesies later; this
one measures the cost inside a mechanism that beats the humans). The cap arm
remains the best measured equation; normal timing is a preference Cory can
buy, now at a known price, not a free improvement.

---

## 11. PREREG — THE UNITS TEST (`--objective-points`), committed before the run

**§9 limit 4 is the biggest open risk: rank-units are not points.** This tests
it directly. Everything about the cap arm is unchanged EXCEPT the scale on
which `lineupValue` is computed:

- rank-units arm: value(man) = (N+1) − pick_no  (linear in rank)
- points-units arm: value(man) = **curve(pick_no)** — the empirical
  pick→realized-season-points curve, fit **LEAVE-ONE-SEASON-OUT** (replaying
  2024 uses the curve from 2023+2025 only), bucketed by round (15 picks — the
  draft's own natural unit, not a tuned width), bucket means, monotone
  non-increasing enforced, linear interpolation between bucket centers.

No same-season outcome data ever enters a replay — the leak rule is the same
AS-OF discipline the capture jobs use. Candidate ORDER within a position is
still the market's (the curve is monotone), so this isolates UNITS: how
marginals compare across positions and board regions, which is exactly what
rank-linearity distorts.

**Bar, declared now:** 30/30 legal · actual **> +2.5** and skill **> +7.9**
(the open call's own table — beats plain BA and the shipped curve). The
REPORTED question beside the bar: does the cap arm's win survive the unit
change within noise (actual within [+10, +82], the rank arm's bootstrap CI)?
- **Survives** → the translation risk is retired and the cap arm is fit for
  A's live-board wiring.
- **Clears the bar but leaves the CI** → the SIGN is unit-robust, magnitudes
  are not; live wiring proceeds with wide error bars, said out loud.
- **Fails the bar** → MLV is a rank-space artifact; it must not touch the
  live board, and that verdict is filed like the rest.

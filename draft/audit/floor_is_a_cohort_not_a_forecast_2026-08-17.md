# E's fifteenth sweep — the floor and the ceiling are COHORT statistics, and the war room called them forecasts

**Session E (red team), 2026-08-17.** Board: `public/draft_data.json`, 682 rows.

This sweep closes a gap **my own fourteenth sweep named and did not cover**:

> *"It reads the ENGINE's inputs, not every surface's. A panel that computes its
> own quantity from the board and displays it is outside this net."*

E13 (`rookie_affinity` pinned at 0.0) was the proof that gap was real. So this
sweep runs the same cv test over **what the WAR ROOM reads** — 16 board fields
parsed out of `app.js` — rather than what the engine reads.

**Two of those 16 are not in the engine's 18 at all: `proj_floor` and
`consensus_rank`.** The class sweep had never touched them.

---

## A FLAG THAT DIED FIRST, because it looked like the §1 defect and is not

The cv sweep returned `proj_floor` at **cv 0.000e+00** — a perfect constant
multiple, apparently worse than the ceiling ever was. **That reading was wrong
and I am recording it because the correction is the useful part.**

The zero-cv cell is `QB|33+`, where `proj_floor / proj_mean` is not *constant*
but *identically zero*: **123 players carry a floor of exactly 0.0.** Of those,
**79 have `proj_mean == 0.0`** — unprojected players, where a zero floor is
correct and carries nothing. The remaining 44 are clamped by
`projections.py:446`, and the code states the reason outright:

> *"`max(0, ...)` stays: a negative floor is not a football outcome. Note the
> measured p10 for QB|33+ is itself -0.001, i.e. the clamp is doing real work
> rather than decorating."*

**The clamp is correct, documented, and not a defect.** `proj_floor/proj_mean`
genuinely varies elsewhere — RB|17-32 shows cv 0.34 on a single source.

**Method note, because I have now made the mirror-image error twice.** On the
ceiling I mistook 452 distinct *rounded* ratios for real variation; here I
mistook an identically-zero ratio for a constant multiple. Distinct-value counts
and cv both need the population checked before the statistic means anything.

---

## THE FINDING — right cell, absurd number

`proj_floor` and `proj_ceiling` are, since 2026-08-17,
`proj_mean × the measured p10/p90 ratio of the player's (position, projection-
rank band) CELL` (`projections.py:423-437` via `projection_error.proj_floor_for`
/ `proj_ceiling_for`). **Every player in a cell carries the same multiple.**

Applying a **step function of band** to a **continuous rank** puts a cliff at
every band edge. On the live board, at the QB edge between 16 and 17:

| | player | proj | floor | ceiling |
|---|---|---|---|---|
| QB15 | Patrick Mahomes | 332.7 | **88.39** | 474.3 |
| QB16 | Jaxson Dart | 328.5 | **87.29** | 468.4 |
| QB17 | **Jordan Love** | 322.5 | **2.45** | 478.7 |
| QB18 | Baker Mayfield | 313.9 | **2.39** | 465.9 |

**A 35.6× drop in floor across a 6.0-point gap in projection.** Both players are
in their **correct** cell — this is *not* the E1 misread. Verified against the
calibration directly: `QB|9-16` p10 = 0.265682 → 328.5 × 0.265682 = 87.28;
`QB|17-32` p10 = 0.007604 → 322.5 × 0.007604 = 2.45.

**A 2.45-point season floor is not a statement about Jordan Love.** It is the
p10 of a cohort (QB17–32) that runs down to quarterbacks who never take a snap.
And the war room printed it as his, with nothing to say otherwise:

```
Projection 323 (floor 2, ceiling 479)
```

The same edge produces **TE33 Darnell Washington 2.11** against TE32 Kenyon
Sadiq 11.61.

## WHY THE FLOOR AND NOT THE CEILING — and the half of this that runs the other way

Band-to-band ratio spans, per position:

| pos | p10 (floor) span | p90 (ceiling) span |
|---|---|---|
| QB | 0.0076 … 0.5968 — **78.5×** | 1.0937 … 1.4842 — 1.4× |
| RB | 0.0207 … 0.7702 — **37.2×** | 1.4337 … 1.8903 — 1.3× |
| TE | 0.0302 … 0.7732 — **25.6×** | 1.0921 … 1.7040 — 1.6× |
| WR | 0.0487 … 0.6733 — **13.8×** | 1.2959 … 1.7403 — 1.3× |

**Proportionally the floor is 10–50× more sensitive to which cell you land in.**

**But the absolute-points conclusion runs the OTHER way and I am stating it
rather than the flattering half.** Summed over E1's nine misread players, the
error is **373.5 points of floor against 535.1 points of ceiling** — ceilings are
roughly 3× larger numbers, so a smaller proportional error is a bigger absolute
one. Both matter; neither dominates.

## WHAT SHIPPED — a label fix, and nothing else

`showWhy` now prints what the two numbers are. **No number changed, nothing
reordered, no scoring path was touched.**

```
Projection 323 (floor 2, ceiling 479)
  ^ floor/ceiling are the QB 17-32 COHORT's measured
    p10/p90 (2023-25) x this projection — NOT a forecast for this player.
    Every QB in that band carries the same multiple.
    He sits at the TOP of that band, where it is harshest — the QB
    one slot above him is priced off a different, much kinder cohort.
```

### MY FIRST VERSION OF THIS FIX WAS ITSELF A LIE, AND ITS OWN TEST CAUGHT IT

The first helper named the cohort from `pos_rank`. **That is wrong for the nine
E1 players**, whose dispersion was priced against the rank the *build* ranked
them at, not the rank the board *publishes*. It would have told Cory that Jordan
Mason's floor came from `RB 17-32`; it came from `RB 33+`. **A second false label,
pinned by a passing test** — exactly the class this lane exists to catch.

The shipped version **recovers the cohort from the ratio the player actually
carries**, matched against the modal ratio of each band on the live board. No
calibration file is needed in the browser, and a disagreement between the cohort
he was priced off and the band his rank implies **is E1, now visible at the point
of use** rather than only in a register file that is not on `main`:

```
Projection 236 (floor 115, ceiling 311)   [WR8 Justin Jefferson]
  ^ floor/ceiling are the WR 9-16 COHORT's measured
    p10/p90 (2023-25) x this projection — NOT a forecast for this player.
    Every WR in that band carries the same multiple.
    !! He is published WR8, which is the 4-8 band — so his
       floor and ceiling were priced off a DIFFERENT cohort than his rank.
       Known defect (register E1); affects the spread, not his ranking.
```

**Independent cross-check that matters:** the browser-side detector uses only
board data and no calibration file, and recovers **exactly the nine** players my
Python measurement found against the calibration — no more, no less.

**A second real defect fell out of the same test:** the cohort cache was keyed on
a bare "have I computed this" flag, so it **survived a re-sync replacing
`state.board`** and would have gone on answering with the previous board's
ratios. Now keyed on the board reference.

## THE GUARD — `draft/tests/floor_is_a_cohort_not_a_forecast.test.js`, 12 checks

Including three that are not decoration:

- **KNOWN-POSITIVE on the live artifact:** the board must actually *contain*
  adjacent-rank floor cliffs. If it stops containing them, this test must be
  re-read, not silently kept.
- **BOTH branches exercised:** of the four cliffs on the board, two are the band
  step (Love QB17, Washington TE33) and two are E1 misreads (Mason RB31, Pierce
  WR32) — so neither branch is dead code. *My first version of this check
  asserted every cliff sits on a band edge; it went red and was right to.*
- **FAIL ARM:** with the `dispersionCaveat` call removed, the wiring check must go
  red.

`pos_rank`, `proj_floor_source` and `proj_ceiling_source` are all in
`freeze_pre_draft.PLAYER_FIELDS`, so the 2027 replay is unaffected — checked
first, having broken it once with `cellStamp`.

**88 of 88** JS suites touching `app.js`, dispersion or the freeze pass,
including `freeze_replay_fidelity`, `engine.test`, `warroom_mobile` and the six
`ui_fidelity_*`.

### ASK / EVIDENCE / REC / DEFAULT → **A** (owns the calibration)

```
ASK:      Should the dispersion cell be a STEP over rank bands, or interpolated
          between band centres?
EVIDENCE: QB16 Jaxson Dart floor 87.29 vs QB17 Jordan Love floor 2.45 -- 35.6x
          across a 6.0-point projection gap, both in their CORRECT cell. p10
          ratios span 78.5x band-to-band at QB, 37.2x at RB. Same edge gives
          WR31 68.43 vs WR32 8.23 and TE32 11.61 vs TE33 2.11.
REC:      The label fix has SHIPPED and is the whole of what I am willing to do
          pre-draft -- it changes no number. On the underlying question I lean
          interpolate, because nothing in football makes QB17 discontinuous
          with QB16, but the calibration is measured per band and interpolating
          between measured cells is a modelling decision, not a red-team one.
DEFAULT:  Do nothing before 08-22. This changes the SPREAD, not the ranking, and
          the composite's ceiling weight is 0.0 -- so no recommendation moves
          today. Post-draft item.
```

Rule 3d, answered:
1. **Did the input vary?** Yes — `p10_ratio` differs per cell and is measured on
   real 2023-25 outcomes; the cliff is the *intended* application of it.
2. **Did it arrive?** Yes — `proj_floor` reaches `showWhy` and is rendered. What
   did not arrive was any statement of *what it is*.
3. **Could the check have fired?** Yes — the caveat distinguishes three states
   (measured cohort / Gaussian / E1 mismatch) and all three occur on the live
   board, with the E1 branch firing on exactly 9 rows.

## WHAT THIS SWEEP DOES **NOT** COVER

1. **It does not say the calibration is wrong.** The p10 for QB|17-32 really is
   0.0076 as measured. The finding is that a band average is displayed as a
   player forecast, not that the average is miscomputed.
2. **`consensus_rank` is measured here and is NOT degenerate** (cv 0.249) — but
   whether its *name* is truthful is registers 21/21b, which are B's and A's, and
   this sweep does not settle them.
3. **One board.** Every figure is the published 682-row board.

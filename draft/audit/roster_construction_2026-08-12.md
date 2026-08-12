# Do twelve individually good picks build a startable lineup?

**Draft-critical validation, asked by Cory 2026-08-12.** Run with the existing
seat-simulation harness on the current production draft logic —
`draft/tools/roster_construction.js`, 120 rooms, seat 8, MEASURED_WEIGHTS,
bench-branch fix in place.

---

## FIRST — THE ROSTER REQUIREMENTS, AND THE CORRECTION WAS WRONG

Confirmed against `draft/data/sleeper_league_settings.json`, as instructed:

```
roster_positions: QB, RB, RB, WR, WR, TE, FLEX, K, DEF + 6 x BN   (15)
```

**The league starts TWO receivers, not three.** The brief corrected an earlier
note to say three and asked that the validation confirm against Sleeper rather
than inherit the error — the correction is the thing that was wrong, and the
original list was right.

With Chase (WR), Henry (RB) and Walker (RB) kept, the open starting slots are:

**QB · WR2 · TE · FLEX · K · DEF — six, not seven.**

FLEX is RB/WR/TE, so a third running back is fully startable and is never
counted as redundant depth anywhere in this run.

---

## THE HEADLINE: LEGAL EVERY TIME, STRUCTURALLY WRONG MOST TIMES

**Slot filling is clean.** Across 120 rooms:

| slot | unfilled |
|---|---|
| QB, RB, WR, TE, FLEX, K, DEF | **0/120 — 0.0%** |

No room ended with an unfilled starting slot. No near miss: no slot was still
open at my last pick with three or fewer viable players behind it. Thin fills
(a starter below his position's replacement level) occurred at WR in 4/120 =
3.3%.

**On the question as asked — can the sequence construct a legal, usable starting
roster — the answer is YES, cleanly, across every room tested.**

**BUT THE SHAPE IS WRONG, AND THAT IS THE FINDING.**

```
MODAL  QB3 RB1 WR3 TE3 K1 DEF1      55/120   45.8%
       QB3 RB1 WR1 TE5 K1 DEF1      18/120   15.0%
       QB3 RB1 WR2 TE4 K1 DEF1      17/120   14.2%
       QB2 RB1 WR3 TE4 K1 DEF1      14/120   11.7%
       QB4 RB1 WR2 TE3 K1 DEF1       6/120    5.0%
```

**The modal draft spends six of twelve picks on quarterback and tight end — two
positions that start one each — and takes 0.9 running backs.** Two rooms drafted
**zero** running backs.

This is exactly the category Cory named: *technically filled but structurally
poor*. A slot-count check passes all 120 rosters. Every individual pick was
locally defensible. The composite is a roster with three quarterbacks, three
tight ends, and Henry + Walker + one as the entire running-back room.

---

## IT IS NOT CAUSED BY TODAY'S FIX

Measured across three arms, same seeds, 15 rooms — mean picks per position:

| arm | QB | RB | WR | TE | K | DEF |
|---|---|---|---|---|---|---|
| **MEASURED + floors (ships today)** | **3.0** | 0.9 | 2.5 | **3.6** | 1.0 | 1.0 |
| MEASURED, floors removed (pre-fix) | **4.7** | 0.9 | 2.3 | 2.1 | 1.0 | 1.0 |
| DEFAULT_WEIGHTS | **3.7** | 0.8 | 3.2 | 2.3 | 1.0 | 1.0 |

**The bench-branch fix REDUCED quarterbacks from 4.7 to 3.0** and raised tight
ends from 2.1 to 3.6. Net onesie spend is roughly unchanged at ~6.6 of 12 picks.

**And RB sits at 0.8–0.9 in every arm**, including DEFAULT. So this is not a
consequence of the weight vector and not a consequence of the fix — **it is a
property of the scorer that predates both**, and today's change moved it sideways
rather than causing it or curing it.

---

## THE MECHANISM, AND IT IS A UNITS PROBLEM

The bench branch now ranks on `upsideBonus`, which is
`(proj_ceiling − proj_mean) × 0.15 × gate`, capped at 20. **That spread is in raw
season points and is NOT position-normalised.** Measured on the live board, the
90th-percentile spread by position:

| pos | p90 spread |
|---|---|
| **QB** | **66.5** |
| RB | 44.9 |
| DEF | 41.7 |
| WR | 34.7 |
| TE | 30.8 |
| K | 28.1 |

A quarterback scores 350–400 season points, so his ceiling-minus-mean is the
largest absolute number on the board almost by construction. **A ceiling-anchored
bench branch therefore prefers quarterbacks structurally, not because they are
better bench picks.** It is the same class of defect `upsideBonus` was written to
fix — a variance measure entering a points-over-replacement sum at face value —
surviving one level down, in the branch where nothing else competes with it.

The onesie discount does fire (it is why QB fell from 4.7 to 3.0), but it is
multiplicative on a small number: a tenth of a positive score is still positive
when every alternative sits near zero.

**TE at 3.6 is not explained by this table** — TE has the *smallest* skill-position
spread. That part is undiagnosed and I am not going to guess at it.

---

## WHAT I AM NOT CLAIMING

- **Not that the roster is unusable.** Every lineup is legal and fills from the
  drafted 12 in all 120 rooms.
- **Not that this is a completion-path failure.** The distinction Cory drew is
  the right one and this is on the other side of it: deferring QB and DEF is the
  measured rule, and nothing here is a dead end.
- **Not that RB 0.9 is wrong on its own.** With two backs kept, RB2 is filled and
  the FLEX is genuinely position-agnostic. The exposure is an injury argument,
  not a legality one, and it is a judgement about risk rather than a defect.
- **Not measured on the real board geometry.** The artifact carries three
  keepers, all mine; the live board loses ~30 elite players when the slate
  confirms. The `--thin` arm exists in the tool for that and has not been run at
  volume.

---

## RECOMMENDATION

**This is a DECISION, not a defect to fix quietly ten days out.** The shape is
pre-existing, present under DEFAULT as well, and any change to it moves the
composite on every mid-round pick — which re-opens the frozen baseline again.

Three options, costed the way the bench-branch options were:

1. **Normalise the ceiling term by position** (divide the spread by the
   position's median, or express it in replacement-relative units). ~2h code,
   ~2h baseline re-freeze. Re-opens: the ceiling arithmetic Cory decided on
   2026-08-10, again. **Most correct, and it is the same units argument that
   produced `CEILING_SPREAD_SHARE` in the first place.**
2. **Cap onesie duplicates structurally** — refuse a third QB or third TE in the
   bench branch outright rather than discounting it. ~1h code, ~2h re-freeze.
   Re-opens nothing measured; it is a roster-legality rule, not a valuation one.
   Blunt, and it would not fix the underlying units problem.
3. **Do nothing before the 22nd** and carry it as a known shape, using the
   override path on draft night when the board offers a third quarterback.
   Zero hours. The cost is roughly two picks of a twelve-pick draft.

**My recommendation is (2) before the draft and (1) after it.** (2) is cheap,
re-opens nothing, and removes the visible failure; (1) is the real fix and
deserves a baseline cycle it cannot have this week.

---

## AS AN ANNUAL GATE

Per the follow-up instruction, this becomes a gate rather than a report, fired on
the keeper-slate confirmation rather than the Annual — the slate confirms in
August and the Annual runs in January, and the answer is needed at the former.
The gate condition is a **systematically unfilled slot with no credible
completion path**, which is a stricter bar than the shape finding above: on
today's numbers this run PASSES the gate and still produces a finding, which is
the correct behaviour for a gate that is not supposed to block on a judgement
call.

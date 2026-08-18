# E's twenty-sixth sweep — I was measuring a two-day-old board, and it hid a top-three driver

**Session E (red team), 2026-08-18.** Before another sweep I asked the question
that outranks them: **does any of this reach the board Cory drafts from?**

---

## FIRST, THE GOOD NEWS, WHICH CORRECTS AN ASSUMPTION OF MINE

**A has been merging.** Eleven of my fifteen session commits are on `main`
(E16–E23); only the last four were outstanding. My working assumption — carried
from earlier in the session — that nothing had been merged was **out of date**.

**And A answered E17's artifact question in the direction I recommended.**
`kept_players` on the fresh board now carry `vorp`, matching the board formula
exactly (Chase 94.0, Henry 59.1, Walker 46.2). My UI derivation no-ops when the
field is present, exactly as filed.

## THEN THE DEFECT, AND IT IS MINE

| | my branch | `main` |
|---|---|---|
| board `built_at` | **2026-08-16T14:10:12Z** | **2026-08-18T11:20:33Z** |
| players | **682** | **696** |
| `MEASURED_WEIGHTS.ceiling` | **0.0** | **0.45** |

**Every number I published this session was measured against a two-day-old
artifact and a superseded weight vector.** That is the class I have filed all
session — measuring something other than what the user sees — and it is mine.
My branch was **3162 commits behind main**.

**What survives:** the structural findings do not depend on board values —
E17 (the seam), E18 (the bar ranked unvalued rows), E19 (suites on the wrong
weights), E21 (the pick board), E22 (`wire_level` never written), E27 (the strip
was not in `safeRender`). All are about code shape.

**What did not:** every numeric claim. Chase's projection alone moved 295.09 →
256.60.

## WHAT THE STALE BOARD HID — a top-three driver missing from the document

Re-derived on the current board and code:

```
value 50.2%  ·  onesie 24.0%  ·  ceiling 16.4%  ·  stack 8.0%  ·  keeper 1.3%
```

**`ceiling` is the third-largest driver of the recommendation.** The 2026-08-17
ruling put `MEASURED_WEIGHTS.ceiling` at **0.45**; it was 0.0 on my branch, which
is why the term did not exist in any measurement I made.

**A had updated §1's weight sentence and the provenance entry for that ruling.
The SHARE TABLE was not updated** — it listed `value / onesie / stack / keeper`
while the composite moved on five terms.

**That is the failure §1 opens with, repeated:**

> *"`onesie` is a top-three driver of the recommendation and a reader of the old
> sentence would not have known it exists."*

A second top-three driver had become invisible the same way.

### AND MY OWN CHECK IS WHY IT WENT UNCAUGHT

`surface_contract.test.js` asserted `value > onesie > stack > keeper` — **four
names, hardcoded, by me.** A new term at 16.4% could appear without failing
anything, because the check never asked about a term it had not been told to
expect.

**Fixed by changing the question.** It now asserts that **every term above 5% of
movement is listed as a row in the document's table**, which fails on an unlisted
term rather than on a re-ordering of names chosen in advance. **Fail arm proven:**
deleting the `ceiling` row turns it red and names `ceiling`.

## MY E23 DATED CONDITION FIRED, AND I DID NOT NOTICE IT FIRING

Two sweeps ago I filed, verbatim:

> *"If the ceiling weight ever ships non-zero, the 22 suites omitting
> `ceilingAllStages` become a real gap that day."*

**It shipped non-zero the day before I wrote that**, and I could not see it
because I was on a stale branch. The condition was right; the tripwire had
already been crossed. `ceilingAllStages` moves **551 of 630 scores** at a
non-zero ceiling weight.

## E1 IS LARGER THAN ITS ROW STATES

Re-run on the fresh board: **14 misreads, not 9** — and now well inside the range
Cory drafts:

| overall | player | board band | applied band |
|---|---|---|---|
| **8** | James Cook | 4-8 | **1-3** |
| **24** | Chris Olave | 9-16 | 17-32 |
| **30** | Mike Evans | 9-16 | 17-32 |
| **32** | Malik Nabers | 9-16 | 17-32 |
| **43** | Jameson Williams | 17-32 | 9-16 |
| **52** | D'Andre Swift | 9-16 | **1-3** |

**And E1's row says "Blast radius: dispersion fields only — order does not
move." That claim rested on the ceiling weight being 0.0.** Measured at 0.45,
with cells corrected against as-shipped:

- **top recommendation: unchanged at 0 of 12 picks**
- **20 of 120 name slots move**

**So the claim is now partially false, and bounded.** The pick Cory takes does
not change; a sixth of the column under it does. I am stating both halves
because "order does not move" is what A has been ruling against.

## WHAT THIS SWEEP DOES **NOT** COVER

1. **I did not re-verify every earlier numeric claim** on the fresh board — only
   the term table, E1, and the keeper-vorp question. E16's floor cliffs, E20's
   Kelce/Kittle case and E26's lock-shift numbers were measured on the stale
   board and are **unverified on the current one**.
2. **The 5% materiality bar in the new check is a choice**, not a measurement.
   It is above `keeper` (1.3%) and below `stack` (8.0%) on today's board.
3. **One board, again** — but this time the one Cory drafts from.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      None on the code. Two things to know.
EVIDENCE: §1's share table omitted `ceiling` at 16.4% of movement; the check
          that should have caught it used a hardcoded list of four names,
          which was mine. E1 is 14 misreads on the fresh board, not 9, and
          its "order does not move" is now 20 of 120 name slots.
REC:      E1's row needs its blast-radius line updated whoever rules on it --
          it is quoted in the ruling and it is no longer accurate at ceiling
          0.45. I have not edited E1's row text beyond this audit, because
          the ruling is yours and rewriting the argument under it is not
          mine to do.
DEFAULT:  The table and the check are fixed. Nothing else changed.
```

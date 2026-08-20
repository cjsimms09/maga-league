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


---

# ADDENDUM, same day — TWO OF MY FILINGS WERE WRONG, AND A HAD ALREADY RULED

Re-running the three findings I had flagged as unverified turned up two errors of
my own. Both are withdrawn here rather than quietly dropped.

## 1. E29 IS WITHDRAWN — A closed E1 hours before I filed against it

**A's ruling (`projections.py:306`, 2026-08-18):** the calibration was fitted on
historical seasons where **nobody is withheld**, so its `WR 4-8` cell measures the
world's WR4-8 — and the **full-universe** rank (keepers counted) is the one that
reads the right cell. The published `pos_rank` answers a different question,
availability, and may legitimately differ at band boundaries for exactly as many
slots as keepers sit above. **Full-universe ranking is also invariant to keeper
withholding.**

**So the "misreads" are the ruled-correct reads.** My count of 14 measures the
gap between availability rank and full-universe rank — expected, not a defect.

**How I got it wrong:** I re-measured on main's fresh board but did not re-read
E1's row after merging main, so I filed against a closure I had just pulled in.

**One piece survives with its sign flipped:** my measurement that correcting the
cells to published rank moves **20 of 120 name slots** is now evidence **for**
A's rejection — it quantifies what the rejected fix would have disturbed.

## 2. E26'S MECHANISM 1 IS WITHDRAWN — the same ruling kills it

I filed that **46 players change calibration cell at lock**. They do not. The
cell is read from the full-universe rank, which already counts the withheld
keepers, so it **does not move at lock**. I inherited that claim from E1's
pre-ruling audit and repeated it without re-deriving it.

**Mechanism 2 stands and is independent of the ruling:** `liveIndexOf` counts
non-keeper rows in `pick_order`, which genuinely gains ~8 keeper slots at lock,
dropping every one of Cory's picks by 8 live selections. **So the board moves
ONCE at lock, on the survival scale — not twice.**

## 3. E30 — MY OWN CAVEAT WAS LYING ON THE LIVE BOARD

The 08-17 volatility wiring added a **third** dispersion source. Today's board:

| source | rows | what it is |
|---|---|---|
| `measured-2023-25-p90-x-player-cv` | **268** | cell ratio × **this player's own** cv |
| `measured-2023-25-p90` | **267** | cohort constant |
| `gaussian_z` | 161 | Gaussian |

Both measured forms begin with `measured-`, and my `dispersionCaveat` tested
exactly that prefix — so it told the reader *"Every &lt;POS&gt; in that band
carries the same multiple"* for **all 535**. **False for 268 of them, and false
in the direction that matters:** it tells Cory to discount a figure that IS about
this player.

**The whole point of that caveat is that a label must say what the number is. It
stopped doing so the moment the number changed under it** — this lane's own
failure mode, in my own shipped code, because I shipped it against a board where
the third source did not exist and then measured on a stale branch for two days.

**And my first fix was wrong too.** It returned early for per-player rows, which
dropped the **full-universe repricing note A had added after ruling E1** — 268
rows lost it. Replacing one false label with a missing one. **This file's own
repricing checks went red and caught it**, and the shipped version keeps both
facts, because *which construction produced the number* and *which population
picked the band* are independent.

## WHAT THE THREE UNVERIFIED FINDINGS ACTUALLY DID ON THE FRESH BOARD

- **E16 (floor cliffs): reproduces, slightly worse — 5 cliffs, not 4.** Jordan
  Love QB17 floor **2.34** against Jaxson Dart QB16 at **81.23**, a 34.7× drop on
  a 6.0-point gap. New: DK Metcalf WR32 4.70 vs Marvin Harrison 64.85.
- **E20 / E26 numbers: not re-run.** Still outstanding and still stated as such.

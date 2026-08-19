# E's twenty-fourth sweep — what actually moves at keeper lock, now that lock is 08-21

**Session E (red team), 2026-08-18.** Motivated by E25: Cory corrected the lock
date to **8/21**, which leaves **one day** between lock and draft. That makes
"what changes at lock" a draft-week question rather than a housekeeping one.

---

## THE SETUP, AND IT IS DELIBERATE RATHER THAN BROKEN

The board models **3 keeper slots** — Cory's own, rounds 1-3 at seat 8.
`keeper_slate` reports **8 further keepers across 3 teams withheld**, with a
stated reason:

> *"designations exist but the slate is not confirmed; applying a partial slate
> would make the board look authoritative and move once BEFORE the move that
> matters."*

**That is a considered decision and I am not filing against it.** The question is
what the deferred move costs, and until now nobody had put a number on the
*pick-scale* half of it.

## THE MECHANISM — E21's conversion, at lock scale

`survival.js:liveIndexOf` converts a board slot to a **live selection index** by
counting non-keeper rows at or below it. E21 measured this at today's scale:
3 keeper slots, so pick 33 → live selection 30, and that 3-slot difference alone
moved **48 of 650 survival numbers by up to 12.5pp**.

At lock the count grows:

| scenario | keeper slots | pick 33 → | pick 148 → |
|---|---|---|---|
| **today** | 3 | **30** | 145 |
| **at lock, the 8 designated apply** | 11 | **22** | 137 |
| all 17 predicted | 17 | **16** | 131 |

**A shift of 8 live selections at every one of his twelve picks** — nearly three
times the shift E21 already showed to be material.

### THE RESULT IS EXACT, NOT APPROXIMATE, AND THE REASON IS WORTH STATING

I placed the 8 extra slots synthetically, which would normally make this
directional. It does not here: **every keeper slot lies in rounds 1-3 (overall
≤ 30) and every one of Cory's picks is ≥ 33**, so the count below each of his
picks is the *total* count regardless of which seats the keepers belong to.
`liveIndexOf` depends only on that count. **Placement-independent.**

## WHAT IT MOVES — measured, with the pool held constant

Same player pool, **only** the pick board changed, so this isolates the scale
effect from the pool effect:

| | |
|---|---|
| top recommendation differs | **0 of 12 picks** |
| top-10 name slots that move | **44 of 120** |
| survival numbers shifting >1pp | **18-40 per pick** |

**The pick does not change. The board beneath it does — a third of the visible
list reorders.** I am stating it that way round because the headline that
matters to a drafter is that his top recommendation is stable, and the honest
qualifier is that the rest of the column he reads while deciding is not.

## THIS IS THE SECOND INDEPENDENT MECHANISM FIRING ON THE SAME DAY

E1 already measured the **pool** half: when the other teams' keepers leave the
board, **46 players change calibration cell, 37 inside the top 150**, and since
`proj_ceiling` is `proj_mean × a per-cell constant`, cell membership *is* the
dispersion figure — so all 46 get a different floor and ceiling.

So on **08-21, one day before the draft**, the board changes in two unrelated
ways at once:

1. **Pool** — 46 players change calibration cell (E1, already filed, awaiting A).
2. **Scale** — every pick's live-selection index drops by 8, moving 44 of 120
   name slots (this sweep).

**Neither is a defect on its own.** Together they mean the board Cory rehearses
on this week is not the board he drafts from, and the gap between them is now
one day rather than the two my own earlier notes assumed.

## FLAGS THAT DIED THIS SWEEP — three, and one was my own error

1. **`slot_to_roster_id` is `{}`** — looked like a broken seat map. It is not:
   `test_seat_map.py` documents that Sleeper serves it empty for 2023, 2024 and
   2025, `app.js:6505` uses `draft_order` as the primary path and this only as a
   secondary, and there is already a test that fires if Sleeper starts serving
   it. **Handled and tested.**
2. **"`pick_order` rows carry only one distinct `team_slot`"** — **my grep used
   the wrong key.** The rows carry `slot`, and it is populated 1-10 correctly.
   My error, not the board's.
3. **Cory's twelve pick numbers** — verified from first principles rather than
   trusted: 10-team snake, seat 8, 15 rounds, 3 keepers forfeiting rounds 1-3.
   Computed `33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148`. **All twelve
   match the artifact**, and `my_picks_before_keepers` correctly carries the
   extra three (8, 13, 28).

## WHAT THIS SWEEP DOES **NOT** COVER

1. **It isolates the scale effect.** The real lock moves pool and scale together,
   and I did not measure the combination — E1 owns the pool half and its fix is
   still unapplied, so a combined figure would be measuring a state nobody has
   ruled on.
2. **8 designated, not 17 predicted.** I used the count `keeper_slate` reports as
   designated. Six teams are still undesignated; if they all keep three, the
   shift is 14 rather than 8 and everything above gets larger, not smaller.
3. **One board, one roster.**

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      None new. This is a magnitude for a decision you already hold.
EVIDENCE: At lock the live-selection index drops by 8 at every one of Cory's
          picks (exactly, not approximately -- all keeper slots are in rounds
          1-3 and all his picks are >= 33). Same pool, 44 of 120 name slots
          move and 18-40 survival numbers shift >1pp per pick; the top
          recommendation holds at all 12.
REC:      E1's ruling gets more urgent, not less. Both mechanisms fire on
          08-21 and the draft is 08-22, so the re-check window E1's row
          anticipates is ONE day. If E1 is going to be fixed at all, it wants
          to be fixed before lock rather than after it.
DEFAULT:  Nothing changes here. No code was touched by this sweep.
```

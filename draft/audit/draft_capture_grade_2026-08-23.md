# THE DRAFT IS CAPTURED — and the grade it was built for cannot run yet

Cory, 2026-08-23: *"Draft over and done! Continue."*

## What landed

The scheduled job fired on its own at **22:57:22Z** (cron `45 22 22 8 *`), completed
clean, and committed **150 pick rows + 150 shadow rows**. Every row carries
`freeze_sha256`, so the board state each recommendation was computed from is
reproducible. All twelve of Cory's picks are present.

**Final roster (15):** QB C.Williams · RB Henry, Walker, Judkins, E.Johnson,
Charbonnet, R.White · WR Chase, Rice, Adams, Odunze, P.Washington, Sutton ·
TE Gadsden · DEF HOU. Kicker added post-draft by Cory.

## THE GRADE CANNOT RUN YET, AND THE LOG SAYS SO ITSELF

`new_path_recommendation` is **null on every row**, with an honest reason
recorded in the row: *"Step 5 VORP-space path not landed at capture time. The
freeze carries proj_mean, replacement, adp and adp_sd, so this is computable
later and scorable OUT OF SAMPLE against these rows."*

So the before/after comparison the capture exists for has a **before** and no
**after**. That is a known, stated gap — not a failure of the capture.

## ⚠️ AND THE "BEFORE" IS A KNOWN-BAD BASELINE, WHICH I MISREAD TWICE

`old_path_recommendation` is a raw-VORP ranking. Graded against it, Cory
matched its #1 at **1 of 12** picks and took someone in its top 3 at **3 of 12**.

**That number means almost nothing, and I nearly reported it as if it did.**

1. **First reading — "the tool recommended a DEFENCE at nine of twelve picks".**
   True as stated, and I was about to file it as a headline defect.
2. **Correction — "it is a 0.07 VORP tie, not a blunder".** I checked the gap at
   pick 48, found 0.07, and over-corrected into calling the whole thing a tie
   artifact. **That was wrong too.**
3. **The distribution, which I should have looked at first (rule 3i):**

   | pick | #1 → #2 gap |
   |---|---|
   | 48, 53 | 0.07 — genuine tie |
   | 68 | 8.33 |
   | 73 | 10.02 |
   | 88, 93 | 14.00, and #2 is also a DEF |
   | 113, 128, 133 | 0.00 — the whole top of the list is DEFs |

   Five of twelve are sub-1.0 ties; the rest are not. Both my earlier readings
   were partly right and stated as if whole.

**The actual cause, measured from the rows:** implied replacement at pick 88 is
DEF 103.0 and K 97.0, so the Rams defence at proj 132 scores **+29 VORP** while
the best available receiver scores under +15. The arithmetic is consistent —
and it is the wrong metric. A +29 defence is **replaceable off waivers for
nothing**; a +29 receiver is not. That is the cross-position comparability
defect the project already established (register 196/207 class), and it is
exactly why the live board uses VONA and surplus-over-wire instead.

**CRITICALLY: this is NOT what Cory saw.** The war room's THE PICK showed
top-VONA on his selected source, and the position boards were VONA-ranked.
`old_path_recommendation` is computed independently by the logger, and its name
says what it is. Grading his draft against it would be grading him against a
list he never looked at.

## TWO REAL CAPTURE DEFECTS, for next year

1. **`is_mine` is `false` on all 150 rows**, including Cory's own fifteen. The
   field exists to identify his picks and never fires; `team_slot == 8` is what
   actually works. Any consumer filtering on `is_mine` gets an empty set — a
   silent zero, the shape this project keeps paying for.
2. **`my_actual_pick` and `my_deviation_reason` are null on every row.** They
   were meant to record what he did against the recommendation and why. They
   needed live input during the draft that never happened, so the "why" behind
   twelve decisions is gone and cannot be recovered.

## What IS gradeable now, and what waits

- **Now:** roster shape against the top-3-finisher target; pick-by-pick
  availability against the freeze; whether his deviations were free (man still
  there next pick) or costly.
- **Waits for the season:** anything about outcomes. No points have been scored.

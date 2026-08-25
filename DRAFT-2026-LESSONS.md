# DRAFT 2026 — WHAT WE LEARNED (read this before you draft in 2027)

**Cory, 2026-08-24:** *"We need something that states everything we've learned
during this draft so we can re read it next year and not make same mistakes."*
This is that document. Every claim below is MEASURED — the number and its source
ride with it. The enforceable build plan is `DRAFT-2027-PROGRAM.md` (§7 is the
readiness ledger with owners and dates); this file is the memory.

---

## PART 1 · STRATEGY — what the numbers actually said

1. **You cannot out-pick your own room, so stop trying.** The league's draft
   order — no model, just ten people — captured **82–87% of perfect-hindsight
   value at every position**. Perfect foresight was worth only **14.2
   points/team/week** over what the room already does. Vegas props, our model,
   and last-year's points ALL lost to the room's collective judgment.
   (`empirical_draft_value_2026-08-16.md`.) **2027's edge is calibration,
   shape, keepers, and room knowledge — not cleverness.**

2. **Rounds 1–6 are the draft. Rounds 7–15 are statistically interchangeable**
   (no round's confidence interval excludes any other's, three years running).
   Stop sweating round-9-vs-round-11; spend the prep on the first six.

3. **Late RB/WR picks are worse than free.** Twelve of sixteen below-replacement
   (round, position) cells are RB/WR in rounds 8–15; round-15 RB is **−142
   points below replacement**. The wire supplies these players for nothing.
   **TE is the only position where a late pick is not a measured loss.**

4. **The two loudest pieces of standard advice are noise in this format.**
   "Take RBs early": rounds 1–6 RB-vs-WR difference has a CI of [−36, +66] and
   the sign flips by year. "Pay up for a QB": +46.6 with CI [−47, +141].
   Neither is knowledge. Don't let either drive a pick.

5. **Conversion beats acquisition — this is the headline.** The engine's replay
   ACQUIRED MORE POINTS than the real owners (+2.1%/+5.1% in 2023/2025) and
   still finished 8th of 10, because the value never reached starting slots
   (conversion 0.74–0.77 vs owners' 0.83). The league leaves **15.9 points on
   benches every week** — vs a TOTAL draft prize of 14.2. **A worse draft that
   fields its points beats a better draft that benches them, every time.**

6. **Roster shape must be priced DURING the draft, not patched after.** The
   `need` term shipped at weight 0 — nothing penalized a pileup — and the
   replay's worst seat drafted SEVEN quarterbacks; the live board wanted RB7
   with a one-TE-in-30-of-30 degeneracy. The five roster-aware terms (need,
   flex rule, empty-slot insurance, slot-aware VONA, wire bench rule) were all
   BUILT and all disconnected. **A term at weight zero is a term that does not
   exist.** (Register 60; P344 sets the 2027 weights from this season's data.)

7. **Ceiling is a bench instrument.** The reference implementation
   (ffanalytics) emits floor/ceiling as SEPARATE rankings and never adds
   ceiling into value; we shipped `+0.45 × ceiling` on every player at every
   pick. Cory's "why are we adding ceiling to everyone" was the textbook's
   position. Starters want the low-uncertainty side; upside is for benches.

8. **FantasyPros anchors this room — graded, not assumed.** P102 (graded
   08-24 on the real 127 picks): FP mean |pick − ADP| 15.85 vs FFC 16.28, FP
   closer on 71/125 players, full coverage. The "FFC is our exact format"
   thesis did NOT show up in the room's actual behavior.

9. **The keeper choice was our highest-stakes decision and had zero
   instruments on it.** Nothing scored keeping Chase/Henry/Walker against
   alternatives. The grader now exists (register 289); 2027 keepers get chosen
   from a season of priced evidence, not an August hunch.

## PART 2 · THE NIGHT — operational mistakes we already paid for

10. **The record of the night nearly didn't exist, twice.** The pick-log sync
    couldn't commit a file it had never created (untracked-file blindness),
    and the shadow logger graded from a freeze taken FIVE DAYS earlier,
    sorting on a field the shipped board didn't rank by. **Every capture
    pipeline gets an end-to-end control that proves a real row lands, run
    BEFORE the night — and points at the live board, verified same day.**

11. **We never captured WHY.** Cory overrode the tool on 11 of his 12 picks
    and not one reason was recorded — the schema had the field, nothing wrote
    it. Those reasons are unbackfillable. **2027's war room asks WHY at write
    time, one tap** (readiness ledger item 7, due before 2027 mocks).

12. **The keeper-lock rebuild is a hazardous operation with its own physics.**
    Removing 23 keepers without reducing `starter_counts` walked replacement
    12–9 ranks deep and inflated every RB +29.6 / WR +23.7 VORP vs TE —
    cross-position, feeding the RB pileup. A same-mechanism check three days
    earlier was ruled immaterial *at three keepers* and nobody attached an
    expiry to the condition that made it small. (Register 283.) **The 2027
    lock rebuild runs a counts-vs-pool test in CI, and no "immaterial" ruling
    ships without its expiry condition.**

13. **What you rehearse works; what you don't, breaks.** Mock drills caught
    the capture-gap classes before the draft. The one path never rehearsed —
    invoking a scheduled function over HTTP — failed in production the first
    time it was tried (they're not invocable; found by our own probe, after
    an untested "manually invocable" comment sat in the repo for weeks).
    **A thing that has never fired has not been tested, only scheduled.**

14. **Post-draft, the tools must stand down gracefully.** The war-room's
    stale-board lock froze its own toolbar including the EXIT; the preseason
    bet-lock produced the same wrong sentence from THREE independent
    mechanisms, each fixed one at a time. **Gates never block navigation, and
    fixing a symptom is not fixing the class — enumerate the mechanism's
    consumers before declaring it closed.**

## PART 3 · HOW WE FOOLED OURSELVES — the process failures with names

15. **Stale artifacts impersonate findings.** "The board takes RB10" ran for
    hours in three documents — it came from an eighteen-pick artifact
    including picks Cory doesn't own. "The blend is thinnest at TE" — 85 of
    those 86 players were outside the draftable range. **Look at the
    distribution behind a number, and check the artifact's freshness, before
    writing it anywhere** (rule 3i — every one of these checks took under
    ten seconds).

16. **Wrong premises cost more than wrong answers.** Five of six premises
    handed to one lane were false — sentences nobody had checked against the
    code; one false claim lived in three files at once. Nine ad-hoc probes
    returned confident wrong answers in a single evening; the ones caught
    were caught by running a known-answer control FIRST (rule 3f). **Verify
    the premise before working the row; run the control before writing the
    answer.**

17. **Standing dates rot; corrections must chase every copy.** "Parked until
    post-draft" became a lot nobody emptied until Cory ordered it. A
    correction written into one file left the same wrong claim standing in
    the entry file everyone reads first. **Parks carry release TRIGGERS, not
    dates; a correction isn't done until every copy of the claim is found**
    — the entry-file grep is part of the fix.

18. **The learning loop only counts if it's automatic.** Manual capture meant
    the weeks Cory ignored the tool — the exact weeks worth grading — went
    unrecorded. Everything now logs itself and is probed weekly. **An
    unscored recommendation is where defects live** (the wire told Cory to
    drop Ja'Marr Chase, in production, because nothing graded that output —
    register 277/290). Next August, before trusting ANY tool surface, ask:
    what does it tell you to do, and what grades that instruction?

---

*Filed 2026-08-24 by the relay at Cory's order. The companion build plan with
owners and dates is `DRAFT-2027-PROGRAM.md` §7; the January synthesis (P345,
due 2027-01-15) will append this season's graded verdicts to both.*

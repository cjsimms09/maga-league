# The seat: slot 8 by direct count, 3 by Sleeper's draft_order

## What was applied, and why

**Slot 8.** Cory counted the draft board: **two teams pick before him in round 4.**
Round 4 is a reverse round, so position 3 means slot `11 − 3 = 8`.

It self-checks against our own pick-order derivation without assuming the slot:
rounds 1–3 hold **27** picks (30 minus his three keeper forfeits), then two teams
pick, then him — `27 + 2 + 1 = 30`, which is exactly `my_picks[0]` at slot 8.
The count and the board agree on a number neither was told.

    slot 8, keeping 3 -> first four picks 30, 45, 50, 65

## THE CONFLICT, UNRESOLVED AND LOUD

Sleeper's draft object says **3**, two ways:

    draft_order["434915673219526656"] = 3
    slot_to_roster_id[3]              = roster_id 1   (coryjsimms per our pipeline)

That is not a rounding difference. **Slot 3 and slot 8 are five apart** and give
completely different schedules — first pick 35 vs 30.

**Why the count won.** It is a DIRECT OBSERVATION of the thing that actually
matters — who picks before him — rather than an inference from an integer whose
meaning I encoded from knowledge. And `draft_order` is **PARTIAL**: 4 of 10 users
placed, status `pre_draft`. A half-populated ordering field is not a settled seat.

**Why it is still a conflict.** One of these is wrong, and the losing explanation
matters:

* if `draft_order` is stale or mid-assignment, it will change and should be
  re-read before the 22nd;
* if `slot_to_roster_id[3] = 1` is right and `coryjsimms` is roster 1, then slot 3
  is his and the round-4 count needs re-doing;
* or our `roster_id` mapping is wrong — it comes from `predict_keepers.py`, which
  is OURS, not Sleeper's, and has never been checked against
  `slot_to_roster_id`. At slot 8 he would be roster **7**, not 1.

The third is the one I would look at first, because it is the only one where a
value we produced is standing in for a value Sleeper holds — the exact shape of
every defect found today.

## The check that settles it, before draft day

Re-run `sleeper-league-probe` once the order is fully assigned (10 of 10) and
compare `draft_order` against the count again. If they still disagree, the
roster_id mapping is the suspect, and `/league/{id}/rosters` gives `owner_id` per
`roster_id` directly — no inference required.

**Until then the board runs on 8 and the disagreement is recorded rather than
resolved.** A board silently built on either number while the other is live is
the failure this file exists to prevent.

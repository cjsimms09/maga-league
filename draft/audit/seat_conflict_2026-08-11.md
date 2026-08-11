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

---

# CORRECTION (same day, ~19:00) — the API was right and I was wrong

**The draft order was being reassigned while I was reading it.** Two fetches,
about forty minutes apart:

| | `draft_order[me]` | `slot_to_roster_id` |
|---|---|---|
| 18:20 | 3 | slot 3 → roster 1 |
| 19:00 | **8** | slot 8 → roster 1 |

**Both snapshots are internally consistent.** `draft_order` and
`slot_to_roster_id` agreed with each other *on both occasions*; my roster (1)
genuinely moved from slot 3 to slot 8 between them — almost certainly while the
Draft Settings screen was open, since that screen has a SAVE button.

## What I got wrong, stated plainly

1. **"`draft_order` is NOT the draft position."** It is. It was mid-edit. I
   reached that conclusion by comparing a stale snapshot against a live
   screenshot and treating the disagreement as a property of the field rather
   than as a property of the clock.

2. **"The likeliest suspect is our `roster_id` mapping."** It is not. Sleeper's
   `/league/{id}/rosters` gives my `roster_id` as **1**, and
   `predict_keepers.py` says **1**. They agree. The mapping I named as the
   probable defect was correct the whole time, and I inferred otherwise from
   `slot_to_roster_id[8] = 7` in the STALE object.

The reasoning that produced both was sound in shape — corroborate, name the
branch where a value we produce stands in for one Sleeper holds — and it was
applied to data whose freshness I never questioned. **A snapshot compared
against a live observation is not a disagreement between two sources; it is one
source at two times.**

## What survives, and why the guard is still right

* **The seat is 8** — now confirmed four ways: the count, the UI screenshot,
  `draft_order`, and `slot_to_roster_id`. The board is correct.
* **The guard stands on its own merits.** `draft_order` is still only 4 of 10
  populated, so it still cannot verify a seat — and this episode is the argument
  FOR that rule rather than against it: a field that changes under you is exactly
  one you must not import silently. Had the guard existed at 18:20 it would have
  refused slot 3, which was the right answer for the wrong reason and would
  still have been the right action.
* **No traded picks.** `pick_trading` is enabled but `traded_picks` is empty, so
  the pick order derived from seat + keepers is safe on that axis. Checked
  rather than assumed, and a failed fetch reports UNKNOWN rather than none.

## The lesson worth keeping

Every value I checked today was checked against a source. This one was checked
against a source **I had already read and cached**, and staleness is invisible in
exactly the way a wrong value is: it is well-formed, internally consistent, and
answers the question you asked. Re-fetching cost one workflow run.

# E's adjuster audit — `bye` was hooked up to the wrong severity signal, and it is the exact term register 59 needs

**Session E (red team), 2026-08-19.** Cory, in response to register 59 (the tool
drafts 12 RBs / 2 WRs, un-fieldable in week 11): *"We need [the adjusters] to
not be ornamental! Why don't they work?"* and *"make sure all these adjuster
are hooked up, hookup up to right thing, and adjust as they should based on
circumstance."*

Register 59 already answers "hooked up at all" — all 8 terms are structurally
wired into `scorePlayer()`'s weighted sum; `MEASURED_WEIGHTS` just multiplies
four of them (`tier`, `need`, `risk`, `bye`) by zero, and P110 is already
running a proper preregistered grade on whether `need` should turn on. That
question is not this audit's to relitigate.

This audit's job is the second question Cory asked — **hooked up to the
RIGHT thing** — for the term most directly implicated in register 59's own
scenario: `bye`. Even if the P110-style process turns `w.bye` on, would it
actually have caught Cory's WR2 problem? **No — and this is a real, separate
bug, found and fixed today.**

## The bug

`composite.js`'s `byeCollisionPenalty()` computes `shortAfter` — the number
of starting slots at a position that cannot be covered on a candidate's bye
week — correctly. But the returned `value` (what actually reaches the score)
was scaled by a completely different quantity:

```js
const collisions = sameByeAtPos.length;                      // OLD
const value = drop * posWeight * Math.min(1, collisions / Math.max(1, slots));
```

`collisions` counts roster players who share the candidate's **exact** bye
week. Register 59's scenario has none: Chase (kept, bye 6) and Jayden Reed
(bye 11) never collide, yet together they are exactly `starters.WR` (2) deep
with zero margin — either one's bye alone leaves WR2 empty. **Verified
empirically before the fix**, feeding the real function Cory's real pair:

```
byeCollisionPenalty(Reed, {roster:[Chase], league}) 
  → { value: 0, shortAfter: 1, detail: 'bye week 11' }
```

`shortAfter: 1` — the function KNOWS there's a hole. `value: 0` — the score
never sees it, because `collisions` (0, no other WR shares bye 11) is what
actually multiplies the penalty, not `shortAfter`. The existing test suite's
own comment names this as if it were the intended design: *"Bye: it can only
bite when the roster actually collides on a week"* — nobody had recognized
insufficient-depth-without-collision as a distinct, real risk before now.

## The fix

```js
const severity = Math.max(shortAfter / Math.max(1, needed), collisions / Math.max(1, slots));
const value = drop * posWeight * Math.min(1, severity);
```

Scales on the larger of the two real risk shapes: a pure pile-up (multiple
players sharing one bye) still costs full severity as before, AND a
depth-shortage-with-no-collision (register 59's shape) now scores
proportionally to how short it leaves the position. Re-verified empirically:
the identical Chase/Reed pair now returns `value: 1.878` (with a realistic
`replacement` field; the first empirical check used `replacement ===
proj_mean` by fixture accident, trivially zeroing `drop` — caught and
corrected before concluding anything).

**One more guard added, load-bearing:** the function now refuses to price
ANY bye risk when the roster has zero existing players at that position —
`roster.filter(pos).length === 0` returns `{value: 0, detail: 'no existing
depth at position yet'}` immediately. Without this, the corrected formula
would have penalized drafting the very FIRST player at any empty position
(since `shortAfter` is trivially `needed` when nobody is there yet) — that
question belongs to `need`, not `bye`, and conflating them would have been a
new bug in the act of fixing this one. Verified: a first-ever-WR case stays
at `value: 0` under the fix, matching (for the right reason now, not by
accident) its pre-fix value.

## Testing

3 new tests in `engine.test.js`, added directly beside the existing bye-term
tests: the register-59 depth-gap case (now nonzero, `shortAfter > 0`), the
first-pick-at-position regression guard (stays zero), and a real-depth
control (bye-diverse roster, stays zero). **264/264 `engine.test.js`, 42/42
`update.test.js`**, plus every other composite.js-dependent suite
(`keeper_bar_ignores_what_it_cannot_value`, `keeper_option_floor`,
`keeper_seeded_with_a_value`, `kov_measured_ramp`, `stack_routes`,
`valuation`, `waivers`) green. `archetype_rooms.test.js` shows one
pre-existing, unrelated failure (`the three designated opponent keeper teams
are applied`) — confirmed via `git stash` to fail identically without this
change; not touched here, flagged separately.

## What this does not do

Does not turn `w.bye` on — that stays P110/register 59's call, made properly
through the graded process already in flight. This fix makes the term
correct WHENEVER it is weighted, whether that is today under Auto (which
already ramps `w.bye` to 0.5–1.4 by phase) or later if the flat weights turn
it on. Also does not touch `tier` or `risk` — auditing those next.

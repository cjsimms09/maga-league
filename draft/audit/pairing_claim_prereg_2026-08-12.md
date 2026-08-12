# Preregistration: does pairing actually cancel the room model's blind spot?

**Written BEFORE the numbers, and committed before the run finished, so the read
cannot be chosen to fit the result.** This is the discovery→preregistration→
production discipline applied to a claim of my own rather than to a data source.

---

## THE CLAIM UNDER TEST — MINE, NOT A REVIEWER'S

From `room_model_tails_2026-08-12.md`, written this morning:

> The construction-order results stand. Those arms are compared paired on the
> same seed within the same room model, so a shared blind spot cancels between
> arms — it biases the LEVELS, not the DIFFERENCES. `greedy_end_state` beats the
> composite by the same margin in a room with no tail as it would in one with a
> tail, because both arms face the identical board.

**That last sentence is an ARGUMENT, not a measurement.** I wrote it to defend
the construction-order results against a defect I had just found in the room
model, which is exactly the circumstance under which a defensive argument should
be distrusted. `--room profiled` turns it into a measurement.

## THE INSTRUMENT, AND WHAT IT WOULD SHOW IF THE CLAIM WERE FALSE (rule 13g)

The same five arms, the same seat, the same valuation, the same paired seeds —
only the opponent model swapped from `adp` (elite fall-through in **0 of 40**
drafts) to `profiled` (**40 of 40**). If pairing did NOT cancel the blind spot,
this run would show it as a **changed arm ordering or a changed paired margin**,
because the profiled room puts a class of board state in front of every arm that
the ADP room never produced. A null here is informative only because that
alternative was reachable.

**n = 60, not 200.** Smaller by design — the profiled room is the expensive one.
The paired SE on the shipped-vs-greedy margin at n = 200 was ±1.5, so at n = 60
expect roughly **±2.7**. That is the resolution, and it is stated first so that a
shift inside it is not read as a shift.

## THE THREE OUTCOMES, AND WHAT EACH ONE COSTS ME

**1. ORDERING HOLDS, MARGINS WITHIN ±2.7.** `greedy_end_state` still ≈ +8,
`lookahead_2` still ≈ 0, `need_filter` and `scarcity_per_turn` still well below.
→ The pairing claim is **validated on the one axis that could have broken it**,
and item 11's answer stands as written: do not rewrite the composite; the
tractable lookahead buys nothing. No document changes except to add this result.

**2. MARGINS MOVE BUT THE ORDERING HOLDS.** e.g. greedy's edge grows or shrinks
materially while still winning, lookahead still ≈ 0.
→ The **conclusion** survives and the **claim** does not. "Biases the LEVELS, not
the DIFFERENCES" would be too strong; the honest version becomes *the sign is
robust to the room model and the magnitude is not*. `room_model_tails` gets
corrected, `composite_shape` gets a magnitude caveat, and the 0.4% figure becomes
room-model-dependent — which weakens the "not worth rewriting" argument only if
the number moves UP, and I should say so plainly if it does.

**3. THE ORDERING MOVES.** Any arm changes rank — in particular if `lookahead_2`
beats `shipped` by more than ±2.7 in a room with tails.
→ **I was wrong, and the correction is mine to report, not to soften.** A tail is
precisely where lookahead should pay: the value of holding a slot open is the
chance something elite falls to you, and a room that never produces a
fall-through cannot reward waiting. **If lookahead wins here, my item-11 answer
was an artifact of a room model that had no tail**, `composite_shape_2026-08-12.md`
needs its headline rewritten rather than qualified, and the external review's
prescription is back on the table with a measured case behind it.

**Outcome 3 is the one I consider most likely to be underweighted by me**,
because I have already written two documents whose conclusions depend on it not
happening. Recording that here is the point of writing this first.

## WHAT THIS RUN STILL CANNOT SETTLE

The profiled room **overshoots** — 40/40 fall-throughs, deepest at 130 picks, a
marginal with no memory. So it is not "the real room"; it is the opposite error
from the ADP room. Agreement across BOTH is evidence the ordering does not depend
on the tail; disagreement tells us the ordering is tail-sensitive **without
telling us which room is right**. Settling that needs the trace capture, which is
post-draft and costed at ~1h.

**Silence rule (15) holds:** simulation only, nothing rendered, nothing visible
during a live decision.

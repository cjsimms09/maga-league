<!-- TERRITORY: A -->
# PREREGISTRATION — should `bye` be on? (register 59, P114)

> ## ⛔ NOT GRADEABLE — RESOLVED 2026-08-19, BEFORE ANY GRADE WAS WRITTEN DOWN
>
> **The arm ran and changed nothing.** `--bye 1.0` produced a `seasons` block
> **bit-identical to the shipped arm across all 30 seats** — same rosters, same
> records. It graded at **+0.0 points in 30 of 30**.
>
> Everything about it looked correct, which is the point: the choice file
> differed by 176KB (key ordering only), the read-back weights stamp read
> *"MEASURED_WEIGHTS with bye=1"*, and `weights_values` carried `"bye": 1`.
> **The weight really was applied. The quantity it multiplies is zero.**
>
> `byeCollisionPenalty` (`composite.js:333`) returns 0 unless the roster ALREADY
> holds a same-position player on that same bye week, and bundle boards may
> carry no `bye` at all. **`engine.js:1875` had already recorded the symptom in
> a comment — *"three of the seven sliders (keeper, bye, stack) could not change
> the top five at ANY setting"* — and nobody connected it to this prereg.**
>
> **So every prediction below is unanswerable as written**, and a `+0.0` here
> means "the term never participated", never "the bye weight does not pay".
> Register 69; `draft/tools/arm_participation_check.py` now guards the class in
> CI, because the weights stamp — built after the `--need` incident, where the
> weight was never applied — structurally cannot catch a weight that WAS applied
> to a zero.
>
> **Reopen this prereg only after the input gap is closed** (does the bundle
> carry historical bye weeks at all?). Nothing below is retracted; it is simply
> not yet askable.


**Filed 2026-08-19 by A, BEFORE any arm ran.** Grade-by **2026-08-26** —
deliberately AFTER the draft, unlike P110. See §5.

---

## 1. Why this term and why now

Register 59, measured on the live board at Cory's own fifteen picks: the tool
drafts **RB10 / WR1**, and with his keepers that is **WR 2** against a lineup
starting WR2 — and the only drafted receiver has a **week-11 bye**, so week 11
has an empty WR2 slot.

`bye` ships at weight **0**. It is the term that prices exactly that.

**AND P110 IS THE REASON THIS IS A SEPARATE QUESTION RATHER THAN A FOOTNOTE.**
`need: 1.0` was graded and **PAID** — +68.6 points per seat-season, CI-clear,
3 of 3 seasons. But it made the roster **more** concentrated, not less
(WR share 0.394 → 0.335, RB 0.369 → 0.451). **It earned money and did not fix
the hole it was measured because of.** So the roster-fragility question is still
open, and `bye` is the term aimed at it.

## 2. Why the instrument can see this one

The seat replay's primary estimand is the **hindsight-optimal legal lineup each
week**. "Legal" is doing real work: a bye collision means a slot cannot be
filled, and that costs points in the grade rather than being averaged away.

**This is a materially better fit than P110 had.** There I had to argue in
advance that a null on points shouldn't block the change, because season-total
grading is forgiving of imbalance. Here no such argument is needed: if `bye`
protects anything, the instrument is built to see it. **A null here is therefore
much stronger evidence against the term than P110's null would have been.**

## 3. The comparison

| arm | weights |
|---|---|
| **B0** | `MEASURED_WEIGHTS` as shipped — `bye: 0` |
| **B1** | `MEASURED_WEIGHTS` with `bye: 1.0` |

1.0 is `DEFAULT_WEIGHTS`' own value — the challenger is named by an existing
artifact, not chosen by me. One override at a time: `replay_seats.js` **refuses
with exit 2** if `--need` and `--bye` are both passed, because a combined arm is
a third configuration nobody preregistered.

Everything else held: same bundles, same seats, same keepers, same fixed
opponents, `VONA_INCLUDE_SELF: true` on both.

## 4. Predictions, registered before the run

**P114-a (points).** `mean(B1 − B0)` on the `optimal` estimand, season-clustered.
**I predict a NULL.** Bye collisions are a *lineup-week* problem and the replay
grades **season totals with K/DEF mirrored and skill slots only** — one bad week
out of seventeen is a small fraction of a season total even when it is total.

**P114-b (the mechanism, and the one I expect to move).** B1's rosters will show
**fewer same-bye-week clusters at a position**: the mean count of
(position, bye-week) pairs where a seat holds ≥2 players will fall.

**P114-c (the cost).** B1 will score **worse than B0 on raw projected points at
draft time** — because avoiding a bye means passing a better player. If it does
NOT, `bye` is free, and a free term that also reduces clustering should simply
be on.

## 5. Why this one is NOT dispatched for a pre-draft decision

P110 was graded before the draft because Cory asked for the `need` answer on
that clock. **This is deliberately post-draft**, and stating the reason in
advance so it cannot be revisited on the strength of a result:

- Three engine/weight changes in one day is more than a board should absorb
  three days before a draft, and two are already in front of Cory.
- **B has been asked for the un-fieldable-lineup WARNING instead** — it changes
  no number, needs no grade, and protects against the same failure without
  touching the scorer on draft week.
- If P114 comes back strongly positive, the honest statement is *"we should
  have had this on"*, not *"flip it Friday night"*.

## 6. What this cannot say

- K/DEF are **mirrored** and excluded from skill grading, so bye protection for
  the onesie slots is invisible here — and register 2e (reopened 08-19) means
  their inputs are the least-informed on the board anyway.
- Three seasons is three clusters.
- The replay's rosters are **frozen as drafted**; no waiver pickup ever covers a
  bye. Real seasons have waivers, so this **overstates** the cost of a bye
  collision — which makes a null on P114-a stronger, not weaker.

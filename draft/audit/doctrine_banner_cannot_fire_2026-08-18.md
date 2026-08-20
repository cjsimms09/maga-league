# THE STRATEGY BANNER CANNOT FIRE, AND NO VALUE OF `DG_NOISE_BAND` CHANGES THAT

**Relay, 2026-08-18. Territory: A owns the engine constant and the banner design.
This is a measurement and a recommendation, not a change.**

---

## 1 · WHAT REGISTER 4x ASKED FOR

> **RE-DERIVE `DG_NOISE_BAND` FROM THE CURRENT DOLLAR DISTRIBUTION** … *"at $4
> the QB-run alert cannot fire by $0.24."* Do NOT simply lower it to 3.5 to make
> the test pass — derive it from the gap below which doctrine choice does not
> separate outcomes, on THIS board's scale.

That instruction is careful and it is right about the anti-pattern. **It is also
asking for a fix that cannot work**, and the reason is arithmetic rather than
calibration.

---

## 2 · THE MEASUREMENT, ON THE LIVE BOARD, AT CORY'S REAL PICKS

Twelve picks (33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148 — from
`pick_order.my_picks`), nine doctrines, scored through `doctrine.js`'s own
`scoreBoardDetail()` against the engine's dollar model.

```
leader gap   min 0.000   max 0.000
picks where the gap exceeds DG_NOISE_BAND = 4.0 :  0 of 12
picks where the gap is even NON-ZERO            :  0 of 12
distinct doctrine scores per pick : 2,3,3,2,2,1,1,1,1,1,1,1
```

**The leader gap is exactly zero at every one of Cory's picks.** Not small
against a $4 band — zero. And from pick 88 onward **all nine doctrines produce
one single score**.

---

## 3 · WHY, AND IT IS MECHANICAL

`scoreBoardDetail` scores a doctrine as *the E[$] of the best board player that
doctrine would let me take right now*. A doctrine that does not forbid the
top-of-board player therefore scores **exactly the unconstrained maximum** — the
same number as every other non-forbidding doctrine.

At Cory's picks only one to three of the nine constraints bind at all:

```
pick 33 : binds [zero_rb]                         → 2 distinct scores
pick 48 : binds [zero_rb, wr_anchor, elite_te]    → 3
pick 53 : binds [zero_rb, wr_anchor, early_qb]    → 3
pick 68 : binds [zero_rb, wr_anchor]              → 2
pick 88+: binds []                                → 1
```

And a binding constraint always scores **lower** — that is what binding means.
So the leader is always one of the non-binding doctrines, always tied with every
other non-binding doctrine, and **the gap between first and second is a gap
between two identical numbers.**

**THE SWITCH CONDITION IS `challenger − current > band`.** With the gap pinned at
0, this is false for every band ≥ 0 — and it is false at a band of **zero** too,
because the comparison is strict. **There is no value of `DG_NOISE_BAND`, and no
re-derivation of it from any dollar distribution, that makes this banner speak.**

---

## 4 · SO THE ROW'S ACTION DOES NOT FOLLOW, AND ITS DIAGNOSIS WAS ONE LAYER OFF

4x reads the `146/148` robot-mock failure — *"a QB run triggers EXACTLY ONE
switch announcement" → 0 announcements* — as a **calibration** problem: the band
is $4, the movement is $0.24, lower the band honestly.

**It is a design property.** The doctrines are not close together on this board;
they are *identical*, because the scoring function collapses every
non-binding constraint onto the same player. Tuning the threshold between two
equal numbers cannot produce an inequality.

**⚠️ I am not claiming the doctrine ties are a bug.** The row says so itself and
it is right — scoring a doctrine by the best player it permits is a defensible
definition. What follows from it is that **a banner built on gaps between those
scores has nothing to report**, and that is the finding.

---

## 5 · WHAT IT WOULD TAKE, STATED SO THE OPTION IS VISIBLE — NOT PROPOSED FOR THIS WEEK

A banner that can speak needs doctrine scores that differ when the doctrines
differ. That means scoring a doctrine over **the plan it implies across the
remaining picks**, not the single player it permits at this one — which is what
the Lab's `cory_conditional.py` archetypes actually do, and it is a real piece of
work.

**RECOMMENDATION: do not attempt it before 08-22, and do not touch
`DG_NOISE_BAND` either.** The constant is used by `recommend()`'s even-money
confidence class as well as the banner, so moving it to fix a banner that will
stay silent anyway would change how *decided* versus *even money* renders on
every pick Cory sees. That is a real behaviour change, four days out, bought for
nothing.

---

## 6 · THE ONE SENTENCE CORY IS OWED

The sheet's A3 already says the default (nothing ships, banner quiet) is
acceptable **only if he is told**. Here is the telling, and it is now backed by a
measurement rather than an expectation:

> **The strategy banner will stay quiet all night. That is structural, not a
> fault waiting to clear: at every one of your picks at least six of the nine
> doctrines allow the same top player, so they score identically and there is no
> leader to change.**

---

## 7 · `DG_NOISE_BAND`'s ORIGIN, SINCE THE ROW ASKED

The row asks what the $4 was derived from, and says *"if the answer is 'a chosen
round number,' say so."*

**Say so.** `engine.js:120` defines `DG_NOISE_BAND: 4.0` with a comment
describing what it *means* (*"the even-money width — a gap inside it is not a
real edge"*) and **no derivation**. The only place a number is reasoned about is
`engine.js:321`, and there $4 is used as a **reference point** for sizing a
different constant — *"the top-two composite gap at Cory's picks runs 2.4-10.1
points; `DG_NOISE_BAND` … is 4.0"* — not derived itself.

So: a chosen round number, and it has since been cited as though it were
measured. **That is worth fixing post-draft on its own merits**, independent of
the banner, because the even-money class Cory reads at every pick rests on it.

---

## 8 · RULE 3g

**Does this imply another failure we have not looked for?** Yes — `TARGET_NUDGE:
3.0` sits two lines below and is described the same way (*"wide enough that your
own read wins a close call"*) with no derivation either. Same shape, same file,
unexamined.

**Does it invalidate something we already trust?** It invalidates 4x's stated
fix, and it strengthens A3: the default is not merely acceptable, it is the only
outcome available. It touches no projection or price.

**Is it routed to the lane that can act?** A owns both the constant and the
banner design. Routed with the sentence for Cory attached, so the cheap half can
happen even if the expensive half never does.

---

*Reproduced with `doctrine.js`'s own `scoreBoardDetail()`; pinned by
`draft/tests/doctrine_banner_is_degenerate.test.js`.*

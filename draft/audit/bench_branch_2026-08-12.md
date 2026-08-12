# The bench branch has no anchor under the weights we ship

**Found 2026-08-12, by accident, ten days before the draft.** Not an audit of the
engine — it surfaced while measuring disagreement rates for high-contrast strategy
candidates. The market-anchored arm's sample line showed the *shipping* arm taking
Denzel Mims (ADP 696) over Sam LaPorta (ADP 73) in round 8.

**Live on the war room today.**

---

## The size

`draft/tools/bench_branch_probe.js`, 20 simulated drafts, seat 8, opponents
drafting to ADP. A pick counts as a reach at ADP > 250, stated before the run.

| arm | reaches |
|---|---|
| **MEASURED_WEIGHTS — `app.js:52`** | **111/240 picks = 46.3%** |
| DEFAULT_WEIGHTS | 0/240 = 0.0% |

By round, out of 20 drafts: **r8 20 · r9 12 · r10 19 · r11 20 · r12 20 · r13 20.**

Every reach is on the bench branch, which fires on 120 of 240 picks. So: **from
the round my starting lineup fills to the round I take a kicker, the top
recommendation is wrong roughly nine times in ten.**

Sample: Josh Johnson, Joe Flacco, Tom Brady, Marcedes Lewis, Jason Witten,
Trenton Irwin, Mack Hollins.

---

## The mechanism

`scorePlayer` has two branches. Once every starting slot is filled, every
remaining skill player reads `need.fills === 'bench'` and takes:

```
score = w.ceiling*ceiling + w.stack*stack + w.keeper*kov
      + max(0, w.need*need) - max(0, w.bye*bye) + w.risk*min(0, risk)
```

VONA and tier-cliff are deliberately absent, and that is correct — they price
scarcity for a man you cannot start. The branch is meant to rank on **upside**.

```
MEASURED  value 1  tier 0  need 0  risk 0  ceiling 0     keeper 1  bye 0  stack 0.5
DEFAULT   value 1  tier 1  need 1  risk 1  ceiling 0.65  keeper 1  bye 1  stack 1
```

**MEASURED zeroes four of the six terms in this branch.** The two weights it does
*not* zero — `value` and `tier` — do not appear in the branch at all. So the
shipped bench score is:

```
score = 0.5 * stack + 1 * keeper
```

`stack` is a flat bonus for sharing an NFL team with somebody already on my
roster, regardless of whether the player can play. Measured at pick 73:

| player | VORP | score |
|---|---|---|
| Denzel Mims | −172.7 | **+2.42** (0.5 × 6.00 stack − 0.58 keeper) |
| Sam LaPorta | +17.8 | +0.01 |
| Travis Kelce | +6.1 | −0.02 |
| Brock Purdy | +8.5 | +0.25 |

---

## And the anchor the comment credits was never running

The branch's own comment says the top bench pick "is the highest-ceiling player
left". **It is not, under either weight vector.** `upsideBonus` is gated to zero
until `CEILING_LATE_FROM` = 0.6 of the draft — pick 90 of 150 — and the bench
branch starts firing near pick 70. Measured at pick 73 the ceiling term is
**0.00 for every player on the board**, Mims and Kelce alike.

Rule 11e: a comment describing an implementation that does not run. And it is the
second defect that makes the first one reachable — the branch was never ranking
on upside, so removing the other terms left nothing at all.

## Why DEFAULT survives, and why that is diagnostic rather than reassuring

What saves DEFAULT is **not** the ceiling. It is the `risk` term — −42.00 on Mims
at weight 1 — and the need/insurance term. MEASURED zeroed `risk` because the Lab
measured it as drag **in the starter branch**, where `value` anchors everything.
In the bench branch it was the only thing holding the floor.

**A weight measured on one composition, applied to another.** Same shape as rule
10d: the measurement was sound and its scope was not carried with it.

---

## The fix is a judgement call, so it is not made here

Three candidates, and they are not equivalent:

1. **Floor the bench branch's ceiling weight**, the way `wValue` is already
   floored by `CFG.VALUE_WEIGHT_FLOOR = 0.25` in the starter branch, *and* let the
   ceiling ramp start when the bench branch starts rather than at 0.6. Most
   faithful to the stated design — but it changes when upside enters, which was
   Cory's own model ("mean+VONA+tiers decide early/mid; throwaway rounds get the
   lottery").
2. **Floor the risk weight in the bench branch.** Smallest change, restores what
   is actually protecting DEFAULT today — but it protects by accident rather than
   by design, and it leaves the branch ranking on nothing positive.
3. **Give the bench branch an explicit value anchor** (a discounted VORP). Most
   honest about what a bench pick is worth — but it partly re-does the reprice
   this branch exists to implement.

**My recommendation: (1) plus (2)** — floor the ceiling weight *and* start the
ramp where the branch starts, with the risk floor as the safety net. It restores
the design the comment describes instead of inventing a fourth one.

**Why it is not applied here:** it changes the score on every bench pick, which
re-opens the frozen baseline (`draft/baseline/v6.json`) that was deliberately
re-frozen against artifact_v5's board four days ago. A weights-policy change made
quietly the week of the draft is exactly the class of thing that has to be Cory's
call.

**Interim, costing nothing:** the war room's own plausibility rail already exists.
It did not fire here — worth checking why separately.

---

## Pinned

`draft/tests/bench_branch_anchor.test.js` is a **characterisation** test: it
asserts the *broken* behaviour so the suite stays green and the defect cannot be
forgotten, names it, sizes it, and carries a retirement check that fires the
moment the fix lands and instructs its own deletion. That is B's pattern from the
`wins: 49 → 48` repair, reused.

<!-- TERRITORY: A -->
# THE COMPOSITE'S "ROSTER BLINDNESS" IS AN ARTIFACT OF `ceiling = 0`

**2026-08-17.** Found while proposing the ceiling weight at 0.45:
`composite_roster_blindness.test.js` fails with ceiling on. Traced to mechanism
rather than pinned over.

---

## THE MECHANISM, from `engine.js:1682-1700`

```js
const benchOnly = need.fills === 'bench';        // ← ROSTER-DEPENDENT
if (benchOnly) {
  const benchCeiling = upsideBonus(player, …);
  const wCeil = Math.max(CFG.BENCH_CEILING_FLOOR, w.ceiling == null ? 1 : w.ceiling);
  // the bench branch scores on UPSIDE — the ceiling term is its anchor
}
```

`CFG.BENCH_CEILING_FLOOR` is **0** (retired from 0.25 on 2026-08-14, correctly —
a constant was re-enabling a weight the measurement had switched off).

So:

| `w.ceiling` | `wCeil` in the bench branch | filling QB/TE… |
|---|---|---|
| **0** (today) | `max(0, 0)` = **0** | changes who is `benchOnly`, but their ceiling term contributes nothing → **top 70 does not move** |
| **0.45** (proposed) | **0.45** | changes who is `benchOnly` → their score changes → **top 70 moves** |

**The blindness is not a property of the composite's design. It is a consequence
of one weight being zero.** The bench branch has always been roster-aware; with
ceiling off, its awareness had nothing to express.

## WHY THIS MATTERS MORE THAN THE TEST

`NEED-WEIGHT-PREREG.md` rests its entire case on that blindness:

> at pick 70, adding a QB and a TE to the roster drops the mask's admitted
> quarterbacks from **215 to ZERO** and does not move the composite top 70 by one
> player

**That premise is true only while `ceiling = 0`.** If the weight ships, the
composite acquires roster sensitivity through the bench branch for free, and the
`need` study is measuring a smaller gap than the one it was designed around. The
prereg is not wrong — it was written on today's board — but its motivating
measurement must be re-taken after any ceiling change, or the study will answer a
question that no longer exists.

## WHAT THIS IS NOT

**Not an argument against shipping 0.45.** Roster awareness in the bench branch
is arguably what we want — it is the branch that ranks the whole back half of the
draft, and "who can I actually start" is real information. It is an argument for
knowing that shipping the weight does TWO things, not one: it prices upside, and
it switches on a roster-sensitivity that has been dormant.

**Not a defect in the test.** `composite_roster_blindness` is measuring exactly
what it claims. Its failure under ceiling-on is the correct report of a real
behavioural change, and pinning it green would have hidden the finding.

## WHAT IS OWED IF THE WEIGHT SHIPS

1. Re-take the 215→0 measurement with ceiling on, and record the new gap.
2. Decide whether `composite_roster_blindness` should assert blindness at all, or
   should become a test that the sensitivity is BOUNDED — the honest successor.
3. `NEED-WEIGHT-PREREG.md` §1 needs a note that its premise is ceiling-dependent.

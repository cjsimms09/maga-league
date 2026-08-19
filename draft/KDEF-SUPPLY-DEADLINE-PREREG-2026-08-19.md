# PREREGISTRATION — take the onesie on a SUPPLY DEADLINE, not on a weight

**A, 2026-08-19, written BEFORE the code and BEFORE the run.** Register 127,
second attempt. The first is in `KDEF-STREAM-TAX-PREREG-2026-08-19.md` and was
**refused** — it left 8 of 30 rosters with no kicker.

## WHAT THE FIRST ATTEMPT TAUGHT, AND WHY IT REFRAMES THE PROBLEM

Taxing the first kicker's weight to 0.034 did move him later. It also left a
quarter of the rosters **without one**. I read that as the forcing rule failing.
It was not:

| season | kickers in the draft | LAST one off the board |
|---|---|---|
| 2023 | 10 | pick **145** |
| 2024 | 10 | pick **136** |
| 2025 | 11 | pick **149** |

**Ten teams, ten kickers, no surplus.** Cory's last two picks are **133 and
148**. In 2024 the last kicker went at 136 — so a seat that waits past its
pick-133 slot has *no kicker in existence* to take at 148.

**The humans do not take a kicker at pick 126 because they value kickers. They
take one because that is the last moment one exists.** The quantity that governs
this is SUPPLY, and neither the weight nor the fill rule can see it.

## THE MECHANISM

Not a weight. A **deadline**:

```
remaining(pos, next_pick) = how many of this position are still unclaimed
                            when my next turn comes

w(pos, 0) = 1.0                          if remaining(pos, next_pick) < 1
                                         … the shelf empties before I pick again
          = base × (1 − streamability)   otherwise
                                         … he is abundant; he can wait
```

Everything else is unchanged. The onesie is priced **cheaply while it is
abundant and at full value exactly once, at the last moment it exists.** That is
what a good drafter does, and it is the behaviour the humans exhibit.

⚠️ **NO NEW CONSTANT.** `remaining` is counted from the board; the streaming tax
and Cory's curve are already in the file. There is nothing to tune, which is the
point — the first attempt failed *because* it used a fixed weight for a
time-varying problem.

## PREDICTIONS

**P221 — every roster is legal.** **Zero** of 30 seat-years finishes without a K
or a DEF.

**FALSE if any seat ends short.** This is the bar the last attempt broke, and it
is non-negotiable: an illegal roster scores zero in that slot every week.

**P222 — K and DEF still move later than they do today.** Mean pick for K
**≥ 110** and DEF **≥ 105**, against today's 96 and 83.

**FALSE if either misses.** ⚠️ Deliberately looser than the last attempt's
118/115 bar. The supply deadline should move them toward the humans' 126/128
but is *not* free to push them past the point of existence — that was the whole
failure, and a bar that demands it would be demanding the defect back.

**P223 — the points do not get worse on EITHER grading.** Actual **≥ −20.4**
and skill **≥ +7.9**.

**FALSE if either drops.** ⚠️ **On the SKILL grade specifically**, because the
last attempt looked like an *improvement* on actual points (−20.4 → −18.7) while
being a disaster on skill (+7.9 → −23.5). Actual points alone would have shipped
a roster with no kicker. Cory's ruling — *grade skill not luck* — is what caught
it, and it is the deciding grade here too.

## CONTROLS

1. **C1 — KNOWN POSITIVE (rule 3e).** The deadline must actually fire, and be
   seen firing: report the count of picks at which `remaining < 1` triggered
   full weight. If it never fires, the arm is the untaxed board wearing a new
   name and every number below is meaningless.
2. **C2 — it must touch NOTHING but K and DEF.** `w` for QB/RB/WR/TE bit-identical
   at every holding.
3. **C3 — supply is counted from the REAL draft, with no hindsight.** `remaining`
   at my next pick uses only picks that have already happened plus the fixed
   opponents' known future picks — the same fixed-opponent counterfactual every
   other arm uses. No outcome data enters.
4. **C4 — paired.** Same 30 seat-years, same rooms, same everything; only
   `startProb` differs.

## GUARD

**Ships to `engine.js` only if P221, P222 and P223 all hold.** Otherwise register
127 stays open with the off switch as its mitigation, and this document becomes
the second documented dead end so nobody walks it a third time.

**`no_fit_guard`: no bar in this file moves after the number is seen.**

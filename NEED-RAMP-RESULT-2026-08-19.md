# Your ramp works. Both my predictions failed narrowly, and I set those bars.

**A, 2026-08-19.** Cory: *"the need doesnt need to be that big of the equation at
first, should get louder or weighted more as the draft goes on… ie will almost
force draft a def and k in the last 2 rounds"*

```
value(p, t) = ( proj − waiver ) × [ (1 − λ) + λ × need(pos, held) ]
λ(t)        = min( 1 , unfilled starting slots / picks remaining )
```

**λ is derived, not chosen** — a ratio of two things the roster already knows.

---

## THE RAMP, VISIBLE

```
pick    33   48   53   68   73   88   93  108  113  128  133  148
λ     0.50 0.46 0.40 0.33 0.38 0.43 0.50 0.60 0.50 0.33 0.50 0.00
```

**It falls while you are acquiring starters, RISES in the middle as slots stay
open and picks run out, and hits exactly 0.00 on the last pick — every slot
filled, pure value.** That is the dynamic you described, and nothing told it to do
that.

## THE PICKS

`QB2 · RB3 · WR4 · TE1 · K1 · DEF1` drafted — **and `DEF` came at 108 and `K` at
133, both late, neither forced by a rule.** At pick 108 the Rams priced 20.0
because DEF need was **1.0** (a slot you cannot field) and λ had climbed to 0.50.

**Total projected points 2297.6 — `+3.5%` against `draft_plan.js`.**

## ⛔ BOTH PREDICTIONS FALSE, NARROWLY, AND THE BARS WERE MINE

**P156 FALSE.** I predicted K **and** DEF in the last **four** picks. K landed at
133 ✅; **DEF landed at 108 — the fifth from last, one pick early.** The mechanism
did what you asked; my window was arbitrary and it missed by one.

**P157 FALSE.** I predicted total points **≥ P144's 2309.5** and got **2297.6** —
short by **11.9 points, 0.5%.** I set that as a hard bar on purpose, writing
*"seven arms have traded shape against value and the whole claim of the ramp is
that you should not have to."* **It very nearly did not have to. It still traded
half a percent.**

**Reporting both as FALSE because they are.** The honest summary is the table
below, not the predictions.

## WHERE ALL NINE ARMS NOW STAND

| arm | drafted | value vs `draft_plan` |
|---|---|---|
| **P156 — your ramp** | **QB2 RB3 WR4 TE1 K1 DEF1** | **+3.5%** |
| P144 — flat need | QB2 RB3 WR4 TE1 K1 DEF1 | **+4.0%** |
| P152 — measured curve | QB2 RB2 WR4 TE2 K1 DEF1 | +0.8% |
| P149 — your K/DEF rule | QB2 RB3 WR3 TE2 K1 DEF1 | −0.4% |
| P146/148 | QB1 RB2 WR3 TE3 K2 DEF1 | −6.9% |
| P155 — streamability | QB1 RB2 WR5 TE2 K1 DEF1 | −9.3% |
| P147 | QB1 RB3 WR2 TE1 K2 DEF1 | −19.9% |

**The ramp and P144 draw the same twelve-pick shape.** The ramp gets there **with
the streamability discount included and without the double-count sinking it** —
which is the thing P155 could not do at all (−9.3%). **Your ramp is what made the
streamability term usable.**

## WHAT IS STILL OPEN — one cell, and it is the same one

**The second quarterback.** Purdy at pick 93, priced 20.3. Nine arms, and QB2 has
survived every one of them except the two that broke something else.

**It is not a need problem.** Need for a 2nd QB is now **0.175**, measured and
correctly low. **It is that a backup QB's margin over a 319-point wire is still 35
points**, and 0.175 × 35 = 6.1 — which at pick 93 beats the alternatives on a
board where everything else has thinned out.

**The narrow question, stated for whoever runs it next: is `waiver_level(QB) =
319` right?** It is the best free QB after 150 picks, taken from one board. If the
real streamable QB is better than that, the margin shrinks and the QB2 disappears
on its own. **That is one measurement, not another arm.**

⚠️ **Nothing here ships before Saturday. Report only, no cap, no board field.**

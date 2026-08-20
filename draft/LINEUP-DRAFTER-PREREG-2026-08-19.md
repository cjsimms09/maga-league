# PREREGISTRATION — draft by marginal lineup value, with no roster rules at all

**A, 2026-08-19, committed BEFORE the code.** Cory: *"Try it"*.

## THE IDEA

Every roster rule this project has built — the need curve, the wire levels, the
flex-exposure weighting, the streamability discount, the 1-slot correction, the
reservation gate — is an approximation to **one** quantity. Compute that
quantity directly and they should all become unnecessary:

```
value(candidate) = E[ starting-lineup points over 17 weeks WITH him ]
                 − E[ starting-lineup points over 17 weeks WITHOUT him ]
```

Take the largest at every pick. **No need curve. No positional cap. No forced
slots. No wire constant. Nothing about roster shape is written down anywhere.**

If the objective is right, the shape falls out: a body whose bye clashes with my
starter is worth less; injury risk costs more on a starter than on depth; a
fifth running back is worth little because he rarely reaches the lineup; and a
kicker becomes the best pick on the board the moment an empty K slot is costing
me a zero every week.

## PREDICTIONS

**P206 — it beats drafting by projected points.** Evaluated at 4000 seasons on
expected starting-lineup points, the marginal-value roster beats the
draft-by-mean roster. **FALSE if it does not.** ⭐ *Draft-by-mean is the arm
that won the last experiment by 11% over ceiling and 0.5% over floor. It is a
real bar, not a straw man.*

**P207 — it fields a legal team without being told to.** The roster contains at
least QB 1, RB 2, WR 2, TE 1, K 1, DEF 1 — **with no rule requiring it.**
**FALSE if any slot is empty.** ⭐ **This is the one that matters. If the
objective really contains the roster logic, it must produce a kicker on its own,
because an empty K slot scores zero every week and nothing else on the board can
be worth more than that. If it leaves the slot empty, the objective is NOT a
substitute for the rules and I will say so plainly.**

**P208 — and it does something a points-ranking cannot: it spreads byes.** The
maximum number of the roster's starters sharing a single bye week is **lower**
than in the draft-by-mean roster. **FALSE if it is equal or higher** — in which
case the bye-awareness I claim falls out of the objective does not.

## CONTROLS

1. **COMMON RANDOM NUMBERS, and this is the one that decides whether any of it
   means anything.** Each player's weekly score and absence must be drawn from a
   stream keyed to *(his id, season, week)* — **not** from a shared sequence.
   With a shared sequence, adding a candidate shifts every later draw and the
   with/without difference is dominated by noise rather than by him. **Control:
   evaluating the same roster twice must return bit-identical totals, and
   evaluating a roster with a candidate who can never start (a 3rd kicker) must
   return a delta of exactly 0.**
2. Same board, same 12 picks, same keepers, same ADP drain as the other arms.
3. Weekly volatility from the measured league values (QB .44 RB .54 WR .57
   TE .59 K .48 DEF .70), season-level remainder as before.
4. **REPORT ONLY.**

**If P207 fails, the honest report is that the objective is right and
insufficient, and the roster rules stay.**

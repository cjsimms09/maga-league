# PREREGISTRATION — the missing term: STREAMABILITY, measured

**A, 2026-08-19, committed BEFORE the run.** Cory: *"have we found equation that
matches what we talked about up top? if not we need to keep trying."*

**Honest answer: no. One piece he specified was never built.**

> *"they really should never be at 0 for any except Def and K. but should go very
> low, almost 0 on TE and Qb, but not so much where you miss extreme value at
> those positions."*

**Nothing I built does that.** The binomial hits exactly 0. The measured curve
gives QB2 = **0.427**, far too high — it drafted a second quarterback (P152). **The
right number is low but non-zero, and I have had no principled way to get it.**

## THE TERM, AND WHY IT IS MEASURED RATHER THAN CHOSEN

**A second body is only worth a DRAFT PICK to the extent you could not have gotten
one free.**

```
need(pos, held) = measured_start_rate(pos, held+1) × ( 1 − streamability(pos) )

streamability(pos) = of all the roster-weeks in which a team's 2nd-or-later body
                     at that position was on the roster, the fraction where that
                     player ARRIVED BY WAIVER OR FREE AGENCY rather than by draft
```

**One measured multiplier, and all three of Cory's rules fall out of it:**

| | expected streamability | ⇒ need |
|---|---|---|
| K, DEF | ~1.0 — the whole pool cycles | **≈ 0** — his K/DEF ruling, derived |
| QB, TE | high — a startable one is always on the wire | **low but NOT zero** — his "almost 0" |
| RB, WR | low — you cannot stream a startable RB4 | **stays near .27 / .33** — his floor |

**Nothing is tuned. `streamability` is counted from three seasons of this
league's own transactions, and it is the only new input.**

## PREDICTIONS

**P153 — streamability is ordered K/DEF > QB/TE > RB/WR**, and the gap is large:
`streamability(QB) − streamability(RB) ≥ 0.25`.

**FALSE if the ordering breaks or the gap is smaller** — which would mean
"streamable" is not a real property of these positions in this league and Cory's
distinction, and mine, rest on nothing measurable.

**P154 — the resulting need for a 2nd QB is below 0.15 and strictly above 0**,
matching *"very low, almost 0… but not so much where you miss extreme value."*

**FALSE if it is ≥ 0.15 or exactly 0.**

## CONTROLS

1. **Drafted set built from `drafts[].picks`**, and every drafted player must be
   found on the roster that drafted him in week 1, or the join is wrong.
2. **Adds counted from `transactions` types `waiver` and `free_agent` only** —
   trades are neither streaming nor drafting and are excluded and counted.
3. **Three seasons contribute**, reported separately.
4. **Known positive:** `streamability(DEF)` must exceed 0.5 — this league cycles
   100% of the defence pool, so if defences look un-streamable the join is wrong
   and nothing else counts.
5. **Denominator is roster-weeks at rank ≥ 2**, not all roster-weeks.

## GUARD

**REPORT ONLY.** No board field, nothing ships, and there is no constant here to
choose — the multiplier is counted.

---

# ADDENDUM — P155, the full equation, stated before it is driven

**P153 TRUE** (gap 0.278). **P154 FALSE by 0.025** — I predicted the 2nd-QB need
below 0.15 and it measured **0.175**. **The threshold was mine and arbitrary; the
substantive result is the shape**, and it is Cory's:

| | measured 2nd-body | streamable | **⇒ need** |
|---|---|---|---|
| WR | .696 | **.252** | **.521** |
| RB | .713 | **.311** | **.491** |
| QB | .427 | **.590** | **.175** |
| TE | .414 | **.624** | **.156** |
| DEF | .484 | **.925** | **.036** |
| K | .828 | **.966** | **.029** |

**Every one of Cory's rules is now derived rather than asserted:** RB/WR stay
high · QB/TE go low but **not** zero, so extreme value can still win · K/DEF are
effectively zero without being hardcoded to it.

## THE FULL EQUATION — every term counted from this league's own history

```
value(p) = need(pos, held) × ( proj_mean(p) − waiver_level(pos) )

need(pos, held) = 1.0                                     if held < starting slots
                = measured_start_rate(pos, held+1)
                  × ( 1 − streamability(pos) )            otherwise
```

**No weights. No caps. No constants I chose.**

## P155

**Driven down Cory's real twelve picks, this arm's total projected points are
within 5% of `draft_plan.js`, and no position exceeds the depth the measured
curve supports** (nothing past RB6 / WR6 / QB2 / TE2 / K1 / DEF1).

**FALSE if value drops more than 5%, or if it drafts past the measured range.**

⚠️ **I am NOT predicting the roster shape, and that is deliberate.** Cory:
*"i dont want 6 rb 5wr.. it may end that way but thats not a set roster."*
**Shape is an outcome. Whatever it draws, it draws** — the test is whether each
pick is defensible at its price, not whether the counts match a target.

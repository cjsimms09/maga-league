# PREREGISTRATION — VONA across positions, where they compete for the same slot

**A, 2026-08-19, committed BEFORE the run.**

Cory: *"I also think vona could apply between positions if vying for same spot
ie flex"*

## WHY THIS IS THE ONE PLACE IT IS LEGITIMATE

The whole reason VONA had to come out of the value term (P196) is that it is
**not comparable across positions**: a 39-point quarterback cliff sits on 17
points of surplus while an 11-point back sits on 233. Different slots, different
replacements, no common denominator.

**The flex has exactly one denominator.** RB, WR and TE compete for the same
slot against the same alternative, so "what do I lose by waiting" IS comparable
between them there — and only there.

## THE CHANGE

A body is worth his surplus **in whichever slot he actually fills**, weighted by
how often he fills each. `f(pos, n)` is already measured — the share of the
n-th body's starts that are FLEX starts (P175, counted from 535 team-weeks:
RB .450/.544/.682 at bodies 3/4/5; WR .435/.551/.882).

```
own_surplus   = max(0, proj_used − waiver(own position))
flex_surplus  = max(0, proj_used − max waiver over RB/WR/TE)      = − 130.4
value(p, n)   = (1 − f) × own_surplus  +  f × flex_surplus
```

**And the VONA tie-break for a flex body is taken across the whole flex-eligible
pool** rather than within his position, which is Cory's sentence directly.

⚠️ **The flex replacement is TE 130.4, the highest of the three, and real teams
flex a tight end 1.7% of the time.** Flagged at P172 and unresolved. Both the
raw max (130.4) and the empirical flex owner (WR 124.8) are run and **must
agree** or the result does not stand.

## PREDICTIONS

**P199 — it moves backs down and receivers barely at all.** RB's own wire is
78.4 against a flex wire of 130.4, a 52-point penalty on his flex share; WR's is
124.8, a 5.6-point penalty. So on the same 300 rooms, `a = 0`, Cory's curve:
**mean RB falls by at least 0.30** and **mean WR rises**, against the current
5.08 / 5.92. **FALSE if RB does not fall by 0.30.**

**P200 — and it does not break what is already right.** QB, TE, K and DEF all
stay within **0.10 of 1.00**, and the share of rooms with **WR > RB stays at or
above 92%**. **FALSE if any misses.** ⭐ **This is the guard: a change that
improves the RB/WR split by disturbing the four positions that already land
exactly has not improved anything.**

## CONTROLS

1. **KNOWN POSITIVE.** With `f = 0` for every body (nobody ever flexes) the run
   must reproduce the current `cory` arm exactly — RB 5.08, WR 5.92, onesies 1.
2. **Both flex-replacement choices reported** (TE 130.4 and WR 124.8); the
   verdict must be the same under each.
3. `f` is read from the committed `flex_exposure.json`, whose controls passed.
4. **REPORT ONLY.**

**`no_fit_guard`: if P199 passes and P200 fails, the arm is reported as a
failure and NOT adopted, and no constant is moved to rescue it.**

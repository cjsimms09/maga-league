# PREREGISTRATION — the acceptance test Cory actually named: the AVERAGE draft

**A, 2026-08-19, committed BEFORE the run.**

**Cory:** *"we know it right when its **average draft** is 1QB, 4-5RB, 4-5WR, 1k,
1 def"*

## ⛔ THIS IS NOT THE TEST I HAVE BEEN RUNNING, AND THAT IS THE POINT

**Every one of the nine arms today was graded on ONE deterministic drive down ONE
board with the room draining in strict ADP order. n = 1.** A single draft drawing
a second quarterback tells you almost nothing — **in that room, a quarterback
fell.** Cory's criterion is the distribution, and it is the correct one.

**I have been reporting single-draft outcomes as if they were the model's
behaviour. They are one sample of it.**

## THE TEST

**Simulate the room 300 times.** Each simulation draws the order players come off
the board from `adp` with the board's own `adp_sd` — so the room is realistic and
different every time — then runs the ramp arm down Cory's real twelve picks.

**Report the AVERAGE drafted roster across the 300, with its spread.**

```
value(p, t) = ( proj − waiver ) × [ (1 − λ) + λ × need(pos, held) ]
λ(t)        = min( 1 , unfilled starting slots / picks remaining )
need        = measured start rate × (1 − streamability), both counted
```

## P158 — Cory's criterion, stated as he stated it

**Across 300 simulated rooms the MEAN drafted roster is:**

- **QB: 1.0 ± 0.5**
- **RB: between 4 and 5**
- **WR: between 4 and 5**
- **K: 1.0 ± 0.3**
- **DEF: 1.0 ± 0.3**

**FALSE if any mean falls outside those bands.**

⚠️ **Cory's list omits TE and sums to 12 with RB/WR at 4.5 each. I am NOT
inventing a TE band** — I will report the TE mean and let him rule on it, because
guessing at a number he did not say is exactly how I turned his last description
into a target.

## CONTROLS

1. **The 300 rooms must actually differ** — report the mean and spread of how many
   distinct players are gone by pick 33. A constant means the noise is not firing
   and every "simulation" is the same draft.
2. **`adp_sd` comes from the board**, and any player lacking it is reported, not
   silently given a default.
3. **Cory's twelve picks and three keepers are identical in every room.**
4. Both source artifacts must have passed their own controls.
5. **The deterministic ADP-order run must appear inside the simulated
   distribution** — if the n=1 result is an outlier against the 300, the noise
   model is wrong.

## GUARD

**REPORT ONLY.** No board field, no cap, nothing ships. **And whatever the average
is, it is the answer** — I am not adjusting the equation to hit the bands. If it
misses, that is the finding and the next change is preregistered separately.

---

# ADDENDUM — P159. Cory: *"so fix and rerun. make it right"*

**P158 FALSE: mean QB 1.96 (want 1), RB 3.75 and WR 3.25 (want 4–5).** The extra
quarterback eats the depth. Diagnosed as the `(1 − λ)` bypass being
**position-blind** — it does not know whether you can field the player.

## THE FIX — the ramp form was wrong, not the ramp

**`(1 − λ) + λ × need` is a linear blend, and it is the wrong way to ramp a
MULTIPLICATIVE weight.** It drags every need toward 1 by the same additive amount,
which compresses exactly the distinction that decides a pick. **The natural form
for damping a multiplier is the exponent:**

```
bracket = need ^ λ            instead of   (1 − λ) + λ × need
```

**Both endpoints are unchanged and both are Cory's:**

- `λ = 0` → `need⁰ = 1` for everyone → **pure value, "draft value first"**
- `λ = 1` → `need¹ = need` → **full need weighting, late**
- **a slot you cannot field has `need = 1.0`, so it is 1.0 at EVERY λ** — the
  forcing case still forces.

**And it stops the leak, measured at λ = 0.50:**

| | need | blend | **exponent** |
|---|---|---|---|
| QB 2nd | 0.175 | 0.588 | **0.418** |
| RB 3rd | 0.491 | 0.746 | **0.701** |
| **ratio QB2 : RB3** | | **0.79** | **0.60** |

**The blend hands a second quarterback 79% of a third running back's weight. The
exponent hands him 60%.** Nothing else changes — same need, same streamability,
same λ, same waiver levels. **λ is still `unfilled slots / picks remaining`, still
derived.**

## P159 — the same acceptance test, over the same 300 rooms

**Mean drafted roster: QB ≤ 1.5 · RB between 4 and 5 · WR between 4 and 5 ·
K 1.0 ± 0.3 · DEF 1.0 ± 0.3.**

**FALSE if any of those misses.** The QB bar is set at **≤ 1.5** rather than
"1.0 ± 0.5" deliberately: **1.96 → below 1.5 is the movement that matters, and if
the exponent cannot do that much it is not the fix.**

⚠️ **One change only, and it is the form of the ramp.** No cap, no new constant,
no tuned parameter. **If P159 fails, the exponent is wrong too and I say so
rather than trying a third form tonight.**

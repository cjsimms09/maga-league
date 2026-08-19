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

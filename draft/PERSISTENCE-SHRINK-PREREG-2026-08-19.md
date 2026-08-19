# PREREGISTRATION — shrink each position's spread by how predictable it is

**A, 2026-08-19, written BEFORE the code and BEFORE the run.** Register 127,
third attempt — and the first one that comes from Cory rather than from me.

> Cory: *"We are over thinking k and def.. find what makes them least valuable,
> it barely matters what one you have and really none are worth keeping all
> year. Too dependent on who they play. Then use that info to solve the
> equation"*

## HIS CLAIM, MEASURED, AND IT HOLDS

**Half one — the spread is small.** Best-over-median season points, this
league's own three seasons:

| | K | DEF | RB | WR |
|---|---|---|---|---|
| 2023 | 20 | 53 | 195 | 139 |
| 2024 | 57 | 30 | 165 | 161 |
| 2025 | 33 | 54 | 181 | 142 |

**Half two — and it is the half that matters — the spread is NOT
PREDICTABLE.** Persistence of per-game scoring, first half of season to second,
averaged over three seasons:

| pos | r |
|---|---|
| RB | **0.572** |
| WR | 0.259 |
| QB | 0.208 |
| DEF | 0.132 |
| TE | 0.041 |
| **K** | **0.013** |

**A kicker's first half tells you essentially nothing about his second**
(seasons: −0.46, +0.49). The gap between the best kicker and the median one is
real and **uncapturable** — you cannot know in advance who gets it. That is
"too dependent on who they play", stated as a number.

## WHY THIS IS A VALUE BUG, NOT A NEED BUG — and why two attempts failed

Both previous attempts (`KDEF-STREAM-TAX`, `KDEF-SUPPLY-DEADLINE`) tried to fix
**how much we want** a kicker. Both failed. **The defect is in how much he is
WORTH.**

`waiver_level(K) = 128.6` is *the 11th-best kicker by PROJECTION*. The best
kicker projects 177. So the model sees **48 points of surplus** and reaches at
pick 96.

**But if kicker performance does not persist, the 177 and the 128.6 are the same
expected kicker.** The projection ordering of kickers is noise wearing a
ranking. The surplus is an artifact of trusting a projection at a position where
projections carry no signal.

## THE CHANGE

Shrink every position's projection spread toward its own mean by its own
measured persistence:

```
expected(p) = mean(pos) + persistence(pos) × (proj(p) − mean(pos))
```

- **K (r = 0.013)** — every kicker collapses to the position mean. Surplus over
  the wire ≈ **0**. He gets taken when nothing else is left, which is what the
  fill rule is for.
- **RB (r = 0.572)** — barely shrinks. A good back really is a good back.
- Everything in between scales by its own evidence.

**⚠️ NO NUMBER IS CHOSEN.** Each shrink factor is that position's own measured
persistence, computed from committed weekly stores by the probe in this
document. There is nothing to tune, and the same transform applies to all six
positions — K is not special-cased.

## PREDICTIONS

**P227 — it beats the shipped arm on both gradings.** Actual **> −20.4** and
skill **> +7.9**.

**P228 — it beats plain best-available, the real comparator.** Actual **> +2.5**
and skill **> 0.0**. ⚠️ **The shape term has never cleared this.**

**P229 — K and DEF move late without going missing.** Mean pick for K **≥ 110**
and DEF **≥ 105**, **and 30 of 30 rosters legal.** Dead end 1 bought the timing
by leaving 8 rosters without a kicker; that is not a pass.

**FALSE on any of the three and it does not ship.** No bar in this file moves
after the number is seen.

## CONTROLS

1. **C1 — KNOWN POSITIVE.** K's spread must actually collapse: report the
   best-minus-wire surplus for K before and after. If 48 does not fall toward 0,
   the transform did not take.
2. **C2 — RB must NOT collapse.** Its surplus must retain ≥ 50% of its original
   spread, or the transform is flattening the whole board rather than the
   unpredictable parts of it.
3. **C3 — persistence is computed with NO HINDSIGHT about the season being
   drafted.** It is a property of positions measured across seasons, not of the
   players being picked.
4. **C4 — legality reported**, and **C5 — both gradings**, per standing rules.

## A NOTE ON TIGHT END, WHICH THIS TOUCHES

TE persistence is **0.041** — as unpredictable as a kicker. Yet the top-3
finishers draft **1.67** tight ends against the bottom-3's 1.11.

**Those two facts are not in conflict, and together they may be the whole
answer:** when a position is unpredictable, the rational response depends on
whether you can replace it weekly. **K is unpredictable AND streamable (0.966)
— so hold one, drafted last.** **TE is unpredictable and NOT streamable (0.624)
— so hold more bodies and start whichever is hot.**

That is a real hypothesis and it is **NOT tested here.** Recorded so it is not
lost, and flagged for its own preregistration.

# PREREGISTRATION — the adjuster moves the PROJECTION, not a bonus

**A, 2026-08-19, committed BEFORE the code.**

Cory: *"What I want is! Floors to be used for tiebreakers in early rounds and
ceilings in later rounds. Also want to be able to adjust ceiling adjuster and
for model to project more ceiling than mean as I adjust up."*

**Three separate things, and the third one is what makes the other two
coherent.**

---

## WHY THIS IS NOT THE TERM WE HAVE

Today: `score = VONA + w.ceiling × upsideBonus(...) + …`, where `upsideBonus` is
`(ceiling − mean)`, rescaled by position, ramped by lateness, then weighted.
**Register 124: all three of those transforms are repairs for an input that was
never a real distribution.** A bonus **added** to VONA is a second, parallel
quantity fighting the first.

**Cory's design has no bonus in it.** *"project more ceiling than mean as I
adjust up"* means the adjuster moves **where on the player's own distribution we
price him**, and everything downstream — VONA, replacement, need — is computed
from that one number. **One quantity, not two.**

```
a  ∈ [−1, +1]      the adjuster.  0 = today.
proj_used(p, a) = mean(p) + a × (ceiling(p) − mean(p))      a > 0
                = mean(p) − |a| × (mean(p) − floor(p))      a < 0
```

**a = 0 → the mean. a = +1 → his ceiling. a = −1 → his floor.** Per player,
using **his own** floor and ceiling, which is exactly what the Draft Sharks
store now gives us for 247 of the board.

**Then VONA is recomputed on `proj_used`.** No weight to pick, no ramp constant,
no position rescale — a real distribution carries its own units.

## AND THE TIEBREAKER IS A SEPARATE MECHANISM

Cory asked for floor early, ceiling late — **as a tiebreaker**, which is not a
score term. Two players inside a small band of each other are, to this model,
the same player; the tiebreak decides which one you take.

```
early (before FLIP of the draft):  prefer the higher FLOOR
late  (after  FLIP):               prefer the higher CEILING
fires only when |score difference| <= TIE_BAND
```

⚠️ **`TIE_BAND` and `FLIP` ARE CHOICES AND ARE LABELLED AS SUCH.** `TIE_BAND` is
set to **2% of the leading score** and `FLIP` to **0.5 of the draft**. Neither is
measured. They are reported in every artifact, and **no arm may be selected by
moving them** — `no_fit_guard`.

## PREDICTIONS

**P182 — a = 0 is EXACTLY today.** With the adjuster at zero and the tiebreaker
off, the recommendation order over the full board is **byte-identical** to the
current board's order. **FALSE on any single player moving.** ⭐ **This is the
one that matters: it is what makes the feature safe to put in front of Cory
three days before a draft. If it fails, nothing else in this file counts.**

**P183 — the adjuster is monotone and does what he asked.** As `a` goes
0 → 0.25 → 0.5 → 0.75 → 1.0, the mean `proj_used` across the board **rises at
every step**, and the number of players whose `proj_used` exceeds their
`proj_mean` is **0 at a = 0 and every player carrying a ceiling at a = 1**.
**FALSE if either is non-monotone.**

**P184 — it re-orders the board, and the effect is concentrated in wide players.**
At a = 0.5 the recommendation order changes for at least **10** of the top 100,
and the players who GAIN rank have a median (ceiling − mean) at least **1.5×**
that of the players who lose rank. **FALSE if under 1.5×** — in which case the
adjuster is shifting a level rather than expressing upside, and it is doing
nothing a constant could not do.

**P185 — the tiebreaker only breaks ties.** Turning the tiebreaker on at a = 0
moves **no player whose score gap to its neighbour exceeds `TIE_BAND`**, and
early-round moves favour the higher floor while late-round moves favour the
higher ceiling, **100% of the time in each phase.** **FALSE on any violation** —
a "tiebreaker" that reorders non-ties is a score term in disguise.

## CONTROLS

1. **KNOWN POSITIVE, and it is P182.** The a = 0 arm must reproduce the live
   board's order exactly.
2. **Every player must carry a real floor and ceiling, or be excluded and
   COUNTED.** 247 of 700 carry Draft Sharks values; the rest fall back to
   `proj_mean` (so `a` cannot move them) and **the artifact reports how many** —
   a silent fallback would make the adjuster look weaker than it is and nobody
   would know which players were inert.
3. **`floor ≤ mean ≤ ceiling` per player, or the row is rejected and named.**
4. **REPORT ONLY.** No board field written, `engine.js` untouched.

## GUARD

**Cory has asked for a feature, three days before his draft.** So the honest
split, stated before any code:

- **The reprojection and the tiebreaker are built and MEASURED now.**
- **Whether either goes live before Saturday is Cory's call, not mine**, and I
  will give him P182's result as the deciding evidence rather than an opinion.
- **`no_fit_guard` holds regardless: `TIE_BAND`, `FLIP` and any default `a` are
  declared here and are not tuned toward a result.**

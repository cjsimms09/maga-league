# PREREGISTRATION — the TE cap is the most suspect number in the equation

**A, 2026-08-19, written BEFORE the code and BEFORE the run.** Draft 08-22.

> Cory: *"You really going to let humans beat you??"*

They are, and the two attempts to fix it so far both tried to make the model
draft **more like the humans** on K/DEF. Both made it worse. This one goes the
other way: it tests the single place where the evidence says the *winners* do
something the *losers* do not.

## THE EVIDENCE

Drafted bodies from this league's own three drafts, split by where the team
actually finished:

| group | QB | RB | WR | **TE** | K | DEF |
|---|---|---|---|---|---|---|
| TOP-3 finishers (n=9) | 1.56 | 4.78 | 5.00 | **1.67** | 1.00 | 1.00 |
| bottom-3 (n=9) | 1.78 | 4.33 | 5.67 | **1.11** | 1.11 | 1.00 |

**Tight end is the widest separation on the board.** Top-3 teams draft a second
tight end; bottom-3 teams do not. This corroborates **P120**, which found TE the
only position to separate on finish (p = 0.0043), reached from a different
direction.

**And the shipped equation forbids exactly that.** `CORY_CURVE.TE = [1, .05, 0]`
— a second tight end is a **twentyfold hole**, so it is taken only when nothing
else on the board is within 20× of it.

## THE CHANGE — a substitution, not a tune

**⚠️ NO NUMBER IS BEING CHOSEN OR SWEPT.** `no_fit_guard` forbids selecting a
value because it performs. The change replaces the **transcribed** TE row with
the **measured** one that already exists, has already passed its own controls,
and was committed long before tonight:

```
CORY_CURVE.TE   [1.000, 0.050, 0.000]     Cory's transcription
measured_need   [0.719, 0.414, 0.406]     measured_need_curve.json
```

**One object swapped for another object, on the one position where an
independent measurement says the transcription is most likely wrong.** Every
other position keeps Cory's row untouched.

⚠️ **`0.414` is not my number and I did not pick it.** It is what
`measured_need_curve.json` — 540 team-weeks, its own passing controls — records
for the second tight end.

## PREDICTIONS

**P224 — it beats the shipped arm on the grade Cory says decides.** Skill delta
**> +7.9** (today's value).

**FALSE if it does not.** ⚠️ **And it must also not go backwards on actual
points**: actual **≥ −20.4**. Dead end 1 taught that one grade alone can ship a
disaster.

**P225 — it beats plain best-available, which is the real comparator.** Skill
**> 0.0** and actual **> +2.5**.

**FALSE otherwise.** The shape term has never cleared this bar. If a measured TE
row does not clear it either, the honest conclusion is that shaping does not pay
in this league and Cory should be told that in those words.

**P226 — the roster moves toward the winners, not just the arithmetic.** Mean TE
drafted rises above **1.30**, from today's ~1.0.

**FALSE if TE does not move** — then the row swap changed the score without
changing the behaviour and P224/P225 are measuring something else.

**⚠️ AND ALL THREE ARE REPORTED EVEN IF ONLY ONE FIRES.** Three predictions were
left FALSE tonight at bars they nearly cleared. No bar in this file moves.

## CONTROLS

1. **C1 — KNOWN POSITIVE (rule 3e).** `w(TE, 1)` must change from 0.050 to
   0.414 and be seen doing so. If it does not, the edit did not take.
2. **C2 — nothing but TE moves.** `w` for QB/RB/WR/K/DEF bit-identical at every
   holding.
3. **C3 — legality.** 30 of 30 rosters legal, the bar dead end 1 broke.
4. **C4 — paired.** Same 30 seat-years, same rooms; only `startProb` differs.
5. **C5 — both gradings reported**, per Cory's standing ruling.

## GUARD

**Ships to `engine.js` only if P224, P225 and P226 all hold.** Otherwise the
shipped arm stands, this becomes the third documented dead end, and the answer
to *"are you going to let humans beat you"* is **"on this evidence, yes, and
here is what I tried."**

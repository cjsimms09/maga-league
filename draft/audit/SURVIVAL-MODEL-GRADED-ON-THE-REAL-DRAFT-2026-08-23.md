# The survival model told Cory to reach — graded on his own draft

**E (red team), 2026-08-23.** First real grade of a shipped component against
the 2026 draft. **Base rate printed before the score**, which is register 265's
rule applied to my own work.

## The measurement

`pre_draft_freeze_2026.json` carries `availability_by_pick`: for all **682**
players, P(available) at each of Cory's twelve picks. The committed pick log
says who went when, so every outcome is known. For each of his picks *P* and
every player still available at *P*:

* **prediction** = `availability_by_pick[pid][next pick after P]`
* **outcome** = survived iff he was not taken in `[P, next)`

**6,608 graded pairs across 11 of his 12 picks.**

**BASE RATE: 0.9826.** Most of a 682-man pool is deep bench nobody drafts, so a
Brier score against this is nearly meaningless on its own — model **0.0152** vs
climatology **0.0171**, a +11.0% skill that says almost nothing. **The number
that matters is what happens where the model is not confident.**

## Calibration

| predicted | n | mean predicted | actual survival |
|---|---|---|---|
| 0.00–0.05 | 47 | 0.013 | **0.277** |
| 0.05–0.20 | 41 | 0.126 | **0.707** |
| 0.20–0.40 | 39 | 0.301 | **0.744** |
| 0.40–0.60 | 51 | 0.507 | 0.627 |
| 0.60–0.80 | 67 | 0.710 | 0.836 |
| 0.80–0.95 | 117 | 0.892 | 0.889 |
| 0.95–1.00 | 6,246 | 0.999 | 0.997 |

**The confident half is well calibrated. Everything below 0.80 is badly
under-confident, in one direction.**

## The finding

**Decision-relevant set (predicted < 0.80): n = 245.**
**Mean predicted 0.371 · actual survival 0.649 · gap +0.278.**

**Of 245 players the model said were unlikely to last, 159 actually lasted —
65%.**

**The direction holds at 11 of 11 of his picks**, and widens as the draft goes
on:

| pick | n | predicted | actual |
|---|---|---|---|
| 33 | 22 | 0.291 | 0.318 |
| 48 | 13 | 0.504 | 0.692 |
| 53 | 22 | 0.324 | 0.409 |
| 68 | 15 | 0.473 | 0.733 |
| 73 | 27 | 0.352 | 0.519 |
| 88 | 15 | 0.355 | 0.667 |
| 93 | 26 | 0.414 | 0.577 |
| 108 | 18 | 0.389 | 0.889 |
| 113 | 29 | 0.359 | 0.690 |
| 128 | 25 | 0.406 | 0.920 |
| 133 | 33 | 0.323 | 0.758 |

Eleven of eleven is what makes this a finding rather than noise; no single band
is large.

**In Cory's language: when the board said "take him now, he will not last," the
man lasted about two times in three.** Ricky Pearsall was predicted **0.00** at
picks 113, 128 *and* 133 and was available at all three. Brock Purdy, Wan'Dale
Robinson and Jakobi Meyers likewise at 133. **Rachaad White was predicted 0.00
at 133 — Cory took him at 148.**

## Why, and it is not the model's arithmetic

The freeze is `status: PROVISIONAL` and — its own field —
**`opponent_keepers_applied: 0`**. It was taken when 4 of 10 teams had
designated and no keeper placements existed, so **all 20 opponent-kept players
were still in its pool, competing to be drafted.** In the real draft they were
removed as keepers and only **127 competitive selections** happened, not 150.

Both effects push survival predictions the same way — down. That is the
direction measured, and the widening with pick number is what un-applied
keepers predict: the simulation keeps spending picks on men who were never
available to be spent on.

**So this is the provisional freeze propagating into every survival number on
the board, not a flaw in the survival maths.** `draft_ready` printed the fix
line for days — *"delete it and re-take it AFTER the slate confirms."*

## Controls

Both arms, because register 265 was a null that looked like a score:

* **Both outcomes exist** — 6,493 survived, 115 gone. (The log's own stored
  column had 144 gone and 0 survived, which is why it could not be graded.)
* **The confident band behaves** — predicted ≥ 0.95 → actual **0.9974**. A probe
  that mis-joined ids would not produce that.

## What it does not say

Not that the tool cost Cory points — that needs the counterfactual roster, which
this does not touch. It says the **urgency signal specifically** was biased
toward "now", by a measured +0.278 where it mattered, from a cause that is
named and fixable.

## What to do

1. **Re-take the freeze post-lock** and re-derive `availability_by_pick`. Same
   code, correct pool. This grade becomes the before-measurement.
2. **Re-run this grade after**, and the gap should close. If it does not, the
   survival maths is implicated and this artifact was wrong about the cause.
3. **Ship the base rate beside every grade.** +11.0% skill against a 0.9826 base
   rate is the kind of number that reads as success and is not one.

*Reproduce: `draft/audit/survival_grade_2026-08-23.py`.*

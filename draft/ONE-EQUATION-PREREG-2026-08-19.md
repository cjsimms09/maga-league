# PREREGISTRATION — one equation, no cap, no seats. Does Cory's roster FALL OUT?

**A, 2026-08-19, committed BEFORE the run.** Draft 08-22.

**Cory, verbatim:** *"this is the solve to a lot of our problems if we can get it
right. RB and WR injured a lot more, the correct equation will normally draft
3-4WR, 3-4RB, 1Qb, 1TE, 1 def, and 1 K normally!!! and extract the most value out
of draft in the process."*

**That is a specification, and it is falsifiable.** He is not asking for a cap —
he is saying **the right equation produces that shape on its own.** My capped arm
hits `QB1 RB6 WR5 TE1 K1 DEF1` **because I forbade a second QB**, which proves
nothing about the equation. This tests whether the shape falls out.

---

## 1. THE EQUATION — one line, for every pick, starter and bench alike

```
value(p)  =  need(pos, held_at_pos)  ×  ( proj_mean(p)  −  waiver_level(pos) )
```

**take the highest. That is the whole model.**

**Why it needs no seat logic:** `need = 1.0` while `held < S`, so a position you
cannot yet field prices at its full margin over the wire and gets taken first.
Starters fall out of the same equation that prices the bench. **No slot
assignment, no shortlist, no positional cap, no weights.**

- `need` — the **season-basis** curve corrected today
  (`NEED-CURVE-RESULT-2026-08-19.md`): `q = (17 − games_expected + 1)/17` from
  the board, `season = 1 − (1 − weekly)^17`. **This is the piece that was broken:
  the shipped one-week version collapses RB need two bodies too early.**
- `waiver_level` — `draft_plan.js`'s measured levels, **QB 319 · RB 112 · WR 124
  · TE 124 · K 134 · DEF 112**. This is what carries "you can just stream one".

**Cory's mechanism, in one sentence: RB and WR are injured more AND their wire is
barren, so their need stays high and their margin stays large; QB and TE are
durable-ish AND their wire is deep, so the second one is worth almost nothing.**

## 2. THE FLEX, WHICH IS THE ONE HONEST DIFFICULTY

`need` depends on how many starting slots a position has, and **the FLEX belongs
to whichever position ends up filling it — unknown at pick 33.** Today's curve
credits it to RB by assumption, which makes WR collapse a body early (P142 was
FALSE on exactly this).

**Declared before the run, not chosen after:** the flex is credited to the
position that currently has the **largest need-weighted margin**, recomputed at
every pick. It is a live seat going to whoever most deserves it, which is what a
flex is. **No tuning knob.**

## 3. PREDICTIONS

**P144 — the shape falls out with NO CAP.** Driven down Cory's real twelve picks
with his real three keepers, the equation alone draws **3–4 WR and 3–4 RB among
the twelve drafted, exactly 1 QB, exactly 1 TE, exactly 1 K, exactly 1 DEF.**

**FALSE if any of those is missed** — in which case the shape needs a cap and
Cory's *"the correct equation will normally draft"* is not yet true of this
equation.

**P145 — and it does NOT cost value.** Total `proj_mean` of the twelve drafted is
**within 5%** of `draft_plan.js`'s twelve on the same board and schedule.

**FALSE if it gives up more than 5%** — that would mean the shape is bought with
points, which is the trade Cory explicitly does not want (*"and extract the most
value out of draft in the process"*).

⚠️ **P144 is the one I expect to fail, and I am saying so first.** The equation
has no upside term and no tie-break; a pure need×margin rule may well take a
fifth or sixth back late, because RB margin over a 112-point wire stays large
long after need has decayed. **If it fails, the honest reading is that the wire
level is doing too much work at RB, not that Cory is wrong.**

## 4. CONTROLS

1. **Reproduce the need curve.** The driver must call the same `needNew` as
   `need_curve.js` and reproduce its published table exactly.
2. **Flex credited once**, at every pick, checked every pick — not once at the
   start. The bug that drafted three tight ends was crediting it three times.
3. **Keepers count** toward `held` from pick one.
4. **Exactly twelve picks**, and the schedule must equal `draft_plan.SCHED`.
5. **Room drain identical** to the other arms (strict ADP order), so shape
   differences are the equation's and not the room's.

## 5. THE GUARD

**REPORT ONLY.** `draft_plan.js` and the engine are untouched; this writes no
board field and ships nothing. **`no_fit_guard`: if P144 fails I do not add a cap
and re-run — the failure is the finding, and the fix is a preregistered change to
the EQUATION, not scaffolding around it.**

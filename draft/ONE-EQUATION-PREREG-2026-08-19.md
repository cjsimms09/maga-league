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

---

# ADDENDUM — P144 FALSE on one cell. The diagnosis, and the preregistered fix.

**Result: `QB2 RB3 WR4 TE1 K1 DEF1` among the twelve drafted.**
**Five of six cells hit — WR 4 ✅ · RB 3 ✅ · TE 1 ✅ · K 1 ✅ · DEF 1 ✅ — and
`QB 2` ✗.** **P145 TRUE:** 2309.5 projected points against `draft_plan.js`'s
2220.1, **+4.0%** — it extracts *more* value, inside the 5% band.

## THE DIAGNOSIS — a units error in MY equation, not in Cory's reasoning

Pick 93 took a second quarterback at `need 0.933 × (354 − 319) = 32.2`, above a
receiver at 12.0.

**`need` is `P(I will need this body at ALL)`. The equation then multiplies it by
a FULL SEASON's margin.** But a QB2 does not play a season — **he plays the one
or two weeks his starter is out.** The margin is right; the duration is missing.

- QB2: needed ~**1–2 weeks of 17** → his real worth is `35 × 1.5/17 ≈ 3`, not 32.
- RB4: needed **many** weeks — RB `q = 0.224` per week across 3 slots — so his
  full-ish margin is honest.

**That single missing factor is exactly Cory's distinction.** He said QB and TE
collapse because *"you can just pick one up"*; the deeper reason is that **a
backup at a one-slot position plays almost never, and a backup at a three-slot
injury-heavy position plays often.** `need` as a probability cannot see the
difference. **Expected WEEKS STARTED can.**

## P146 — the corrected equation

```
weeks(pos, held) = Σ over w=1..17 of P(at least (held − S + 1) of S starters out in week w)
                 = 17 × weekly            [weeks are exchangeable]

value(p) = weeks(pos, held) / 17  ×  ( proj_mean(p) − waiver_level(pos) )
```

**`need` becomes expected weeks started, normalised.** Nothing else changes — same
waiver levels, same flex rule, still one equation, still no cap.

**P146: with expected-weeks, the drafted twelve are 3–4 WR, 3–4 RB, exactly 1 QB,
1 TE, 1 K, 1 DEF — all six cells — and total projected points stay within 5% of
`draft_plan.js`.**

**FALSE if any cell misses or the value drops more than 5%.**

⚠️ **This is a preregistered change to the EQUATION, which is what §5 said the
response to a failure had to be. I am not adding a cap, and `SHORTLIST`,
`RANK_WINDOW` and the waiver levels are untouched.** If P146 also fails, the next
step is again a stated change to the equation — not scaffolding.

---

# ADDENDUM 2 — P146 FALSE, and WORSE. Two defects in MY driver, both already solved elsewhere in this repo.

**Result: `QB1 RB2 WR3 TE3 K2 DEF1`, and P145 FALSE at −6.9%.** Expected-weeks
fixed the quarterback (QB 1 ✅) and broke three other cells.

## DEFECT 1 — THE FLEX CHASE IS SELF-REINFORCING

`chooseFlexOwner()` gives the flex to whichever position currently has the
largest need-weighted margin. **Once RB and WR are stocked their weights decay,
so TE wins the flex — which raises TE's slot count `S` from 1 to 2 — which makes
a SECOND tight end "a starter" at weight 1.0.** It took Kelce at 93 and Andrews
at 108 for exactly that reason.

**The flex is not a prize for the position with the best margin. It is a seat
filled by whoever is actually on the roster.** `draft_plan.js` already gets this
right: `flexOwner` is set **from the seat assignment**, not from a chase
(`draft_plan.js:433`). My version re-litigates it every pick and lets a position
promote itself.

## DEFECT 2 — A ZERO IS NOT A RECOMMENDATION

Pick 148 took `TE Brenton Strange` at **value 0.0**, and pick 133 a second kicker
at 1.0. When every remaining candidate prices at or near zero the driver still
takes an arbitrary maximum. **`draft_plan.js` explicitly guards this** — *"A ZERO
IS NOT A RECOMMENDATION. Once every remaining option prices at 0 the model has
nothing to say, and picking the arbitrary winner of that tie is how a backup
kicker ends up on the sheet"* — and says **UNPRICED**. I did not carry that
across.

**Both are defects in MY driver, both were solved in this repo already, and
neither is evidence about Cory's equation.** Rule 11: one derivation, reused.

## P147 — the same equation, with both defects removed

- **flex owner** = the position that actually holds a startable surplus body,
  taken from the roster as drafted, **not** re-chosen per pick by margin.
- **UNPRICED floor**: if the best remaining value is `< 1.0`, the pick is
  reported as UNPRICED and **left to upside**, exactly as `draft_plan.js` does.
  It is not filled with an arbitrary zero.

**Nothing else changes: same `E[weeks started]` weight, same waiver levels, one
equation, still no cap.**

**P147: 3–4 WR, 3–4 RB, exactly 1 QB, 1 TE, 1 DEF, at most 1 K, and any remaining
picks UNPRICED rather than junk — with total projected points within 5% of
`draft_plan.js` over the picks it actually prices.**

**FALSE if any cell misses.** ⚠️ **If P147 fails too, I stop iterating and report
that the one-equation form does not produce Cory's shape without structure —
three preregistered attempts is enough to say so honestly rather than keep
tuning until it works.**

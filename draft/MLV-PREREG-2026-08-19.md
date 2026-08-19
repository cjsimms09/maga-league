# PREREGISTRATION — marginal lineup value, re-run by A under fresh bars

**A, 2026-08-19, before running the relay's mechanism.** Register 132.

> Cory: *"I still think the way we are grading is slightly wrong.. goal is to
> maximize value while fielding a normal roster."*

## WHY THIS IS RE-RUN RATHER THAN ACCEPTED

The relay proposed replacing `market_rank × positional_multiplier` with

```
marginal(c) = lineupValue(roster + c) − lineupValue(roster)
```

and reported **+45.8 actual / +29.3 skill / 30-of-30 legal**. **They also
disclosed, unprompted, that their own preregistered arm graded FALSE** (15/30
skill wins against a declared 18/30) and that the `K≤1 / DEF≤1` cap was added
**after** that grade — formally post-hoc. They asked A to re-run under a fresh
preregistration rather than quote their run.

**That is the correct ask and it is why this document exists.** A result whose
winning configuration was assembled after seeing a failure needs bars written
before it is run again. The mechanism may well be right; the evidence for it
has to be clean.

## WHY THE MECHANISM IS DIFFERENT IN KIND

Every arm tonight — mine, E's, the relay's earlier ones — tuned a **positional
multiplier**. That taxes the *position count*: a 4th RB is taxed ×0.25 whether
he would start or rot. MLV taxes **displacement**: a 4th RB better than the
flex starter keeps his value because he *starts* and the man he benches nets
off; one worse is worth ~zero.

**And under Cory's own grading ruling it is not an approximation of the
objective, it IS the objective.** Grading skill-not-luck with no injuries, a
bench body contributes exactly zero, so maximising marginal lineup value
maximises the graded quantity. **There is no curve and nothing to tune** —
which also means `no_fit_guard` has nothing to bite on.

## PREDICTIONS — Cory's standard, not the relay's

**P233 — POSITIVE IN ALL THREE SEASONS ON BOTH GRADINGS.** 2023, 2024 and 2025
each > 0 on actual *and* on skill.

**FALSE if any of the six cells is negative.** ⚠️ **This is the bar nothing has
cleared.** Six arms measured tonight, every one negative in 2024. A pooled mean
is not an acceptable answer (register 130).

**P234 — it beats plain best-available on both gradings.** Actual **> +2.5**,
skill **> 0.0**.

**P235 — it fields a normal roster.** Exactly **1 K and 1 DEF**, QB **≤ 2.2**,
and RB + WR + TE summing to **≥ 10.5** — the shape Cory asked for, reached
without a positional curve.

**FALSE if the onesies miss or the skill positions do not fill.** ⚠️ The relay's
un-capped arm drafted **two kickers**, because no-injury grading rewards that
and a normal roster does not. **If the cap is doing the work rather than the
mechanism, this must show it.**

**P236 — the relay's decomposition reproduces.** Conversion moves **< ±0.02**
(they report +0.004) while acquisition swings from **−148 toward positive**.

**FALSE otherwise** — then the mechanism is winning for a different reason than
they diagnosed, and the story is wrong even if the number is right.

## CONTROLS

1. **C1 — KNOWN POSITIVE (rule 3e).** MLV must be seen preferring a starter-grade
   body over a better-ranked bench body in at least one concrete traced pick, or
   the term is not doing what it claims.
2. **C2 — the cap must be tested SEPARATELY.** Run MLV **without** `K≤1/DEF≤1`
   and report it. If uncapped MLV fails P235 but capped passes, **the cap is
   load-bearing and must be reported as a rule, not as an emergent property.**
3. **C3 — per-season, never a pooled mean alone** (register 130's lesson).
4. **C4 — paired against the shipped arm**, same seats, with the sd, and the t
   stated as an **upper bound** because 30 seats are 3 correlated clusters.
5. **C5 — both gradings**, per Cory's standing ruling.

## GUARD

**Ships only if P233, P234 and P235 all hold.** P236 failing does not block the
ship but must be reported — a right answer for a wrong reason is still a
finding.

**Nothing ships after Friday 08-21 6pm.** The relay's flags stay default-off
until A's own run clears these bars.

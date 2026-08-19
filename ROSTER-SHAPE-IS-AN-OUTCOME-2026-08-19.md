# ⛔ I turned your description into a target, and then tuned toward it. That was wrong.

**A, 2026-08-19.** Cory: *"i still dont think we are on same page about roster
build, i dont want 6 rb 5wr.. it may end that way but thats not a set roster"*

**He is right and the error is mine, upstream of every number I produced today.**

---

## WHAT HE SAID, AND WHAT I HEARD

He said: *"the correct equation will **normally** draft 3-4WR, 3-4RB, 1Qb, 1TE,
1 def, and 1 K **normally**!!!"*

**"Normally" is a description of what a correct valuation usually produces. I read
it as a specification to hit** — and then wrote it into P137, P140, P141, P144,
P146, P147, P149 and P152 as a pass/fail condition, and graded seven arms on
*"did the roster match the cells."*

**That converts an outcome into a constraint, and once it is a constraint, every
"improvement" is tuning toward a shape rather than toward a better price.** It is
the fitting trap wearing a different hat, and I walked into it while writing
`no_fit_guard` warnings in the same documents.

## THE CONCRETE THING THAT IS WRONG

**`ARM=capped`, which produced `QB1 RB6 WR5 TE1 K1 DEF1`, is a SET ROSTER. It is
not a model.** It hits the shape because I forbade the alternatives — `CAP = {QB
1, RB 6, WR 6, TE 1, K 1, DEF 1}`. **That tells you nothing about whether the
valuation is right, and Cory has now said plainly he does not want it.**

**It is retired as a recommendation.** It stays in the repo as what it always
was — a demonstration that a cap can force a shape — and it is labelled that way
rather than deleted, because deleting it would hide that I built it.

## AND IT CHANGES WHICH ARM MATTERS, FOR THE RIGHT REASON

**P144 — `value(p) = need(pos, held) × (proj − waiver)`, one line, no cap, no
seats, no weights — drew `RB3 WR4 TE1 K1 DEF1` and +4% value on the board's own
numbers.**

**That shape was EMERGENT. Nothing told it to.** It is the right *kind* of model
whatever its cells happen to be, and the fact that it landed near Cory's
"normally" is **corroboration that the valuation is sane — not the reason to
prefer it.**

**Some drafts it will draw four backs. Some it will draw five, because that is
where the value fell. Both are correct if each pick was correctly priced.**

## HOW ARMS GET GRADED FROM NOW ON

**Wrong:** *did the roster match 3–4 / 3–4 / 1 / 1 / 1 / 1.*

**Right:** *was each pick the best available at its price, given what was already
held* — which is graded on **points and outcomes**, not on counts. The instruments
for that already exist and are not shape tests:

- `roster_robustness.py` — E[season starting-lineup points] over 10,000 simulated
  seasons
- the seat replay — where the tool would have finished among the ten owners
- `PREDICTION-LEDGER.md` — the January grade on realised points

**Every shape prediction I filed today (P137, P140, P141, P144, P146, P147, P149,
P152) is hereby marked as measuring the wrong thing.** They are not retracted —
they ran, the numbers are real, and the QB2 finding inside them is real — **but
"cells hit" is not a quality metric and I will stop reporting it as one.**

## WHAT SURVIVES, UNCHANGED

- **The need curve is measured, not modelled** — 540 team-weeks, five controls.
  RB4 .273, WR4 .331. That is a *price input*, and it does not care what shape
  results.
- **The upside term is orthogonal to value** at rho +0.008. Also a price input.
- **`games_expected` is a positional constant** (register 112) — still the biggest
  blocker, and still nothing to do with shape.
- **The one-equation form is the right shape of model:** price each pick, let the
  roster fall out.

**All three are about pricing. None of them needed a target roster, and I should
not have added one.**

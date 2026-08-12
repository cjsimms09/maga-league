# Item 4b — when to take a onesie, measured as a difference of differences

**Two results, and the second is the one that narrows the problem.**

1. **Survival treatment does NOT move the crossovers** — and the null is real
   rather than vacuous, which I checked.
2. **K and DEF never become urgent, at any pick, under either survival
   treatment.** This is a QB-and-TE problem, exactly the narrowing you
   anticipated, and the shipped rule is already right for half the onesies.

The decision gate — the crossover policy as an arm against the shipped rule on
the paired construction harness — is running; results append below.

---

## THE MEASUREMENT

`draft/tools/onesie_timing.js`. Loss from waiting, in projected season points,
at each of my eleven picks from seat 8 after three keeper rounds.

**DoD = onesie loss − FLEX loss.** Positive means the onesie is the more urgent
pick. The positional curves are diagnostic; this is the decision quantity.

| pick | flexLoss | QB loss/DoD | TE loss/DoD | K loss/DoD | DEF loss/DoD |
|---|---|---|---|---|---|
| 33 | 5.2 | 8.6 / **+3.3** | 15.6 / **+10.4** | 0.0 / −5.2 | 0.0 / −5.2 |
| 48 | 3.8 | 5.9 / **+2.1** | 3.2 / −0.6 | 0.0 / −3.8 | 0.0 / −3.8 |
| 53 | 18.2 | 1.9 / −16.4 | 3.4 / −14.8 | 0.0 / −18.2 | 0.0 / −18.2 |
| 68 | 5.9 | 1.9 / −4.0 | 3.0 / −2.9 | 0.0 / −5.8 | 0.0 / −5.9 |
| 73 | 3.6 | 3.6 / −0.0 | 2.0 / −1.6 | 0.0 / −3.6 | 0.0 / −3.6 |
| 88 | 1.7 | 2.7 / **+1.0** | 1.3 / −0.5 | 0.0 / −1.7 | 0.1 / −1.7 |
| 93 | 2.7 | 10.8 / **+8.0** | 6.2 / **+3.5** | 0.5 / −2.3 | 0.5 / −2.2 |
| 108 | 3.0 | 2.6 / −0.4 | 1.9 / −1.1 | 0.4 / −2.6 | 0.3 / −2.6 |
| 113 | 2.4 | 10.6 / **+8.2** | 1.4 / −1.0 | 1.7 / −0.7 | 2.1 / −0.3 |
| 128 | 0.7 | 4.1 / **+3.4** | 1.0 / **+0.3** | 0.4 / −0.4 | 0.3 / −0.5 |
| 133 | 2.8 | 4.7 / **+1.9** | 5.7 / **+2.9** | 0.4 / −2.4 | 1.5 / −1.2 |

### 🔴 IT IS NOT A CROSSOVER. IT OSCILLATES.

**There is no pick after which the onesie is urgent and before which it is not.**
QB's DoD is positive at 33 and 48, **negative from 53 through 73**, positive
again at 88–93, negative at 108, positive at 113–133. TE does the same.

**So the shape refutes the form of the rule, not just its parameter.** A
"take the onesie after pick X" policy cannot fit a signal that changes sign five
times. What the curve actually says is *take QB or TE at the specific picks where
a tier is about to break*, and the picks where that happens are a property of
this board rather than of the position.

**The magnitudes are also small.** The largest single DoD is **TE +10.4** at my
first pick, and most are under 4 projected season points — **under a quarter of a
point per week.** That is well inside the territory your own gate calls
arithmetic.

---

## SURVIVAL, BOTH WAYS — AND THE NULL IS NOT VACUOUS

| position | raw survival | conservation-constrained | moved? |
|---|---|---|---|
| QB | first positive at pick 33 | pick 33 | **no** |
| TE | first positive at pick 33 | pick 33 | **no** |
| K | **never** | **never** | no |
| DEF | **never** | **never** | no |

**You warned against assuming the bias cancels, and you were right to — but
measured, it does not matter here.**

> **⚠️ AND I CHECKED THAT THE TWO ARMS ARE ACTUALLY DIFFERENT COMPUTATIONS**,
> because `survival()` falls back to raw whenever `conservedSurvival` reports
> `applied: false`, and two identical arms agreeing would be a rule-10d
> tautology dressed as a result. Verified directly at pick 33:
> `conservedSurvival applied = true`, and `E[best QB]` moves **363.914 → 365.527**.
> The conservation correction fires and changes the numbers; it is simply too
> small to move a sign that is oscillating by several points.

**So: survival uncertainty is not decision-critical for this question.** That is
the good half of your either/or, and it is a real result rather than an absence.

---

## K AND DEF: NO MEANINGFUL TIMING DECISION, REPORTED AS A RESULT

**Their DoD is negative at every one of my eleven picks, under both survival
treatments.** The flex alternative always loses at least as much from waiting.

The diagnostic agrees: top-20 spread is **20 points for K and 22 for DEF**,
against 76 for QB, 86 for RB and 69 for TE — roughly a quarter of a point per
week between the best and the twentieth-best.

> **This is the narrowing you anticipated. It is a QB-and-TE problem, and the
> shipped deferral rule is already correct for K and DEF.** Not a failure of the
> experiment — half the onesies are now settled and can stop being argued about.

*(I set the flatness threshold at a 20-point spread before running, and K landed
exactly on it. I am not moving the threshold to make K read "flat": the DoD says
it never crosses, which is the decision quantity, and the spread is diagnostic.)*

---

## THE BOUNDARY, HELD

Nothing here changes a shipped value. No urgency weight, no change to VORP, no
influence on the live draft. `onesie_timing.js` prints and proposes nothing.

**The gate is the arm**, and it is deliberately a *minimal* difference from the
shipped rule: `onesie_timing` in `construction_order.js` takes the most urgent
open onesie **only when its DoD is positive**, and otherwise falls through to
`E.recommend` unchanged. So the paired difference is attributable to the timing
signal rather than to a different ranking rule.

**Your bar, declared before the run: under one projected starting-lineup point it
closes as arithmetic.**

### 🔴 IT CLOSES. IT DOES NOT EVEN GAIN.

| room | onesie_timing vs shipped | holes |
|---|---|---|
| **adp** (n=100 paired) | **−2.2 ± 3.3** | 0 |
| **profiled** (n=100 paired) | **−4.2 ± 4.5** | 0 |

**Negative in both rooms, with both intervals spanning zero.** The policy does
not beat the shipped rule; the best that can be said is that it is not measurably
worse. Under a bar of *"gains under one point closes it"*, a policy that gains
nothing closes with room to spare.

**And I recorded the expectation before the number arrived** — *"given the DoD
magnitudes above I expect it to close as arithmetic"* — which is the only reason
that sentence is worth anything now.

**So item 4b resolves as: the shipped deferral rule is not leaving measurable
points on the table.** The timing signal is real, it is small, it oscillates, and
routing it into a policy does not produce a better roster.

---

## LIMITS, STATED BEFORE THEY ARE ASKED FOR

- **Layer-1 survival only.** `intervening` is empty, because this tool has no
  opponent rosters, so Layer 2 — which models the specific owners picking between
  my turns — never engages. Right restriction for a question about the shape of a
  curve; wrong one for a live rule.
- **ADP depletion for the board at each pick**, the room measured to over-draft
  QB by 40% and TE by 33%. Both arms of every DoD face the identical board so it
  cancels *within* a comparison — but **not** for the pick numbers, which is why
  the policy arm runs in both room models.
- **A defect of mine, caught and recorded rather than quietly fixed.** My first
  version passed `currentPick: null` into the survival context.
  `survivalProbability` branches on exactly that field: with it set, it asks
  *"given he is available now, is he there at my next pick"*; with it null it
  answers the **unconditional** question. Every loss came out roughly ten times
  too small, and the two survival arms then appeared to move the TE crossover by
  **80 picks** — a headline finding that was my own malformed argument. The
  context is now the scorer's own shape.

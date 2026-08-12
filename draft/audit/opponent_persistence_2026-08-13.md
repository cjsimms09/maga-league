# Do owner tendencies persist? — answered out of sample, and a power problem found

**Two results. The second matters more than the first, and it is about the live
experiment's design rather than about owners.**

1. **Out of sample, the profile arm ties the market proxy** — +1.6pp in 2024,
   +0.0pp in 2025, mean **+0.8pp**. Under your own declared rule, **a tie does
   not distinguish the two worlds.**
2. **🔴 THE EXACT-PLAYER RULE IS UNDERPOWERED AT THE MEASURED BASE RATE.** Both
   arms hit **2–3%**, so one draft gives ~4 hits per arm and the smallest gap it
   could resolve is **~5.8pp** — roughly four times the largest effect either
   season produced.

---

## THE TEST, AND WHY IT IS NOT CIRCULAR

`manager_profiles.json` was **built from these same drafts.** Predicting them
with it would be fitting to training data (rule 10d), and would have reported a
number far above anything real.

**So both arms are rebuilt per target season from the seasons BEFORE it, and the
shipped artifact is never consulted.** 2024 is predicted from 2023; 2025 from
2023+2024.

**The baseline had to be rebuilt for the same reason.** A contemporaneous
2024/2025 ADP does not exist in this repository — scoring an old draft against
the 2026 ADP would measure two years of career trajectory and report it as market
knowledge. The baseline is therefore a **market proxy**: a player's average draft
position across the prior seasons only. **Both arms see the identical information
cut-off**, which is the whole design; an asymmetric cut-off would let either arm
win for a reason unrelated to tendencies.

Keepers are excluded from both. A keeper is not a draft decision — it is a slot
pre-assigned before the room sat down, and counting it as a tendency would score
the league's keeper rules as if they were the owner's behaviour.

| target | built from | n | profile | market proxy | difference |
|---|---|---|---|---|---|
| 2024 | 2023 | 127 | **3.1%** | 1.6% | **+1.6pp** |
| 2025 | 2023, 2024 | 130 | **2.3%** | 2.3% | **+0.0pp** |
| | | | | | **mean +0.8pp** |

---

## 🔴 THE POWER PROBLEM, AND IT IS THE ACTIONABLE HALF

**Exact-player accuracy is 2–3%.** At that base rate, with n = 135 predictions in
one draft:

| base rate | n | hits per arm | SD of the arm difference | smallest resolvable gap |
|---|---|---|---|---|
| **3%** | **135 (one draft)** | **~4** | **2.8 picks** | **~5.8pp** |
| 3% | 270 (two drafts) | ~8 | 4.0 picks | ~4.1pp |
| 3% | 675 (five drafts) | ~20 | 6.3 picks | ~2.6pp |

> **The largest effect either season produced was 1.6pp. One draft could not
> resolve anything smaller than 5.8pp.** So the live experiment on the 22nd is,
> on this evidence, **roughly four times too coarse to see the effect it is
> looking for** — and would report a tie whether or not tendencies persist.

**This is not an argument for a softer rule to get a nicer number.** Your
reasoning for exact-player stands entirely: it removes tuning surface, and it
keeps the comparison symmetric. It is a measured statement that the primary
instrument may be unable to answer the question at the sample sizes available,
which you asked to be told rather than to assume.

### WHAT I WOULD DO, AND IT IS YOUR CALL

**Keep exact-player as the headline. Add ONE secondary diagnostic, declared now,
before any live data exists** — which is the condition under which adding it is
not tuning:

> **POSITION-CORRECT.** Did the arm name the right POSITION at this pick?
> Applied identically to both arms, so the comparison stays symmetric.

It is the natural second measure because **the profile arm is literally a
positional model** — it predicts a position and then defers to the market within
it. Exact-player asks it to win at something it does not model. Position-correct
asks it to win at the thing it does, and its base rate will be an order of
magnitude higher, which is where the power comes from.

**Declared now, graded separately, and never substituted for the headline.** If
exact-player and position-correct disagree, that disagreement is itself the
finding: tendencies would predict *what kind of player* an owner takes without
predicting *which one* — which is exactly the distinction between describing an
owner and predicting them.

---

## LIMITS, STATED BEFORE THEY ARE ASKED FOR

- **Two target seasons is TWO CLUSTERS.** A direction and a magnitude, never an
  interval.
- **The market proxy is weaker than the live baseline will be.** "Average pick
  number across prior seasons" in a 10-team keeper league with heavy turnover is
  a much cruder instrument than real ADP. **That biases toward the profile arm**,
  which makes the tie result stronger rather than weaker — the profile could not
  beat even a weak baseline — but it means the +0.8pp should not be expected to
  transfer to the live experiment.
- **A player the prior seasons never saw is invisible to both arms.** Rookies are
  unpredictable here by construction. That biases the arms down equally and
  neither relatively.
- **This does NOT retire the live experiment.** It measures the same question on
  older, thinner evidence with a worse baseline. The 22nd is still the better
  instrument on every axis except sample size — which is precisely the axis the
  power table says is binding.

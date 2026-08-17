# Who owns the MODEL, and how much scrutiny an input has to earn

**Cory, 2026-08-17:** *"I NEED SOMEONE WHO IS WATCHING THE WHOLE MODEL… IT IS TO
GIVE ME AN EDGE… IT JUST DECIDED RANDOMLY WE WOULD ONLY USE SLEEPER DATA INSTEAD
OF LOOKING FURTHER IF THERE IS A BETTER WAY… WE NEED TO BE MORE STRICT DEPENDING
ON HOW FAR REACHING THAT DATA IS… I WONT USE THE TOOL IF THE MODEL DOESNT HELP ME
DRAFT A WINNING TEAM."*

---

## 1. THE INDICTMENT, IN ONE LINE

**We spent three preregistered studies across two independent seed sets on the
`ceiling` weight — measured 08-17 as moving at most 5 late-round bench spots and
never the top recommendation — and ZERO studies on which projection source feeds
the board, which sets every number on it.**

**Scrutiny was inversely proportional to blast radius.** Nobody chose that. It
happened because rigor attaches to whatever question is currently open, and no
rule says a load-bearing input has to earn more of it than a leaf.

## 2. THE RULE — TIER BY REACH, NOT BY INTEREST

Every input, constant and source gets a tier by **how far downstream it reaches.**
The tier sets the bar it must clear, and the bar is not negotiable by proximity to
the draft.

| tier | what it is | examples | the bar |
|---|---|---|---|
| **T1 — FOUNDATIONAL** | everything downstream reads it | **the projection source**, `proj_mean`, realized-points store, the scoring table, the crosswalk | **A named alternative must be MEASURED against it before it ships or stays.** "It was already here" is not a justification. Re-examined every preseason. |
| **T2 — STRUCTURAL** | changes the ORDER of the board | VORP replacement levels, position scarcity, `adjusted_adp`, the composite's `value` term | Preregistered study, matched population, known-positive control. |
| **T3 — MODULATING** | shifts magnitudes inside an existing order | `ceiling`, `tier`, `need`, `risk`, `stack` weights; `autoWeights` phases | Prereg + control. **Blast radius measured and stated** before it ships. |
| **T4 — COSMETIC / LEAF** | reaches one surface or one row | copy, labels, tie-break epsilons, display toggles | Test it works. Ship it. |

**THE ASYMMETRY THAT MATTERS: a T1 input is guilty until proven innocent.** A T4
is innocent until proven guilty. We have been treating the projection source —
the most T1 thing in the entire system — as a T4 that shipped because it was
there first.

### The T1 register, and its current state

| T1 input | alternative measured? | status |
|---|---|---|
| **projection source** (Sleeper) | **NO — never, until today** | 🔴 `source_blend_2025.py` built, awaiting dispatch |
| `proj_ceiling` construction | YES — fixed 08-17 (was `mean × 1.35`, now measured p90) | 🟠 73 players still `gaussian_z` |
| realized-points store | partial — 2021-2025 exist | 🟠 2025 blocked on laterals |
| house scoring table | YES — frozen, parity-tested | ✅ |
| player crosswalk | YES — match rate reported per run | ✅ |

**Three of five T1 inputs are not clean.** That is the actual state of the model's
foundations, and it is a more useful thing to know than any single weight.

## 3. "TOO CLOSE TO THE DRAFT" IS NOT A REASON. RISK IS.

**Cory is right that the date is a dumb filter, and the relay has used it twice.**
The correct filter is not *when* but *what*:

| the change… | ship it, even on 08-21 | hold it |
|---|---|---|
| makes a number MORE correct, with a measured blast radius | ✅ **YES** | |
| is a fix to a defect | ✅ **YES** | |
| is a fit against data we hold, with a control | ✅ **YES** | |
| is a NEW UNTESTED MECHANISM with no measured blast radius | | ❌ hold |
| would be tuned against the draft it is about to run | | ❌ hold — that is fitting to the test |

**The ceiling weight passes this test.** Measured, bounded, ≤5 late bench spots,
top pick never changes. **The blend passes it too if it clears its own prereg.**
Neither is a "too close to the draft" case; both were treated as one, by me.

## 4. WHO OWNS THE MODEL — the gap Cory is describing

| role | object | can decide? |
|---|---|---|
| **A** | is it CORRECT — merges, gates, CI, what a number means | yes, on correctness |
| **B** | the surfaces | no |
| **C** | getting data in | no |
| **D** | is data used, graded, fed back | no |
| **E** *(as scoped today)* | does an OUTPUT make football sense | **no — explicitly barred from overriding** |
| **relay** | integration, chasing, keeping the record honest | no |
| **— nobody —** | **does this model give Cory an EDGE, and where does the edge come from** | **— nobody —** |

**Every lane owns a part. No lane owns the point.** That is why the source
question sat: it is not a defect (nothing is broken), not an ask until Cory asked
it, not an output implausibility, and not a data-lifecycle gap. **It falls between
every lane precisely because it is the whole thing.**

### THE FIX: E becomes the MODEL OWNER, not a board red-teamer

E is one session old and has produced nothing yet, so redefining it costs
nothing — and a seventh session costs boot tokens and another coordination edge.

**E's object becomes the MODEL AS A SYSTEM:**
- **Owns the T1 register above.** Every foundational input either has a measured
  alternative or a dated plan to get one. That is E's standing report.
- **Owns "where does the edge come from?"** — and is expected to answer it in
  writing, with numbers, or say we do not know.
- **Decides input policy**, subject to Cory: which sources feed the board and at
  what weight. A keeps correctness and merges; E keeps *edge*.
- **Is the one who says "ship it, it is measured"** when a good input arrives
  late — and the one who says "no, that is untested" when something reckless
  arrives at any time. Cory named both halves; they are one job.
- Keeps the output red-team work — that is how a model owner notices.

**What E must NOT become:** a second gatekeeper. A still merges and still owns
correctness. E can be overruled by A on *correctness* and by Cory on *anything*.

## 5. THE STANDING QUESTION E ANSWERS EVERY WEEK

> **Where does our edge come from, in points, and which input is carrying it?**

If the answer is "we do not know," that is the week's work. **A model that cannot
name its own edge is a model nobody should draft from** — which is exactly Cory's
point, and the reason the tool working is necessary but not sufficient.

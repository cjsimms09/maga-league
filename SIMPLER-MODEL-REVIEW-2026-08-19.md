# The simpler model already exists. It is four terms, and one of them is switched off.

**A, 2026-08-19.** Cory: *"This model sucks. I think maybe we need to simplify,
please review all the resources, if there a simpler model here that uses VONA,
drafts a normal roster, tries to max value?"*

**Short answer: yes — and you are already running most of it. The scoring model
is four live terms. What is not simple is the 700-odd files around it.**

---

## 1. FIRST, TWO THINGS I OVERCLAIMED. YOU WERE RIGHT TO CALL THEM.

**"TE is the one position that separates this league's top-3 teams."** On the
draft length that applies to Saturday (2024+2025, the only seasons with your
15-round format):

| | top-3 | rest | p | n |
|---|---|---|---|---|
| TE | 1.83 | 1.29 | **0.0522** | **6 team-seasons** |
| RB | 3.83 | 4.57 | **0.0617** | 6 |

**Neither clears 0.05. My own audit said "too thin to settle it" — and I then
repeated the TE claim as established in five separate places.** It is a
suggestive effect on six team-seasons. It is not a finding. **The same is true
of "winners draft fewer RBs."**

**"The tool drafts 12 running backs."** That was computed on a 15-pick schedule
starting at pick 8 — three picks you forfeit by keeping three players. On your
real twelve picks it is **RB7 including keepers, five of your own selections**.

**So: "draft 9 RBs and more TEs" was never supported. You were right.**

## 2. WHAT THE MODEL ACTUALLY IS

`MEASURED_WEIGHTS = {value 1, tier 0, need 0, risk 0, ceiling 0.45, keeper 1,
bye 0, stack 1}`

**Four of the eight terms are ZERO.** The live model is:

```
score  =  VONA  +  0.45 × ceiling  +  keeper  +  stack
```

**`value` weight 1 IS VONA.** So the model you asked for — *"uses VONA, maxes
value"* — is the model you are running. It is not a complicated scoring rule.

What surrounds it: **186 tools · 260 backtest scripts · 299 artifacts · 1,113
tests · 193 audit documents · 77 open defect rows · 6,218 lines of engine and
survival code.** The war room reads **five** JSON files.

**The complexity is not in the model. It is in the apparatus.**

## 3. DOES IT MAX VALUE? YES — MEASURABLY.

Replaying the shipped engine into all 30 seat-years of this league's history:

| season | engine roster points | owners' | |
|---|---|---|---|
| 2023 | 20,650 | 20,218 | **+2.1%** |
| 2025 | 21,127 | 20,111 | **+5.1%** |
| 2024 | 17,990 | 21,749 | −17.3% |

**In two of three seasons it acquires MORE total points than the human owners
did.** The value-maximising half works.

## 4. SO WHAT IS ACTUALLY BROKEN — one thing, and it is measured on 30 seasons

**Conversion: the share of roster points that reach a starting lineup.**

| | 2023 | 2024 | 2025 |
|---|---|---|---|
| owners | 0.828 | 0.826 | 0.834 |
| **shipped engine** | **0.740** | 0.815 | **0.771** |

**In 2023 and 2025 the engine holds more points than the owners and loses
anyway, entirely because it cannot start what it holds.** That is your *"roster
still not normal"*, in points, and it is worth **131–180 points per season** —
more than the entire acquisition edge.

**This does not depend on the six-team-season shape data at all.** It is 30
seat-seasons, controlled, and reconciled against a second independent
aggregation to the decimal.

**The cause is one line:** `need` is the only roster-aware term in the composite
and it ships at **weight 0**. Nothing in the scorer prefers a receiver because
you have none. Register 60.

## 5. THE SIMPLER MODEL, CONCRETELY

**It is the model you have, with one weight turned on:**

```
score  =  VONA  +  0.45 × ceiling  +  keeper  +  stack  +  1.0 × need
```

Measured on the same 30 seat-years:

| arm | conversion | roster pts vs shipped | **lineup pts / seat-season** |
|---|---|---|---|
| shipped | 0.740 / 0.815 / 0.771 | — | — |
| **`need: 1.0`** | **0.876 / 0.849 / 0.829** | −99 | **+68.6** |
| slot-aware | 0.878 / 0.825 / 0.815 | −84 | +58.2 |

**`need: 1.0` closes the entire conversion gap and overshoots it.** It acquires
*less* raw value and starts more of it — which is exactly the trade you want,
because points on your bench are worth nothing.

## 6. I AM CHANGING MY RECOMMENDATION, AND SAYING WHY

**I have been recommending slot-aware over `need: 1.0`, on the grounds that
`need` drafts more running backs (5.83 vs the winners' 3.83).**

**That objection rests entirely on the six-team-season shape data that does not
clear significance.** With that evidence removed, what is left is:

- `need: 1.0` gains **+68.6** points/seat-season; slot-aware **+58.2**
- `need: 1.0` is **one weight**; slot-aware is a **feature flag** that has
  collapsed three separate times in three different ways
- `need: 1.0` needs no new code path; slot-aware turns on ~400 lines that are
  currently unreachable

**On points, on simplicity, and on risk, `need: 1.0` is the better change. My
earlier recommendation was built on the weaker evidence and I am withdrawing
it.**

⚠️ **What I am NOT claiming:** that `need: 1.0` produces a roster you will like
the look of. It drafts more backs. **I no longer have evidence that fewer backs
is better** — I only have evidence that starting more of your points is better,
and `need: 1.0` does that best.

## 7. WHAT SIMPLIFYING WOULD ACTUALLY MEAN

**Not a new model. Deleting the apparatus around the existing one.**

Honest inventory of what is dead or unused:

- **Four of eight weights are zero** — `tier`, `need`, `risk`, `bye`. Three of
  the four have never been graded as on. **`bye` cannot ever fire: the backtest
  boards carry no bye weeks at all** (register 69).
- **Seven of twelve projection sources return zero rows** and report success
  (register 96).
- **Eight probes drive a pick schedule you do not own** (register 95).
- **77 open defect rows.**

**The model is four terms. The debt is everything else.** If you want to
simplify, the target is the 700 files and 77 open rows — not the scoring rule,
which is already about as simple as a VONA model gets.

## 8. THE ONE DECISION

**Turn `need` on at 1.0, or do not.** Everything above is one ruling, it is
yours, and the default remains that nothing ships if you say nothing by
**08-21 6pm**.

# REGISTER 211 — A PROMOTION STATISTIC THAT SEPARATES, and the reason the old one could not

**Session D, 2026-08-21.** Answers register 211, whose next action was *"the
promotion rule needs a statistic that separates — a per-player paired test over
the week's population rather than a 17-point weekly-MAE series."* Tooling:
`draft/audit/promotion_paired_statistic_2026-08-21.py` (new, TERRITORY: D),
tests `draft/tests/test_promotion_paired_statistic.py` (**10/10**).
**REPORT ONLY — no promotion rule is changed by this file.**

---

## 1 · THE RESULT

200 simulated seasons, 17 weeks, 250 players a week, ρ = 0.60, α = 0.0125.

| | shipped rule + best-of-K gate | **paired per-player statistic** |
|---|---|---|
| skill-free arm promotes | 0.179 | **0.045** |
| real −15% MAE edge promotes | 0.227 | **1.000** |
| separation at that realistic edge | **0.048** | **0.955** |

**Better on the null AND twenty times the separation.** The old rule's four
points between *nothing* and *unmissable* become ninety-five and a half.

## 2 · THE DETECTION FLOOR MOVES FROM ~40% TO ~5%

The number that matters operationally is the smallest real edge the rule can
see. Swept, rather than asserted:

| candidate's true edge | paired statistic fires |
|---|---|
| 0% (skill-free) | 0.075 |
| 1% | 0.163 |
| 3% | 0.412 |
| **5%** | **0.875** |
| 10% | 1.000 |
| 15% | 1.000 |

A monotone dose–response, which is what a working test looks like. The shipped
rule reaches 54.8% only at a **−40%** edge; this one is at 87.5% by **−5%**.

## 3 · WHY IT WORKS, AND IT IS NOT MAINLY THE EXTRA n

The obvious story is *250 players beats 17 weeks*. That is part of it and it is
the smaller part. **The lever is that pairing SUBTRACTS the shared weekly
shock before anything is tested.**

Real challenger arms are variants of one model, so most of any week's error is
common to champion and candidate alike — the slate was weird for everyone.
Comparing two MAE *series* leaves that common component in both numbers, where
it is pure noise for the comparison. Pairing each player against **himself, in
the same week**, removes it by construction. Pinned as a test: add an arbitrary
+100 shock to both arms and the paired week-means do not move.

**So the more alike the arms are, the MORE the paired test wins** — the
opposite of the intuition that correlated challengers are harder to separate,
and the reason A's finding that cross-arm correlation *"does not rescue the
rule"* (null ~95% at every ρ from 0.00 to 0.95) is not a dead end. Correlation
was never the problem; discarding the pairing was.

## 4 · TWO THINGS THE MEASUREMENT CHANGED IN MY OWN DESIGN

**⚠️ THE FIRST RUN'S FALSE RATE WAS 0.167, NOT 0.045 — and α was the reason,
not the statistic.** At α = 0.05 the skill-free arm promoted in 16.7% of
seasons, no better than the shipped gated rule. The cause is **fifteen
sequential Tuesday looks**, weeks 3 through 17, each one a fresh chance to
cross the line. At α = 0.0125 the false rate falls to 0.045 and **the power at
a realistic edge does not move at all** (1.000 either way). The multiple-looks
exposure was doing all the damage and none of the work.

**⚠️ AND C2 = 1.000 WAS TREATED AS A BUG REPORT BEFORE IT WAS TREATED AS A
RESULT** (rule 3d — a suspicious positive). A statistic that fires on
everything would also print 1.000. §2's sweep is what settled it: it fires at
0.075 on a skill-free arm and climbs monotonically with the true edge. A broken
test does not produce that curve.

## 5 · WHAT THIS IS NOT

* **It is a STATISTIC, not a policy.** What a promotion rule should *do* with a
  separating statistic — how many weeks, what α, whether to keep 3-of-4 as a
  pre-filter — is a ruling and is deliberately not proposed here.
* **It is simulation.** Player errors are abs-normal with a shared weekly
  shock: A's model refined to the player level, not the real error
  distribution. **Confirming it needs real per-player weekly errors, which do
  not exist for 2026 until week 1.** Stated as the next step rather than
  smoothed over.
* **The Spearman non-regression gate is not modelled**, which can only reduce
  firing, so every rate here is if anything optimistic.
* **α = 0.0125 is not tuned to this result** — it is 0.05 split across the
  looks, chosen before the sweep in §2 was run, and the sweep was run at that
  same α rather than at whichever value flattered it.

## 6 · THREE-PART FILING

* **LEARNING TARGET:** whether the promotion rule's inability to separate is a
  property of the *evidence available* or of the *statistic chosen*. Answered:
  the statistic. The evidence was always there, averaged away one week at a
  time.
* **SKILL DESIGN:** the proposed statistic walks the SAME Tuesday-by-Tuesday
  schedule as the shipped rule, so the multiple-looks exposure is identical and
  the comparison is like-for-like — a statistic that only looked once would win
  on that alone. Three arms (skill-free / −15% / −40%), a separation check that
  fails the script rather than printing a table, and A's measured baseline
  quoted as a constant so the comparison cannot drift.
* **CONSEQUENCE ROUTE:** to A with register 211, as a ruling — this is a change
  to how promotion is decided, and **it must land before week 1 or it becomes a
  post-result threshold move `no_fit_guard` forbids.** If A declines it, the
  honest consequence is that the promotion verdict keeps carrying the 95% /
  17.9% ceiling it now states.

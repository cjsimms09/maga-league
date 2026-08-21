# THE RED-ZONE AXIS RETIRES — and the reason corrects register 191: a decorrelation measured on a broken transform is not bankable

**Session D, 2026-08-21.** Grades the arm preregistered in
`draft/RED-ZONE-ADDITIVE-PREREG-2026-08-21.md`, committed before any MAE,
alpha or correlation existed. Tooling: `draft/backtest/red_zone_additive.py`
(new, TERRITORY: D), tests `draft/tests/test_red_zone_additive.py` (**10/10**,
including the prereg's promised known-positive/negative pair), artifact
`draft/backtest/red_zone_additive.json`. **REPORT ONLY — nothing shipped.**

**Headline: FALSE, on the clause the prereg named in advance — and the arm
failing that specific clause is the finding, not a footnote.**

---

## 1 · THE RESULT

| fold | α (LOSO) | baseline MAE | arm MAE | ΔMAE |
|---|---|---|---|---|
| 2022 | 1.0 | 4.5421 | 4.5651 | **−0.0231** |
| 2023 | 0.5 | 4.5332 | 4.5177 | +0.0155 |
| 2024 | 0.5 | 4.6072 | 4.6031 | +0.0041 |
| 2025 | 0.5 | 4.5820 | 4.5720 | +0.0100 |
| **pooled** | — | **4.5666** | **4.5648** | **+0.0018** |

Against the preregistered bar of **+0.10**: the pooled effect is the right
sign and **≈55× too small**. Fold consistency passes (3 of 4 positive).
Blend break-even passes trivially (4.56 ≤ 5.2).

**And it fails anyway, on the gate: ρ(arm, baseline) = 0.9986** against a
0.98 ceiling. **A costume.**

## 2 · THE PREREG CALLED THIS EXACT FAILURE, WHICH IS WHY IT COUNTS

From §3, written before the run:

> *"a small α makes the arm nearly the baseline, which would score well on
> MAE and be worthless in a blend. **If ρ ≥ 0.98 this files as a costume even
> if the MAE bar clears** — that is the whole point of the gate and the reason
> this study exists."*

That is precisely what happened, and it is why the result is worth more than
a null. **The mechanism, measured rather than asserted** (2024 fold, at the
LOSO-selected α=0.5):

* baseline spread: **sd 4.427**
* correction spread: **sd 0.236**, range −0.31 to +1.53
* **the correction is 5.3% of the baseline's own variation**

The arm is the baseline plus a few percent of jitter. Nothing else could
produce ρ=0.9986, and nothing at that ρ can contribute to a blend.

## 3 · THE CORRECTION TO REGISTER 191 — this is the part that generalises

Register 191 established two things that **still stand**: the project's ρ≤0.98
gate sits exactly where blending stops paying, and decorrelation is *necessary
but not sufficient* because a decorrelated-but-inaccurate arm loses on level.

It also concluded — and this is now **wrong as stated** — that red-zone was
*"the one axis with real blend headroom, so reformulate it."* That framing
assumed the ρ=0.74 measured on P292's multiplicative arm was a property of
**the axis**. It was not.

**P292's arm was decorrelated BECAUSE it was broken.** It clipped 17.3% of
player-weeks at ×3, i.e. corrections of +200% of baseline — of course that
does not correlate with the baseline. **Repair the transform so the arm is
accurate, and the decorrelation evaporates: ρ goes 0.74 → 0.9986.**

**So there is a third condition, and it is the binding one:**

> A Tier-1 candidate must be (1) decorrelated from the champion, (2)
> comparably accurate, **and (3) still decorrelated *after* being made
> accurate.** Conditions (1) and (2) trade against each other on the same
> axis, and red-zone is the worked example: at ρ=0.74 it was MAE 9.07; at MAE
> 4.56 it is ρ=0.9986. **The two measurements were never available at the
> same time.**

**A decorrelation measured on a transform you are about to fix is not
evidence about the axis.** Register 191 flagged this as a caveat — *"ρ=0.74
was measured on the multiplicative arm; any reformulation must re-measure ρ
rather than inherit 0.74"* — and re-measuring is exactly what killed it. The
caveat was right and is now a result.

## 4 · WHAT RETIRES, AND WHAT DOES NOT

**RETIRES: the red-zone/end-zone opportunity axis for 2026**, per the prereg's
own FALSE route. Two transforms, two FALSEs, and the mechanism is now
understood in both directions rather than being two unexplained misses.

**DOES NOT retire:** the axis carries *some* information — LOSO selected
**non-zero α in all four folds** and the pooled sign is positive. **That is a
stronger statement than "no signal": the fit wants the term and it still buys
nothing measurable.** Filed that way deliberately, because "we found nothing"
and "we found something worth 0.4% of the bar" are different facts and only
one of them is true here.

**DOES NOT retire: register 191's ρ≤0.98 calibration**, which is untouched and
was in fact the instrument that caught this.

## 5 · WHAT THIS DOES TO THE TIER-1 PROGRAMME

Register 191 left step 3 (preregistered blends, 10-08) waiting on a qualifying
arm and implied one was in reach. **It is not, and the conclusion narrows to
what register 191 offered as its alternative: no qualifying arm exists.** Of
the axes D has measured — usage-conditioned game script (P286), red-zone
multiplicative (P292), red-zone additive (this) — **all three are costumes at
the gate**, two of them after their MAE was made respectable.

**That is a harder problem than "build the Tier-1 arms", and it is worth
saying plainly to whoever owns the blend program** (still unsettled — register
191's open ASK): the search is not for an axis that predicts, but for one that
predicts **differently**, and this project's champion already absorbs more
than the arm list suggests.

## 6 · THREE-PART FILING

* **LEARNING TARGET:** whether the one decorrelated axis found could be made
  accurate enough for Tier 2 — answered NO, and the reason generalises to any
  future candidate.
* **SKILL DESIGN:** paired against P292 on an identical population by import
  (11,747 player-weeks, pinned by test), LOSO-selected α with "do nothing" in
  the grid, the same +0.10 bar as its siblings, and a re-measured gate able to
  fail the arm on its own — which is what happened.
* **CONSEQUENCE ROUTE:** per the prereg — the axis retires for 2026 with its
  decorrelation recorded as **measured-but-unexploitable**, and register 191's
  step-3 conclusion narrows from "a candidate is being built" to "none
  exists". Routed to the unresolved blend-program ownership question.

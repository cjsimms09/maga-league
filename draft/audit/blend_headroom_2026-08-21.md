# WHAT A TIER-1 ARM HAS TO BE WORTH BLENDING — the ρ≤0.98 gate is exactly calibrated, and D's only decorrelated axis is its least accurate one

**Session D, 2026-08-21. REPORT ONLY — no arm, weight or shipped behaviour
touched.** A synthesis of measurements that already exist plus two lookups
against DS10's own machinery (`random_weight_null.expected_averaging_gain`,
imported, not reimplemented). Nothing new was fitted.

**The question it answers:** `BLEND-SEARCH-DESIGN.md` step 3 (preregistered
blends, due 10-08) assumes Tier-1 will produce arms worth blending. DS10
already proved the *current* five cannot be (ρ≈0.997, channel closed). What
nobody had written down is **what a new arm would have to look like to change
that** — and D has already measured two candidate axes, so the answer is
partly in hand rather than hypothetical.

---

## 1 · THE PROJECT'S ρ ≤ 0.98 GATE IS NOT ARBITRARY — it sits exactly where blending stops paying

Free MAE gain from blending, per DS10's calibration, converted at this
project's weekly per-row error sd of ~7:

| ρ between arms' errors | free gain, k=5 | in MAE points | what sits here |
|---|---|---|---|
| 0.00 | 0.3195 | **+2.24** | independent errors — larger than any effect measured here |
| 0.50 | 0.1278 | +0.89 | |
| **0.74** | 0.0570 | **+0.40** | **P292's red-zone arm vs baseline** |
| 0.90 | 0.0166 | +0.12 | |
| 0.95 | 0.0058 | +0.04 | |
| **0.98** | 0.0004 | **+0.00** | **the correlation gate this project applies to every arm** |
| 0.9957 | −0.0012 | −0.01 | P286's usage-interaction vs `v1_tilt` |
| 0.997 | −0.0012 | −0.01 | DS10: the current five arms |

**The gate lands on the zero.** At ρ=0.98 the averaging channel is worth
0.0004 × sd — nothing — and above it the gain goes negative. That gate has
been applied all week as a stated discipline; this is the first time it has
been checked against the calibration that justifies it, and it holds.

**It also retro-justifies two of D's own FALSEs.** P286 (usage-conditioned
game script) failed its MAE bar *and* came in at ρ=0.9957 — so even if its
accuracy had been fine it would have added **−0.01** to a blend. It was a
costume by both tests, not one.

## 2 · DECORRELATION IS NECESSARY AND NOT SUFFICIENT — the part I nearly got wrong

The table above invites the conclusion *"red-zone is the one axis with real
blend headroom (+0.40), so reformulate it."* **That conclusion is wrong as
stated, and the check that caught it is the one worth keeping.**

The free-averaging gain assumes the arms are **comparably accurate**. P292's
red-zone arm is not: MAE **9.07** against the baseline's **4.57**. Simulated
at both arms' real MAEs and their real ρ=0.74 (control: the simulation
reproduces both observed MAEs to 0.01 before anything is read off it):

    50/50 blend at the measured values -> MAE 6.41  vs  baseline 4.57
                                                        = +1.84 points WORSE

**The +0.40 of averaging headroom is swamped by a level penalty four times
its size.** Blending in an arm twice as inaccurate loses, however decorrelated
it is.

## 3 · THE USEFUL OUTPUT: a bar the reformulation has to clear

Same simulation, sweeping the red-zone arm's accuracy at its real ρ=0.74:

| red-zone arm MAE | 50/50 blend MAE | vs baseline |
|---|---|---|
| 4.6 | 4.31 | **−0.26** |
| 5.0 | 4.41 | **−0.16** |
| ~5.2 | ~4.57 | **break-even** |
| 5.5 | 4.71 | +0.14 |
| 6.0 | 4.97 | +0.40 |
| 9.07 *(as built)* | 6.41 | +1.84 |

**So the target is concrete: a red-zone arm must reach MAE ≲ 5.2 to earn a
place in a blend at its measured decorrelation — against 4.57 for the flat
baseline and 9.07 for the multiplicative version P292 retired.** Below ~5.0
it starts *improving* the blend rather than merely not hurting it.

**This converts P292's closing line — "an additive reformulation is the
natural next attempt" — from a preference into a falsifiable bar.** Any
reformulation that lands above ~5.2 MAE is not worth carrying into Tier 2,
whatever its ρ; that is now a number a prereg can be written against instead
of a hope.

## 4 · WHAT THIS SAYS ABOUT THE TIER-1 PROGRAM

**Of the axes D has measured, exactly one is decorrelated enough to matter,
and it is the one whose transform failed.** That is a more useful position
than it sounds: the hard part of a Tier-1 arm is finding an axis the champion
does not already contain, and red-zone opportunity demonstrably is one
(ρ=0.74 against the baseline *and* 0.74 against P286's interaction — distinct
from both). The easy part, by comparison, is fixing a transform.

**The caveat that keeps this honest:** ρ=0.74 was measured on the
*multiplicative* arm. A different transform on the same axis will not
necessarily preserve that decorrelation — an additive form could easily
collapse toward the baseline it is added to. **Any reformulation must re-measure
ρ, not inherit 0.74 from this document.** Assuming otherwise would be the
same error as reading P292's own numbers off the two-point TE test.

## 5 · ROUTED

**No ASK, nothing shipped, no new fit.** Two consequences for whoever owns the
blend program — which is itself unresolved and is the reason this is filed as
a finding rather than acted on: `BLEND-SEARCH-DESIGN.md` says *"Owner: relay"*,
the ROUTES dispatch says D owns the weekly blend program, and P27/P29 are owned
by *"A builds · relay proposes"*. Three sources, three owners.

**(1) Implies?** Step 3's preregistered blends (due 10-08) are unbuildable
until a Tier-1 arm exists that is both decorrelated *and* comparably accurate;
no combination of the current five, or of P286, can satisfy that. **(2)
Invalidates?** Nothing measured — it explains two existing FALSEs rather than
overturning them. **(3) Routed:** the ownership question, with the concrete
stake that step 3 has a dependency nobody is assigned to.

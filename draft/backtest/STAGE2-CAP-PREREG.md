# PRE-REGISTRATION — the crude Stage 2 cap, BEFORE its measurement

_Written 2026-08-09, **before running the intervention-rate diff with the cap
on.** T is fixed here so it cannot be tuned to make the number look good after
the fact. If T turns out wrong, that is a finding to record, not a knob to turn._

## The rule (crude, evidence-gated deviation cap)

The recommendation should START at consensus and require **tested** evidence to
move off it. Implemented inside `recommend()`, behind `CFG.STAGE2_CAP` (OFF by
default):

For each candidate, from its per-term contribution map (`components.weighted`):

- **`earned`** = the sum of absolute points from **material drivers whose evidence
  class is structural, moderate, or validated** — i.e. `need` (structural,
  roster arithmetic) and `ceiling` (moderate, installed off exp 21). It EXCLUDES
  `value` (untested — projections never raced vs market) and the weak terms
  (tier, keeper, bye, risk, stack). These are the terms that can *legitimately*
  justify leaving the market.
- A candidate keeps its full deviation-boosted composite `score` **iff
  `earned ≥ T`**. Otherwise it is scored at its **consensus baseline** =
  `score − Σ(all material driver contributions)`, which strips the deviation
  boost (value + weak terms included) and pulls the candidate back toward its
  VONA/market position.

Then re-sort by the capped score. Net effect: a reach bought mainly by untested
`value` or weak terms collapses toward consensus; a reach backed by ≥ T of
structural/moderate evidence survives.

## T = 4.0 points — and why, fixed now

T mirrors the **noise band the deviation badge already uses (4.0 picks)**: a
deviation off consensus must be backed by at least one noise-band's worth of
tested-evidence driver support to stand. It is deliberately crude — a hard bar,
not the proportional class-scaling of the full re-weighting — because a crude
real anchor that we can MEASURE in two hours beats an elegant fake. T is not
calibrated to a dollar figure; that calibration is exp 34/36's job and is exactly
what the full re-weighting (2.5 units, gated on 34) is for.

## Pre-registered predictions (what each outcome will MEAN)

1. **If identity changes = 0** — the cap moved no picks. Then it is *another
   labeling layer*, and we learned that in two hours instead of two sessions.
   T=4.0 would be too low to bind, or `earned` is mis-defined — a finding, and
   the cap does NOT earn SOURCE a real value. Report and stop.
2. **If identity changes > 0 and the rate drops** — the cap is genuinely
   behavioral. Report HOW MANY picks changed and WHICH decisions (the actual
   players swapped), and the new rate. This earns SOURCE a real "consensus
   anchor (crude)" value — but labelled as UNSIZED, the same as floor Stage 4.
3. **Direction check:** the picks that revert to consensus should be the
   `value`-lead / weak-lead reaches (the untested ones), not the `need`/`ceiling`
   ones. If need/ceiling picks revert instead, `earned` is wrong — a finding.

## Conditions honored (Cory, 2026-08-09)

- **Measured, not just shipped:** the `--diff` runs immediately after, flag on.
- **T pre-registered:** stated above, not adjusted after seeing the result.
- **Reversible + labelled:** `CFG.STAGE2_CAP` OFF by default; when on, the surface
  says "consensus anchor (crude, unsized)" — an unsized crude anchor is not the
  same claim as a calibrated one.
- **SOURCE stays absent** until this measurement proves the cap moves picks. A
  crude cap that moves picks earns SOURCE a real value; one that does not, does not.

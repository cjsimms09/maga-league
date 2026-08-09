# RESULT — the crude Stage 2 cap at the pre-registered T=4.0

_Measured 2026-08-09, `node draft/tools/stage2_cap_measure.js 25`, cap-off vs
cap-on on the same engine. **T was NOT adjusted after seeing this** (condition #2)._

## The number

| | |
|---|---|
| picks that changed IDENTITY | **3 of 300 (1.0%)** |
| deviation rate off → on | **73.7% → 73.3%** |
| the three decisions | pick 64 Brian Thomas (value) → Tyler Warren · pick 77 Caleb Williams (need, dev 28) → Brian Thomas · pick 84 Trevor Lawrence (value) → Caleb Williams |
| direction of reverts | 2 `value` [untested], 1 `need` [structural] |

## The finding — and it is a real one, not a null

At the pre-registered T=4.0 (one noise band of tested evidence), the crude cap is
**essentially inert**: it moves ~1% of picks and drops the deviation rate by 0.4pp.
It is *technically* behavioral (3 > 0, so not purely a labeling layer, and the
direction is right — the reverts are mostly `value`-led untested reaches), but it
does **not** achieve the goal of pulling the 73.7% rate down.

**Why it barely binds — this is the load-bearing result.** The cap only changes a
pick when the leading candidate's deviation is *unbacked* by ≥4 points of tested
(`need`/`ceiling`) evidence. Only ~1% of top picks are like that. The other ~72%
of deviations **carry ≥4 points of `need`/`ceiling` in the composite's own
accounting** — they are not lone-`value` reaches a simple gate can catch.

So the honest read of the 73.7% is NOT "the tool reaches on untested value alone."
It is: **the tool's deviations are broadly backed by its own `need`/`ceiling`
terms — and the open question is whether THAT evidence is correct.** A value-only
evidence gate cannot tame the rate because the rate is not primarily value-only.

## What this changes about the plan (STAGE2-COST.md)

- **T is not retuned.** Per the pre-registration, T=4.0's inertness is the finding.
  Raising T until the number looks good would be tuning to taste — forbidden.
- **The crude cap is not the fix, and it does not earn SOURCE a value.** The flag
  stays OFF; SOURCE stays absent. A mechanism that moves 3/300 has not proven
  itself.
- **The lever that matters moved to exp 34/36.** Taming the rate honestly requires
  knowing whether the `need`/`ceiling`-backed deviations actually beat the market.
  If exp 34 says our deviations LOSE to real ADP, then the full re-weighting
  should discount even the need/ceiling-backed reaches (bind harder, not just gate
  value) — the 2.5-unit build, now clearly justified rather than a design
  preference. If 34 says they WIN, the 73.7% is earned and the cap should stay off.
- **Two hours well spent:** we learned the crude gate is the wrong shape BEFORE
  spending 2.5 sessions on the full version, and we learned exactly why (the
  deviations are need/ceiling-backed, not value-only). That is the point of the
  spike.

## Recommendation

Hold the full re-weighting for exp 34's verdict, as already sequenced — but the
question 34 answers is now sharper: **not "is any deviation justified" but "is the
`need`/`ceiling` evidence that backs 72% of our deviations correct against real
ADP."** Keep the cap flag OFF; keep SOURCE absent.

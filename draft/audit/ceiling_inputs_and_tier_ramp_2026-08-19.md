# Ceiling/floor inputs, and the tier-ramped mean→ceiling blend

**A, 2026-08-19.** Two questions from Cory in one message: *"Should we somehow
have age and opportunity a part of our ceiling and floor model?"* and a
screenshot of an r/fantasyfootball comment proposing a tier-ramped blend of mean
and ceiling projections.

---

## 1. Age and opportunity — MEASURED NO, and the control is the whole story

Tested against the cross-source dispersion built the same day (388 players,
Sleeper + 2 or more of CBS/ESPN/FFToday, scored under our own table).

**The first pass looked strong**, `opportunity_z` against cross-source `cv`:

| | QB | RB | WR | TE |
|---|---|---|---|---|
| `opportunity_z` vs `cv` | +0.758 | −0.656 | −0.582 | −0.625 |

And an obvious story fits it: forecasters agree about a player whose opportunity
is established and disagree about one whose touches are in doubt — which is
exactly the upside question. **I nearly wrote that down.**

**THE CONFOUND: `cv = sd / mean`, and `opportunity_z` is strongly correlated
with the mean.** A big projection is a big denominator, and that shrinks `cv`
whether or not the spread moved. The honest test is against **raw sd**:

| position | `oz` vs `cv` | `oz` vs **mean** | `oz` vs **raw sd** | verdict |
|---|---|---|---|---|
| RB | −0.656 | +0.767 | **+0.057** | mechanical |
| WR | −0.582 | +0.750 | **−0.086** | mechanical |
| TE | −0.625 | +0.799 | **−0.089** | mechanical |
| QB | +0.758 | −0.964 | +0.466 | anomalous — see below |

For RB, WR and TE the raw-sd correlation is essentially zero. **The entire
apparent signal was the denominator.**

**Age is a clean null too:** −0.122 / −0.037 / +0.012 / +0.060 by position;
`years_exp` runs −0.09 to −0.18. Neither predicts how much forecasters disagree.

**QB is anomalous and is NOT claimed.** `opportunity_z` vs mean at **−0.964** on
n=38 is very nearly a perfect *negative* correlation with the projection, which
is not what an opportunity measure should do. That reads as a defect in how
`opportunity_z` is computed for quarterbacks, not a finding about upside.
Treating it as signal would be exactly the over-claim the RB/WR/TE control just
caught. **Filed as a question, not a result.**

**So: no.** And this now completes a pattern worth stating — **P112** killed
outcome-derived dispersion (the right tail varies but does not persist, 4/4
null; a player's own CV ties a positional constant, 0/4 folds). This kills the
structural predictors. **Cross-source disagreement is the only thing left that
carries per-player dispersion information**, which is why the ffanalytics
capture mattered more than it looked.

---

## 2. The tier-ramped blend — the idea is good, and it is now buildable

The comment Cory sent (gawake, r/fantasyfootball):

> *"a mean projection for players based on several datasets, and a ranged
> outcome dataset (ceilings and floors) from those datasets. As you start moving
> away from top tier players into more mediocre players, the scale starts
> tipping from the mean towards the ceiling projections… mean weighted at 100%
> through the first tier, tier two maybe 80% mean / 20% ceiling…"*

**Three things make this worth taking seriously rather than filing as a nice
idea.**

**(a) It is the decision-theoretically correct shape.** A mediocre player's MEAN
is nearly worthless to you — the waiver wire replaces it. His value is the
option on the tail. A tier-1 player's mean is what you are actually buying. So
the weight on ceiling *should* rise as the mean becomes less decision-relevant.
This is "value early, upside late" derived rather than asserted.

**(b) The OP's own objection is the one we just removed.** He replies that
*"boom/bust data is even less prevalent than standard projections, so finding a
large set of this data could be difficult."* That was true here until today.
**We now hold a real ranged-outcome dataset: cross-source ceiling and floor from
three independent scrapers, covering 388 players including all 32 defences and
33 kickers.** The thing the proposal needs is the thing that just landed.

**(c) IT IS NOT WHAT OUR ENGINE DOES, AND THE DIFFERENCE IS SHARP.** We already
have a `ceiling` weight (0.45, Cory's ruling) — but it is **FLAT across the
whole board**. `autoWeights` ramps it, but **by ROUND**: 0.45 Anchor → 0.6 Build
→ 0.8 Fill → 0.5 Endgame.

> **Round is not tier.** A tier-1 receiver who falls to round 8 should still be
> valued on his mean; our Fill-phase ramp treats him as a lottery ticket because
> of *when* he was taken. The proposal ramps on the PLAYER'S tier depth, which
> is the property that actually determines whether his mean is worth having.

That distinction is testable, it is cheap, and nothing in this repo has tested
it.

### The arm, if it is built

```
effective_value(p) = (1 − w(tier_p)) · proj_mean(p) + w(tier_p) · proj_ceiling(p)
```

with `w` ramping over the player's own tier and `proj_ceiling` from
cross-source spread. **Preregistration required before any run, and the ramp
shape must be named from an existing artifact rather than swept** — a grid over
`w` graded on three seasons and shipped at the argmax is fitting, which is what
`no_fit_guard` exists to stop and what P110 was careful to avoid.

**Sequencing, stated so it is a decision and not a drift:** this is a change to
the primary value term. It goes **after** the draft, behind a prereg, graded on
the seat replay — unless Cory rules otherwise with this document in front of
him.

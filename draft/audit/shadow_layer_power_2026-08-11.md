# Does a season of shadow records distinguish two strategies?

**Asked by Cory, 2026-08-11.** Not "is the shadow layer interesting" but "does the
window close at week one, or is the deadline imaginary?"

**Answer: the hypothesis test is hopeless at our sample size — the reviewer is
right. But the deadline is real and it is on a DIFFERENT OBJECT, and that object
costs about an hour instead of a layer.**

## 1. The power calculation, from the league's own weekly data

540 team-weeks across 2023–25, 4,860 starter-weeks. Measured, not assumed:

| quantity | value |
|---|---|
| team week, mean / SD | 109.4 / 23.6 |
| one starter's week, mean / SD | 12.16 / 8.57 |
| **SD of a ONE-SLOT difference, same week** (19,440 pairs) | **11.44** |

The comparison is **paired** — same week, same roster, same opponent — so the
noise is not the 23.6 of a team-week. It is the 11.44 of the slot the two
strategies disagree about. That is the generous framing and it still fails:

| weeks the strategies actually differ | SE | minimum detectable edge |
|---|---|---|
| 4 | 5.72 | **16.0 pts/wk** |
| 8 | 4.05 | 11.3 pts/wk |
| 17 (they differ EVERY week) | 2.78 | **7.8 pts/wk** |
| 34 (two seasons) | 1.96 | 5.5 pts/wk |

**Even if two strategies disagreed every single week of a season, the smallest
edge detectable at 80% power is 7.8 points per week — 64% of what an average
starter scores.** No plausible lineup strategy has a true edge that size; if one
did we would not need a shadow layer to find it.

And they will not disagree every week. Today's flip diagnostic is the closest
available evidence: switching on an entire opponent dossier moved **8 of 1,152**
draft decisions, 0.7%. Two plausible lineup strategies will differ on a handful
of weeks, which puts the real row at 4–8 and the real MDE at 11–16 points.

**So: seventeen weeks of one league's decisions cannot distinguish two
strategies on points. A field would produce a temporary winner by chance, and
the reviewer's asymmetry — seductive false positive vs durable true positive —
holds.**

## 2. But the divergence rate is a different quantity, and it survives

Cory's fallback framing — *"even just a calibrated record of how often the
alternatives would have differed"* — is not a hypothesis test and needs no power.
It is a rate, and 17 weeks gives it with a wide but honest interval. **That one is
worth having.**

## 3. And here is the part that changes the recommendation

**A shadow strategy's choice is RECOMPUTABLE after the fact, unlike a tool's
recommendation.** That is the asymmetry that makes exp 37's September deadline
real and makes this one look real by analogy when it is not:

- the tool's recommendation **at the moment** → unrecoverable → must be captured live
- a shadow strategy's choice → **a function of (roster, projections)** → recomputable
  in January, *provided both inputs still exist*

Sleeper returns the weekly roster retroactively. So the only thing that must be
captured live is **the weekly projections the strategy would have read.**

**And nothing archives them.** `proj_series.json` holds PRESEASON snapshots only
(2026-08-09 … 08-11, source FantasyPros). `grade-cron` writes calibration
snapshots, not projections. Providers overwrite weekly numbers in place.

## 4. Recommendation

**Do not ship the shadow layer before week one. Ship the weekly projection
snapshot instead.**

- It is one fetch, append-only, the same shape as `proj_series.json` — an hour,
  not a layer, and it does not compete with the instrumentation deadline.
- It makes **every** shadow strategy reconstructable in January, not the two or
  three we would guess at today.
- Guessing the field now is the weakest part of shipping early: candidates chosen
  before a season of residuals are chosen from the same priors that built the
  live core. A January field chosen *from* the residuals is strictly better, and
  the snapshot is what buys the right to build it.
- The divergence rate is then computable retroactively too, at no cost in
  August.

**What this gives up:** anything a strategy would need that is neither roster nor
projection — waiver-wire state at the moment of a claim, injury designations as
they stood, the tool's own live outputs. If a candidate needs those, it genuinely
must run live. None of the candidates below do.

## 5. The candidates, since the spec asked and none had been proposed

The honest answer to "why none": **the layer does not exist, and I had not
proposed any.** Not because nothing looked worth proposing — two are sitting in
today's measurements — but because a candidate with nowhere to run is a note, and
I had been writing notes about defects instead. That is a gap in my practice, not
evidence the layer would be empty.

**Candidate 1 — DEFAULT_WEIGHTS against MEASURED_WEIGHTS.** The shipped weights
zero out four terms the Lab measured as drag:

```
MEASURED  value 1  tier 0  need 0  risk 0  ceiling 0     keeper 1  bye 0  stack 0.5
DEFAULT   value 1  tier 1  need 1  risk 1  ceiling 0.65  keeper 1  bye 1  stack 1
```

`app.js:52` ships MEASURED. This is the highest-plausibility candidate in the
system because it is tied to a *measured* surface rather than a hunch, the two
arms are one object apart, and a season of paired weeks says how often four
zeroed terms would have changed a decision. Divergence rate, not a winner.

**Candidate 2 — opponent-blind against opponent-modelled.** Today's flip put the
whole dossier at 0.7% of draft decisions. If that holds in-season, the honest
finding is that opponent modelling is not paying for its complexity, and that is
worth knowing precisely because it argues for *deleting* something.

Both are recomputable from (roster, projections). Neither needs to run live.
**Which is the argument in section 4, arriving from the other direction.**

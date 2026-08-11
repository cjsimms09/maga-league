# Where the evaluation ceiling actually is

**Asked by Cory, 2026-08-11.** Four routes proposed, power analysis first because
it decides whether the others are worth doing. It did, and it also killed one of
them and promoted another.

Tool: `draft/backtest/exp_power_curve.py`. Generator: the league's **own 4,860
realized starter-weeks** (2023–25, mean 12.16, sd 8.57). Those are what happened
— they embed the scoring rules and roster shape, which is required, and they
embed no projection, no weight vector and no strategy. The injected edge is a
free parameter, never a fitted one. That is the circularity guard.

---

## The curve

Power to detect a true edge, 14 weeks × 9 starters, α = 0.05, 1,200–1,500
simulated seasons per cell. `d` is the true advantage per **disagreed slot**.

**At the measured disagreement rate (0.7%, from the opponent-dossier flip):**

| d/slot | d/week | paired weekly | paired decision |
|---|---|---|---|
| 8.0 | 0.50 | 0% | 2% |
| 16.0 | 1.01 | 0% | 5% |

**Total blindness.** A 16-point-per-slot edge — larger than an average starter
scores — is detected at the false-positive rate. There is no effect size this
design can find when the strategies agree 99.3% of the time.

**At 5% disagreement:**

| d/slot | d/week | paired weekly | paired decision |
|---|---|---|---|
| 4.0 | 1.80 | 5% | 10% |
| 8.0 | 3.60 | 15% | 28% |
| 16.0 | 7.20 | 45% | 69% |

**At 20% disagreement:** 8/slot (14.4/week) reaches 82–88%.

**80% power needs 36 points per week in one season at 5% disagreement** — the
search hit its ceiling without reaching it.

---

## Route 1 — power analysis: DONE, and it reframes the rest

The headline is not the 7.8 figure. It is that **the disagreement rate dominates
everything**. Moving from 0.7% to 20% disagreement buys more power than three
seasons of data. That observation is what produces route 5 below.

---

## Route 2 — counterfactual replay: VALID, with a hard boundary

Decision-level replay against the same realized world is legitimate exactly where
**the replayed choice cannot change anything else that was realized**:

| decision | valid? | why |
|---|---|---|
| **lineup / start-sit** | **yes, all the way to the win/loss** | Starting X instead of Y changes only my score. My opponent's score is fixed and does not depend on my lineup, so even the H2H outcome replays honestly. |
| **waiver** | **my points yes, match outcome no** | Claiming X means a rival did not get X. My own score replays; the opponent's does not, so a replayed *record* is fiction. |
| **draft** | **no** | A different pick changes availability for every downstream pick. The state cannot be rebuilt. |

Replay is worth doing for lineup and start-sit. It is the honest source of the
decision-level sample route 3 wants — and route 3 is where it goes wrong.

---

## Route 3 — decision-level paired evidence: THE ROUTE IS CLOSED IN ITS NAIVE FORM

Measured rather than argued. A shared per-week shock (`rho`) is injected — the
slate, the weather, the opponent's defence — and the false-positive rate is read
at a **true edge of zero**:

| rho | decisions treated as iid | aggregated to the week |
|---|---|---|
| 0.0 | 4.7% | 4.5% |
| 0.3 | 6.3% | 4.5% |
| 0.6 | 8.1% | 3.9% |
| **1.0** | **11.1%** | **4.5%** |

**Treating correlated decisions as independent samples more than doubles the
false-positive rate.** That is the breakthrough-costume failure, quantified: the
decision-level test roughly doubles *power* (15% → 28%) and simultaneously
doubles *false positives*. It is not a better experiment, it is a louder one.

**AND THE SOPHISTICATED REMEDY IS WORSE THAN THE SIMPLE ONE.** A block bootstrap
over weeks — the obvious "honest dependence handling" — runs at **9–11% false
positives at every rho**, because a percentile bootstrap CI on n = 14 is
anti-conservative. It would have been reported as rigour.

**What actually handles the dependence is the aggregation we already do.**
Summing decisions to a weekly difference stays calibrated at ~4.5% across every
correlation level, because the week *is* the independent unit. So route 3's
honest form is not a new estimator — it is the estimator already in use, and its
extra power over the naive version is zero.

**Route 3 is closed.** Not because the dependence cannot be handled, but because
handling it honestly returns you to where you started.

---

## Route 4 — cross-season pooling: A GENUINELY DIFFERENT OBJECTION, AND THE BIGGEST LEVER

**Reconciled against the time-decay decision, as required.** Time-decay weighting
was rejected because *weighting by age discards a third of the data to correct a
drift we cannot measure*. Hierarchical pooling with season-level shrinkage faces
a **different** objection, not a weaker version of the same one:

- time-decay **discounts** old evidence — it throws information away to buy
  robustness against an unmeasured drift;
- shrinkage **estimates a common effect** and pulls season estimates toward it —
  it adds effective sample, and the drift it must assume away is *testable* as
  between-season variance rather than assumed.

They are opposite operations. The earlier decision does not bind this one.

**Quantified, in the units of the curve** (5% disagreement, paired weekly):

| d/slot | d/week | 1 season | 2 seasons | 3 seasons |
|---|---|---|---|---|
| 4.0 | 1.80 | 7% | 18% | 27% |
| 8.0 | 3.60 | 17% | 52% | **74%** |
| 12.0 | 5.40 | 31% | 80% | **95%** |

**80% power: 36 pts/week at one season → 3.78 pts/week at three.** False positive
stays calibrated at 4.3%. That is not the 8→7.6 nudge Cory set as the bar for
dismissal; it is the difference between unreachable and borderline.

**F6 constraint:** pooling *within our own league across its own seasons* does not
touch the pooled-vs-local split. Nothing about our room, our managers or our seat
leaves the local side. Stated explicitly rather than assumed.

**The caveat that limits it:** shrinkage assumes a common effect across seasons.
Rosters turn over and the rules era changes — which is precisely why calibration
snapshots carry a `rules_era` stamp. Pooling across an era boundary is the one
way this route becomes the thing it replaced.

---

## THE FIFTH ROUTE — and it is the most valuable output here

Two, and neither was named by either of us.

### 5a. Choose the CONTRAST, not just the candidates

Every number above is dominated by the disagreement rate, and **the disagreement
rate is a design variable we control.** We have been proposing pairs of *plausible*
strategies, which is why they agree 99.3% of the time and why nothing is
detectable.

Instead: pick two strategies that are **both defensible and maximally divergent**
— constructed to disagree, subject to each remaining a strategy someone would
actually run. Moving 0.7% → 20% disagreement buys more power than three seasons
of pooling, at zero cost in data and zero waiting.

This does not manufacture sample. It spends the sample we have on a contrast that
can be resolved instead of one that cannot.

### 5b. Grade the COMPONENTS, not the composite

The composite resolves 14 times a season. **Its components resolve every player-week.**

`value`, `tier`, `need`, `risk`, `bye` each make an implicit claim about player
outcomes. Those claims are gradeable directly against realized player scores at
n ≈ 1,260 starter-weeks a season in our league alone — two orders of magnitude
more than the composite, and available from the box score without any new capture.

This is the question `MEASURED_WEIGHTS` was already answered with once: the Lab
zeroed four terms as drag. That was a component-level finding, and it is the only
kind this data has ever had the power to produce.

**It carries route 3's dependence problem** — player-weeks share games and slates
— so it needs clustering by week or game, not an iid count. But unlike route 3,
the correlated units here are genuinely numerous, so clustering leaves a large
effective sample rather than returning to n = 14.

**This is the route I would spend the season on**, and the weekly-claims rail
built today is already the mechanism.

---

## The ceiling, in the five parts asked for

**WHAT WE CAN LEARN FROM THIS LEAGUE NOW**
- Component-level calibration: are projections, tiers and replacement levels
  right? n in the thousands, resolves weekly, no waiting. (5b)
- Divergence rates: how often would strategy A and B differ at all. No power
  needed; it is a rate, not a test.
- Any effect above ~14 points/week, if the strategies disagree on 20% of slots.
- Gross defects, which is what every real finding this project has produced has
  been: a sign flip, a missing alias, a join that never joined.

**WHAT REQUIRES MORE SEASONS**
- Strategy-level effects between roughly **4 and 14 points/week**. Three seasons
  pooled reaches 3.78 pts/week at 80% power; one season reaches nothing.
- Any claim about *our room's* tendencies at better than the 3-draft precision
  we have, which is why the dossier's shrinkage weight is 0.6.

**WHAT REQUIRES EXTERNAL DATA**
- Strategy effects below ~4 points/week, at any horizon we will live through.
- Anything about draft strategy, because the draft cannot be replayed and one
  draft a year is the sample.
- Opponent modelling that generalises beyond nine specific people.

**WHAT BETTER COUNTERFACTUAL DESIGN BUYS — the category that does not require waiting**
- **Lineup and start-sit replay**, valid all the way to the win/loss (route 2).
- **Maximally divergent contrasts** (5a) — worth more than three seasons of data
  and available immediately.
- **Component-level grading** (5b) — two orders of magnitude more observations
  from the same season.
- **Weekly aggregation as the dependence handler** (route 3's honest form), which
  is free and already in place.

**WHAT IS FUNDAMENTALLY UNIDENTIFIABLE**
- Any strategy difference smaller than roughly 2 points/week, ever, from one
  league. At three seasons pooled and 5% disagreement the floor is 3.78; ten
  seasons would reach ~2 and the rules era will have turned over twice.
- The counterfactual draft. A pick changes availability for everyone downstream
  and that state cannot be rebuilt — no design fixes it.
- Whether a *season outcome* was skill or variance. One season is one draw from a
  distribution with a 23.6-point weekly SD; the money outcome is dominated by it.

---

## What I got wrong producing this

**The correlation experiment could not detect correlation.** The first version
multiplied the shared weekly shock by a random ±1 *per decision*, which makes it
independent noise. False positives sat flat at ~5% across every rho and read
exactly like "correlation does not inflate anything" — a null that was my own
construction. Fifth instance of that shape today and the third that was mine.

**The block bootstrap I wrote as the honest remedy is broken at this n** and I
would have reported it as rigour had I not checked its false-positive rate at a
true edge of zero. Checking the null case is what caught it.

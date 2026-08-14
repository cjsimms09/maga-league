# PRE-REGISTRATION — the ADP dispersion rule

**Written 2026-08-14, BEFORE running the fit. Committed before the result exists.**
A prediction recorded in the same commit as its outcome is not a prediction.

---

## Why this is being reopened now

The rate was measured on 2026-08-14 and deliberately **not** shipped, for one
stated reason: `0.11` was derived from FFC's published dispersion, and Cory's
routing had put source selection under review. Shipping a constant sourced from
a feed under review would have turned an unfinished analysis into a production
change.

**That reason has expired.** Cory closed section 4: *"There is no demonstrated
sourcing defect between FP and FFC… Keep FP's mean and FFC's observed dispersion
unless later evidence independently overturns them."* FFC's dispersion is now the
affirmed measurement, not a candidate under suspicion. And the irreversible
capture — freeze, pick logger, rehearsal, survival basis — is complete, so by
Cory's own sequencing the held dispersion work is next.

Independent reviewer status: **UNAVAILABLE** (harness not yet on main). Per the
protocol's third state that means the work continues and I perform the
adversarial pass manually, saying so. This file is part of that.

## The estimand, in words, before any code

`adp_sd` is the **standard deviation of a player's draft position**, in picks,
over the population of drafts the ADP source samples. It is used for exactly one
thing: the width of the survival curve, `P(still available at pick k)`.

The fitted rule is **not** an estimate of dispersion in its own right. It is a
**fallback for players the market has not priced** — a stand-in for a
measurement that does not exist for those rows. Its correctness criterion
follows directly: *the fallback should look like the measurement it replaces.*

## The objective, stated before fitting

Minimise the **worst band's** discrepancy:

```
    minimise   max over bands of | median(fitted / published) − 1 |
    bands      adp 1-25, 25-50, 50-100, 100-150
    population rows carrying a PUBLISHED sd (n=219 today)
```

**Why per-band and not pooled.** A pooled median of ratios mixes the
floor-bound region, the linear region and the cap-bound region, so a rule can
improve the aggregate while getting worse everywhere the draft happens. My first
candidate (rate 0.12, floor 2.0, cap 20.0) scored *worse* on the pooled metric
(1.121 vs 1.103) while being better in three of four bands — which is how I
learned the pooled objective was ill-posed rather than the candidate bad.

**Bands stop at 150** because that is where my twelve picks live. Beyond it the
cap binds and the population thins.

## What I expect — recorded before the optimiser runs

1. **Rate lands near 0.11.** Two estimators already agree to 1.5% (least-squares
   through origin 0.1083, median per-player ratio 0.1099, n=173).
2. **Floor drops well below 3.0.** At rate 0.11 the bare linear rule already
   tracks the market at the top (1.10 predicted vs 1.30 measured at adp 10),
   so the floor of 3.0 — which binds below adp 27 — is what makes the 1-25 band
   read 1.25. I expect the fitted floor around **1.0–2.0**.
3. **Cap stays near 15 or rises slightly.** Measured sd at adp≥200 has a median
   of 15.2 and a max of 42.3, so the cap is close but the data is thin (n=30).
4. **Worst-band error falls below 0.15**, from today's 0.29.

## FALSIFIERS — what would make me not ship this

- **The optimum is not better than today's rule in the worst band.** Then the
  current constants are already the best available and the measurement changes
  nothing.
- **The optimum is unstable** — refitting on a random half of the rows moves any
  constant by more than 25%. Then it is fitted to noise and I have re-made the
  error I retracted this morning.
- **The blast radius grows.** The fitted rule only fires where nothing was
  published: 119 rows today, of which ONE is inside pick 150. If a new rule
  changes survival at more than a handful of my own picks, it stopped being a
  deep-pool correction and needs re-arguing on its own terms.
- **Survival at my twelve picks moves materially for players inside pick 150.**
  That would mean I am changing draft-night behaviour, not repairing a fallback.

## What I will NOT claim regardless of the result

- That the fitted rule is *correct*. It will be *closer to the published
  dispersion*, which is a different and smaller claim.
- That published dispersion is itself right. FFC pools ~2,391 drafts at our
  format and size; that is the best available measurement, not ground truth.
- That this improves draft outcomes. Nothing here is scored against an outcome.
  The pre-draft freeze and pick log exist so that question becomes answerable in
  September, and it is not answerable today.

## Decision rule, fixed now

Ship only if **all four** hold: worst-band error improves, the fit is stable
under a half-sample refit, the blast radius stays ≤5 rows inside pick 150, and
survival at my twelve picks is unchanged for every player with a published sd
(it must be, since published always wins — and if it is not, the rule is being
applied where it should not be, which is a bigger finding than the constants).

---

# OUTCOME — recorded 2026-08-14, after the fit. NOT SHIPPED.

## Against the four expectations

| expectation | result | |
|---|---|---|
| rate near 0.11 | **0.122** (half-sample median 0.116, drift 21%) | ✓ just inside the 25% bar |
| floor 1.0–2.0 | **2.0** — but **119% drift** across 12 half-samples (0.50–2.70) | ✗ |
| cap near 15 or higher | **fell to 12.0** | ✗ |
| worst-band error < 0.15 | **0.040**, from 0.293 | ✓ |

## Against the falsifiers

| | |
|---|---|
| optimum no better in the worst band | passed — 0.293 → 0.040 |
| **optimum unstable under a half-sample refit (>25%)** | **FIRED — floor drifts 119%** |
| blast radius grows | passed — 119 rows, **1** inside pick 150 |
| survival moves at my twelve picks | passed — the one affected row (Oronde Gadsden, adp 147) reads **100.0% → 100.0%, delta +0.0** at pick 33 |

**Three of four. The stability falsifier fired. Decision rule required all four.
NOT SHIPPED. Production constants are unchanged: floor 3.0, rate 0.15, cap 15.0.**

## Why the rate cannot be shipped alone

```
variant                       1-25  25-50 50-100 100-150   worst
CURRENT (ships today)         1.29   1.27   1.24   1.20    0.293
FULL FIT (floor unstable)     0.97   1.03   1.01   0.96    0.040
RATE ONLY, floor + cap held   1.25   1.03   1.01   1.07    0.252
```

The 1-25 band is **floor-bound**: `0.122 × 25 = 3.05`, so every row below adp 25
receives exactly 3.0 whatever the rate is. Almost the whole error lives in the
floor, and the floor is the parameter the data cannot determine — n=22 in that
band, so a half-sample sees about eleven rows. Shipping the rate alone moves the
worst band from 0.293 to 0.252, which is not a repair; it is a rounding of one.

## What this established, which was worth the measurement

1. The shipped rule really is **~25% wide** across every band the draft happens
   in — confirmed against 219 published dispersions, monotone across four
   independent bands.
2. **The error is concentrated in the floor-bound region**, adp < 25. That was
   not obvious before the per-band fit; the pooled metric hid it.
3. **The floor is not identifiable from today's data.** Not "hard to estimate" —
   it moves by 119% under resampling. Any value I picked would be fitted to
   about eleven rows.
4. **It does not matter for this draft.** One row inside pick 150, and its
   survival at my first pick is identical to a tenth of a point either way.

Point 4 is why not shipping costs nothing, and why shipping anyway would have
been the worse error: a real but unmeasurable improvement to a deep-pool
constant, made eight days before a draft, on a parameter I had already watched
swing by a factor of five.

## When to revisit

FFC's published-sd population grows as more drafts run — 2,391 behind today's
prices and rising into the season. The floor becomes identifiable when the
adp 1-25 band carries enough rows that a half-sample refit holds it inside 25%.
Re-run this fit then; the objective, bands and falsifiers above are unchanged
and do not need re-deriving.

**No reviewer verdict was available** (harness not yet on main), so this
adversarial pass is mine. That is the protocol's UNAVAILABLE state working as
intended: the work continued, and the absence of a review did not become an
approval.

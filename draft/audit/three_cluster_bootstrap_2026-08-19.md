# The right interval for a 3-season panel: there isn't a good one, and the honest one reverses the conclusion

_TERRITORY: D. Written 2026-08-19, answering A's routed ask ("a three-cluster
bootstrap is not a confidence interval and I nearly let one ship as
evidence... tell me what the right interval is, or that there isn't one")._

**Short answer: there is no trustworthy interval at 3 clusters — this is an
information limit, not a computation to fix. But the smallest honest
alternative (a t-interval on the 3 cluster means) is still worth computing,
and it changes the conclusion: it does NOT exclude zero.**

## 1. Why the percentile bootstrap failed the way it did

A's own diagnosis is exactly right: with 3 clusters, a nonparametric
(percentile) bootstrap can only ever produce resamples drawn from those same 3
values, so the 2.5th/97.5th percentiles of the resampled distribution
collapse onto the min and max of the 3 cluster means almost by construction.
**This isn't a bug in the bootstrap — it's what a percentile bootstrap
necessarily degrades into once cluster count is too small to approximate a
continuous distribution.** The standard guidance in the cluster-robust
inference literature (Cameron & Miller's applied guide is the usual
citation) puts the practical floor for percentile-style cluster bootstraps
in the dozens of clusters, not single digits.

## 2. What the standard alternatives buy you at G=3 — not much, but something

- **Wild cluster bootstrap.** The usual recommended fix for few clusters.
  But at G=3, each cluster's residual can only be sign-flipped (+1/-1),
  giving **2³ = 8** total resample patterns — the smallest possible
  non-trivial p-value is 1/8 = 0.125. It cannot report significance at any
  conventional threshold no matter how large the true effect is. Technically
  valid, practically useless here.
- **A t-interval on the cluster means**, df = G−1 = 2. This is the
  classical small-sample approach: treat the 3 season means as your entire
  sample, use Student's t with 2 degrees of freedom instead of a normal
  quantile. It has correct nominal coverage under the (unverifiable at n=3)
  assumption that season-level effects are roughly normally distributed —
  weaker evidence than a bootstrap with real resolution, but it does not
  pretend to have more precision than 3 numbers can support.
- **No interval at all**, just the raw cluster values and their sign
  agreement. This is what A's own DEFAULT already proposes, and it is not a
  cop-out — for G=3 it may genuinely be the most honest thing to publish.

## 3. Computing the t-interval — and it reverses the headline

The bootstrap's own degenerate bounds are informative here: since a
3-cluster percentile bootstrap's [2.5%, 97.5%] IS the [min, max] of the
cluster means, **[+34.1, +100.9] tells us the smallest and largest of the
three season means directly.** With the reported overall mean of +58.2 across
30 equally-sized seat-years (3 seasons × 10 seats, confirmed by "7/10 in
every one of the three seasons"), the middle season's mean is recoverable
algebraically: `3 × 58.2 − 34.1 − 100.9 = 39.6`.

**Stated limit: this backs out the season means from summary statistics
rather than reading them from a raw artifact — I did not find a committed
file with the three season-level means directly.** The arithmetic is exact
given the stated inputs; if the real per-season figures differ from
{34.1, 39.6, 100.9}, the numbers below need re-deriving from source, but the
METHOD stands regardless of the exact inputs.

With those three cluster means {34.1, 39.6, 100.9}:

```
mean = 58.2
sample sd (n=3, ddof=1) = 37.08
SE = sd / sqrt(3) = 21.41
t(0.975, df=2) = 4.303
margin = 4.303 x 21.41 = 92.1
95% t-interval = [58.2 - 92.1, 58.2 + 92.1] = [-33.9, +150.3]
```

**This interval includes zero.** The invalid percentile bootstrap said
"[+34.1, +100.9], excludes zero" — a false precision that happened to look
like a real result because both its bounds are literal data points rather
than a estimated sampling distribution. The properly small-sample-honest
interval is enormous (as it should be, from 3 data points) and does not
support "excludes zero" as a claim.

## 4. What this does and does not say about the slot-aware VONA finding

**Does NOT say the effect is fake.** The raw facts A already quotes as the
DEFAULT — 3 of 3 seasons positive, 21 of 30 seats, median +41.8 — are still
true and still the strongest thing actually supportable at G=3. A consistent
sign across all 3 independent seasons is real evidence, just not evidence
that compresses into a 95% interval excluding zero.

**Does say:** any claim of the shape "[+X, +Y], excludes zero" from this
harness, on any seat-replay finding with 3 season-clusters, is making a
promise the data cannot keep. This is the same shape of error register 21's
own saga warned about (a level claim dressed as more precise than it is) —
just in the confidence-interval currency instead of the point-estimate one.

## 5. Recommendation, matching what was asked

**Quote the raw counts (3/3 seasons, 21/30 seats, median/mean effect size)
as the primary evidence, never an interval, until real cluster count grows.**
The only way to a legitimate interval here is more independent seasons —
not more seats within a season, which are correlated by construction (the
"ten seats in one season are not ten independent draws" framing this
project already uses correctly elsewhere) and add nothing to G. If a number
is genuinely needed for some downstream automated gate, the t-interval above
can serve as a labeled, honestly-wide sanity bound — but it should never be
reported as "the CI" without saying so, because df=2 t-intervals have poor
real coverage even though they are the standard textbook answer.

**This affects every seat-replay claim built the same way, exactly as A
flagged** — any prior or future "[+X, +Y]" quoted from a 3-season-clustered
bootstrap on this harness should be re-read as the min/max of 3 numbers, not
a confidence interval, until re-derived properly.

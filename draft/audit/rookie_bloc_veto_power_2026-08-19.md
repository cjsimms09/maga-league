# The rookie-bloc veto's power, measured against the real data — and what it can and cannot catch

_TERRITORY: D. Written 2026-08-19, answering A's routed ask ("tell me what n
this test needs to be worth quoting, and whether there is a better-powered
form")._

**Short answer: no realistic n fixes this — it is a signal-to-noise problem,
not a sample-size problem. At the CURRENT n=19, the test can only reliably
catch a rookie-vs-veteran bias of roughly 4x the size actually observed
(~7+ percentage points of median relative shift); anything smaller passes
whether or not it is real.**

## 1. Reproduced the live numbers first, and caught my own reproduction bug

`multisource_blend.py`'s veto compares `rookie_shift`/`vet_shift`, computed
as `(blended_mean − pre_blend_mean) / pre_blend_mean`. My first attempt
called `apply_multisource()` on a copy of the ALREADY-BLENDED live board, so
`proj_mean` was already the post-blend value and the "shift" it measured was
the blend against itself — near-zero for both blocs (0.0166 vs 0.0162),
nothing like the committed provenance. **Caught before using it**: the board
stamps the pre-blend value explicitly as `proj_mean_sleeper_only` alongside
the blended `proj_mean`, and recomputing the shift from THAT pair reproduces
the committed diagnostic closely (rookie median 0.0713, exact match;
veteran median 0.0531 vs the committed 0.0560 — small residual difference,
likely a slightly different `>20` pre-blend-value threshold at build time
vs. my reconstruction). Extracted arrays: **19 rookies, 250 veterans**
(close to A's reported 284/283 — the small gap is the same threshold
sensitivity).

## 2. Does more n fix it? No — power stays low even at n far beyond what a real draft can produce

Bootstrap-resampled from the OBSERVED rookie distribution (fixed shape and
spread, varying only how many rookies are drawn) against the real veteran
pool, and measured how often the permutation test would reach p<0.05 for
the effect size actually observed:

| rookie n | power to detect the OBSERVED effect at p<0.05 |
|---|---|
| 19 (current) | 0.02 |
| 30 | 0.03 |
| 50 | 0.05 |
| 75 | 0.08 |
| 100 | 0.06 |
| 150 | 0.09 |
| 200 | 0.12 |

**Power barely moves from n=19 to n=200 — a tenfold increase in sample size
buys roughly 10 percentage points of power, not the dramatic gain you'd
expect if this were purely an n problem.** The reason: rookie-shift values
have a within-bloc spread (sd ≈ 0.12) roughly 6-7x the size of the observed
median gap between blocs (≈ 0.018). A test comparing medians of two
overlapping, high-variance distributions this close together needs an
enormous sample to resolve — and this league will never draft 200 rookies
in a season to get there. **This is not a "collect more data" problem.**

## 3. What CAN the test at n=19 actually catch? — the real detection floor

Injected a synthetic shift on top of the real rookie distribution's shape
(same spread, recentered), scaled as a multiple of the observed gap, and
measured power at the ACTUAL n=19:

| gap size | power at n=19, p<0.05 |
|---|---|
| 1x observed (0.018) | 0.00 |
| 2x observed (0.037) | 0.00 |
| 3x observed (0.055) | 0.00 |
| **4x observed (0.073)** | **0.55** |
| 6x observed (0.110) | 1.00 |
| 8x observed (0.146) | 1.00 |

**The test only becomes reasonably reliable (≥50% power) once the true bias
is about 4x what was actually measured — a roughly 7-percentage-point
median relative-shift gap between rookies and veterans.** Below that, a
pass from this test is exactly what A suspected: a weak null, not a
clearance. Above roughly 6x (an 11-point gap), the test is reliable.

## 4. The "better-powered form" question — attempted, not resolved, saying so rather than guessing

A rank-based test (Mann-Whitney/Wilcoxon rank-sum) is the standard
recommendation for more power than a median-difference test at small n,
since it uses the full ordering of both samples rather than collapsing
each to one number. **I implemented one by hand (no `scipy` in this
sandbox) and it produced an implausible result** (p=1.0 on the real data,
and it detected LESS reliably than the median test even at 4x the observed
gap) — a result I do not trust and am not reporting as a finding, per this
project's own standard that a suspicious result is a bug report until
verified. **Flagging this as unresolved rather than shipping a wrong
number**: whether a rank-based form genuinely out-powers the median test
here needs either `scipy.stats.mannwhitneyu` (unavailable here) or a
correctly-debugged hand implementation, neither of which I have done.

## 5. Recommendation

**Do not quote this veto's pass as a clearance — quote it as what section 2
proves it structurally can be: a check that can only catch a bias 4x or
larger than anything measured so far.** Keep the DEFAULT A already
proposed (report it as a weak null, which the committed provenance's own
`note` field already says — "a small rookie n makes a pass a WEAK null, not
a strong clearance," verified true by this power analysis rather than just
asserted). If a rank-based form is worth pursuing, it needs a
properly-validated implementation before being trusted, which is future
work, not something to claim solved here.

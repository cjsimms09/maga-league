# Zero-information weeks make a decision-null grader LESS significant, not more — and that inverts the warning

**D, 2026-08-25. Register 344. Corrects one clause of register 340's Rule 3g ③, not its fix.**

## The claim being checked

Register 340 closes with the statement it says D and E are owed:

> *"a decision-null instrument that admits a zero-information week reports skill
> against a phantom, and the null band shrinks with n, so contamination makes a
> WEAKER result look MORE significant."*

The first half is right and the fix that follows from it is right. **The
inference in the second half runs the wrong way**, and it is the half that
tells the next lane what to be afraid of.

## The algebra

`start_sit_vs_random.py:298` sets the null band for the mean of *n* uniform
percentiles at `0.5 ± 1.96/sqrt(12n)`. Contaminate *n* real owner-weeks of mean
percentile *m* with *k* zero-information weeks, each scoring 0.5 by
construction because every alternative is tied at nothing:

- observed deviation from the null centre becomes `n(m − 0.5) / (n + k)`
- band half-width becomes `1.96 / sqrt(12(n + k))`
- so the result's distance from the band, in half-widths, scales as
  **`n / sqrt(n + k)`**

That is strictly **decreasing** in *k*. The band does shrink with n — that
clause is true — but the mean is dragged toward the null centre as `1/(n+k)`,
faster than the band shrinks at `1/sqrt(n+k)`. Dilution by null-scoring
observations can only deflate this statistic. **It cannot inflate it.**

## Measured on the instrument's own numbers

| | n | mean percentile | band half-width | distance from 0.5, in half-widths |
|---|---|---|---|---|
| contaminated (register 340's measured "before") | 712 | 0.7602 | 0.02120 | **12.27** |
| clean (`start_sit_vs_random.json` today) | 532 | 0.8481 | 0.02453 | **14.19** |

Band half-widths recomputed from the formula in the source, not copied from
prose: `1.96/sqrt(12·532) = 0.02453` against the artifact's stored `0.0245`.

The predicted ratio is `sqrt(n/(n+k)) = sqrt(532/712) = 0.8644`. The observed
ratio is `12.27/14.19 = 0.8647`. **They agree to three decimals**, which is the
test — the law was written down first and then reproduced the numbers, rather
than being fitted to them.

## Why this matters more than a sign error

The warning as written points at false positives. The mechanism points at
**false negatives**, and that is a different search:

- A contaminated grader that reports **"inside the null band — not
  distinguishable from chance"** may be sitting on a real effect that dilution
  pushed under the bar. The contamination manufactures precisely the shape
  **Rule 3e** exists for: a clean-looking null that is indistinguishable from
  a broken probe.
- register 339 says **~40 modules under `draft/backtest/` read
  `league_history` and now see a fifth season of zeros**. Every null any of
  them has reported since `c5ec97a5` is suspect in the direction of *too
  weak*, not too strong. A re-derived null from that window should be re-run,
  not merely re-read.
- Nothing needs un-publishing. The start/sit headline moved **0.7602 → 0.8481**
  when the phantom weeks came out, i.e. the contaminated number understated
  the league's start/sit skill. `CLAUDE.md`'s quoted 0.8497 was taken before
  the contamination and is intact, exactly as 340 says.

## The one condition on this

It holds for contamination that scores **at the null centre**. Phantom
observations that scored systematically *above* 0.5 would inflate rather than
deflate. Here they cannot: a week where every player scored zero has every
legal lineup tied, so the percentile is 0.5 by construction — which is also
why the oracle control collapsed to 0.873 and failed. Any future contamination
of a different shape needs its own check; this is not a general licence to
assume dilution is safe.

## Follow-up questions (Rule 3g)

- **Does this imply another failure we have not looked for?** Yes, and it is
  the actionable half: any `draft/backtest/` grader that reported a NULL while
  reading the contaminated store may have a false null. That is a re-run list,
  and the sweep register 339 leaves open is what produces it.
- **Does it invalidate something we already trust?** No published number. It
  invalidates a *heuristic* — "contamination inflates significance" — that
  would have sent the next reader looking in the wrong direction.
- **Is it routed?** Register 340 is A's row and `TERRITORY: A`; this corrects a
  sentence in it, not the code, so it goes to A as a note rather than a patch.

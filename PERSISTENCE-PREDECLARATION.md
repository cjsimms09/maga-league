# TERRITORY: C
# CROSS-SEASON PERSISTENCE OF OWNER BEHAVIOUR — PRE-DECLARATION

**Committed BEFORE the analysis runs, so the order is checkable in git history rather
than asserted afterwards.**

## What it decides

**If tendencies do NOT persist**, the room layer's 1.4% was the ceiling, the negative was
evidential, and no architecture fixes it. **If they DO persist**, the negative was
architectural — an additive term against a dominant quantity — and the room layer is a
design problem with a payoff behind it. **We are planning the winter as though the second
is true without having checked.**

## The dependence structure and the effective n, stated first

The naive reading is "three seasons, n=3." That is wrong, and so is "30 observations."

- **30 owner-seasons** — 10 owners × 3 seasons. These are the raw units.
- **Pairwise correlations are NOT independent.** For one tendency there are 3 season
  pairs (23v24, 24v25, 23v25) but only **2 independent transitions** per owner — 23v25 is
  implied by the other two.
- **So the effective independent sample is ~10 owners × 2 transitions = 20
  owner-transitions per tendency**, not 30, and not 3.
- **Tendencies are correlated within an owner** (someone who takes QB early plausibly
  takes TE early), so 6 tendencies are not 6 independent tests either.

**Therefore the instrument is NOT 18 pairwise correlations at n=10** — that was C-001's
first cut, it had power only for |ρ| ≥ 0.648, and it answered nothing.

**It is a variance decomposition with a permutation null.** For each tendency, compute
the share of total variance that lies BETWEEN owners rather than WITHIN an owner across
seasons — the intraclass correlation. Persistence *is* between-owner variance exceeding
season noise. Significance comes from **shuffling owner labels across the 30
owner-seasons** and recomputing, which preserves the real dependence structure and
assumes no distribution.

## On F1, and it is a capture gap rather than a filter gap

Cory's instruction is that F1 must not bound a discovery question. **It does not bound
this one, and for a reason worth stating precisely: our own league is not F1-filtered —
it *is* our format.** The data that would enlarge this test is *external* leagues with the
**same owners across multiple seasons**, and that was **never captured**: the MFL crawl
takes one season per run and no run has followed a league across years.

**So the limit here is something we did not capture, not something F1 excluded.** That is
a capture-policy finding, and it is exactly the shape of the standing capture principle:
free, and unrecoverable once the seasons pass.

## Predictions, made blind

- **P1.** At least one tendency shows between-owner variance clearly above the
  permutation null (**p < 0.05**). Onesie timing — when an owner takes K or DEF — is the
  most habitual behaviour in a draft and the most likely to persist.
- **P2.** `RB_share5` shows the strongest persistence of the skill-position tendencies.
  It was the largest correlation in C-001's thin version (+0.62, +0.30, +0.61).
- **P3.** `TE1` shows **no** persistence. It was flat in C-001 (+0.01, −0.01, −0.09), and
  TE timing is driven by which tight ends happen to be available rather than by habit.
- **P4.** The **pooled** answer across all six tendencies is positive — i.e. owners are
  distinguishable from one another by their draft behaviour — even where individual
  tendencies are not significant.
- **P5.** Even a positive result will NOT be enough to justify building the room layer.
  It removes the *evidential* explanation for the 1.4%; it does not establish that a
  different architecture would capture it. **Those are different claims and only the
  first is on offer here.**

**What would falsify the exercise rather than a prediction:** if between-owner variance
sits *at* the permutation null for every tendency, then owners are statistically
indistinguishable from one another in how they draft, the room layer is dead on evidence,
and the winter plan needs rewriting. **That is the outcome I would report first and
loudest, because it is the one that changes what gets built.**

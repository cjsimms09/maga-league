<!-- TERRITORY: A -->
# PREREGISTRATION — THE FRESH-SEED REPLICATION, AND THE PROMOTION BAR

**Committed BEFORE the run. No results in this commit.**

This is the outstanding blocker named in `EXP-CEILING-BRACKET-RESULT.md`. Both
ceiling runs so far used the **same three seeds**, so they are one experiment
measured twice. This is the independent one.

---

## 1. THE SEEDS ARE DERIVED BY A RULE, NOT CHOSEN

`cory_conditional.SEED` is 20260808. The two prior runs used
`SEED + 7919 / 104729 / 1299709` — the 1,000th, 10,000th and 100,000th primes.

**This run uses `SEED + 15485863 / 32452843 / 49979687`** — the 1,000,000th,
2,000,000th and 3,000,000th primes. Same family, mechanically the next rungs,
provably disjoint from the three already used:

| | seed |
|---|---|
| fresh #1 | 35746671 |
| fresh #2 | 52713651 |
| fresh #3 | 70240495 |

They are written here before the run so that "these are the seeds it worked on"
is not available as an outcome.

## 2. ONE WEIGHT, AND IT IS DELIBERATELY NOT THE BEST-SCORING ONE

**w = 0.45.** Single arm against `core` (the shipped `ceiling = 0.0`).

The bracket found 0.30 / 0.45 / 0.65 indistinguishable — means within **$0.6**
against CIs spanning about $40 — and forbade reading a ranking off that. **0.45
is the positional middle of that plateau, chosen by where it sits and not by
what it scored.** The best-scoring weight was 0.30, and picking that one would be
selection on exactly the noise the bracket said not to read.

Testing the whole grid again would be a **third grid on one question**, which
`CEILING-BRACKET-PREREG.md` §6 forbids without a further prereg — and this is
that prereg, declaring a single point instead precisely so it cannot become a
search.

## 3. THE BAR, WHICH IS THE SAME BAR

**Positive in all 3 fresh seeds AND CI excludes 0 in at least 2**, enforced by
the shared `summarise()` rather than by my reading of a table. 400 paired rooms,
per-seed paired bootstrap CI, `exp_ceiling_freshseed.py` reusing
`race`/`_paired`/`summarise`.

**This is the promotion bar.** If it clears, the evidence chain for moving
`MEASURED_WEIGHTS.ceiling` off zero is complete and the decision is Cory's, after
the draft. If it does not clear, **the weight does not move and the two earlier
runs are reported as NOT REPLICATED** — not as "two out of three agreed".

## 4. DECLARED IN ADVANCE

- **A smaller effect than +$36 is expected and is not a failure.** The prior
  runs' magnitudes came from three particular seeds; the honest prediction is
  the same sign with a different size. Only the sign and the separability count
  against the bar.
- **The stamped board check still applies**: more than one distinct
  `proj_ceiling/proj_mean` ratio, or the run is void.
- **No anchor control is possible here and that is the point** — there is no
  shared arm to reproduce, because sharing nothing with the earlier runs is what
  makes this replication independent. What it gives up in cross-checking is what
  it buys in independence.

## 5. WHAT MAY NOT HAPPEN

- **Nothing ships before 2026-08-22, even on a clean pass.** Unchanged from all
  three earlier preregs. A cleared bar makes the change *available* to Cory
  after the draft; it does not make it.
- **No fourth seed set.** If this run comes back mixed, that is the answer.
  Adding seeds until the bar clears is the failure mode this whole sequence of
  preregs exists to make impossible.
- `risk` stays UNMEASURED. No `ADP_SD_RATE` re-fit rides along.

**"Did not replicate" is a valid outcome and needs no further permission.**

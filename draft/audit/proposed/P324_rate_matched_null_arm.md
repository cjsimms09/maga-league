# PROPOSED DIFF — `random_rate_matched`, the deviation-rate-matched null

**Session D, 2026-08-24.** For A. **Stacks on
`register280_random_top25_null_arm.patch`** — apply that one first; both were
verified to apply in order from a clean tree.

```
git apply draft/audit/proposed/register280_random_top25_null_arm.patch
git apply draft/audit/proposed/P324_rate_matched_null_arm.patch
```

`archetype_policy.js` is TERRITORY: A and is **unchanged on this branch**.

---

## What it is for

`random_top25` (the 280 patch) showed random reordering of the engine's own
top-25 loses by **−3.4** paired weekly. But it deviates on **8.4** picks/room
against `market_adp`'s **6.2**, so that number mixes two things:

* our ordering carries information, and
* deviating from `recs[0]` costs something *per se*.

This arm removes the second by acting on **exactly the picks `market_adp` acts
on**, and never returning `recs[0]` when it acts.

## What it found — and it revises the earlier number

| paired mean_weekly vs `shipped` | seeds 1-40 | seeds 41-80 |
|---|---|---|
| `random_top25` (unmatched, 8.4/room) | −3.4325 | −3.3115 |
| **`random_rate_matched` (matched, ~6.2/room)** | **−1.3992 [−1.96, −0.84]** | **−1.7563 [−2.52, −0.99]** |

**Roughly half of the −3.4 was deviation cost.** Our score's ordering is worth
**+1.4 to +1.8** over random at matched rate — not +3.4. P322's row has been
amended in the ledger rather than left standing.

The decomposition, all at matched rate:

| comparison | value |
|---|---|
| our ordering vs random | **+1.4 / +1.8** |
| ADP vs our ordering | **+1.35** |
| ADP vs random | **+2.77 / +3.11** |

**ADP's ordering edge over our score is comparable in size to our score's
entire edge over random.** That is the sentence worth carrying into
`EDGE-DEFINITION.md`.

## ⚠️ I overstated the match in the code before measuring it

The arm's comment originally said the divergence count matched **"by
construction, not by luck."** It does not. Once either arm deviates, its room
diverges from the other's, so every later pick is judged against that arm's
*own* `recs`.

Measured at 40 rooms: **6.4 vs 6.2** on one block and **6.1 vs 6.8** on the
other — **opposite directions, so no systematic bias**, and both far closer than
`random_top25`'s 8.4/8.5. The comment is corrected in this patch; I am flagging
it because the wrong version would have been the thing a future reader trusted.

## Verified, not asserted

| check | result |
|---|---|
| the two patches apply in order from a clean tree | verified, then `node --check` and a module load |
| the arm registers | `ARCHETYPES` goes 15 → 16 |
| rate match | **6.4/6.2** and **6.1/6.8** (vs `random_top25`'s 8.4/8.5) |
| pairing preserved | `shipped` and `market_adp` unchanged: `market_adp − shipped` still **+1.3712 / +1.3488** |
| refusal fires | no `pickSeed` → throws, same as `random_top25` |

## STATED BOUNDARY

The residual rate mismatch is small and unbiased across blocks, but it is **not
zero**, so the −1.4/−1.8 is very close to a pure ordering measure rather than
exactly one.

Every run in this chain carries D's unaccepted **register-269** patch. A clean
re-run of P321/P322/P324 is owed once that lands, and no row discharges it.

`SEND BACK` is a complete answer if you would rather not carry two null arms —
though `random_top25` alone gives the biased −3.4, and it was reported as a
finding before this arm existed.

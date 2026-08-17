<!-- TERRITORY: A -->
# RESULT — THE REPLICATION CLEARED. THE CEILING CHAIN IS CLOSED.

**Prereg:** `CEILING-FRESH-SEED-PREREG.md`, committed before the run (`b6e754a5`).
**Generated table:** `EXP-CEILING-FRESHSEED.md` · **data:** `exp_ceiling_freshseed.json`

---

## THE RESULT

`w = 0.45` against the shipped `ceiling = 0.0`, 400 paired rooms, on three seeds
sharing nothing with either prior run:

| seed | edge | 95% CI | excludes 0 |
|---|---|---|---|
| 35746671 | **+29.06** | [+9.44, +48.69] | yes |
| 52713651 | **+32.69** | [+14.94, +52.06] | yes |
| 70240495 | **+46.06** | [+24.00, +65.75] | yes |

**Mean +$35.9 · positive 3/3 · separable 3/3. THE PROMOTION BAR IS CLEARED.**

## WHY THIS ONE COUNTS DIFFERENTLY

The re-derivation and the bracket both ran on `CC.SEED + the 1,000th / 10,000th /
100,000th primes`. However clean each looked, they were **one experiment measured
twice**. This run uses the next rungs of the same ladder — the 1,000,000th /
2,000,000th / 3,000,000th primes — declared in the prereg before the run, and the
script **refuses outright** if its seed set ever intersects the prior one.

The weight was fixed in advance too, and deliberately **not** the best-scoring
one: 0.45 is the *positional middle* of the plateau the bracket found
indistinguishable. **0.30 scored highest**; testing that would have been
selection on exactly the noise the bracket said not to read.

## THREE RUNS, TWO SEED SETS, FOUR WEIGHTS, ONE DIRECTION

| run | seeds | weight | mean |
|---|---|---|---|
| re-derivation | set A | 0.65 | +$35.5 |
| bracket | set A | 0.45 | +$35.7 |
| **replication** | **set B** | 0.45 | **+$35.9** |

Every one of the twelve bracket cells and all three replication seeds are
positive with a CI excluding zero. **`MEASURED_WEIGHTS.ceiling = 0.0` is wrong,
and the evidence for that no longer rests on one seed set, one weight, or one
run.**

## WHAT IS STILL TRUE THAT LIMITS IT

The replication inherits every structural limit of the runs it replicates,
because it shares their board and their proxy — fresh seeds buy independence
from *sampling*, nothing else:

- **money proxy, not a graded historical replay.** `+$35.9` means "clearly
  positive", not a bankable figure.
- **cross-band dispersion only.** The measured ceiling is still `proj_mean × a
  per-cell constant` (Spearman 0.9607 against `proj_mean`), so this says the
  model should price upside *between bands*. It still says nothing about whether
  **this** player has upside — that is `weekly_volatility.py`
  (`VOLATILITY-WIRING-PREREG.md`), and it remains the question Cory has actually
  been asking.
- **the proxy's keeper `weekly_sd` fix ran in this effect's favour**, and was
  made the same day. Independent seeds do not undo a shared correction.

## WHAT HAPPENS NOW

**Nothing, before 2026-08-22.** A cleared bar makes the change *available* to
Cory after the draft; it does not make it. That was fixed in all four preregs
before any of them produced a number, and a result landing the way we hoped is
the worst possible reason to relax it.

**The decision waiting for Cory, in one sentence:** *the model is currently
ignoring upside entirely; three preregistered runs across two independent seed
sets say it should not, and say the exact amount hardly matters anywhere between
0.30 and 0.65.* Not "set it to 0.30".

**A defect this run found in the shared summariser, fixed before this was
written up:** with a one-point grid, `min(weights) == max(weights) == winner`, so
the "THE GRID DOES NOT BRACKET THE OPTIMUM" clause fired and told the reader the
run had failed to locate a peak it was never looking for. A one-weight run is not
an unbracketed optimum; it is not an attempt to bracket one. Guarded now, with a
control proving the clause still fires on a genuine two-point grid
(`draft/tests/test_ceiling_rederivation.py`, 30/30).

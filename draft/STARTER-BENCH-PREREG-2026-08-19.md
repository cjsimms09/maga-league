# PREREGISTRATION — should the waiver baseline apply only to BENCH bodies?

**A, 2026-08-19, committed BEFORE the run.**

Cory: *"Value is wrong?? Shouldn't it only compare to waiver when drafting
bench?"*

## HIS INTUITION, STATED FAIRLY

If I don't draft a bench body, that roster spot gets a **wire pickup** — so the
wire is exactly the right alternative. But if I don't draft a **starter**, I
don't play a wire man all year; I take a different starter with a later pick.
**So the alternative for a starter is the next real player at that position, not
the wire.** That is VONA, and it is a genuinely different baseline.

## THE ARM

```
body fills a STARTING slot :  value = proj_used − best available at that
                                      position at my NEXT pick        (VONA)
body is BENCH              :  value = proj_used − waiver(position)    (VOR)
```

## ⚠️ THE FAILURE MODE I HAVE ALREADY HIT ONCE, PREDICTED BEFORE RUNNING

**`model_diagnostics.js` carries this correction in its own source:** *"THE
SPLIT IN SECTION 5 OF THE DERIVATION WAS WRONG… with R = VONA for starters, a QB
priced 5.4 when you held NONE and 22.0 when you held one — value RISING as the
slot filled, which is nonsense."*

The arithmetic is the reason. At running back the two baselines are:

| | baseline | a 240-point back scores |
|---|---|---|
| **starter** (next-pick best RB) | ~311 | **0** |
| **bench** (the wire) | **78.4** | **162** |

**A bench body is measured against a baseline 233 points lower than a starter's,
so bench bodies out-price starters and the model drafts depth before it drafts a
lineup.** That is not a tuning problem, it is the split itself.

## PREDICTIONS

**P201 — the split inverts the roster.** On the same 300 rooms, `a = 0`, Cory's
curve: **at least one starting slot is left empty in more than 5% of rooms**,
OR **mean RB + WR moves by more than 1.5 bodies** against the current
4.37 / 6.63. **FALSE if neither happens** — in which case my §5 correction was
wrong about this case and Cory's split works.

**P202 — and the cause is the baseline gap, not the idea.** Measured directly at
a mid-draft pick: the **median baseline for bench bodies is at least 100 points
below the median baseline for starters**. **FALSE under 100** — in which case
the two baselines are close enough that the split is harmless and P201's
failure, if it happens, has another cause.

⭐ **If P201 comes back FALSE I adopt Cory's split, because it would mean the
correction I have been carrying since the derivation is wrong.**

## THE THIRD ARM — because his intuition may be right about BENCH only

**`bench-only`: keep the current surplus for starters, and for BENCH bodies
lower the baseline to the wire.** This is the half of his idea that does not
invert anything, and it is run alongside so the answer is not all-or-nothing.

## CONTROLS

1. **KNOWN POSITIVE.** The unchanged arm must reproduce RB 4.37 / WR 6.63 /
   onesies 1.00 exactly.
2. Both baselines printed at a mid-draft pick so the gap is visible, not argued.
3. Same rooms, seed, keepers, projections, `a = 0`.
4. **REPORT ONLY.**

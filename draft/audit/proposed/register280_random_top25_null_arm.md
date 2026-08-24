# PROPOSED DIFF — `random_top25`, the working non-vacuity control

**Session D, 2026-08-24.** For A. This is register 280's design fault answered
with code rather than another finding, and it is also the instrument P322
graded on.

**A proposal, not an edit.** `archetype_policy.js` and `archetype_rooms.js` are
TERRITORY: A and are **unchanged on this branch**.

```
git apply draft/audit/proposed/register280_random_top25_null_arm.patch
```

---

## Why this is not just "D needed an arm"

Register 280 established that `anti_barbell` — the family's own **declared**
non-vacuity control, written PRE-DECLARED TO LOSE — **cannot act at Cory's
seat**. Measured, in three artifacts across two seed blocks:

| arm | overlay-diverged picks / room |
|---|---|
| `anti_barbell` (the declared control) | **0.0** |
| `no_deadweight`, `anchor_early` | **0.0** |
| `market_adp` | 6.2 |
| **`random_top25` (this arm)** | **8.4** |

The family's believability rule — *"if it does not lose, nothing else in this
family means anything"* — is unsatisfiable while its control is inert. **This
arm is a control that demonstrably acts, and demonstrably loses.**

## What it does

Uniform choice among the **same** top-25 non-onesie candidates `market_adp`
reorders, after `legalityOwns` exactly like every other arm.

## The one design decision worth reading

`state` carries no rng, and **the room's `rng` must not be used.** Drawing from
the shared stream would shift every later opponent pick, so the arm's rooms
would no longer be the control's rooms and the paired design would collapse
silently — no error, just a quietly invalid comparison.

So the driver passes `pickSeed: (seed * 2654435761 + overall) >>> 0` — a pure
function of the room seed and the pick number that **consumes nothing** from
`rng`. The arm refuses (throws) if it is absent, the way `requireClassOf`
refuses a missing classifier: a silent `Math.random()` fallback would make the
null both irreproducible and unpaired.

## Verified, not asserted — three controls

| control | result |
|---|---|
| **C1 — the arm acts** (unlike `anti_barbell`) | **8.4 diverged picks/room** |
| **C2 — reproducible** | same config re-run → **byte-identical output** |
| **C3 — pairing preserved** (load-bearing) | `shipped` and `market_adp` **bit-identical** with and without the arm present, at 6 rooms **and** at full 40 |
| the refusal fires | no `pickSeed` → throws, with the reason |

**C3 is the one that matters.** It is the direct check that adding the arm did
not perturb the rooms, and it held at full scale: `market_adp − shipped` came
out **+1.3712** and **+1.3488** on the two blocks — identical to four decimals
to the P321 runs made *before* this arm existed.

## What it found (P322)

| paired, mean_weekly | seeds 1-40 | seeds 41-80 |
|---|---|---|
| `market_adp` − `random_top25` | **+4.80 [+4.09, +5.52]** | **+4.66 [+4.00, +5.32]** |
| `random_top25` − `shipped` | **−3.43 [−4.10, −2.77]** | **−3.31 [−3.89, −2.73]** |

**The engine's ordering is worth about +3.4 points/week over noise.** That
refutes the alarming reading P321 could not rule out — our fine-grained
ordering is *not* worse than a coin flip. ADP is simply better than it, by
+1.4.

## STATED BOUNDARY — the arms do not deviate at equal rates

`random_top25` diverges on **8.4** picks/room and `market_adp` on **6.2**, so
the −3.4 mixes *"our ordering carries information"* with *"deviating from
`recs[0]` is costly per se"*, and **this design cannot separate them.** The
primary (ADP beats random) is unaffected — it is a comparison between two
deviating arms — but the −3.4 should not be quoted as a pure measure of the
score's information. A rate-matched null is filed as **P324**.

`SEND BACK` is a complete answer if you would rather fix `anti_barbell` than add
a second control — though register 280's measurement says fixing it needs a
wider `TOP_N` or acting before `legalityOwns`, both of which change what every
other arm sees.

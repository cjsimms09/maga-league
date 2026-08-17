<!-- TERRITORY: A -->
# CORRECTION — I OVERSTATED WHAT THE CEILING FIX CHANGED — 2026-08-17

**This corrects my own claim in commit `7c4d0833` and the message I gave Cory
with it.** Found while doing the thorough hunt he asked for, before he found it.

## WHAT I SAID

> "The bench branch changes — that is the fix." And: *"429 of 530 players move
> 10+ places in that order."*

## WHAT IS TRUE

**The 429-of-530 figure was real but it described a ranking I computed in my own
script, not one the engine uses.** I sorted the board on
`proj_ceiling − proj_mean` and reported how that ordering moved. The engine does
compute that spread — and then multiplies it by a weight of **zero**.

Traced properly, `proj_ceiling` has three consumers and two of them are inert:

| consumer | live? | why |
|---|---|---|
| composite `ceiling` term | **NO** | `w.ceiling * ceiling`, and `MEASURED_WEIGHTS.ceiling = 0.0` |
| bench branch | **NO** | `wCeil = Math.max(BENCH_CEILING_FLOOR, w.ceiling)` — and `BENCH_CEILING_FLOOR` is **0**, so the floor does not rescue it |
| `CEILING_TIEBREAK` | **YES** | reads `p.proj_ceiling` directly, unweighted, on by default |

I read the bench branch's comment ("ranks on `proj_ceiling − proj_mean`"),
confirmed the branch exists, and did not check that its weight resolves to zero.
`BENCH_CEILING_FLOOR = 0` is even documented as a deliberate named zero — "a
knob at zero that a test exercises is honest" — and I quoted the surrounding
block without reading that line.

## THE ACTUAL BLAST RADIUS

The tiebreak fires only on pairs that are **same position, same tier, adjacent
in score order, and within `TIE_THRESHOLD = 2.0`**. Measured over every
same-position/same-tier pair on the live board:

    pairs                                    5,333
    pairs whose ceiling ORDER flips          16   (0.30%)

And a flip is only *possible* across a band boundary — within a band both the
old and the new ceiling are the mean times one constant, so the order is
identical by construction. The live recommendation changes are a **subset of
those 16**, since each pair must also be adjacent and inside the tie threshold.

Examples of the 16: Amon-Ra St. Brown (WR 1-3) vs CeeDee Lamb (WR 4-8);
Dak Prescott (QB 4-8) vs Jared Goff (QB 9-16); Javonte Williams (RB 9-16) vs
Jeremiyah Love (RB 17-32).

## WHAT THIS DOES AND DOES NOT CHANGE

**Unchanged — the fix was still worth making.** `proj_ceiling` and `proj_floor`
were arithmetic on the mean and are now measured distributions. Every downstream
consumer that ever reads them gets a real number, the frozen snapshots now
record what they mean, and the deep-band flattery (a WR 33+ told his floor was
0.656× projection against a measured 0.049×) is gone from the artifact a human
reads.

**Changed — the claim that the board now "considers upside".** It does not, in
any weighted sense. The data is correct; the model still ignores it, because
`ceiling` is weighted 0.0 in the composite AND in the bench branch. Cory's
sentence — *"We absolutely need to change draft board if we aren't considering
upside"* — is **still unsatisfied**, and I reported it as satisfied.

## WHY THE OLD WEIGHT TEST CANNOT BE APPEALED TO

The obvious reply is "the weight is 0.0 because it was measured as worthless."
That measurement is **void**, for the reason already recorded: it tested a field
that was a monotone transform of the mean, so it could not have earned a weight
under any circumstances. Zero was the right answer to the wrong question.

**Raising the weight is therefore an open question with no evidence on either
side** — which is exactly what the simulation has to settle, and the first time
such a simulation would be measuring anything real.

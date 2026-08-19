# ROW 3 — THE OPPONENT ARM IS A NULL AT ALL FOUR POSITIONS, AND THE REASON IS THE FINDING

_TERRITORY: D. In-season row 3 (P57). Preregistered in
`OPPONENT-ARM-PREREG.md`, committed first (`f8d9dedd`). Result:
`opponent_arm.json`._

## THE RESULT

| position | pooled ΔMAE | seasons + | placebo p | net of placebo | **clears** |
|---|---|---|---|---|---|
| QB | **−0.0239** | 0/3 | 0.951 | −0.0200 | ❌ |
| **RB** | **+0.0147** | 2/3 | **0.0164** | +0.0161 | ❌ |
| WR | −0.0098 | 1/3 | 0.984 | −0.0080 | ❌ |
| TE | **0.0000** | 0/3 | 0.541 | +0.0039 | ❌ |

**Nothing clears.** The bar was preregistered with magnitudes: pooled ΔMAE ≥
+0.010 **and** 3 of 3 seasons positive **and** placebo p < 0.05.

**RB is the one real signal and it still fails** — it beats its placebo cleanly
(p=0.0164) and clears the magnitude, but **2025 is −0.035** and the 3-of-3
requirement catches it. That requirement was fixed before any number existed.

**TE's fit chose λ = 0.00 in all three folds** — the harness picked *do
nothing*, every time. That is worth stating because it shows the fitting is not
forced to find something.

**Population: 100% kept.** 2,023 / 2,099 / 2,009 eligible rows, **zero dropped
for a missing opponent and zero for a missing rating.** No result here rests on
a silently shrunken population.

## 1. THE HEADLINE — feasibility and arm are different claims

`opponent_strength.py` (relay) rules **IN-SEASON ONLY at all four positions**:
QB +0.320, RB +0.276, TE +0.258, WR +0.174 median in-season persistence.

**The arm finds nothing at QB, WR or TE.**

| | feasibility (in-season median) | arm (ΔMAE) |
|---|---|---|
| QB | **+0.320** — the strongest | **−0.024**, worse than baseline, p=0.95 |
| TE | +0.258 | **0.000**, λ=0 chosen every fold |
| WR | +0.174 | −0.010, p=0.98 |
| RB | +0.276 | **+0.015**, the only one beating placebo |

> **A rating that DESCRIBES the second half is not a multiplier that REDUCES
> error.** QB has the highest persistence of the four and is the arm's worst
> position.

That is the distinction the prereg was written around, and it is now measured
rather than argued. **This does not contradict the relay's study** — that study
measured persistence and reported it honestly. It refines what persistence
licenses: **a feasibility median is not a licence to build.**

**Why the two can diverge, plainly:** a defence can be reliably worse than
average and still not move a *player's* projection, because the running-mean
baseline already contains the schedule the player has faced, and because a
±10% team-level tilt is small against the week-to-week variance of one player.
Persistence is a property of the *defence*; ΔMAE is a property of the
*prediction*.

## 2. THE PLACEBO SPLIT IS ITSELF INFORMATIVE

Register DS3 predicted this arm would be **safe by construction** — the
multiplier is `allowed / league_mean`, so it is mean-normalised and cannot buy
the free shrink that killed register DS2's `game_total` arm.

**Confirmed, and visibly:** the placebo means are ≈0 rather than the +0.046
that arm enjoyed, and the three failing positions have placebo p of 0.95, 0.98
and 0.54 — i.e. **the real arm is indistinguishable from, or worse than, a
coin-flip reassignment of its own ratings.** With an uncentred multiplier those
positions would have shown a spurious positive.

**Centre the multiplier and the artifact disappears.** That rule now has a
second, independent confirmation.

## 3. MY THREE PREREGISTERED PREDICTIONS, GRADED

Filed in the prereg before the arm existed; **P74–P77 in `PREDICTION-LEDGER.md`.**

| | prediction | outcome |
|---|---|---|
| **P74** | RB clears and is the largest | **HALF RIGHT** — largest and the only one beating placebo, but 2/3 seasons, so it does not clear |
| **P76** | pooled-across-positions is weaker than RB alone | **TRUE**, and trivially so — the other three are ≤ 0 |
| **P75** | the effect is under +0.05 ΔMAE, so clearing would not make it shippable | **TRUE** — +0.0147, which is **4.7% of the replay's ±0.310 detection floor** |

**P75 is the one worth keeping.** It was filed specifically so that a *passing*
result could not be oversold, and it bounds the 10-27 live grade in advance.

**And a new prediction is filed now, before the season starts, so it cannot be
written afterwards: P77 — the 10-27 live grade will not clear either, on the
same 3-of-3 requirement.**

## 4. WHAT THIS MEANS FOR ROW 3

**The live 10-27 grade still runs** — the row asks for it, the season provides
new data, and a null on three backtested seasons is a reason to expect a null,
not a reason to skip the measurement. **Rule 3c: nothing is stopped.**

**What changes is the expectation, and it is on record.** If the live grade
clears where the backtest did not, that is a surprise requiring explanation
rather than a success to announce.

**Two things the 10-27 grade must add that this cannot:**

1. **Start/sit accuracy.** This is MAE only. `PROJECTION-PROGRAM-2027.md`'s bar
   is start/sit, which needs a lineup simulation this harness does not have.
   **Named as a gap in the prereg rather than quietly dropped**, and it is
   possible for an arm to be MAE-null and start/sit-positive: a tilt that never
   changes a lineup decision cannot help, but one that flips a marginal
   start/sit call can, without moving MAE much.
2. **RB specifically.** It is the only position with a live signal, and 2/3 is
   the kind of result a fourth season resolves.

## 5. WHAT THIS DOES NOT COVER

- **Points allowed is a crude rating** — no adjustment for the *defence's* own
  schedule, no snap-weighting, no home/away. A better rating is a later arm and
  this is not evidence against one.
- **No K/DEF** — absent from these stores and from `own_weekly_v1`'s formula.
- **MAE only**, per §4.
- **Nothing wires**, which the prereg said regardless of outcome.
- **The opponent map comes from the Vegas store's regular-season game lines**,
  which sidesteps the BDL playoff-numbering trap `opponent_strength.py`
  documents. 100% join on all three seasons, verified before the study was
  written.

## 6. TRIGGERS

- **Re-test RB with a fourth season** when 2026 completes — 2 of 3 is the
  shape a fourth fold resolves, and RB is the only position that has earned one.
- **Re-test on start/sit**, at the 10-27 live grade, where the metric that
  actually decides the program's bar can be computed.
- **Re-test with an opponent-adjusted rating** — the crude rating is the most
  likely reason a real effect would be attenuated here.

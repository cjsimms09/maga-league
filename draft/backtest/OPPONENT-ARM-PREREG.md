# PREREG — the opponent arm (P57), in-season, all four positions

_TERRITORY: D. In-season row 3. Written 2026-08-18, **committed before
`opponent_arm.py` exists.**_

## WHAT IS ALREADY SETTLED, AND WHAT IS NOT

`draft/backtest/opponent_strength.py` (relay) measured **feasibility** and its
verdict is **IN-SEASON ONLY**:

| position | draft-day median | in-season median |
|---|---|---|
| QB | +0.063 (3/4) | **+0.320 (5/5)** |
| RB | **+0.329 (4/4)** | +0.276 (4/5) |
| WR | +0.095 (3/4) | +0.174 (3/5) |
| TE | −0.006 (2/4) | +0.258 (4/5) |

**The pooled median hides RB** — it is the one position that also persists year
over year. That is read here and not re-derived.

**What is NOT settled is whether an ARM built on this improves a projection.**
A rating that *describes* the second half is not the same claim as a multiplier
that *reduces error*. This preregisters that arm.

## THE ARM

For season Y, week W: rate each defence on the points it allowed **to that
position**, over **weeks 1..W−1 of season Y only** — never last season's
rating, which is exactly what the draft-day column says does not carry.

    m[team, pos] = allowed_per_game[team, pos] / league_mean_allowed[pos]
    proj = baseline × (1 + λ · (m − 1))

**The multiplier is mean-normalised by construction**, which puts this arm in
the SAFE class register DS3 identified — six of eight multiplicative MAE arms
are safe for exactly this reason, and the two that were not are the two that
skipped it. **The placebo still runs (below); "safe by construction" is a
prediction, not a result.**

`baseline` is the strictly-prior running mean, identical to every other arm in
this lane, so results compare like with like.

## POPULATION

Seasons **2023, 2024, 2025**. Weeks **5–17** (weeks 1–4 cannot support a rating
from 1..W−1 with enough games; this matches `exp_weekly_env`'s eligibility
floor, inherited rather than chosen). **Minimum 3 prior games per defence**, or
that team-week is **EXCLUDED and counted** — absent stays absent, never m = 1.

Eligibility otherwise unchanged: ≥3 prior appearances, prior mean ≥ 5.0.

**Each position is fitted and judged SEPARATELY.** Pooling is what the relay's
own doc warns against.

## LEAK PROTOCOL

Within-season only, and strictly backward: the rating for week W uses weeks
1..W−1 of the same season. **λ is fitted leave-one-season-out** — fitted on the
other two seasons, evaluated on the held-out one. Only held-out numbers are
quotable. In-sample values are emitted labelled and no verdict may read them.

## GRID

λ ∈ **{0.00, 0.15, 0.25, 0.35, 0.50, 0.65, 0.80, 1.00}**. λ=0 is the baseline
by construction and is the arithmetic self-check.

## THE PLACEBO — mandatory, and it is now this lane's standard

Permute the team → rating assignment **within each week**: same distribution,
same shrink opportunity, zero information about which defence. **60 draws, each
running the full leave-one-season-out fit.**

Register DS2 is why: a preregistered, out-of-sample, 5-of-5-positive bar passed
an arm with no information in it, and the placebo killed it. **A result that
cannot beat a coin-flip reassignment of its own numbers is not a result.**

## THE BAR — magnitudes, declared before any number exists

`clears: true` for a position requires **all three**:

| | |
|---|---|
| pooled out-of-sample ΔMAE | **≥ +0.010** |
| seasons positive | **3 of 3** |
| placebo p | **< 0.05** |

**Four positions is the multiplicity and it is disclosed here**, not in the
write-up. A position clearing alone is reported as one of four tests.

## PREDICTIONS, RECORDED NOW SO THEY CAN BE GRADED

1. **RB clears and is the largest effect.** It is the position with the
   strongest feasibility signal on both bars, and game-script dependence is
   most plausible there.
2. **The pooled-across-positions result is weaker than RB alone** — that is the
   relay's warning restated as a prediction.
3. **The effect is small in absolute terms** — under +0.05 ΔMAE, i.e. well
   below the replay's ±0.310 detection floor (register DS1). **Clearing this
   bar would not make it shippable to the board**, and I am saying so before
   the number exists.

## WHAT THIS WILL NOT COVER

- **No 2026 live grade.** The season has not started; this backtests the arm on
  committed seasons. **The live grade is 10-27, after week 7**, as the row
  states.
- **No start/sit metric here.** MAE only. Start/sit needs a lineup simulation
  that does not exist in this harness; it is the 10-27 grade's job and is named
  as a gap rather than quietly dropped.
- **Points allowed is a crude rating.** No opponent-adjustment of the defence's
  own schedule, no snap-weighting. A better rating is a later arm.
- **No K/DEF.** Absent from these stores and from `own_weekly_v1`'s formula.
- **Nothing wires.** A wiring decision is A's, and prediction 3 says it should
  be "no" regardless.

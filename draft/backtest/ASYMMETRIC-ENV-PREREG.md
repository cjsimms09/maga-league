# PREREG — the asymmetric environment arm, on a FORECASTABLE signal

_TERRITORY: D. Register 18b's design instruction. Written 2026-08-18,
**committed before `asymmetric_env_arm.py` exists.**_

**Cory ruled this built NOW rather than after 08-22** (2026-08-18, answering
D's Q-B directly and overriding D's "after" recommendation). Nothing here
touches the board; the no-change-before-08-22 rule is untouched.

## THE HYPOTHESIS, AND WHERE IT CAME FROM

Register 18b measured, on a perfect game-total oracle:

| side | best λ | ΔMAE | % of that side's baseline |
|---|---|---|---|
| dud game (m ≤ 1) | **0.80** | +0.5462 / +0.3293 | **10.2% / 6.4%** |
| shootout (m > 1) | 0.25 / 0.50 | +0.0627 / +0.1295 | 1.0% / 2.0% |

**A single λ is a compromise between two regimes.** The mechanism: a shootout
concentrates in one or two players, so scaling a whole roster up over-credits
it; a dud suppresses everyone roughly uniformly, which is what a multiplier
models.

**H: a two-sided λ beats the best single λ on a FORECASTABLE environment
signal, out of sample.**

**This is the shippable version of 18b.** The oracle reads the realised total
and can never ship; a betting line is a forecast of it and is what the
`vegas_lines_*` store holds.

## MY PRIOR, STATED BEFORE THE RUN

**I expect a null.** Register 18's symmetric team arm bought +0.002 / +0.008
ΔMAE — a line is a far weaker signal than the realised total, and a form
improvement on a signal that carries almost nothing should stay almost nothing.
**Recorded so a null cannot later be presented as a surprise, and a positive
cannot be presented as expected.**

## SIGNALS — both forecastable, both already committed

| arm | m for a player's team, week w |
|---|---|
| `game_total` | that game's `total_line` ÷ league mean `total_line` that week — both teams share it, the direct analogue of the oracle's construction |
| `team_implied` | (`total_line`/2 + `spread_line`/2) ÷ league mean implied that week — register 18's arm |
| `oracle_total` | **CONTROL ONLY**, realised points, 2023-24 only — see the gate |

Form: **proj = baseline × (1 + λ(m − 1))**, with **λ = λ_low when m ≤ 1,
λ_high when m > 1**. The symmetric baseline is the same code with
λ_low = λ_high.

## POPULATION

`exp_weekly_env`'s declared eligibility, unchanged: weeks 5–18, ≥3 prior
appearances, prior running mean ≥ 5.0, appeared that week. Baseline = the
strictly-prior running mean.

**Seasons: 2021–2025.** Primary set **2023-25**; **2021-22 are SECONDARY** and
reported separately. The scoring-fingerprint split between them is a
float32 artifact (register 27b, max distortion <5×10⁻⁶ points), so the tables
match — but those two seasons are `rebuilt_offline: true` and **that rebuild
has not been verified against a live capture**, which is a different claim. A
verdict that depends on which set is used is itself a finding and will be
reported as one.

**ABSENT STAYS ABSENT.** A player-week with no team or no line is **excluded**
and counted, never given m = 1.0. Join survival is recorded per season; below
**0.90** the season is marked invalid and dropped from the verdict.

## GRID

λ_low, λ_high each ∈ **{0.00, 0.15, 0.25, 0.35, 0.50, 0.65, 0.80, 1.00}** —
64 combinations. Symmetric baseline: the 8 diagonal cells.

## THE LEAK PROTOCOL — leave-one-season-out, and it is the whole design

**A 64-cell grid on 5 seasons will find an asymmetry whether or not one
exists.** So nothing in-sample is quotable:

> For each season s: fit (λ_low, λ_high) on **all seasons except s**, then
> evaluate that fitted pair on s. **Only the held-out ΔMAE is reported.** The
> symmetric baseline is fitted and evaluated by the identical protocol, so the
> comparison is like for like.

In-sample numbers are emitted for inspection and are labelled
`in_sample: true`. **No verdict may read them.**

## THE GATE — a known-positive control, declared as VOIDING

**Run the identical asymmetric machinery on the `oracle_total` signal
(2023-24).** It must:

1. fit **λ_low > λ_high**, and
2. beat its own symmetric baseline out of sample.

**If the control fails, the run is VOID** and I report the harness failure
instead of a verdict. A null from a harness that cannot detect asymmetry where
18b already measured a large one says nothing about Vegas lines.

## THE BAR — with a magnitude this time

**Register 18's arm set a bar of "ΔMAE > 0" with no magnitude and duly reported
`clears: true` on two thousandths of a point. That was a badly designed bar and
this one is not.**

`clears: true` requires **both**:

| | |
|---|---|
| pooled out-of-sample ΔMAE(asymmetric) − ΔMAE(best symmetric) | **≥ +0.010** |
| seasons where that difference is positive | **≥ 4 of 5** valid seasons |

Judged on the primary set (2023-25) with all five reported. Each arm
(`game_total`, `team_implied`) is judged separately; **both are declared now,
so neither can be selected after the fact.** Two arms is the multiplicity and
it is disclosed here rather than in the write-up.

## WHAT CLEARING WOULD AND WOULD NOT LICENSE

**It would not license wiring anything.** Declared before the number exists so
it cannot read as a retreat from a disappointing result:

> A **perfect** game-total oracle scores ΔMAE +0.2379, which is **77% of the
> replay's ±0.310 minimum detectable effect** (register 31). Every arm here is
> bounded above by that. **Nothing measured in this study can be graded by the
> instrument this project uses to decide whether something is an edge.**

What clearing WOULD establish is narrower and still worth having: **that the
asymmetric form is the right shape for environment features**, which is a
design fact that transfers to any future signal, including ones we do not have
yet.

## WHAT THIS DOES NOT COVER

- **One functional form.** Two-sided λ only; no per-position, no per-role, no
  interaction with the player's own volatility.
- **Season-vintage lines.** The store's lines are as recorded; no closing-line
  vs opening-line distinction is available.
- **QB/RB/WR/TE only**, per the inherited eligibility. No K, no DEF.
- **Not a claim about pace or `env_points`** — A's arms, not re-graded here.

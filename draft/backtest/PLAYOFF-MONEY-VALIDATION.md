# THE COMPLETE MONEY FUNCTION — every verdict re-run with playoff $ included

_Filed 2026-08-08. Companion to `HETEROGENEOUS-VALIDATION.md`: same pattern, a
harness increment landing and every landed verdict re-measured against it._

## What changed

Playoff money is **$2,125 of the $4,000 pot — 53%**. Until this increment the
Lab graded weekly-high + regular-season only. Every verdict on record was
therefore measured on the smaller 47% of the money, and, worse, *reaching the
bracket was priced at zero* when it is the largest payday available.

Two pieces landed:

1. **`money_grade.simulate_bracket` + `certify_bracket_resim`** — the real
   bracket, resimulated. The format was **derived from the harvested brackets,
   not assumed**: four teams by regular-season rank, seeds 1v4 and 2v3, then a
   final (`p:1`) and a third-place game (`p:3`), round *r* played in week
   `playoff_week_start + (r-1)`. All **12 games across 2023/24/25 reproduce
   exactly**. The certification runs inside `lab.certify_grader`, so no
   experiment grades on an uncertified bracket — the same rule the money tables
   already lived under.

2. **`cory_conditional.postseason_dollars`** — one shared RS-prize + bracket
   step, called by `grade_room` and by the stack sweep's `grade_room_corr`.

   A caught mistake worth recording: the stack sweep had its *own* grading loop,
   so the first pass at this left exp 6 on the old currency while every other
   number moved — and the before/after table below briefly reported it as if it
   had been re-run. Two graders, one table, no way to tell. That is precisely
   why the postseason is now a single shared function rather than a rule each
   experiment reimplements.

`grade_substituted` also pays playoffs now, with three outcomes and no blending:
missed the bracket → `$0` exact; made it and the replay covers the playoff weeks
→ real dollars; made it but the replay stops at week 15 → **withheld with a
note**. Grading a strategy's regular season against the incumbent roster's
playoff scores would be a number about nothing.

**Strongest available check:** replaying a seat with the scores it actually
posted reproduces its real grade to the dollar, playoff money included, for
every roster in every season.

## Verdict-by-verdict: before → after

| finding | weekly-high + RS only | **complete money function** | survives? |
|---|---|---|---|
| **19b WR Feast** (enrolled) | +$91.50 [74, 109] | **+$187.25 [150, 224]** | YES — doubles |
| 19b Early-QB Strike | +$67.62 [50, 87] | **+$200.62 [157, 248]** | YES — triples, now nominally ahead |
| 19b Late-QB | −$60.62 | **−$211.50 [−257, −169]** | YES — burns 3.5× harder |
| 19b zero/hero/robust-RB, elite-TE | $0 (never bind) | $0 (never bind) | unchanged |
| **21 frontier flat λ=0.5** | +$70.67 | **+$171.00 [109, 234]** | YES — grows |
| **21 H1 early-weighted ceiling** | −$37.29 REFUTED | **+$226.50 [168, 288] SUPPORTED** | **NO — REVERSES** |
| 21 flat λ=2.0 / λ=3.0 | −$26.33 (λ=3) | −$88.83 / −$116.50 | YES — over-dosing still burns |
| **6 stack peak 0.5×** | +$80.42 [56, 106] LEAN | **+$204.58 [142, 269]** | YES — still a LEAN, still not installed |
| **2 §6 conditional rules** | zero clearing (null p95 $65.83) | zero clearing (null p95 **$157.23**) | YES — the null scales with the money |

## The two things that actually moved

### 1. The enrollment did NOT flip, and the gate is why

On the complete money function Early-QB Strike posts a **larger mean** than WR
Feast (+$200.62 vs +$187.25). The old rule — "enroll whoever has the highest
mean among those clearing the control" — would have flipped the plan.

It should not have, and now it cannot. The rooms are paired, so the leader-minus-
runner-up difference is a legitimate paired delta with its own bootstrap CI:

> **early_qb − wr_anchor = +$13.38, CI [−$53.75, +$78.00] — NOT SEPARABLE.**

The two are indistinguishable. A **head-to-head gate** now sits after the control
gate: the leader is enrolled only if it beats the runner-up by more than the
even-money band with a CI clear of $0. Otherwise they are **co-leaders and the
incumbent is retained** — the same hysteresis principle as the doctrine banner,
for the same reason. A plan that changes on a difference the data cannot resolve
is not a plan.

**WR Feast stands.** Not because it won, but because nothing beat it.

The gate is not a ratchet: a leader that *does* separate still takes the plan
from an incumbent, and there is a test for that.

### 2. The phase-shape finding REVERSES — this one needs Cory

H1 (weight the ceiling term toward EARLY picks) was **refuted at −$37.29** on
weekly-high + RS. On the complete money function it is the **best candidate in
the whole frontier sweep at +$226.50, CI [168, 288]**, and `policy_tournament`
independently reports `H1 beats all rivals: False` only because its rivals are
all negative there — h1_phase is the least-bad of that set.

The mechanism is not mysterious: **the playoffs are a two-week single-elimination
tournament.** You need to win one game, not accumulate over sixteen. Variance is
worth far more there than in the regular season, and excluding 53% of the pot —
the half that pays for exactly that — systematically underpriced ceiling.

**This bears directly on D9**, installed at the conservative end (`ceiling 0.65`,
endgame narrowed to `0.5`, core tilts unchanged) on the *incomplete* money
function. **Nothing has been changed.** D9 stands as installed until Cory rules,
and it is filed as a decision, not applied — reversing a refutation is exactly
the situation where a fitted parameter is most tempting and least earned.

## Standing limitations added

- **Bracket seeding in the simulated rooms is by season TOTAL POINTS**, because
  those rooms have no schedule and therefore no win-loss record. The real league
  seeds by wins, tie-broken on points. Points-seeding is strictly *less* noisy
  than the real rule, so it understates how often a mid-table team backs into the
  bracket — and therefore probably **understates** the playoff variance premium
  rather than inventing it.
- `sim_validation` still reports `runs_per_draft` as a statistic the room cannot
  reproduce; the re-fit cascade moved to 2.0 on this run.
- Money proxy remains v1 (normal weekly draws from `proj_mean`/`weekly_sd`). The
  September quantile model re-run is pre-registered and unchanged by any of this.

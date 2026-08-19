# THE OPPORTUNITY ADJUSTER IS THE BOARD'S ONLY EDIT TO SLEEPER, AND IT IS ZERO-INFORMATION

> # ⚠️ RETRACTED IN ITS HEADLINE CLAIM, SAME DAY. READ THIS FIRST.
>
> **This document's framing — "nobody saw it" — is FALSE, and I routed it to A
> as a red open row four days before the draft.**
>
> `draft/audit/opportunity_adjustment_2026-08-16.md` graded exactly this on
> **08-16**: NEUTRAL on ordering in **17 of 18** cells, WORSE on level in **18
> of 18** with every CI clear, and **a shuffled control performing identically
> — so it was carrying scale, not player information.** Cory ruled on it
> **08-17** (*"Remove 1"*) and `league_config.json` has shipped
> `opportunity_cap: 0.0` ever since. Its `_opportunity_cap_why` note records all
> of it, including that **CENTRING the layer — the "obvious next arm" §7 below
> proposes — had already been measured and moved QB1 by one rank.**
>
> **What survives:** the 27-cell numbers are correct and independently
> corroborate that grade **from a second artifact**. That is worth something as
> replication. It is not a discovery, and §§1–4 should be read as corroboration
> throughout. **§5's inventory and §6's placebo on my own 18b claim are
> unaffected**, and §9's freeze finding is new (register DS4).
>
> **Cause:** I read the artifact and not its audit doc, and
> `draft/tools/prior_art.py --grep` — which exists on `main` and finds this in
> one command — was not in this branch and I did not check for one. **That is
> the failure this lane exists to catch, committed by this lane.** Standing
> change to my process: prior_art before filing. Register DS5.


_TERRITORY: D. Register DS3's inventory (placebo exposure), and it answers
**Q1** — D's own open question, *"does the opportunity adjuster help at all?"_
Written 2026-08-18. **Nothing was recomputed. Every number below was already in
`opportunity_adj_grade.json`.**

## THE FINDING

**Register 21 established that `proj_mean` is Sleeper × the opportunity
adjuster — `proj_baseline == proj_sleeper` for 422 of 422 players. The adjuster
is the entire difference between the board and a free public projection.**

Across **27 graded cells** (3 seasons × 3 baselines × 3 positions):

| | |
|---|---|
| cells where the adjuster makes **MAE worse** | **27 of 27** |
| mean **bias it ADDS** to an already-high baseline | **+9.10 points** |
| its MAE gap vs a **zero-information rank surrogate** | **−0.54** on a ~40-point MAE |
| cells where its ordering beats a **shuffle of itself** at p<.05 | **1 of 27** (p=.035 — what 27 tests produce by chance) |
| median shuffled p on ordering | **0.265** |

**It carries no ordering information distinguishable from a random permutation
of its own values, and it degrades magnitude systematically.**

## 1. THE TABLE

| yr | baseline | pos | n | base MAE | adj MAE | surrogate MAE | base bias | adj bias | shuffled p |
|---|---|---|---|---|---|---|---|---|---|
| 2023 | naive_prev | RB | 115 | 47.30 | 51.54 | 51.50 | +10.58 | **+17.27** | 0.505 |
| 2023 | naive_prev | WR | 151 | 33.64 | 35.73 | 36.09 | +10.04 | +16.60 | 0.185 |
| 2023 | naive_prev | TE | 83 | 24.34 | 25.76 | 26.25 | +4.80 | +8.63 | 0.155 |
| 2023 | recency_blend | RB | 120 | 47.14 | 51.31 | 51.49 | +6.46 | +12.57 | 0.400 |
| 2023 | market_curve | RB | 48 | 62.80 | 70.07 | 70.03 | +28.62 | **+42.80** | 0.880 |
| 2024 | naive_prev | RB | 101 | 44.60 | 46.56 | 46.61 | −0.13 | +7.02 | 0.555 |
| 2024 | market_curve | WR | 54 | 49.87 | 60.14 | 61.64 | +21.91 | **+38.44** | 0.570 |
| 2025 | market_curve | WR | 52 | 52.62 | 61.26 | 62.42 | +29.55 | **+46.50** | 0.455 |
| … | | | | | | | | | |

*(All 27 rows are in the artifact; the nine above are the pattern. **No row
reverses it** — `adj MAE > base MAE` in every one.)*

## 2. THE SURROGATE IS THE PART THAT SETTLES IT

`opportunity_adj_grade.py` already computes a **rank surrogate**: the same
multiset of adjustment values, reassigned **purely in descending baseline
order** — so it carries the adjustment's *distribution* and **none of its
player-specific information**.

> **2023 naive_prev RB: adjuster MAE 51.543, surrogate MAE 51.498. A gap of
> 0.045 points on a 51-point error.**

Pooled over 27 cells the adjuster beats its own zero-information surrogate by a
mean of **0.54 MAE points**. **Whatever the adjuster knows about individual
players is worth about half a point of season MAE, against the ~9 points of
bias it costs to apply.**

## 3. THE MECHANISM IS IN THE `bias` COLUMN

Baseline bias is **positive in 23 of 27 cells** — the running-mean and
market-curve baselines already over-predict. **The adjuster then adds +9.10
more.** It is a net-inflation rule applied to an over-predicting baseline, and
the MAE damage is very nearly all of it.

**This is the mirror image of register DS2's finding**, and worth stating
together because they are one mechanism seen from two sides:

| | direction | effect on MAE |
|---|---|---|
| register DS2 (`game_total` arm) | a fitted rule that **shrinks** a subset | **free improvement**, ~+0.046, no information needed |
| this (the opportunity adjuster) | a shipped rule that **inflates** | **systematic harm**, +9.1 bias, no information present |

**A biased-high baseline pays you for shrinking and charges you for inflating,
regardless of what the rule knows.** Any adjustment graded on MAE against such
a baseline is measuring that before it measures anything else.

## 4. WHAT WAS ALREADY THERE, AND WHY NOBODY SAW IT

`grade_cell` runs its permutation test **only for Spearman**
(`d = spearman(sp, act) - spearman(base, act)`). It computes MAE, and
`bootstrap_delta` even accepts `key == "mae"` — **but the only verdict the
artifact emits is `verdict_ordering`.** Every cell reads `NEUTRAL`, and a reader
stopping at the verdict sees a harmless adjuster.

**The MAE half has no verdict at all**, so nine pooled cells of
CI-excludes-zero degradation sat in a committed file unread. **The permutation
machinery to grade it was two lines away, in the same function, being used for
the other metric.**

That is this repo's most-repeated failure, in its most expensive location: not
a missing measurement, **a measurement taken and never given a verdict.**

## 5. REGISTER 33'S INVENTORY — every multiplicative MAE arm, classified

The question that opened this: how many graded arms are exposed to register
32's free-shrink artifact? **Classified by whether the multiplier can move the
prediction's mean**, which is the actual criterion.

| arm | multiplier | exposed? | status |
|---|---|---|---|
| `pace_arm` | `1 + k(mean − x)/mean` — **mean-centred** | ❌ no | safe by construction |
| `advanced_efficiency_study` | `1 + ADV_W·z`, **z is mean-zero**, weight fixed before data | ❌ no | safe by construction |
| `exp_weekly_env` | m normalised to the weekly mean, single λ | ❌ no | safe by construction |
| `vegas_team_arm` | same, λ swept symmetrically | ❌ no | safe |
| `oracle_lambda_sweep` (main curve) | same | ❌ no | safe |
| `oracle_lambda_sweep` (§3 asymmetry) | per-side λ | ✅ **yes** | **placebo run today — SURVIVES**, §6 |
| `asymmetric_env_arm` | per-side λ | ✅ yes | placebo run; one arm killed (register DS2) |
| **`opportunity_adj_grade`** | `1 + adj`, **adj not mean-centred** | ✅ **yes, inverted** | **this document** |

**Six of eight are safe by construction and the reason is the same in each: the
multiplier is normalised or centred, so it cannot move the mean.** That is the
design rule worth extracting — **centre the multiplier and the artifact
disappears.** Register DS2's arm and the adjuster both skip it.

## 6. AND THE SAME CONTROL, RUN ON MY OWN CLAIM FROM YESTERDAY

Register 18b's headline — *"a dud game is worth 5–10× a shootout"* — is measured
on exactly the shape register DS2 just exposed, so it was re-tested first, before
anyone else's work.

| season | side | real | placebo mean | p | **net** |
|---|---|---|---|---|---|
| 2023 | dud (m≤1) | +0.5462 | +0.0948 | **0.024** | **+0.4514** |
| 2023 | shootout (m>1) | +0.0627 | **+0.0000** | 0.024 | +0.0627 |
| 2024 | dud (m≤1) | +0.3293 | +0.0327 | **0.024** | **+0.2967** |
| 2024 | shootout (m>1) | +0.1295 | **+0.0000** | 0.024 | +0.1295 |

**It survives — every side beats every one of 40 placebo draws.** But the ratio
must be corrected: **8.7× / 2.5× raw becomes 7.2× / 2.3× net.** The claim is
"**2.3–7.2×**", not "5–10×". The direction and the mechanism stand; the top of
my stated range was inflated by the artifact, and 18b is amended.

**The placebo is exactly 0.0000 on the shootout side, in both seasons.** A
shuffled multiplier buys literally nothing when it points up, and buys +0.09
when it points down. **That is register DS3's premise proved outright: the free
lunch exists only in the shrink direction.**

## 7. WHAT THIS DOES AND DOES NOT SAY

- **It does not say remove the adjuster before 08-22.** Nothing changes on the
  board this week; that is A's and Cory's call and the no-change rule holds.
- **Ordering is NEUTRAL, not harmed** — so the *pick order* Cory drafts from is
  largely unaffected either way. **Magnitude is where the harm is**, which
  reaches anything reading points, VORP or dollars. **A should determine the
  live-board impact**; this study grades reconstructed baselines.
- **The `_note` limit is binding and is the artifact's own:** this grades the
  shipped adjustment applied to **RECONSTRUCTED** baselines, because
  `proj_baseline` was never archived before 2026-08-09. **No number here grades
  the shipped baseline step.** Three different baselines all give the same
  answer, which is the strongest thing available short of the real one.
- **Not a claim that the opportunity CONCEPT is dead.** It is a claim about this
  construction: uncentred, applied multiplicatively, on top of a biased-high
  baseline. **Centre it and the +9.1 bias goes away by construction** — that is
  the obvious next arm and it needs no new data.

## 9. WHAT IS ACTUALLY NEW HERE — the freeze carries a reverted policy

Measured on committed artifacts, and this one has no prior art:

| | `opportunity_adj` nonzero | `proj_mean != proj_baseline` |
|---|---|---|
| **live board**, built 08-17T16:35Z | **0 of 693** (all exactly `-0.0`) | 0 |
| **`pre_draft_freeze_2026.json`**, 08-14 | **375 of 682** | **374 rows** |

`-0.0` across the board is the arithmetic fingerprint of `cap = 0.0`, and
`opportunity_z` is still nonzero for 377 players — **so the ruling is verifiably
in force on the board Cory drafts from.**

**The freeze is not.** Gibbs 299.9 → 344.9, Bijan 292.9 → 336.8, Nacua 259.0 →
297.9. **It is not merely stale in the way `test_freeze_not_stale.py` already
flags (14 missing fields) — it encodes a projection policy Cory has since
reversed**, and the grade behind that reversal measured the layer as worse on
level in 18 of 18 cells. Anything reading the freeze reads the pre-ruling board.

**Register DS4, routed to A.** The ask is narrow: confirm nothing Cory sees on
draft night reads the freeze. If nothing does, it closes as a documentation
note; if anything does, it is draft-critical with four days left.

## 8. TRIGGERS

- **Re-grade with a centred adjuster** (`adj − mean(adj)`), which removes the
  inflation mechanically. If the residual still tracks the surrogate, the
  adjuster carries nothing and that is the end of it.
- **Give the MAE half a verdict**, in `opportunity_adj_grade.py`, using the
  permutation already in `grade_cell`.
- **Re-test when a real archived `proj_baseline` exists** (post 2026-08-09
  captures), which retires the `_note` limit.

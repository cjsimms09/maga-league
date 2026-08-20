# THE ASYMMETRIC ENVIRONMENT ARM — one real signal, one null, and the bar that passed both

_TERRITORY: D. Register 18b's design instruction, 18's store. Preregistered in
`ASYMMETRIC-ENV-PREREG.md`, committed first (`f7010f1`). Result:
`asymmetric_env_arm.json`. Built now rather than after 08-22 because **Cory
ruled it** on 2026-08-18, overriding D's recommendation._

## THE RESULT IN ONE TABLE

| arm | prereg bar | placebo p | net of placebo | verdict |
|---|---|---|---|---|
| `game_total` | **clears: true** (+0.0491, 5/5) | **0.377** | **+0.0034** | ❌ **NULL** |
| `team_implied` | **clears: true** (+0.0832, 5/5) | **0.0164** | **+0.0343** | ✅ **real, and 59% smaller than the headline** |

**The preregistered bar passed both arms. A control the prereg did not require
killed one of them and cut the other by more than half.** That is the finding
with the longest reach, and §3 is about it.

## 1. WHAT WAS RUN

Register 18b measured, on a perfect oracle, that a **dud** game is worth
2.3–7.2× (**corrected 08-18 net of a 40-draw placebo; raw was 5–10×** — register DS3) a **shootout** and wants twice the damping. This tests the same two-sided form
on a signal that could actually ship — the committed Vegas lines, 2021-25.

`proj = baseline × (1 + λ(m − 1))`, with **λ_low when m ≤ 1, λ_high when m > 1**.

**Leave-one-season-out throughout.** A 64-cell grid on 5 seasons will find an
asymmetry whether or not one exists, so the pair is fitted on the other seasons
and only the held-out ΔMAE is reported. The symmetric baseline runs the
identical protocol. Join survival ≥0.99 on every season; absent stays absent.

**The gate passed.** The identical machinery on the oracle signal fits
λ_low > λ_high in both seasons (0.8/0.5, 0.8/0.25) and beats symmetric out of
sample. A harness that could not find 18b's asymmetry could not have found this
one.

## 2. THE TWO ARMS

| season | `game_total` gain | `team_implied` gain |
|---|---|---|
| 2021 | +0.0436 | +0.1216 |
| 2022 | +0.0565 | +0.0840 |
| 2023 | +0.0746 | +0.0838 |
| 2024 | +0.0187 | +0.0325 |
| 2025 | +0.0522 | +0.0940 |
| **pooled** | **+0.0491** | **+0.0832** |

Both 5 of 5 positive, both fitting λ_low = 1.00 / λ_high = 0.00 in every fold —
which is not "asymmetric" so much as **one-sided: use the signal when it points
down, ignore it when it points up.**

## 3. THE PLACEBO, AND WHY IT WAS NEEDED

**The prereg carried a known-positive gate and NO negative control. That was the
design error, and it would have shipped a false positive.**

The first run came back large and positive **against my own stated prior of
"null"**, with λ pinned to the grid corner in every fold and the symmetric
baseline at exactly 0.0000. Rule 3d says an implausible result is a bug report
until proven otherwise, and the mechanism was available without any data:

> **the baseline is a running mean of a right-skewed quantity, so it is biased
> HIGH — and ANY rule that shrinks a subset of rows improves MAE.** λ_high = 0
> is what a pure shrink rule looks like, not what an environment signal looks
> like.

So: **permute the team → m assignment within each week.** Same multiplier
distribution, same shrink opportunity, zero information about which team gets
which. 60 draws, each running the full LOO fit — a placebo that skipped the
fitting would be easier to beat than the real arm and would prove nothing.

| arm | real | placebo mean | placebo sd | placebo p95 | p | net |
|---|---|---|---|---|---|---|
| `game_total` | +0.0491 | **+0.0457** | 0.0075 | +0.0572 | **0.377** | **+0.0034** |
| `team_implied` | +0.0832 | **+0.0489** | 0.0088 | +0.0644 | **0.0164** | **+0.0343** |

**`game_total` is entirely bias correction.** It does not beat a coin-flip
reassignment of its own numbers.

**`team_implied` survives** — but roughly **three fifths of its headline was the
same shrink effect**, and its honest effect is **+0.0343**, not +0.0832.

### The grid corner says the same thing again, independently

λ_low = 1.00 sat at the grid maximum in every fold, which is the edge-of-grid
defect register 18b was opened for. Extending the grid to 2.00 (in-sample, for
diagnosis only):

| arm | extended argmax | does the corner bind? |
|---|---|---|
| `game_total` | λ_low = **1.50** | **yes** |
| `team_implied` | λ_low = **1.00** | **no** |

**A pure shrink rule always wants to shrink harder; a real signal has an
optimum.** `game_total` wants more; `team_implied` is already at its interior
best. Two independent diagnostics, same split.

### And it reproduces register 18's finding by a completely different route

`vegas_oracle_row18_2026-08-17.md` found the game-total oracle *"cannot separate
a 45-point offence from the 3-point one it played"* — one number handed to both
teams. **Here, with no oracle and no shared multiplier by construction, the
game-total arm's information content measures to zero and the team-level arm's
does not.** Same conclusion, different method, three months of data apart.

## 4. MY OWN BAR WAS BROKEN BY CONSTRUCTION

The prereg says judge on the primary set (2023-25) and requires **"≥ 4 of 5
valid seasons positive"**. **A three-season set cannot produce four positive
seasons.** The primary verdict therefore reads `clears: false` at pooled
+0.0712 with 3 of 3 positive — a bar that could not be met however the data
came out.

**That is the check-that-cannot-fire defect, in my own prereg, written the same
day I audited the repo for it.** It is inverted here (cannot pass rather than
cannot fail) but it is the same error. The five-season set is what the verdict
is read on, and it is the set where the bar is meetable.

## 5. WHAT THIS IS WORTH — the calibration, not the excitement

**+0.0343 ΔMAE per player-week is real and small.**

| against | |
|---|---|
| register 18's symmetric team arm (+0.008) | **4.3× larger** |
| a PERFECT game-total oracle (+0.2379, register 18b) | **14% of it** |
| the replay's minimum detectable effect (±0.310, register DS1) | **11% of it** |
| `own_v6`'s own weekly MAE (5.70) | **0.6%** |

**Nothing here ships, and the prereg said so before the number existed.** The
effect is a ninth of what our edge instrument can resolve. What it establishes
is narrower and durable: **the two-sided form is the right shape for
environment features, and the team-level line carries information the game
total does not.** That transfers to any future signal, including ones we do not
have yet.

## 6. RULE 3d ON MY OWN POSITIVE

The lane's standard applies hardest when the result is one I would like.

| | answer |
|---|---|
| **Did the input vary?** | Yes. Implied totals span roughly 0.6–1.5× the weekly mean; both sides of m = 1 hold 40–60% of rows in every season. |
| **Did it arrive?** | Yes, counted per season: **join survival ≥ 0.99** on all five, recorded in `population`. Absent stays absent — no row was given m = 1.0. |
| **Could it have failed?** | **Yes, and one arm did.** `game_total` ran the identical code and came back p = 0.377. A harness that produces a null on one arm and a positive on the other is not a machine that only makes positives. |
| **Could it have fired on noise?** | **This is the question the prereg forgot, and it is the one that mattered.** The placebo answers it: 60 draws, p = 0.0164. |

## 7. DEVIATIONS

1. **The placebo was added after the first run.** It is not in the prereg. A
   deviation in the direction of more checking, and it **cost** the study its
   headline rather than rescuing it — `game_total` went from `clears: true` to
   null and `team_implied` lost 59% of its effect. Recorded so the direction is
   visible: this control was not chosen because it flattered the result.
2. **The extended grid (§3) is in-sample and diagnostic only.** No verdict reads
   it.
3. **The primary-set bar is unmeetable** (§4). The verdict is read on the
   five-season set. Declared rather than quietly re-scoped.

## 8. WHAT THIS DOES NOT COVER

- **One functional form.** Two-sided λ only — no per-position, no per-role, no
  interaction with a player's own volatility.
- **2021-22 are `rebuilt_offline: true`** and that rebuild has not been verified
  against a live capture (register 27b). The verdict holds on 2023-25 alone at
  +0.0712 pooled, 3 of 3 positive, so it does not depend on them — but the
  five-season *bar* does, and that is stated rather than buried.
- **Lines as recorded.** No opening-vs-closing distinction exists in the store.
- **QB/RB/WR/TE only.** No K, no DEF.
- **No wiring claim.** Nothing installs; a wiring decision is A's and Cory's,
  post-08-22.

## 9. THE RE-TEST TRIGGERS

- **Split the shrink from the signal in the FORM, not just in the analysis.**
  The arm is currently one rule doing two jobs. A baseline bias correction
  fitted on its own, with the environment multiplier applied on top, would say
  whether the +0.0343 grows once it stops paying for the shrink.
- **Per-position.** RB workload should track game script harder than WR; the
  pooled fit cannot see it.
- **Re-test the placebo on every arm this project has already graded.** If a
  running-mean baseline plus any shrink rule buys +0.046 for free, **that is not
  specific to this study**, and several existing nulls and near-nulls were
  measured against a baseline with the same property.

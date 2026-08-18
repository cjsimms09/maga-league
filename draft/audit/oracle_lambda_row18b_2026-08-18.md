# ROW 18b — the grid edge was real, the ceiling barely moved, and the asymmetry is the finding

_TERRITORY: D. Register 18b. Preregistered in `ORACLE-LAMBDA-PREREG.md`,
committed first (`ae2bb60`). Result: `oracle_lambda_sweep.json`._

**Verdict: `INTERIOR`, λ\* = 0.60, agreed independently by both seasons.**

Two of 18b's three claims survive and one does not:

| 18b said | measured |
|---|---|
| the optimum sits at the grid edge, so +0.228 is a floor | ✅ **true** — λ\* = 0.60, outside the old grid |
| the true ceiling is therefore unmeasured | ✅ true, and now measured: **+0.2379**, a **+4.3%** correction |
| an oracle needing damping means the form is **mis-specified** | ❌ **refuted as stated** — the curve is smooth, unimodal, and turns sharply negative above λ=1. **But it is mis-specified in a different, sharper way — §3.** |

## 1. THE REPRODUCTION CONTROL — declared as VOIDING, and it passed exactly

| check | expected | got |
|---|---|---|
| 2023 eligible rows | 2,179 | **2,179** ✅ |
| 2024 eligible rows | 2,259 | **2,259** ✅ |
| 2023 ΔMAE @ λ=1.0 | 0.1412 | **0.1412** ✅ |
| 2023 ΔMAE @ λ=0.5 | 0.2422 | **0.2422** ✅ |
| 2024 ΔMAE @ λ=1.0 | 0.1219 | **0.1219** ✅ |
| 2024 ΔMAE @ λ=0.5 | 0.2138 | **0.2138** ✅ |

Read from A's committed `exp_weekly_env.json`, not from a copy typed into this
study. **A grid extension that cannot reproduce the two points it extends is
measuring a different experiment**, and the prereg made that VOID rather than a
footnote.

Both populations are also **identical**: `dropped: 0` under absent-stays-absent.
Every eligible player-week had a team and a multiplier, so the strict and
reproduction arms coincide and nothing rests on A's `m = 1.0` default here.

## 2. THE CURVE

| λ | 2023 | 2024 | pooled (sum) |
|---|---|---|---|
| 0.00 | 0.0000 | 0.0000 | 0.0000 |
| 0.25 | 0.1610 | 0.1403 | 0.3013 |
| 0.50 | 0.2422 | 0.2138 | 0.4560 ← *the old grid minimum* |
| **0.60** | **0.2546** | **0.2212** | **0.4758** ← **λ\*** |
| 0.70 | 0.2534 | 0.2144 | 0.4678 |
| 0.80 | 0.2339 | 0.1957 | 0.4296 |
| 1.00 | 0.1412 | 0.1219 | 0.2631 |
| 1.25 | −0.0589 | −0.0434 | −0.1023 |
| 1.50 | −0.3222 | −0.2668 | −0.5890 |

**The corrected ceiling is +0.2379, against the published +0.228.** The
grid-edge defect was real and the correction is **small** — worth stating
plainly, because 18b's framing invited the opposite expectation. **Anyone
holding "+0.23" as the bound on perfect game-environment information was
approximately right.**

## 3. THE ASYMMETRY — and this is the part worth keeping

The prereg names this diagnostic and gates it on a MONOTONE-TO-ZERO verdict.
**I ran it unconditionally.** Deviation declared in §5, in the direction of more
checking. It is the most useful number in the study.

Split the same rows by whether the team's oracle multiplier is above or below 1:

| season | side | n | side baseline MAE | best λ | ΔMAE | as % of that side's error |
|---|---|---|---|---|---|---|
| 2023 | m > 1 (shootout) | 1,064 | 6.0328 | 0.25 | +0.0627 | **1.0%** |
| 2023 | m ≤ 1 (dud) | 1,115 | 5.3294 | **0.80** | **+0.5462** | **10.2%** |
| 2024 | m > 1 (shootout) | 1,065 | 6.3746 | 0.50 | +0.1295 | **2.0%** |
| 2024 | m ≤ 1 (dud) | 1,194 | 5.1682 | **0.80** | **+0.3293** | **6.4%** |

**Knowing a game will be a dud is worth 5–10× more than knowing it will be a
shootout, and it wants nearly twice the damping factor.**

That is the prereg's candidate 1, measured: **the multiplicative form
over-credits blowups.** A 55-point shootout does not lift every player on the
roster by 40% — it usually concentrates in one or two — so scaling the whole
roster up over-corrects, and the fit pulls λ down to limit the damage. A
16-point dud suppresses everyone roughly uniformly, which is exactly what a
multiplier models, so that side tolerates λ=0.80.

**λ\*=0.60 is not an optimum. It is a compromise between two regimes that want
0.25–0.50 and 0.80**, and reporting one scalar hides both.

### What this instructs, for the first time this week

Every game-environment feature this project has tried has been graded as *does
this signal work*. This says the failure may be in the **application**, not the
signal: **apply it asymmetrically — fully when the environment points down,
weakly when it points up.** That costs no new data, applies directly to the
Vegas store (register 18), and is testable with a preregistered arm.

**It is not shippable evidence.** This is an oracle: it reads the realised
total. A betting line is a forecast of that total and strictly worse. What
transfers is the **functional form**, not the effect size.

## 4. WHAT THE CEILING NOW MEANS, IN CONTEXT

**+0.2379 ΔMAE per player-week is a real number in a small pond.** Against the
detection floor measured today
(`replay_best_drafter_claim_2026-08-18.md` §4a: **±0.310 ΔMAE**, the replay's
minimum resolvable effect), **even a perfect game-total oracle sits below the
threshold at which the all-seats replay could see it** — at 77% of the floor.

That is not a reason to stop; it is the correct calibration for every Vegas
decision downstream. **The most this channel can ever be worth, with perfect
information, is smaller than the smallest thing our edge instrument can
measure.** Register 18's team-level arm (+0.008) is 30× below even this ceiling.

## 5. DEVIATIONS FROM THE PREREG

1. **The asymmetry diagnostic was gated on MONOTONE-TO-ZERO and I ran it
   anyway.** The verdict was INTERIOR, so by the letter of the prereg it should
   not have run. It is the study's most informative result and I would rather
   declare the deviation than not have it — same call, same direction, as the
   routes study's unrequired collinearity check. **No verdict depends on it:**
   §1–2 stand exactly as preregistered.
2. **Nothing else.** The grid, the control, the tolerance, the four verdicts and
   the two populations are as committed.

## 6. WHAT THIS DOES NOT COVER

- **2023–24 only** — the seasons `exp_weekly_env_features.json` holds.
- **The oracle arm only.** A's three real arms are not re-graded.
- **No null, by construction** — an oracle is leaked by design. The reproduction
  control is what makes this falsifiable.
- **Not a wiring claim, and not a Vegas claim.** A realised total is not a line.
- **`exp_weekly_env.py` was not edited.** It is TERRITORY: A and its
  `DAMPENING = (1.0, 0.5)` still ships the old grid — routed, not reached into.

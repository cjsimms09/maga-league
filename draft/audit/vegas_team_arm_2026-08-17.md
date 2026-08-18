# REGISTER 18 CLOSED — the join was 100%, and the real team-level line buys ~nothing

_TERRITORY: D. Preregistered in `VEGAS-TEAM-ARM-PREREG.md`, committed first.
Result: `vegas_team_arm.json`. No egress — all three inputs committed._

## 1. Q2 is answered: the signal ARRIVED, completely

| season | eligible | joined | no team | no line | **survival** |
|---|---|---|---|---|---|
| 2023 | 2,179 | 2,179 | 0 | 0 | **100.0%** |
| 2024 | 2,259 | 2,259 | 0 | 0 | **100.0%** |

**Register 18's open question is closed: the original null was NOT a wiring
failure.** Every eligible player-week found its team and its line.

**And the harness reproduces the original exactly** — 2,179 / 2,259 eligible rows
and baseline MAE **5.6729 / 5.7369**, identical to `exp_weekly_env`'s published
figures, from an independently written eligibility path. That is the control
that makes the comparison meaningful.

## 2. The real, correctly-aimed line buys essentially nothing

| λ | 2023 ΔMAE | 2024 ΔMAE |
|---|---|---|
| **0.15** | **+0.0016** | **+0.0079** |
| 0.25 | −0.0027 | +0.0082 |
| 0.35 | −0.0113 | +0.0053 |
| 0.50 | −0.0297 | −0.0046 |
| 1.00 | −0.1528 | −0.1021 |

**Best case: +0.002 and +0.008 points of weekly MAE.**

## 3. MY BAR WAS BADLY DESIGNED AND I AM SAYING SO RATHER THAN BANKING IT

The artifact reports **`clears: true`** — positive in both seasons with valid
folds, exactly as I preregistered. **That is a meaningless pass.** I set a bar
requiring only ΔMAE > 0 with no magnitude, and +0.002 clears it.

**In substance this is a null.** A prereg that can be cleared by two thousandths
of a point is the same defect as a control that cannot fail, and I wrote it this
morning while auditing others for exactly that. **Any future arm here declares a
minimum EFFECT SIZE, not just a sign.**

## 4. The λ pattern confirms the transform is wrong

ΔMAE falls **monotonically** with λ in both seasons; λ=1.0 is worst by an order
of magnitude (−0.15, −0.10). **The best thing to do with the line is almost
nothing** — which is what a mis-specified transform looks like, and it is the
same tell the relay found in the original (λ=0.5 beat λ=1.0 at the grid
minimum). Extending below 0.5 was worth doing and it settles the direction:
the optimum is at or below **0.15**, i.e. no-op.

## 5. What this does and does not say

- **The store's `_note` is still wrong about what the +0.23 bounds** (register
  18) — a game-total oracle shared by both teams is not a team-level bound.
- **But the correctly-labelled measurement now exists and is thin anyway.** The
  real closing line, aimed at the right team, with a verified 100% join, moves
  weekly MAE by under a hundredth of a point.
- **This is a REAL LINE, not an oracle** — strictly weaker in information than
  perfect foresight, so it does not replace the ceiling question, and a
  team-level *oracle* was not run.
- **Multiplicative rescale of a running mean is the wrong shape**, on this
  evidence. A different functional form is the open direction, not more λ.
- **Nothing installs.** Weekly-MAE grain only; says nothing about season totals.

## 6. Trigger

> Re-test with a **team-level ORACLE** (actual team points, not the line) to
> separate "the line is weak" from "the transform is wrong" — the two are
> confounded here. And re-test any **non-multiplicative** form before concluding
> the channel is empty.

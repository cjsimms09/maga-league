# CEILING WEIGHT vs THE SHIPPED ZERO — does it hold across fresh seeds?

_400 paired rooms × 3 fresh seeds · core = mask + value anchor, ceiling weight 0.0 (the shipped setting)_

_Board: **505** distinct `proj_ceiling/proj_mean` ratios over the pool. **1 would VOID this experiment** — a constant-multiple ceiling is rank-identical to `proj_mean`, so no run against one can separate the ceiling weight from the value weight, whatever the table below says._

| seed | w=0.65 | w=1.0 | w=1.5 |
|---|---|---|---|
| 20268727 | +28* | +14 | +16 |
| 20365537 | +52* | +41* | +35* |
| 21560517 | +27* | +9 | +9 |
| **mean** | **+35.5** (3/3 sep) | **+21.1** (1/3 sep) | **+19.9** (1/3 sep) |

_* = CI excludes 0._

**Verdict:** REPLICATES at w=0.65 — positive in all 3 fresh seeds (mean +$35.5), separable in 3/3, against a CORE arm whose ceiling weight is the shipped 0.0. A non-zero ceiling weight beats the shipped zero. THE GRID DOES NOT BRACKET THE OPTIMUM: w=0.65 is the smallest weight tested, so the peak lies at or beyond the edge and this run cannot locate it.

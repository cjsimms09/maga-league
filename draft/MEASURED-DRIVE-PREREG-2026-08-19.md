# PREREGISTRATION — drive the draft with the MEASURED need curve. Is it right?

**A, 2026-08-19, committed BEFORE the run.** Cory: *"test and make sure its
right."*

**Everything so far modelled need. The measured curve counts it** — 540 real
team-weeks, 2023-25, five controls passing, coherent with the league's own slots
(QB 1.000 starters/week, RB+WR+TE 5.989, total 8.981).

## THE ARM

```
value(p) = measured_need(pos, held) × ( proj_mean(p) − waiver_level(pos) )
```

`measured_need(pos, held)` is **the counted start rate of the (held+1)th body at
that position** — no binomial, no `games_expected`, no injury constant, nothing
modelled:

| | 1st | 2nd | 3rd | 4th | 5th | 6th |
|---|---|---|---|---|---|---|
| RB | .869 | .713 | .490 | .273 | .155 | .074 |
| WR | .830 | .696 | .530 | .331 | .179 | .168 |
| QB | .693 | .427 | .407 | — | | |
| TE | .719 | .414 | .406 | — | | |
| K | .952 | .828 | — | | | |
| DEF | .823 | .484 | — | | | |

**Beyond the measured range the need is 0** — nobody in this league has ever
rostered a 7th back, so there is no evidence a 7th is worth anything.

**Cory's K/DEF ruling stands** (`need = 0` beyond one): the measured K2 rate of
.828 is people **streaming** a bye-week kicker off waivers, which costs a claim,
not a pick. **That is the one place a measured rate is not a draft need, and it is
declared here rather than discovered after.**

**QB2 (.427) and TE2 (.414) are left AT their measured rates on purpose** — the
same streaming argument applies, but the waiver term already handles it (`proj −
319` for a QB is small), so the equation gets to prove it without my help. **If it
drafts a QB2 anyway, that is a real finding against the form.**

## P152

**The drafted twelve are 3–4 RB, 3–4 WR, exactly 1 QB, 1 TE, 1 K, 1 DEF — all six
of Cory's cells — with total projected points within 5% of `draft_plan.js`.**

**FALSE if any cell misses or value drops more than 5%.**

## CONTROLS

1. **Curve loaded from the artifact**, not retyped — the module reads
   `measured_need_curve.json` and fails if its controls did not all pass.
2. **Flex credited once**, from the roster as drafted.
3. **Keepers counted** from pick one.
4. **Twelve picks on `draft_plan.SCHED`**, room drained by ADP, identical to
   every other arm.
5. **No value below the measured range** — a 7th body at any position must price 0.

## GUARD

**REPORT ONLY.** Nothing ships, no cap is added, and the curve is *counted data*
— there is no constant here for me to tune. If P152 fails, it fails.

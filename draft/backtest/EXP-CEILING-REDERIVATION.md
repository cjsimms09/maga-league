<!-- TERRITORY: A -->
# RESULT — THE CEILING WEIGHT, RE-DERIVED ON A REAL-CEILING BOARD

**Prereg:** `CEILING-REDERIVATION-PREREG.md`, committed before the run (`f1bb701b`).
**Run:** `python3 draft/backtest/exp_ceiling_replicate.py` · 400 paired rooms ×
3 fixed seeds · deterministic (re-run reproduced `per_seed` exactly).

---

## THE HEADLINE

**A non-zero ceiling weight beats the shipped zero, separably, in all three
seeds.** The tool ships `MEASURED_WEIGHTS.ceiling = 0.0`; the `core` arm in this
experiment *is* that setting on the ceiling axis (`_CORE` = `value 1.0`,
everything else `0.0`). So this is not a comparison between two candidate
weights. It is the shipped configuration against itself plus upside.

| | w=0.65 | w=1.0 | w=1.5 |
|---|---|---|---|
| **pre-fix** (ceiling ≡ 1.35 × mean) | **+0.1** · 1/3 pos · 0/3 sep | +10.3 · 3/3 · 0/3 | +28.9 · 3/3 · 1/3 |
| **post-fix** (measured p90, 505 ratios) | **+35.5** · 3/3 · **3/3 sep** | +21.1 · 3/3 · 1/3 | +19.9 · 3/3 · 1/3 |

Per seed, post-fix, in dollars against core:

| seed | w=0.65 | w=1.0 | w=1.5 |
|---|---|---|---|
| 20268727 | **+27.56** [+6.56, +49.44]\* | +13.56 [−8.06, +35.25] | +15.56 [−5.56, +36.50] |
| 20365537 | **+52.50** [+31.38, +73.31]\* | +40.81 [+19.62, +60.44]\* | +35.38 [+14.81, +55.38]\* |
| 21560517 | **+26.56** [+5.69, +47.06]\* | +9.00 [−11.81, +30.31] | +8.69 [−12.50, +29.50] |

_\* = bootstrap CI excludes 0._

Against the preregistered bar — *sign holds in all three seeds AND separable in
at least two* — **w=0.65 clears it at 3/3 and 3/3.**

## THE SHAPE INVERTED, AND THAT IS THE MOST INFORMATIVE PART

On the degenerate board the effect **rose** with the weight (+0.1 → +10.3 →
+28.9). On the real board it **falls** (+35.5 → +21.1 → +19.9).

This is interpretation, not measurement, and is labelled as such: on a board
where `proj_ceiling ≡ 1.35 × proj_mean`, the ceiling term is `0.35 × proj_mean`
— a second copy of the value term. Turning its weight up was turning the value
weight up, so "more is better" is exactly what a degenerate board *should*
produce, and it did. The old grid was not measuring upside at any point along
it. **Its slope was an artifact of the defect**, which is why the pre-fix numbers
are reported here only as a comparison of instruments and are not evidence about
ceilings in either direction.

## WHAT THIS OVERTURNS

`WAR-ROOM-SURFACE-CONTRACT.md` recorded `ceiling` as **UNMEASURED**, on a
measurement of **−4.8 with a [−26, +17] interval** — "unsignable", and the stated
reason `MEASURED_WEIGHTS.ceiling` is 0. That measurement was taken against a
board whose ceiling was rank-identical to `proj_mean` (Spearman **1.0000**), so
it could not have come out any other way.

**The zero was never a measured setting.** It is now a setting contradicted by a
preregistered measurement on a board that carries real per-player ceilings.

## WHAT THIS DOES *NOT* SHOW — FOUR LIMITS, ALL DECLARED IN ADVANCE

1. **It does not locate the optimum.** w=0.65 is the *smallest* non-zero weight
   in the grid and it won. The peak is at or below the grid's edge and this run
   cannot find it. The verdict string says so itself.
2. **It prices CROSS-BAND dispersion only.** The measured ceiling is still
   `proj_mean × a per-(position, band) constant` — it varies between cells, not
   within them. So this cannot answer *"should THIS player be taken for his
   upside"*. That needs `weekly_volatility.py` wired in
   (`VOLATILITY-WIRING-PREREG.md`).
3. **The collinearity is reduced, not removed** — production measures Spearman
   **0.9607** against `proj_mean` with 17 of the top 100 reordered. Some of this
   edge is still the value term wearing a different hat.
4. **It is a money-proxy result**, not a graded historical replay. The proxy's
   keeper `weekly_sd` was itself a flat literal until 2026-08-17; that fix moves
   the proxy in the direction that FAVOURS upside, so this measurement is not
   independent of a correction that ran in its favour. The `+35.5` should be
   read as "clearly positive", not as a dollar figure to bank.

## WHAT HAPPENS NEXT — NOTHING, BEFORE 2026-08-22

Per `CEILING-REDERIVATION-PREREG.md` §6 and `HARNESS-DISPERSION-PREREG.md` §6:
**no shipped weight change before the draft, whatever this returned.** Five days
out, a weight measured once is a worse instrument than a known one, and this one
is measured once, on a proxy, on a grid that does not bracket its own optimum.

The three-line queue this leaves, in order:

1. **Bracket the optimum** — re-run over w ∈ {0.15, 0.3, 0.45, 0.65} with the
   same three seeds. Needs its own prereg; the finding above is a resolution
   problem, not a new hypothesis, and must not be run without declaring the grid
   first.
2. **Replicate on fresh seeds** before any weight ships. One preregistered run
   is evidence; it is not a promotion bar.
3. **Then the per-player question**, which is the one Cory has actually been
   asking all week and which none of this touches: `weekly_volatility.py`.

**A summariser defect was found by this run and fixed after it** —
`exp_ceiling_replicate.py` judged the whole experiment on the `w=1.0` column
alone and would have published this as *"leans positive, separable in only
1/3"*, and every one of its branches cited a live ceiling weight of 0.65 that
the tool has not shipped since the −4.8 measurement. `summarise()` is now a
function with all four branches under test
(`draft/tests/test_ceiling_rederivation.py`, 14/14), including a control that
runs the OLD rule on this data and asserts it disagrees.

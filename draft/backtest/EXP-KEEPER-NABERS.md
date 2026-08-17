# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag

_anchor: **FANTASYPROS** (MFL live: False) · flat-cost keeper model · 200 paired rooms · live keeper-need rule_

## The four candidates (board VORP = proj_mean − replacement)

| player | pos | proj | VORP | ADP | exp |
|---|---|---|---|---|---|
| Chase | WR | 295.1 | 121.87 | 3.0 | 5 |
| Henry | RB | 274.2 | 85.14 | 19.7 | 10 |
| Walker | RB | 256.6 | 67.58 | 17.0 | 4 |
| Nabers | WR | 200.3 | 27.08 | 28.9 | 2 |

## (A) Raw surplus — every slate, ranked

_surplus = Σ keeper VORP − Σ cost of the first k picks (103.91+62.08+36.2)_

| slate | keep | RB/WR kept | keeper VORP | surplus |
|---|---|---|---|---|
| Chase+Henry+Walker | 3 | 2/1 | 274.59 | **+72.4** |
| Chase+Henry | 2 | 1/1 | 207.01 | **+41.0** |
| Chase+Henry+Nabers | 3 | 1/2 | 234.09 | **+31.9** |
| Chase+Walker | 2 | 1/1 | 189.45 | **+23.5** |
| Chase | 1 | 0/1 | 121.87 | **+18.0** |
| Chase+Walker+Nabers | 3 | 1/2 | 216.53 | **+14.3** |
| _(keep none)_ | 0 | 0/0 | 0 | **+0.0** |
| Henry+Walker | 2 | 2/0 | 152.72 | **-13.3** |
| Chase+Nabers | 2 | 0/2 | 148.95 | **-17.0** |
| Henry | 1 | 1/0 | 85.14 | **-18.8** |
| Henry+Walker+Nabers | 3 | 2/1 | 179.8 | **-22.4** |
| Walker | 1 | 1/0 | 67.58 | **-36.3** |
| Henry+Nabers | 2 | 1/1 | 112.22 | **-53.8** |
| Walker+Nabers | 2 | 1/1 | 94.66 | **-71.3** |
| Nabers | 1 | 0/1 | 27.08 | **-76.8** |

## (B) The best *draft* — MC dollars, paired vs the current slate

| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |
|---|---|---|---|---|
| Chase+Henry+Walker | 723 | — (control) | 2 | 1.81 @ -45.0 |
| Chase+Henry+Nabers | 564 | -158.5 [-192.75, -124.38] | 1 | 2.82 @ -45.8 |
| Chase+Nabers+Walker | 534 | -189.0 [-225.0, -152.12] | 1 | 2.82 @ -45.8 |
| Chase+Henry | 514 | -208.8 [-248.5, -171.5] | 1 | 2.72 @ -44.2 |

## The bias flag (Cory's hypothesis, applied to THIS decision)

- Nabers model VORP **27.08**; market-implied VORP (his ADP rank 29) **33.59** — model and market roughly agree.
- Breakeven to keep Nabers over **Walker**: VORP **67.58**; over **Henry**: VORP **85.14**.
- So even trusting the market over our model, Nabers' value does not reach the breakeven; the bias would have to be very large AND unshared by the market to flip it.

### Cross-sectional experience bias (model vs market)

| experience | n | VORP rank − ADP rank (+ = we rank below market) |
|---|---|---|
| rookie(0) | 77 | +10.5 |
| 2nd-yr(1) | 87 | +16.1 |
| 3rd-yr(2) | 62 | +20.6 |
| vet(3+) | 342 | -10.2 |

**Caveats:** anchor = FANTASYPROS; MFL not live yet, so ranked by FFC (source grade prefers MFL directionally — flagged, not yet wired to the live board) · surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks · MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); rankings travel, absolute $ are harness-dependent · bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market needs realized outcomes (Lab test #1) and BBM at scale (test #3)
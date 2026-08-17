# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag

_anchor: **FANTASYPROS** (MFL live: False) · flat-cost keeper model · 200 paired rooms · live keeper-need rule_

## The four candidates (board VORP = proj_mean − replacement)

| player | pos | proj | VORP | ADP | exp |
|---|---|---|---|---|---|
| Chase | WR | 295.1 | 121.82 | 3.0 | 5 |
| Henry | RB | 274.2 | 85.06 | 19.3 | 10 |
| Walker | RB | 256.7 | 67.6 | 17.0 | 4 |
| Nabers | WR | 200.4 | 27.09 | 28.9 | 2 |

## (A) Raw surplus — every slate, ranked

_surplus = Σ keeper VORP − Σ cost of the first k picks (103.91+62.08+36.2)_

| slate | keep | RB/WR kept | keeper VORP | surplus |
|---|---|---|---|---|
| Chase+Henry+Walker | 3 | 2/1 | 274.48 | **+72.3** |
| Chase+Henry | 2 | 1/1 | 206.88 | **+40.9** |
| Chase+Henry+Nabers | 3 | 1/2 | 233.97 | **+31.8** |
| Chase+Walker | 2 | 1/1 | 189.42 | **+23.4** |
| Chase | 1 | 0/1 | 121.82 | **+17.9** |
| Chase+Walker+Nabers | 3 | 1/2 | 216.51 | **+14.3** |
| _(keep none)_ | 0 | 0/0 | 0 | **+0.0** |
| Henry+Walker | 2 | 2/0 | 152.66 | **-13.3** |
| Chase+Nabers | 2 | 0/2 | 148.91 | **-17.1** |
| Henry | 1 | 1/0 | 85.06 | **-18.9** |
| Henry+Walker+Nabers | 3 | 2/1 | 179.75 | **-22.4** |
| Walker | 1 | 1/0 | 67.6 | **-36.3** |
| Henry+Nabers | 2 | 1/1 | 112.15 | **-53.8** |
| Walker+Nabers | 2 | 1/1 | 94.69 | **-71.3** |
| Nabers | 1 | 0/1 | 27.09 | **-76.8** |

## (B) The best *draft* — MC dollars, paired vs the current slate

| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |
|---|---|---|---|---|
| Chase+Henry+Walker | 629 | — (control) | 2 | 2.03 @ -53.5 |
| Chase+Henry+Nabers | 523 | -106.4 [-134.38, -79.38] | 1 | 3.03 @ -52.6 |
| Chase+Nabers+Walker | 505 | -123.9 [-153.38, -95.12] | 1 | 3.03 @ -52.6 |
| Chase+Henry | 476 | -153.2 [-185.62, -121.12] | 1 | 2.88 @ -46.3 |

## The bias flag (Cory's hypothesis, applied to THIS decision)

- Nabers model VORP **27.09**; market-implied VORP (his ADP rank 29) **33.59** — model and market roughly agree.
- Breakeven to keep Nabers over **Walker**: VORP **67.6**; over **Henry**: VORP **85.06**.
- So even trusting the market over our model, Nabers' value does not reach the breakeven; the bias would have to be very large AND unshared by the market to flip it.

### Cross-sectional experience bias (model vs market)

| experience | n | VORP rank − ADP rank (+ = we rank below market) |
|---|---|---|
| rookie(0) | 80 | +10.4 |
| 2nd-yr(1) | 87 | +13.7 |
| 3rd-yr(2) | 62 | +18.3 |
| vet(3+) | 342 | -9.2 |

**Caveats:** anchor = FANTASYPROS; MFL not live yet, so ranked by FFC (source grade prefers MFL directionally — flagged, not yet wired to the live board) · surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks · MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); rankings travel, absolute $ are harness-dependent · bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market needs realized outcomes (Lab test #1) and BBM at scale (test #3)
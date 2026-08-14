# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag

_anchor: **FANTASYPROS** (MFL live: False) · flat-cost keeper model · 200 paired rooms · live keeper-need rule_

## The four candidates (board VORP = proj_mean − replacement)

| player | pos | proj | VORP | ADP | exp |
|---|---|---|---|---|---|
| Chase | WR | 295.1 | 121.92 | 3.0 | 5 |
| Henry | RB | 274.2 | 85.28 | 19.7 | 10 |
| Walker | RB | 256.4 | 67.52 | 17.3 | 4 |
| Nabers | WR | 200.2 | 27.08 | 29.0 | 2 |

## (A) Raw surplus — every slate, ranked

_surplus = Σ keeper VORP − Σ cost of the first k picks (103.91+62.08+36.2)_

| slate | keep | RB/WR kept | keeper VORP | surplus |
|---|---|---|---|---|
| Chase+Henry+Walker | 3 | 2/1 | 274.72 | **+72.5** |
| Chase+Henry | 2 | 1/1 | 207.2 | **+41.2** |
| Chase+Henry+Nabers | 3 | 1/2 | 234.28 | **+32.1** |
| Chase+Walker | 2 | 1/1 | 189.44 | **+23.4** |
| Chase | 1 | 0/1 | 121.92 | **+18.0** |
| Chase+Walker+Nabers | 3 | 1/2 | 216.52 | **+14.3** |
| _(keep none)_ | 0 | 0/0 | 0 | **+0.0** |
| Henry+Walker | 2 | 2/0 | 152.8 | **-13.2** |
| Chase+Nabers | 2 | 0/2 | 149.0 | **-17.0** |
| Henry | 1 | 1/0 | 85.28 | **-18.6** |
| Henry+Walker+Nabers | 3 | 2/1 | 179.88 | **-22.3** |
| Walker | 1 | 1/0 | 67.52 | **-36.4** |
| Henry+Nabers | 2 | 1/1 | 112.36 | **-53.6** |
| Walker+Nabers | 2 | 1/1 | 94.6 | **-71.4** |
| Nabers | 1 | 0/1 | 27.08 | **-76.8** |

## (B) The best *draft* — MC dollars, paired vs the current slate

| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |
|---|---|---|---|---|
| Chase+Henry+Walker | 716 | — (control) | 2 | 1.75 @ -42.1 |
| Chase+Henry+Nabers | 610 | -105.6 [-137.0, -76.12] | 1 | 2.75 @ -42.7 |
| Chase+Nabers+Walker | 577 | -138.9 [-172.5, -106.38] | 1 | 2.75 @ -42.7 |
| Chase+Henry | 514 | -202.1 [-238.38, -165.38] | 1 | 2.81 @ -44.6 |

## The bias flag (Cory's hypothesis, applied to THIS decision)

- Nabers model VORP **27.08**; market-implied VORP (his ADP rank 29) **33.58** — model and market roughly agree.
- Breakeven to keep Nabers over **Walker**: VORP **67.52**; over **Henry**: VORP **85.28**.
- So even trusting the market over our model, Nabers' value does not reach the breakeven; the bias would have to be very large AND unshared by the market to flip it.

### Cross-sectional experience bias (model vs market)

| experience | n | VORP rank − ADP rank (+ = we rank below market) |
|---|---|---|
| rookie(0) | 47 | +38.3 |
| 2nd-yr(1) | 54 | +48.5 |
| 3rd-yr(2) | 52 | +51.4 |
| vet(3+) | 236 | +27.7 |

**Caveats:** anchor = FANTASYPROS; MFL not live yet, so ranked by FFC (source grade prefers MFL directionally — flagged, not yet wired to the live board) · surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks · MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); rankings travel, absolute $ are harness-dependent · bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market needs realized outcomes (Lab test #1) and BBM at scale (test #3)
# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag

_anchor: **FANTASYPROS** (MFL live: False) · flat-cost keeper model · 200 paired rooms · live keeper-need rule_

## The four candidates (board VORP = proj_mean − replacement)

| player | pos | proj | VORP | ADP | exp |
|---|---|---|---|---|---|
| Chase | WR | 295.1 | 115.44 | 3.0 | 5 |
| Henry | RB | 274.2 | 85.63 | 21.7 | 10 |
| Walker | RB | 255.8 | 67.23 | 18.7 | 4 |
| Nabers | WR | 199.6 | 19.99 | 29.4 | 2 |

## (A) Raw surplus — every slate, ranked

_surplus = Σ keeper VORP − Σ cost of the first k picks (103.91+62.08+36.2)_

| slate | keep | RB/WR kept | keeper VORP | surplus |
|---|---|---|---|---|
| Chase+Henry+Walker | 3 | 2/1 | 268.3 | **+66.1** |
| Chase+Henry | 2 | 1/1 | 201.07 | **+35.1** |
| Chase+Henry+Nabers | 3 | 1/2 | 221.06 | **+18.9** |
| Chase+Walker | 2 | 1/1 | 182.67 | **+16.7** |
| Chase | 1 | 0/1 | 115.44 | **+11.5** |
| Chase+Walker+Nabers | 3 | 1/2 | 202.66 | **+0.5** |
| _(keep none)_ | 0 | 0/0 | 0 | **+0.0** |
| Henry+Walker | 2 | 2/0 | 152.86 | **-13.1** |
| Henry | 1 | 1/0 | 85.63 | **-18.3** |
| Henry+Walker+Nabers | 3 | 2/1 | 172.85 | **-29.3** |
| Chase+Nabers | 2 | 0/2 | 135.43 | **-30.6** |
| Walker | 1 | 1/0 | 67.23 | **-36.7** |
| Henry+Nabers | 2 | 1/1 | 105.62 | **-60.4** |
| Walker+Nabers | 2 | 1/1 | 87.22 | **-78.8** |
| Nabers | 1 | 0/1 | 19.99 | **-83.9** |

## (B) The best *draft* — MC dollars, paired vs the current slate

| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |
|---|---|---|---|---|
| Chase+Henry+Walker | 748 | — (control) | 2 | 1.97 @ -53.6 |
| Chase+Henry+Nabers | 602 | -145.5 [-179.0, -111.38] | 1 | 2.96 @ -46.8 |
| Chase+Nabers+Walker | 585 | -162.6 [-196.88, -129.0] | 1 | 2.96 @ -47.1 |
| Chase+Henry | 543 | -204.5 [-245.0, -161.25] | 1 | 2.72 @ -44.7 |

## The bias flag (Cory's hypothesis, applied to THIS decision)

- Nabers model VORP **19.99**; market-implied VORP (his ADP rank 29) **30.8** — model and market roughly agree.
- Breakeven to keep Nabers over **Walker**: VORP **67.23**; over **Henry**: VORP **85.63**.
- So even trusting the market over our model, Nabers' value does not reach the breakeven; the bias would have to be very large AND unshared by the market to flip it.

### Cross-sectional experience bias (model vs market)

| experience | n | VORP rank − ADP rank (+ = we rank below market) |
|---|---|---|
| rookie(0) | 49 | +34.8 |
| 2nd-yr(1) | 60 | +44.8 |
| 3rd-yr(2) | 52 | +43.2 |
| vet(3+) | 237 | +21.6 |

**Caveats:** anchor = FANTASYPROS; MFL not live yet, so ranked by FFC (source grade prefers MFL directionally — flagged, not yet wired to the live board) · surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks · MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); rankings travel, absolute $ are harness-dependent · bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market needs realized outcomes (Lab test #1) and BBM at scale (test #3)
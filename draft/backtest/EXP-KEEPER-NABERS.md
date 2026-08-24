# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag

_anchor: **FANTASYPROS** (MFL live: False) · flat-cost keeper model · 200 paired rooms · live keeper-need rule_

## The four candidates (board VORP = proj_mean − replacement)

| player | pos | proj | VORP | ADP | exp |
|---|---|---|---|---|---|
| Chase | WR | 271.8 | 128.9 | 3.0 | 5 |
| Henry | RB | 259.1 | 111.35 | 18.7 | 10 |
| Walker | RB | 233.8 | 86.02 | 17.0 | 4 |
| Nabers | WR | 195.5 | 52.6 | 5.4 | 2 |

## (A) Raw surplus — every slate, ranked

_surplus = Σ keeper VORP − Σ cost of the first k picks (103.91+62.08+36.2)_

| slate | keep | RB/WR kept | keeper VORP | surplus |
|---|---|---|---|---|
| Chase+Henry+Walker | 3 | 2/1 | 326.27 | **+124.1** |
| Chase+Henry+Nabers | 3 | 1/2 | 292.85 | **+90.7** |
| Chase+Henry | 2 | 1/1 | 240.25 | **+74.3** |
| Chase+Walker+Nabers | 3 | 1/2 | 267.52 | **+65.3** |
| Chase+Walker | 2 | 1/1 | 214.92 | **+48.9** |
| Henry+Walker+Nabers | 3 | 2/1 | 249.97 | **+47.8** |
| Henry+Walker | 2 | 2/0 | 197.37 | **+31.4** |
| Chase | 1 | 0/1 | 128.9 | **+25.0** |
| Chase+Nabers | 2 | 0/2 | 181.5 | **+15.5** |
| Henry | 1 | 1/0 | 111.35 | **+7.4** |
| _(keep none)_ | 0 | 0/0 | 0 | **+0.0** |
| Henry+Nabers | 2 | 1/1 | 163.95 | **-2.0** |
| Walker | 1 | 1/0 | 86.02 | **-17.9** |
| Walker+Nabers | 2 | 1/1 | 138.62 | **-27.4** |
| Nabers | 1 | 0/1 | 52.6 | **-51.3** |

## (B) The best *draft* — MC dollars, paired vs the current slate

| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |
|---|---|---|---|---|
| Chase+Henry+Walker | 837 | — (control) | 2 | 1.94 @ -17.5 |
| Chase+Henry+Nabers | 780 | -56.4 [-78.75, -34.75] | 1 | 2.94 @ -15.4 |
| Chase+Nabers+Walker | 762 | -75.1 [-99.88, -51.62] | 1 | 2.94 @ -15.4 |
| Chase+Henry | 729 | -107.8 [-142.0, -73.62] | 1 | 2.68 @ -13.3 |

## The bias flag (Cory's hypothesis, applied to THIS decision)

- Nabers model VORP **52.6**; market-implied VORP (his ADP rank 5) **67.6** — model and market roughly agree.
- Breakeven to keep Nabers over **Walker**: VORP **86.02**; over **Henry**: VORP **111.35**.
- So even trusting the market over our model, Nabers' value does not reach the breakeven; the bias would have to be very large AND unshared by the market to flip it.

### Cross-sectional experience bias (model vs market)

| experience | n | VORP rank − ADP rank (+ = we rank below market) |
|---|---|---|
| rookie(0) | 90 | +14.6 |
| 2nd-yr(1) | 86 | +13.7 |
| 3rd-yr(2) | 63 | +9.9 |
| vet(3+) | 326 | -9.6 |

**Caveats:** anchor = FANTASYPROS; MFL not live yet, so ranked by FFC (source grade prefers MFL directionally — flagged, not yet wired to the live board) · surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks · MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); rankings travel, absolute $ are harness-dependent · bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market needs realized outcomes (Lab test #1) and BBM at scale (test #3)
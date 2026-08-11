# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag

_anchor: **FANTASYPROS** (MFL live: False) · flat-cost keeper model · 200 paired rooms · live keeper-need rule_

## The four candidates (board VORP = proj_mean − replacement)

| player | pos | proj | VORP | ADP | exp |
|---|---|---|---|---|---|
| Chase | WR | 295.1 | 122.42 | 3.0 | 5 |
| Henry | RB | 274.2 | 85.63 | 21.7 | 10 |
| Walker | RB | 255.8 | 67.23 | 18.7 | 4 |
| Nabers | WR | 199.6 | 26.97 | 28.8 | 2 |

## (A) Raw surplus — every slate, ranked

_surplus = Σ keeper VORP − Σ cost of the first k picks (103.91+62.08+36.2)_

| slate | keep | RB/WR kept | keeper VORP | surplus |
|---|---|---|---|---|
| Chase+Henry+Walker | 3 | 2/1 | 275.28 | **+73.1** |
| Chase+Henry | 2 | 1/1 | 208.05 | **+42.1** |
| Chase+Henry+Nabers | 3 | 1/2 | 235.02 | **+32.8** |
| Chase+Walker | 2 | 1/1 | 189.65 | **+23.7** |
| Chase | 1 | 0/1 | 122.42 | **+18.5** |
| Chase+Walker+Nabers | 3 | 1/2 | 216.62 | **+14.4** |
| _(keep none)_ | 0 | 0/0 | 0 | **+0.0** |
| Henry+Walker | 2 | 2/0 | 152.86 | **-13.1** |
| Chase+Nabers | 2 | 0/2 | 149.39 | **-16.6** |
| Henry | 1 | 1/0 | 85.63 | **-18.3** |
| Henry+Walker+Nabers | 3 | 2/1 | 179.83 | **-22.4** |
| Walker | 1 | 1/0 | 67.23 | **-36.7** |
| Henry+Nabers | 2 | 1/1 | 112.6 | **-53.4** |
| Walker+Nabers | 2 | 1/1 | 94.2 | **-71.8** |
| Nabers | 1 | 0/1 | 26.97 | **-76.9** |

## (B) The best *draft* — MC dollars, paired vs the current slate

| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |
|---|---|---|---|---|
| Chase+Henry+Walker | 734 | — (control) | 2 | 1.91 @ -48.9 |
| Chase+Henry+Nabers | 616 | -117.6 [-147.75, -88.0] | 1 | 2.9 @ -43.6 |
| Chase+Nabers+Walker | 582 | -151.5 [-183.38, -120.25] | 1 | 2.9 @ -43.8 |
| Chase+Henry | 578 | -156.4 [-195.88, -118.88] | 1 | 2.7 @ -42.5 |

## The bias flag (Cory's hypothesis, applied to THIS decision)

- Nabers model VORP **26.97**; market-implied VORP (his ADP rank 29) **33.42** — model and market roughly agree.
- Breakeven to keep Nabers over **Walker**: VORP **67.23**; over **Henry**: VORP **85.63**.
- So even trusting the market over our model, Nabers' value does not reach the breakeven; the bias would have to be very large AND unshared by the market to flip it.

### Cross-sectional experience bias (model vs market)

| experience | n | VORP rank − ADP rank (+ = we rank below market) |
|---|---|---|
| rookie(0) | 49 | +35.2 |
| 2nd-yr(1) | 60 | +44.1 |
| 3rd-yr(2) | 52 | +42.4 |
| vet(3+) | 236 | +21.7 |

**Caveats:** anchor = FANTASYPROS; MFL not live yet, so ranked by FFC (source grade prefers MFL directionally — flagged, not yet wired to the live board) · surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks · MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); rankings travel, absolute $ are harness-dependent · bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market needs realized outcomes (Lab test #1) and BBM at scale (test #3)
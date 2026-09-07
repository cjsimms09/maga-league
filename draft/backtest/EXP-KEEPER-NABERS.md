# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag

_anchor: **FANTASYPROS** (MFL live: False) · flat-cost keeper model · 200 paired rooms · live keeper-need rule_

## The four candidates (board VORP = proj_mean − replacement)

| player | pos | proj | VORP | ADP | exp |
|---|---|---|---|---|---|
| Chase | WR | 271.8 | 101.5 | 3.0 | 5 |
| Henry | RB | 259.1 | 78.05 | 16.3 | 10 |
| Walker | RB | 233.8 | 52.72 | 16.0 | 4 |
| Nabers | WR | 195.5 | 25.2 | 5.8 | 2 |

## (A) Raw surplus — every slate, ranked

_surplus = Σ keeper VORP − Σ cost of the first k picks (103.91+62.08+36.2)_

| slate | keep | RB/WR kept | keeper VORP | surplus |
|---|---|---|---|---|
| Chase+Henry+Walker | 3 | 2/1 | 232.27 | **+30.1** |
| Chase+Henry | 2 | 1/1 | 179.55 | **+13.6** |
| Chase+Henry+Nabers | 3 | 1/2 | 204.75 | **+2.6** |
| _(keep none)_ | 0 | 0/0 | 0 | **+0.0** |
| Chase | 1 | 0/1 | 101.5 | **-2.4** |
| Chase+Walker | 2 | 1/1 | 154.22 | **-11.8** |
| Chase+Walker+Nabers | 3 | 1/2 | 179.42 | **-22.8** |
| Henry | 1 | 1/0 | 78.05 | **-25.9** |
| Henry+Walker | 2 | 2/0 | 130.77 | **-35.2** |
| Chase+Nabers | 2 | 0/2 | 126.7 | **-39.3** |
| Henry+Walker+Nabers | 3 | 2/1 | 155.97 | **-46.2** |
| Walker | 1 | 1/0 | 52.72 | **-51.2** |
| Henry+Nabers | 2 | 1/1 | 103.25 | **-62.7** |
| Nabers | 1 | 0/1 | 25.2 | **-78.7** |
| Walker+Nabers | 2 | 1/1 | 77.92 | **-88.1** |

## (B) The best *draft* — MC dollars, paired vs the current slate

| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |
|---|---|---|---|---|
| Chase+Henry+Walker | 874 | — (control) | 2 | 2.23 @ -58.1 |
| Chase+Henry+Nabers | 798 | -75.5 [-95.0, -55.38] | 1 | 3.23 @ -55.1 |
| Chase+Nabers+Walker | 773 | -100.6 [-126.25, -75.12] | 1 | 3.23 @ -54.8 |
| Chase+Henry | 691 | -182.6 [-214.5, -152.5] | 1 | 2.85 @ -52.6 |

## The bias flag (Cory's hypothesis, applied to THIS decision)

- Nabers model VORP **25.2**; market-implied VORP (his ADP rank 6) **37.2** — model and market roughly agree.
- Breakeven to keep Nabers over **Walker**: VORP **52.72**; over **Henry**: VORP **78.05**.
- So even trusting the market over our model, Nabers' value does not reach the breakeven; the bias would have to be very large AND unshared by the market to flip it.

### Cross-sectional experience bias (model vs market)

| experience | n | VORP rank − ADP rank (+ = we rank below market) |
|---|---|---|
| rookie(0) | 92 | +17.6 |
| 2nd-yr(1) | 84 | +15.9 |
| 3rd-yr(2) | 65 | +13.9 |
| vet(3+) | 330 | -11.7 |

**Caveats:** anchor = FANTASYPROS; MFL not live yet, so ranked by FFC (source grade prefers MFL directionally — flagged, not yet wired to the live board) · surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks · MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); rankings travel, absolute $ are harness-dependent · bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market needs realized outcomes (Lab test #1) and BBM at scale (test #3)
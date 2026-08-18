# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag

_anchor: **FANTASYPROS** (MFL live: False) · flat-cost keeper model · 200 paired rooms · live keeper-need rule_

## The four candidates (board VORP = proj_mean − replacement)

| player | pos | proj | VORP | ADP | exp |
|---|---|---|---|---|---|
| Chase | WR | 256.6 | 94.0 | 3.0 | 5 |
| Henry | RB | 238.4 | 59.1 | 19.0 | 10 |
| Walker | RB | 225.5 | 46.2 | 17.0 | 4 |
| Nabers | WR | 186.3 | 23.7 | 28.0 | 2 |

## (A) Raw surplus — every slate, ranked

_surplus = Σ keeper VORP − Σ cost of the first k picks (103.91+62.08+36.2)_

| slate | keep | RB/WR kept | keeper VORP | surplus |
|---|---|---|---|---|
| _(keep none)_ | 0 | 0/0 | 0 | **+0.0** |
| Chase+Henry+Walker | 3 | 2/1 | 199.3 | **-2.9** |
| Chase | 1 | 0/1 | 94.0 | **-9.9** |
| Chase+Henry | 2 | 1/1 | 153.1 | **-12.9** |
| Chase+Henry+Nabers | 3 | 1/2 | 176.8 | **-25.4** |
| Chase+Walker | 2 | 1/1 | 140.2 | **-25.8** |
| Chase+Walker+Nabers | 3 | 1/2 | 163.9 | **-38.3** |
| Henry | 1 | 1/0 | 59.1 | **-44.8** |
| Chase+Nabers | 2 | 0/2 | 117.7 | **-48.3** |
| Walker | 1 | 1/0 | 46.2 | **-57.7** |
| Henry+Walker | 2 | 2/0 | 105.3 | **-60.7** |
| Henry+Walker+Nabers | 3 | 2/1 | 129.0 | **-73.2** |
| Nabers | 1 | 0/1 | 23.7 | **-80.2** |
| Henry+Nabers | 2 | 1/1 | 82.8 | **-83.2** |
| Walker+Nabers | 2 | 1/1 | 69.9 | **-96.1** |

## (B) The best *draft* — MC dollars, paired vs the current slate

| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |
|---|---|---|---|---|
| Chase+Henry+Walker | 637 | — (control) | 2 | 2.1 @ -55.1 |
| Chase+Henry+Nabers | 553 | -83.9 [-109.25, -60.12] | 1 | 3.1 @ -51.0 |
| Chase+Nabers+Walker | 542 | -94.5 [-123.62, -67.75] | 1 | 3.1 @ -50.9 |
| Chase+Henry | 500 | -136.8 [-172.12, -103.62] | 1 | 2.77 @ -46.9 |

## The bias flag (Cory's hypothesis, applied to THIS decision)

- Nabers model VORP **23.7**; market-implied VORP (his ADP rank 28) **26.6** — model and market roughly agree.
- Breakeven to keep Nabers over **Walker**: VORP **46.2**; over **Henry**: VORP **59.1**.
- So even trusting the market over our model, Nabers' value does not reach the breakeven; the bias would have to be very large AND unshared by the market to flip it.

### Cross-sectional experience bias (model vs market)

| experience | n | VORP rank − ADP rank (+ = we rank below market) |
|---|---|---|
| rookie(0) | 82 | +5.3 |
| 2nd-yr(1) | 88 | +13.5 |
| 3rd-yr(2) | 63 | +16.5 |
| vet(3+) | 343 | -7.7 |

**Caveats:** anchor = FANTASYPROS; MFL not live yet, so ranked by FFC (source grade prefers MFL directionally — flagged, not yet wired to the live board) · surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks · MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); rankings travel, absolute $ are harness-dependent · bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market needs realized outcomes (Lab test #1) and BBM at scale (test #3)
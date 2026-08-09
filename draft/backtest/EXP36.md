# EXPERIMENT 36 — ADP-efficiency audit (reliability surface)

_255 gradeable board picks (every owner, all seasons) — far more
data per cell than exp 34's 19 decisions. Efficiency = within-cell
Spearman(-adp, realized), clamped [0,1] = the shrinkage weight the Anchor
Doctrine reads. Floor n>=8 to rank; thin cells default to full market
anchor (shrink 1.0), the conservative direction. Sources reached: ffc._

Cells ranked: 11 · thin (n>0, <floor): 5

## THE SURFACE — efficiency (shrink) by round-band × position

_cell = efficiency [shrink] (n); `·` = no players; `thin` = below floor -> shrink 1.0_

| round | QB | RB | WR | TE | K | DEF |
|---|---|---|---|---|---|---|
| r1-3 | thin (n=5) | 0.121 [0.121] (n=24) | 0.256 [0.256] (n=28) | thin (n=3) | · | · |
| r4-7 | 0.58 [0.58] (n=12) | 0.13 [0.13] (n=25) | 0.199 [0.199] (n=30) | 0.615 [0.615] (n=13) | · | · |
| r8-11 | thin (n=4) | -0.024 [0.0] (n=30) | 0.134 [0.134] (n=32) | thin (n=6) | · | · |
| r12+ | -0.073 [0.0] (n=11) | -0.147 [0.0] (n=12) | 0.718 [0.718] (n=15) | thin (n=5) | · | · |

## Pooled by position (fallback axis, all rounds)

- **QB**: efficiency 0.381 CI [0.007, 0.66] [shrink 0.381] (n=32, mean realized 322.48) — weak
- **RB**: efficiency 0.445 CI [0.256, 0.615] [shrink 0.445] (n=91, mean realized 162.5) — weak
- **WR**: efficiency 0.486 CI [0.32, 0.631] [shrink 0.486] (n=105, mean realized 162.2) — weak
- **TE**: efficiency 0.28 CI [-0.098, 0.584] [shrink 0.28] (n=27, mean realized 138.51) — weak
- **K**: thin (n=0) -> full market anchor
- **DEF**: thin (n=0) -> full market anchor

## QB FORMAT-MATCH (6-pt our league vs 4-pt ADP source)

- efficiency under 6-pt (our league): 0.381
- efficiency under 4-pt (ADP source): 0.416
- **delta -0.035** — 6-pt is our era-correct scoring; 4-pt is the ADP source's world. A gap means the market's QB order is being judged against a different currency than it was set in — the underpricing the late-QB verdict compounds.

## Tier-model calibration (per-position realized cliffs by ADP order)

- QB: mean adjacent drop 11.15 (sd 180.76) — cliffs: after ADP-rank 25 (drop 409.18, z 2.2), after ADP-rank 8 (drop 384.38, z 2.06), after ADP-rank 31 (drop 328.2, z 1.75), after ADP-rank 17 (drop 238.44, z 1.26)
- RB: mean adjacent drop -2.0 (sd 134.56) — cliffs: after ADP-rank 3 (drop 277.4, z 2.08), after ADP-rank 18 (drop 236.9, z 1.78), after ADP-rank 9 (drop 230.0, z 1.72), after ADP-rank 5 (drop 191.3, z 1.44), after ADP-rank 38 (drop 190.1, z 1.43)
- WR: mean adjacent drop -1.75 (sd 90.59) — cliffs: after ADP-rank 15 (drop 188.2, z 2.1), after ADP-rank 25 (drop 170.1, z 1.9), after ADP-rank 38 (drop 148.5, z 1.66), after ADP-rank 8 (drop 134.18, z 1.5), after ADP-rank 4 (drop 118.88, z 1.33)
- TE: mean adjacent drop 4.18 (sd 51.04) — cliffs: after ADP-rank 8 (drop 103.0, z 1.94), after ADP-rank 11 (drop 86.8, z 1.62), after ADP-rank 22 (drop 82.66, z 1.54), after ADP-rank 1 (drop 66.0, z 1.21), after ADP-rank 2 (drop 61.5, z 1.12)
- K: thin (n=0)
- DEF: thin (n=0)

## Caveats

- [2025] NOT recovered: pbp disagreed with the library on 2024
- 2025: realized weekly unavailable; season SKIPPED

## What this feeds

Each ranked cell's shrink weight is the Anchor Doctrine's per-region calibration: hard anchor where ADP is measurably efficient, loosened where it is measurably wrong, and full anchor (never a blind deviation) where the cell was too thin to measure. The multi-source + composite extension and the money-graded companion (exp 34 dollar arm + exp 39) attach here; this is the points-reliability spine they build on.

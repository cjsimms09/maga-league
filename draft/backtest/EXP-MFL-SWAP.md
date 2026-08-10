# MFL-as-anchor — the swap decision (Cory to make the call)

_Source grade said MFL orders realized value better than FFC (ρ 0.40 vs 0.28 in 2023,
0.07 vs −0.03 in 2024; MFL won 7 pooled regions to 5; composite did not beat MFL).
Before wiring MFL as the live board's anchor, four questions — all answered here._

## 1. Where does MFL's edge actually live? — **the early rounds, where Cory drafts**
Counterintuitive and decision-flipping. From the per-region grade:
- **2023:** MFL wins **r1-3 (2-0)**, ties r4-7 and r8-11, and **FFC wins the deepest band r12+.**
  Early cells: r1-3 WR ρ 0.32 vs 0.20, r4-7 RB 0.21 vs 0.15 — MFL better where it counts.
- **2024:** mixed and near-zero for both (r4-7 RB actually FFC; r4-7 WR MFL).

So MFL's advantage is **NOT** in the deep board. The 2026 boards mostly *agree by rank*
early and *disagree* deep — but the small early differences MFL makes are better
correlated with realized value, and the deep board (big rank disagreements) is where
FFC is at least as good. The swap matters **where Cory picks**, not where the raw
disagreement count is loudest.

## 2. What changes at Cory's picks (2026 board)? — **real, not cosmetic**
Median absolute rank move by FFC band: **top-50 → 18, 51-100 → 34, 101-130 → 36.** Not
cosmetic. At his actual first three picks:
| pick | FFC | player | MFL rank | move |
|---|---|---|---|---|
| 34 | r34 | Tetairoa McMillan | r34 | 0 |
| 41 | r41 | Bucky Irving | **r66** | **+25 (MFL more bearish)** |
| 54 | r54 | TreVeyon Henderson | r55 | +1 |
Picks 34 and 54 barely move; **pick 41 (Bucky Irving) is a full ~2 rounds later on MFL** —
a real, actionable disagreement at a pick Cory owns.

## 3. Is a per-region hybrid better? — **no, rank by MFL alone**
In-sample per-region oracle: 2023 = 0.354 vs MFL-alone 0.397 (MFL already better);
2024 = 0.119 vs 0.070 (both noise). The hybrid does not convincingly beat MFL and adds
complexity; consistent with the original "composite doesn't beat MFL." **Use MFL alone.**

## 4. Coverage (28% has no MFL number) — **handled, and the hole is where it doesn't matter**
2026 MFL: 702 rows, 447 crosswalked, **72% of the full pool**. But by band:
**top-50 100%, 51-100 100%, 101-130 93%, 131-200 99%** — only **3 uncovered inside the
draftable top-200.** The 28% gap is entirely **deep (200+, 58% covered)**. Fallback rule:
**uncovered players keep their FFC adp** — the swap blends MFL where present, FFC
elsewhere; nobody is dropped or priced to a guess.

## Recommendation
**The swap is worth making.** MFL orders the rounds Cory drafts better, the draftable
range is ~fully covered, uncovered deep players fall back to FFC cleanly, and MFL-alone
beats the hybrid. Wiring point: `build.py` adp seam (fetch MFL like FFC, set `adp` from
MFL rank, FFC fallback, stamp `adp_source: mfl+ffc-fallback`). **Held for Cory's call**
— the anchor is a hand-set, human-gated value (see below).

## Caveats
Two graded seasons, resting substantially on 2023 (2024 near-zero for both); thin per-cell
n (10-18). Directional, not settled — which is exactly why the measurement must keep
re-running as seasons arrive (it does; see the auto-fire note) and why the install stays
gated on Cory rather than self-applied.

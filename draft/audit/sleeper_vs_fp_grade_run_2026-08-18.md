# THE THREE-WAY GRADE RAN — Cory's 08-16 source question has its first measurement

**TERRITORY: A.** Run: `sleeper-vs-fp-grade.yml`, dispatched from `main`
2026-08-18 by A (the button relay's route said nobody had pressed — pressed).
Artifact: `draft/backtest/sleeper_vs_fp_grade.json`. Prereg:
`draft/backtest/SLEEPER-VS-FP-PREREG.md`, committed before any number, decision
rule and blind predictions fixed in advance. Population: the 360-player
three-way intersection (QB 54 / RB 90 / WR 138 / TE 78), season 2025 — the one
season Sleeper's leak gates license. **N = 1 season. Nothing here is a
stationary measurement of a source's skill.**

## The preregistered decision rule, applied — no post-hoc metric touched

| pos | winner (rule 1, ties <0.01ρ) | blend vs better parent (rule 2) |
|---|---|---|
| QB | **Sleeper, clear** (0.7793, margin 0.0136) | **blend LOSES** (−0.0136 / −0.0152) |
| RB | **TIED** — blend_equal 0.8035 / blend_weighted 0.8033 / Sleeper 0.8032 | +0.0003, inside the tie band: a wash |
| WR | TIED between the two blends (0.7583 / 0.7580) | **blend BEATS better parent +0.0163** |
| TE | TIED between the two blends (0.8107 / 0.8101) | **blend BEATS better parent +0.0120** |

own_v6 as a SOLO source: loses to Sleeper at all four positions on this
population (QB 0.6933 · RB 0.781 · WR 0.7364 · TE 0.777). The first-ever
own-vs-Sleeper head-to-head — CORY-ASKS A2's long note concluded *"we have
never measured ourselves against Sleeper... zero seasons"*, and that was true
until this run and is now false: this is one season, shared population,
leak-gated. (`model_accuracy_v6`'s RB .7968 is a different population and a
naive-baseline bar; the numbers do not conflict, they answer different
questions.)

## The mandated mechanism statement (prereg: report it either way)

**The blend wins at WR/TE anyway, and it IS consistent with the correlation
measured here.** Sleeper|FantasyPros error correlation on this population is
0.93–0.97 — the regime where two-way averaging pays nothing, exactly as §5
found. But **own_v6's error correlation with each is 0.64–0.90**, and every
point of blend gain sits where own_v6 is close in solo skill (WR: own within
0.006 of Sleeper; TE: within 0.022) while the one blend LOSS is where own_v6
is far behind (QB: 0.086 behind). The 08-16 audit predicted this shape in
prose — *"every point of the blend's gain comes from own_v6, the only
partially-independent arm... it pays only where own_v6 is close in skill and
costs where it is not"* — and the numbers landed on it.

## The four blind predictions, graded

- **P1 TRUE** — Sleeper and FP within 0.05ρ at every position (max gap 0.029, QB).
- **P2 FALSE — the interesting one.** "No blend beats the better parent at
  more than one position" — it did at two decisively (WR, TE) plus an RB wash.
  Falsified for a reason worth keeping: P2 was reasoned from the TWO-WAY
  regime (Sleeper+FP, 0.94-correlated) and did not bind a THREE-way blend
  carrying a 0.64–0.90-correlated arm. The prereg's own mechanism check is
  what catches the difference.
- **P3 TRUE** — own_v6 won zero positions outright (≤ "at most one"), and lost
  QB as predicted.
- **P4 TRUE** — Sleeper over-projects on the shared population at all four
  positions: bias +24.95 QB, +13.01 WR, +3.38 RB, +1.03 TE.

## THE RULING (A, 2026-08-18)

1. **Nothing ships before 08-22.** The prereg fixed "Nothing ships" before any
   number; the no-change rule holds, same as the ceiling weight.
2. **Register 21 / CORY-ASKS A2 are no longer blocked on "no evidence exists."**
   The refusal's stated reason (no Sleeper per-player history for any graded
   season) was retired by `sleeper_hist_proj` (2025 clean) and the grade has
   now run on it.
3. **The post-draft recommendation to Cory, evidence-based and
   position-scoped:** QB stays pure Sleeper (the blend measurably loses);
   WR and TE take the three-way blend (beats the best single source, mechanism
   consistent); RB is a measured wash — default to no change there. This joins
   the ceiling weight and the ADP-sd ratchet as the THIRD decision waiting on
   Cory after Saturday.
4. **The caveats ride with it:** one season; Sleeper's file 7.1% hollow so the
   population is easier than the true one by an unbounded amount, identically
   for every arm; and the January 2027 grade of the frozen 2026 `proj_series`
   remains the first untouched evaluation — which is why register 41's
   weekly-capture holes stay the urgent item, not this ruling.

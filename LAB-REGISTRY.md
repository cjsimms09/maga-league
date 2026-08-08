# THE LAB — Experiment Registry (pre-registered, 2026-08-08)

Standing infrastructure per `docs/queued/the-lab.md`. **Every experiment is registered HERE with its pre-registered success criteria BEFORE it runs; results are append-only.** Ship rule (all experiments): beats champion on **held-out** data + beats the **null-search 95th percentile** + robot scenario + participation test + cited config. Everything else is documented, parked, re-run in September on quantile grading. Grading currency is **E[$]** under **era-correct per-season payouts** (`payouts.json.by_season`), decomposed (high-pool / entry / RS).

**State legend:** `spec` = written · `harness` = shared replay/MC harness built · `wf` = CI workflow wired · `run` = executed · `landed` = results in.

## Shared harness (build once — gates every experiment)
- Tier A historical replays (2023/24/25, era-correct payouts) · Tier B Monte-Carlo rooms (all slots, heterogeneous keeper configs keep-0/1/2/3, stress scenarios) · Tier C adversarial.
- Season cross-validation (tune-2 / hold-1, rotate) + 500-null luck baselines searching the SAME space.
- **State: CORE BUILT (2026-08-08).** The grading currency + honesty budget are live and validated:
  - `draft/backtest/money_grade.py` — **E[$] grading** under `payouts.json.by_season`; `grade_actual` reconciles to the pot on all three seasons, `grade_substituted` re-grades one seat's weekly-high + RS against the real field. (19 tests.)
  - `draft/backtest/roster_sim.py` — **roster → weekly scores** (best legal lineup from harvested actual player points); the draft→dollars bridge. Hindsight-ceiling denominator, documented. (10 tests.)
  - `draft/backtest/lab_stats.py` — **null-search baselines + leave-one-season-out CV + `ship_rule`** (beats null p95 AND positive every held-out season). (6 tests.)
  - `draft/backtest/lab.py` — **the registry runner**; runs harness-wired experiments, writes `lab-results.json` + `LAB-REPORT.md`. **`lab.yml`** runs it weekly (03:30 UTC Mon, ahead of the self-audit) + on any harness/data change.
  - **First experiment live — L0 (measurement):** weekly-high + RS dollars left on the table by lineup decisions — **+$470/470/595/445 per team** (2023/24/25). Proves roster→scores→dollars end to end.
- **Remaining harness piece:** the **draft-replay → per-season-roster → money** bridge (grow `run.js`/`replay.js` bundles into `roster_sim`-scored, `money_grade`-graded rosters) + **substituted-seat playoff resim** (reseed + bracket). That bridge unblocks the GATED draft-side experiments (1/2/19) below; the grading + gate machinery they need is already built and tested.

## DRAFT-SIDE slate (1–12) — prioritized ahead of mocks where compute allows
| # | experiment | pre-registered criterion | state |
|---|---|---|---|
| 1 | Strategy tournament (profiles+hybrids, money-graded, per-slot) | a strategy is a 'candidate' only if E[$] beats null-95th on held-out; per-slot conditional edges via §6 rules | spec (`strategy-hunt-learning-seed.md` S/N) · no wf |
| 2 | Auto-adjuster policy tournament (phase shapes, event responses, conditional rules) | H1 phase-shape beats all 3 rivals + null-95th on held-out; §5/§6 pre-reg | spec (`auto-adjuster-tuning.md` §5/§6) · no wf |
| 3 | Slider micro-sweeps (7 weights, ±50% around champion) | a slider "matters" only if its perturbation moves E[$] beyond the noise band; else FROZEN | spec · no wf |
| 4 | Flex-pricing validation (D3 marginal vs full-VORP, full tournament) | D3 keeps its place only if it beats full-VORP on held-out E[$]; else revert (prior value recorded) | spec · D3 shipped, tournament-grade pending |
| 5 | LRM threshold tuning (elite-cliff / startable swept) | acting ±1 pick earlier ships only if it moves E[$] past null | spec · no wf |
| 6 | Stack/correlation dose-response (bonus 0→3×) | ship the magnitude where high-pool gain stops paying the floor cost, if it clears null | spec (`money-function.md`) · no wf |
| 7 | Ceiling-term dose-response (per phase) | validates §5 H1; ship per-phase only where the interval clears the default | spec · no wf |
| 8 | Survival-model calibration + alternatives (Backtest R2 §3.1) | Brier on ~450 preds; the alt ships only if it beats current on held-out Brier AND E[$] | spec (`backtest-round-2.md`) · backtest.yml partial |
| 9 | Behavior-ADP split test (Sleeper-board vs FFC pricing) | ship behavior-ADP only if it beats FFC on opponent-prediction Brier + E[$] | spec · no wf |
| 10 | Slot-conditional strategy (best strategy × 10 slots) | report per-slot winners; a slot-conditional rule ships only if machine-detectable + held-out (per §6) | spec · no wf |
| 11 | Keeper-decision retro (2024/25 keeps under optimizer) | grades K0 logic vs history; informational unless it clears null | spec (K0 docs) · no wf |
| 12 | Pick-trade valuator calibration (within-1-round offers vs replay) | valuator ships only if priced offers track replay outcomes across MC rooms; honors the 1-round rule | spec (`payouts.rules`) · no wf |
| **19** | **Archetype tournament** (Zero-RB / Hero-RB / Robust-RB / WR-Anchor / Elite-TE-Anchor / Early-QB / Late-QB / Balanced-BPA-control) as sequencing-constraint overlays | an archetype "wins" only if its E[$] beats Balanced-BPA control + null-95th on held-out; raced LEAGUE-GENERAL (all slots, varied keepers) AND CORY-CONDITIONAL (my seat, keepers locked) | **spec — PRE-MOCK priority** (experiment-1-adjacent, shares harness) · no wf |

### Experiment 19 — THE ARCHETYPE TOURNAMENT (detail; PRE-MOCK)
Race the named positional doctrines under OUR rules + money. **Each archetype is a sequencing-CONSTRAINT overlay** on the engine — the composite still picks the best player WITHIN the constraint:
- **Zero-RB** (no RB before live round ~6) · **Hero-RB** (one RB in first two live picks, then none until late) · **Robust-RB** (2–3 RB in first four) · **WR-Anchor** (3 WR in first four) · **Elite-TE-Anchor** (TE in first two — the Bowers question formalized) · **Early-QB** (QB in first three — does 6-pt passing TD justify it?) · **Late-QB** (no QB before round ~8) · **Balanced-BPA** (no constraints — the CONTROL).

**Raced two ways:** (a) **LEAGUE-GENERAL** — every archetype from every slot across Monte-Carlo rooms with varied keeper configs → "what wins in this league's economy"; (b) **CORY-CONDITIONAL** — from my ACTUAL seat, keepers locked (Henry+Walker+Chase = I already START Robust-RB-shaped, which pre-answers part of it — the real query is what sequencing wins FROM that base: do I ever draft another early RB; when does TE/QB/WR-heavy pay).

**Grading:** full money — E[$] decomposed (high-pool / entry / RS), era-correct per-season payouts, harvested per-week thresholds, efficiency-adjusted opponents, 500-null baselines, season cross-validation. Same gates as everything.

**Deliverables:** the archetype leaderboard BOTH ways; **league-specific verdicts called out explicitly** (does 6-pt passTD move QB timing vs consensus? does half-PPR + 10-team kill Zero-RB's edge? does the high pool reward ceiling-heavy builds?); and **the Cory-conditional winner feeds DIRECTLY into the opening script + the Paths panel's direction-naming** — path cards speak archetype language ("this is the Hero-RB branch") where the tournament shows a doctrine matters.

## IN-SEASON slate (13–18) — graded on replayed 2023–25; lands before week 1
| # | experiment | pre-registered criterion | state |
|---|---|---|---|
| 13 | Lineup-policy tournament (projection vs dual-objective vs threshold-chase) | dollar-optimizer ships only if it beats naive start-your-studs on held-out E[$] (3 bench-decided highs predict yes — measure it) | spec (`in-season-master.md`) · no wf |
| 14 | High-chase trigger tuning (chase/protect boundary swept) | ship the trigger that maximizes E[$] vs the week's threshold distribution, if it clears null | spec · no wf |
| 15 | Waiver claim policy (aggressive vs selective; FA-speed value) | quantify FA-speed edge from transaction history; ship the policy that clears null | spec (`season-readiness-kit.md`, no-FAAB) · no wf |
| 16 | Streaming rules (DST/K stream vs hold) | ship a streaming policy only if it beats roster-and-hold on held-out E[$] | spec · no wf |
| 17 | Efficiency-adjusted opponent projections | validate matchup layer: observed-efficiency vs optimal-lineup at predicting real opponent scores (Brier/MAE, 3 seasons) | spec (Phase $ refinement) · no wf |
| 18 | Trade-radar acceptance thresholds (priced offers vs replay) | ship thresholds only if priced offers track replay outcomes | spec · no wf |

## Program cadence
- **Weekly LAB REPORT appends to the Sunday self-audit** (`self-audit.yml`): experiments run, results landed, winners shipped, noise discarded — one table.
- September: entire slate re-runs on quantile grading; August verdicts provisional and labeled.
- The 2026 shadow season is the final arbiter; January grades the Lab itself in realized dollars.

## ⚠️ Honest state (2026-08-08, updated)
All 18 + Exp-19 are **registered (pre-reg criteria locked)**. **Harness CORE is now BUILT and CI-wired** (see Shared-harness section): E[$] grading, roster→scores bridge, null/CV honesty budget, the registry runner, and `lab.yml` — 35 harness tests green, one measurement experiment (L0) running weekly. **What remains:** the **draft-replay → money bridge** (turn the existing points-graded `run.js`/`replay.js` bundles into money-graded per-season rosters) and the **substituted-seat playoff resim**; those two unblock the gated draft-side experiments (1/2/19). Their grading + gates are done — porting is now wiring, not new infrastructure. Next increment: (a) money-grade the strategy bundles (Exp-1), (b) archetype overlays on the replay (Exp-19), (c) the playoff resim so `grade_substituted` returns full-season E[$].

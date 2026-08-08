# THE LAB — Experiment Registry (pre-registered, 2026-08-08)

Standing infrastructure per `docs/queued/the-lab.md`. **Every experiment is registered HERE with its pre-registered success criteria BEFORE it runs; results are append-only.** Ship rule (all experiments): beats champion on **held-out** data + beats the **null-search 95th percentile** + robot scenario + participation test + cited config. Everything else is documented, parked, re-run in September on quantile grading. Grading currency is **E[$]** under **era-correct per-season payouts** (`payouts.json.by_season`), decomposed (high-pool / entry / RS).

**State legend:** `spec` = written · `harness` = shared replay/MC harness built · `wf` = CI workflow wired · `run` = executed · `landed` = results in.

## Shared harness (build once — gates every experiment)
- Tier A historical replays (2023/24/25, era-correct payouts) · Tier B Monte-Carlo rooms (all slots, heterogeneous keeper configs keep-0/1/2/3, stress scenarios) · Tier C adversarial.
- Season cross-validation (tune-2 / hold-1, rotate) + 500-null luck baselines searching the SAME space.
- **State: SPEC ONLY — harness not yet built.** This is the critical-path blocker; everything below waits on it. Backtest R2's `draft/backtest/` replay is the seed to grow into Tier A.

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

## ⚠️ Honest state (2026-08-08)
All 18 are **registered (pre-reg criteria locked)** but **0 have a functional CI workflow** and the **shared harness is not built**. The next build increment is: (a) grow `draft/backtest/` into the Tier-A/B/C harness with per-season payout grading, (b) a `lab.yml` workflow triggered on harvest completion + weekly schedule that runs the registered experiments and appends the Lab report, (c) port experiments 1–2 (Strategy Hunt, Auto-adjuster) onto the harness first (draft-relevant, ahead of mocks). Harvest completion (2025 wks 7–15, all 2023 matchups, transactions) gates Tier A — it is the upstream dependency.

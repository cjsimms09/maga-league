# THE LAB — Master Backtest Program (Everything Tunable Gets Tested)

Standing infrastructure, not a one-off: a permanent experiment registry + the shared replay/Monte-Carlo harness + CI workflows that run continuously and report weekly. The philosophy: run MAXIMUM experiments, ship MINIMUM winners — every conclusion must clear held-out validation and the null-search luck baseline, because three real seasons is a small sample and the Monte Carlo tiers add power, not truth. Champion-challenger everywhere: current config is champion; challengers replace it only through the gates.

## 1. The harness (build once, every experiment uses it)
- Tier A: historical replays (2023/24/25 real drafts + seasons, era-correct payouts per master sheet)
- Tier B: Monte Carlo rooms/seasons from opponent behavior models + score distributions (thousands of runs; all slots; heterogeneous keeper configs; stress scenarios)
- Tier C: adversarial rooms biased against each candidate's assumptions
- Grading: E[dollars] under the era-correct payout config, decomposed (high-pool / entry / RS); process metrics beneath
- Validation: season cross-validation (tune on 2, hold out 1, rotate) + 500-null luck baselines that search the SAME space as the real search
- Registry: every experiment = a spec entry (hypothesis, knobs, metric, pre-registered success criteria) BEFORE it runs; results append-only

## 2. The experiment slate — DRAFT SIDE
1. **Strategy tournament** (running): all profiles + hybrids, money-graded, per-slot conditional results
2. **Auto-adjuster policy tournament** (specced §5/§6): phase shapes, event responses, conditional rules
3. **Slider micro-sweeps**: each of the seven weights independently perturbed ±50% around champion — sensitivity map showing which sliders actually move E[dollars] (the knob report generalized)
4. **Flex-pricing validation**: D3's marginal-over-best-flex vs full-VORP, full-tournament graded (not just pick-34 reorder)
5. **LRM threshold tuning**: elite-cliff and startable thresholds swept — does acting one pick earlier/later on onesies move money?
6. **Stack/correlation dose-response**: stack bonus magnitude swept 0→3x; find where the high-pool gain stops paying for the floor cost
7. **Ceiling-term dose-response**: same for upside weighting, per phase (feeds/validates the §5 hypothesis)
8. **Survival-model calibration + alternatives** (Backtest R2 §3.1): current model vs behavior-ADP-informed vs simple-ADP — Brier-scored on ~450 historical predictions, then E[dollar] impact of the calibration differences
9. **Behavior-ADP split test**: Sleeper-board opponent prediction vs FFC value pricing (the pending validation, formalized)
10. **Slot-conditional strategy**: does the best strategy CHANGE by slot (turn vs middle)? Full tournament × 10 slots
11. **Keeper-decision retro**: replay 2024/25 keeper choices under the optimizer — would different keeps have earned more? (Grades K0's logic against history)
12. **Pick-trade valuator calibration**: within-one-round trade offers priced by the valuator vs replay outcomes across Monte Carlo rooms

## 3. The experiment slate — IN-SEASON (graded on replayed 2023–25 seasons)
13. **Lineup-policy tournament**: pure-projection vs dual-objective (high-chase) vs threshold-triggered chase — replayed over every historical week; does the dollar-denominated optimizer beat naive start-your-studs, and by how much? (The 3-bench-decided-highs say yes; measure it)
14. **High-chase trigger tuning**: WHEN should the optimizer gamble for the weekly high (my projected score vs the week's threshold distribution) — the chase/protect boundary swept
15. **Waiver claim policy**: aggressive-claim vs selective, claim-ordering rules, FA-speed value quantified from transaction history (who was available Wednesday vs Sunday)
16. **Streaming rules**: DST/K streaming policies replayed vs roster-and-hold — weekly matchup-based streams graded across three seasons
17. **Efficiency-adjusted opponent projections**: validate the matchup-exploitation layer — do observed-efficiency projections beat optimal-lineup projections at predicting real opponent scores? (Brier/MAE, three seasons of evidence)
18. **Trade radar acceptance thresholds**: simulated trade offers priced by the engine vs replay outcomes

## 3b. STANDING AUTO-FIRE RULE (added 2026-08-08 — power-through applies to the Lab)
**No experiment ever waits for a session to decide it's time.** An experiment whose dependencies are green FIRES AUTOMATICALLY on the next Lab run. Analysis work never queues behind human events.

**The ONLY legitimate gates — nothing else may hold an experiment:**
1. **Cory's inputs** (a decision only he can make)
2. **External events** (slot claims, keeper designations, the Sleeper draft room existing)
3. **Season data that does not exist yet** (September quantile model; in-season experiments 13–18; shadow grading)
4. **The draft-path code FREEZE at final mock** — and this protects the **SURFACE ONLY**. Lab, CI, and site-backlog work continue unrestricted through draft week and forever.

"Queued behind mocks", "after the draft", "when there's time" are **NOT gates** and must never appear as an experiment's state. If an experiment is runnable, it runs; if it is gated, the registry names WHICH of the four gates and why. Mechanically enforced: `lab.yml`'s local-input experiments re-run every Lab invocation, and egress-dependent ones re-run behind the bridge gate — so a dependency turning green fires the experiment without anyone noticing it turned green.

## 4. Program rules (the honesty budget)
- Pre-registration mandatory; the registry entry precedes the run
- Multiple-comparisons discipline: with this many experiments, the null baselines are the significance floor — an "edge" the nulls reproduce is noise, reported as such
- Ship rule per experiment: beats champion on held-out data + beats null 95th percentile + robot scenario + participation test + cited config. Everything else: documented, parked, re-run in September on quantile grading
- Weekly LAB REPORT (append to the Sunday self-audit): experiments run, results landed, winners shipped, noise discarded — one table, standing cadence
- September: the entire slate re-executes on quantile-model grading; August verdicts are provisional and labeled
- The shadow season is the final arbiter: Lab winners inform the 2026 draft; 2026's realized dollars grade the Lab itself in January

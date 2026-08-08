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

## RESEARCH-DRIVEN slate (20–30) — literature imports, all registry-and-gates (added 2026-08-08)
Every one enters as a **prior with sample-size credibility** and must survive OUR harness (league-conditional, money-graded, null + CV) before touching the engine — **big foreign data proposes, our data disposes.** Priority: **20, 21, 24, 25, 26 are draft-relevant** — run with the pre-mock batch if compute allows; 22, 27–30 queue behind (22 is a September quantile-build item).

| # | experiment | pre-registered criterion | state |
|---|---|---|---|
| 20 | **Herding fade** — QB & K/DST herding is published (Cambridge/Sleeper); test fading herd-shaped runs (the counter-move's $ value) AND scan our 3 seasons' dossiers for the herding signature | a fade rule ships only if its E[$] beats no-fade + null-95th on held-out; the herding signature is reported as opponent-model input regardless | **spec — PRE-MOCK** · no wf |
| 21 | **Mean-variance frontier point** — build the efficient frontier (proj points vs roster variance, Penn-State formulation), locate where E[$] peaks under OUR payouts | **H: the E[$] optimum sits meaningfully toward the HIGH-variance corner** vs the low-variance point standard leagues favor; ships the variance posture only if it clears null on held-out $. **Subsumes** ceiling-term (7) + stack dose-response (6) into one question | **spec — PRE-MOCK** · no wf |
| 22 | **Team-context projection layer** (September, quantile-build) — team-level-first forecasts (similarity-score team totals allocated to players) + role-change/momentum features vs current blend | the team-context structure ships only if it beats the current blend on held-out Brier AND E[$] | spec — SEPT · no wf |
| 23 | **Pick-trade prior (Massey-Thaler loser's curse)** — earlier picks systematically overvalued; encode a **trade-DOWN lean** in the valuator's priors | the down-lean ships only if priced offers track replay outcomes better than the neutral prior, honoring the 1-round constraint | spec · no wf |
| 24 | **Best-ball roster-construction translation (BBM)** — nearest published analog to our weekly-high economy (spike weeks, not H2H); test winning-roster positional allocation rates + the **spike-week** framing (grade by spike-week COUNT, not mean) | a BBM-derived allocation/spike rule ships only after surviving our money-graded harness; **a spike-week column earns the board only if spike-count predicts roster $ better than mean-proj on held-out** | **spec — PRE-MOCK** (BBM ingestion feeds it) · no wf |
| 25 | **The RB dead zone** — RBs drafted rounds 3–6 underperform ADP while WRs hold; test whether it exists in our data/sims + whether the engine carries an explicit dead-zone discount | the discount ships only if the dead zone is present at our sample + clears null on held-out $; **directly shapes my picks 34–61** | **spec — PRE-MOCK** · no wf |
| 26 | **Konami-code QB premium** — rushing QBs carry higher floor AND ceiling; our 6-pt passTD + rush yards may make it LARGER here; quantify rushing-QB premium in OUR scoring (Lamar/Daniels-class vs pocket at equal proj) | report the premium in our scoring; a rushing-QB tilt ships only if it clears null on held-out $; **feeds the Early-QB-Strike doctrine's target list** | **spec — PRE-MOCK** · no wf |
| 27 | **Championship-week stacking** — upgrade the playoff-SOS term: wk16–17 CORRELATED exposure (two starters in a soft title-week matchup, or stacked) multiplies title-week ceiling | a wk16–17 stack-alignment term ships only if it moves entry→title conversion on sims past null | spec · no wf |
| 28 | **Ambiguous-backfield fliers** — unsettled backfields (no declared starter) as late targets (any resolution mints a startable RB); flier ROI of ambiguity vs settled-backup handcuffs (handcuff question rides along — mostly debunked ex-elite offenses) | the ambiguity-flier lean ships only if its late-round $ ROI beats the handcuff baseline on held-out | spec · no wf |
| 29 | **Availability curves** — replace the flat risk-penalty input with data-driven games-played distributions (position, age, injury-history class) | availability-adjusted projections ship only if they grade better than point-estimate-minus-penalty on held-out | spec · no wf |
| 30 | **Recency-bias trade timing** (in-season) — buy-after-bad-week / sell-after-spike, tested vs our sparse trade history + simulated markets (the desperation-index's academic cousin) | a timing rule ships only if it beats neutral timing on held-out $ | spec · no wf |

**Two validation notes for the record (cite in the opponent-model docs):**
- **Our behavioral-dossier approach IS the Cambridge paper's explicitly-named future work** — the dossiers operationalize exactly the opponent-behavior modeling that paper flags as the open direction. Cite it where the opponent model is documented.
- **The paper's "no universal optimal strategy — it depends on your room" finding is the formal justification for the league-conditional tournament design** (experiments 1/10/19 raced Cory-conditional and per-slot). Our whole tournament architecture is that finding, applied.

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
All 18 + Exp-19 + the research slate 20–30 are **registered (pre-reg criteria locked)**. **Harness CORE is now BUILT, CERTIFIED, and CI-wired** (see Shared-harness section): E[$] grading, roster→scores bridge, null/CV honesty budget, the registry runner, and `lab.yml` — 43 harness tests green, one measurement experiment (L0, the efficiency leak) running weekly.

**THE CERTIFICATION GATE (Cory's order, load-bearing):** `test_money_grade_certification.py` reproduces all three seasons' actual money tables **to the dollar** (external anchors Cory 2023=$400, mhagen 2025=$1,325 both match; full per-owner table locked). It is the **first gated step in `lab.yml`** AND enforced in-process (`lab.certify_grader` — `run_all` refuses to grade a single experiment on an un-certified grader). No experiment consumes the grader until this is green; the efficiency-leak finding is the same machinery, so a green gate certifies it too.

**THE HARNESS'S FINAL INCREMENT — the draft-replay → money bridge (with its CI dependency stated):** turn the points-graded `run.js`/`replay.js` bundles into money-graded per-season rosters + the **substituted-seat playoff resim**. **Its real test belongs in CI, not the sandbox** — `bundles.json` is gitignored and building it needs nflverse/FFC egress, which only works in the Lab workflow. So the next session's work is **writing the bridge test as its own GATED step in `lab.yml`** (bridge test green → THEN experiments consume the full replay path), NOT re-litigating where it runs. Once that step is green the gated draft-side experiments (1/2/19, and the money-graded parts of 20/21/24/25/26) can run. Grading + gates are done — this is wiring, gated on CI egress.

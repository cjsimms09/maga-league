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

## 🧪 EXPERIMENT 2 §5/§6 — FIRED 2026-08-08 (`POLICY-TOURNAMENT.md`): **H1 REFUTED, defaults hold**
**§5 phase shapes — the hand-designed champion WINS.** H1 phase-shape (modest core + aggressive floor-free endgame) **−$31/season** vs defaults (CI [−48, −16] — the loss is real, not noise); uniform boom −$49; floor-heavy −$119. **H1 is refuted, and the per-phase grid says exactly why:** endgame ceiling **0.5 is BETTER (+$19, CI [7.5, 33])** but **1.0/2.0/3.0 are all WORSE with CIs excluding zero** — the endgame optimum is MODEST, not aggressive. Core: every tilt from 0.25–2.0 straddles the default (**"no evidence of a shift there"** — reported, never nudged); only ceiling-0 is worse. **Cross-experiment consistency:** exp 21 independently found the same inverted-U (moderate tilt +$55, λ=3 −$27). Two experiments, different controls, same shape.
**§6 guard COMPLETED 2026-08-08 (Cory's four mirror checks).** (1) The incidence band now bites BOTH ways — `>85%` = **GLOBAL** (a constant wearing a state label) and `<10%` (or n<20) = **INSUFFICIENT-N** (too rare to estimate; report the incidence, never a verdict); the two rejections fail for opposite reasons and are never conflated. (2) **Null parity by construction:** the null miner calls the SAME `mine_conditional`, so it faces the identical partition requirement — otherwise we'd compare real partitioned rules against null degenerate ones and flatter ourselves. (3) Rejected states are **logged in the report with their classification and reason** ("fires in ~every room — folded into the GLOBAL domain; do not re-propose as a condition") so the same costumed globals don't come back next iteration. (4) The **pre-registered expectation is printed in the report itself**: surviving rules will be few, per-state n small, most landing INSUFFICIENT-N or LEAN — *a short list of real conditions beats a long list of costumed globals*, and zero shipping rules is the guard working, not the experiment failing. **⚠️ `run_pressure` AT 0% — A MODEL FINDING, AND MY DIAGNOSIS OF IT WAS ALSO WRONG (corrected 2026-08-08).** Cory's catch was right and the audit it forced (`SIM-FIDELITY.md`) found the true cause, which was neither "runs are rare" nor what I first blamed:
- **Positional runs are real and frequent in our league** — measured across all three real drafts: **46% of picks sit inside a run, ~20 runs per draft** (≥3 of one position in a 5-pick window, computed identically on real and simulated sequences). Reporting 0% as if it were a league fact was exactly the error Cory named.
- **My stated cause — "the sim can't generate runs because opponents are independent" — is REFUTED BY MEASUREMENT.** The independent sampler already reproduces real run frequency at every definition tested (3-of-5: real 19.7 vs sim 21.7 runs/draft; 4-of-5: 7.7 vs 7.3; 5-of-5: 0.7 vs 0.9). The herding term was built, parameterized and **fitted from our own three seasons anyway — and the fit came back at 1.0 (negligible), with magnitude 8 OVERSHOOTING sevenfold** (5-of-5: 5.3 vs real 0.7). The data did not demand the mechanism it was hypothesized to need.
- **THE ACTUAL CAUSE: a broken binarizer.** Run counts cluster tightly across rooms (19–25, four distinct values). The naive `> median` split put the median at 22 and left only **8% of rooms strictly above it** — so a real, frequent phenomenon was made invisible by the *threshold rule*, not by the simulator. Fixed: the binarizer now searches observed values for the cut landing incidence closest to 50%, which handles clustered integers correctly. **`run_pressure` now partitions at 85/120 rooms and is fully testable**; all three states partition and **zero states are rejected**.
- **Same class as the degeneracy guard, one level deeper:** the measurement was structurally unable to see the thing, and the first explanation for that was also wrong. Both are now caught by machinery rather than by noticing.
**Still open and honestly listed:** run STRUCTURE (who runs, on what trigger) is not validated by frequency matching; `runs_per_draft` remains outside tolerance in the fidelity table; my-turn-adjacency is not instrumented. All three are in `SIM-FIDELITY.md`'s **standing limitation section** — states the experiments cannot yet test.

**§6 conditional mining — ZERO rules clear.** Best in-minus-out contrast +$23.77 vs a conditional null p95 of **$50.21** (the null mines the SAME policy×state grid over permuted state labels, as §6 requires). All rows → **LEANS on the manual-override cheat sheet, never automated.** **A methodological catch worth keeping:** the first run's states (`run_fired_early`, `endgame`) fired in **120/120 rooms** — constants, not conditions, whose "conditional" edge was the global edge wearing a state label. A **degeneracy guard** now excludes any state firing in <15% or >85% of rooms and reports it as non-partitioning; states are median-split so they genuinely partition, and the claim is in-state MINUS out-of-state, so "wins in this state" can't mean "wins, and this state happened."

## 📊 EXPERIMENT 6 — FIRED 2026-08-08 (`STACK-SWEEP.md`): **stacking pays, and the first partner is the value**
Dose 0.5× **+$67.50** (CI [45, 93]) · 1.0× +$64 · 1.5× +$56 · 2.0× +$55 · 3.0× +$56 — every dose clears, but the curve **saturates immediately**: the answer to "where does the high-pool gain stop paying for the floor cost" is that the FIRST stack partner captures it and forcing 5 same-team starters adds nothing. **Honest caveat:** the grading model applies a within-team weekly correlation (rho=0.35) that the sweep is pricing — the benefit is real *given that rho*, so this is a **LEAN pending the September quantile model's real correlation structure**, not an install.

## 💰 THE MONEY FUNCTION IS COMPLETE — playoff $ now graded (2026-08-08, `PLAYOFF-MONEY-VALIDATION.md`)
**Playoff money is 53% of the pot ($2,125 of $4,000) and every verdict on record was measured without it.** The bracket resim landed — format **derived from** the harvested brackets (4 teams by RS rank, 1v4 / 2v3, final + third-place game, round *r* in week `playoff_week_start + (r-1)`) and reproducing **all 12 games across 2023/24/25**. Certified inside `lab.certify_grader`, so nothing grades on an uncertified bracket. `grade_substituted` pays playoffs with three unmixed outcomes (missed → $0 exact · made + replay covers the playoff weeks → real dollars · made + replay stops at week 15 → **withheld**, because pairing one strategy's regular season with the incumbent roster's playoffs is a number about nothing). Anchor: replaying a seat with its own actual scores reproduces its real grade to the dollar, playoff money included, for every roster in every season.

**PRE-REGISTERED RE-RUN — every simulated verdict re-measured. Most survived and grew; ONE REVERSED.** WR Feast **+$91.50 → +$187.25**, Late-QB **−$61 → −$212**, frontier λ=0.5 **+$70.67 → +$171**, over-dosing (λ=2/3) still negative, stack peak 0.5× +$80.42 → **+$204.58** (still a LEAN, still not installed), §6 still clearing **zero** rules (null floor scaled $65.83 → $157.23 with the money). **The reversal: H1's early-weighted ceiling ramp goes −$37.29 REFUTED → +$226.50 [168, 288], the best candidate in the sweep** — the playoffs are a two-week single-elimination tournament, so variance pays there in a way sixteen accumulating weeks never showed. **This bears on D9, which was installed on the incomplete money function; NOTHING was changed and it is filed as 🚨 D11 in `DECISIONS-NEEDED.md`.**

**A GATE GAP THIS EXPOSED, now closed.** On the complete money function Early-QB Strike posts a higher mean than WR Feast (+$200.62 vs +$187.25), and the old rule — highest mean among those clearing the control — would have flipped the enrolled doctrine. The paired head-to-head is **+$13.38, CI [−$53.75, +$78.00]: not separable.** A **head-to-head gate** now follows the control gate — the leader enrolls only if it beats the runner-up by more than the even-money band with a CI clear of $0; otherwise they are co-leaders and the **incumbent is retained** (the doctrine banner's hysteresis principle, applied to the doctrine itself). WR Feast stands because nothing beat it, not because it won. The gate is not a ratchet — a leader that separates still takes the plan, and there is a test for that.

**Standing limitation added:** bracket seeding in the simulated rooms is by season TOTAL POINTS (those rooms have no schedule, hence no record); the real league seeds by wins. Points-seeding is *less* noisy than the real rule, so it likely **understates** the playoff variance premium rather than manufacturing it.

## 🏆 EXPERIMENT 19b — CORY-CONDITIONAL VERDICT (2026-08-08, `CORY-CONDITIONAL.md`)
**WR FEAST ENROLLED AS THE PLAN: +$86/season vs Balanced (paired bootstrap CI [70, 103]), on 1.9 contested decisions/draft; runner-up Early-QB Strike +$65 (0.5 decisions — the Lamar window); Late-QB provably burns −$61.** Zero-divergence archetypes (zero/hero/robust-RB, elite-TE) graded IDENTICAL to control — their constraints never bind from my keeper base on the predicted board, which is the method proving itself, not a bug. Machinery: 200 paired rooms (opponents ADP-softmax on the predicted board, candidate+control share room AND weekly luck), v1 money proxy (proj-normal weeks, weekly-high+RS, playoff-$ excluded), **September quantile re-run pre-registered**. Enrollment flows mechanically: `cory-conditional.json` → opening script doctrine block (done) → doctrine banner + Paths vocabulary (**DONE 2026-08-08 — see below**). Regenerates with the board+slates in `draft-data.yml`.

**✅ THE VERDICT NOW REACHES THE SCREEN (2026-08-08).** The enrollment path is closed end to end, one fact with one home: `cory_conditional.py` decides → `cory-conditional.json` holds → `build._load_doctrine()` stamps the artifact's `doctrine` block → `doctrine.js` renders the banner. **`stamp_doctrine.py` re-stamps an already-built artifact** (and runs in `lab.yml`) because the verdict re-races on every harness change while the board rebuilds only on the egress schedule — without it a fresh verdict would sit in the Lab waiting on an unrelated projection build. A missing or retracted verdict un-stamps and the banner honestly runs the control; it never renders a plan the Lab did not race. **Vocabulary is now the LAB's**: `doctrine.js` is keyed by the archetype keys (`wr_anchor`, `late_qb`, …) so no translation table can drift, and `test_doctrine_parity.py` drives BOTH `make_archetypes()` and `LIVE_CONSTRAINTS` over the same grid demanding identical allow/deny — mutation-checked (a one-character change to one window fails it). **Two different dollars, labelled differently:** the banner cites 19b's +$91.50 as the *season* edge of the enrolled plan, and computes a separate *this-pick* gap (best player the doctrine allows, priced by `playerDollars`) — conflating them would invent precision neither number has.

## 📈 EXPERIMENT 21 — FRONTIER VERDICT (2026-08-08, `FRONTIER.md`; + exp 2's phase-shape slice)
**H1 SUPPORTED — the E[$] optimum sits toward the high-variance corner, and the dose-response is an inverted-U:** moderate ceiling tilt WINS (flat λ=0.5 **+$55.50/season**, CI [33,78]; λ=0.25 +$44; all paired-CI clear), heavy tilt LOSES with the CI excluding zero (λ=3 **−$27** — pure boom-chasing is provably bad money). **Exp 2's §5 phase-shape H1 (late-round boom-chasing) NOT SUPPORTED — inverted:** EARLY-ramp λ=1 (+$56) ≫ LATE-ramp λ=1 (+$5); the ceiling money is in early rounds among near-equals, not late lotteries. Same paired-room machinery as 19b, same v1-proxy caveats, September quantile re-run pre-registered. **INSTALL: cleared its in-experiment gate but the environment is a proxy (simulated rooms, no held-out season) — routed to DECISIONS-NEEDED (D9) as a proposed ceiling-slider change for Cory's sign-off; NOT self-installed.** Exp 2's full policy tournament (event responses, §6 conditional rules) remains spec-only — the phase-shape slice is answered; the event-response half queues behind mocks.

## EXPERIMENT 31 — PLATFORM ANCHORING (registered 2026-08-08)
**Hypothesis (Cory):** the room over-relies on Sleeper's default board. **(1) Historical adherence** per manager, 3 seasons: deviation from platform-visible ordering vs from market (FFC, held historically). **DATA CAVEAT RESOLVED: historical Sleeper default rankings for 2023–25 are NOT archived** (we hold picks, not rankings-at-time) → adherence measures against the best platform proxy and is **confidence-capped at LEAN**, per pre-registration. Per-manager adherence sharpens every dossier ("Sadbru: 91% platform-adherent" is a prediction machine). **(2) THE 2026 DELTA BOARD — data source SHIPPED:** `build.py` now emits `sleeper_rank` per player; next artifact build carries it → FALL LIST (Sleeper < market: the room lets them slide) + REACH LIST (Sleeper > market: the room pays retail-plus; I never do), Zone-3 render + board badges ("📉 Sleeper sleeps on him, −14 vs market"), confidence-tiered. **(3) The exploit gates:** survival's opponent basis becomes Sleeper-rank ONLY if historical adherence confirms (the behavior-ADP split validated through the gates); cpu_autopick = 100% adherent, known. **(4) Pre-registered null:** where the two boards agree, adherence is unmeasurable and the experiment SAYS so; the delta lists stay useful as divergence intel either way, LEAN-tiered.

## 🧬 DOSSIER-DRIVEN OPPONENT MODEL — BUILT + EVERY VERDICT RE-VALIDATED (2026-08-08)
`opponent_model.py` replaces nine identical ADP-softmax agents with **per-seat models fitted from three seasons of real drafts** (`manager_profiles.json`, shrinkage-weighted, real ADP coverage). Seats now genuinely differ — ds7mmet **QB×1.38 / TE×1.54**, Jreis **RB×1.44**, Sadbru DEF×1.35 — and **ds7mmet's documented round-5 QB pattern emerged from the picks alone**, never told to the model.

**PRE-REGISTERED VALIDATION (question written before the answer): every verdict landed before this switch was measured against HOMOGENEOUS rooms. All were re-run. ALL SURVIVED; TWO STRENGTHENED** — WR Feast **+$86 → +$91.50** (CI [74, 109]), the frontier peak **+$55.50 → +$70.67**, H1's refutation deepening −$31 → −$37, Late-QB still burning, §6 still clearing zero rules. Full before/after table in `HETEROGENEOUS-VALIDATION.md`. The doctrine enrollment, the D9 install and the D10 stand-down all stand on the more realistic room.

**A defect the comparison itself caught:** `policy_tournament`'s room loop initially bypassed the new opponents and returned numbers IDENTICAL to the homogeneous run — identical output across a real change is a defect signature, not a result. Now routed through the same per-seat picker as every other experiment. **Still open:** platform adherence stays OUT of the model (historical Sleeper rankings unarchived — exp 31's caveat, not guessed); my-turn adjacency remains uninstrumented; run structure unvalidated. All three are standing limitations, not silent gaps.

## 🧭 STANDING META-FINDING — EVERY DOSE-RESPONSE SO FAR IS INVERTED-U AT MODERATE DOSE
Three independent sweeps, three different knobs, one shape:
- **exp 21** ceiling tilt: peak at λ=0.25–0.5 (+$44…+$56), **negative** by λ=2–3 (−$18, −$27 with CI excluding zero).
- **exp 2 §5** endgame ceiling: 0.5 **better** (+$19, CI [7.5, 33]); 1.0/2.0/3.0 **all worse**, CIs excluding zero.
- **exp 6** stack bonus: peak at 0.5×, flat-to-declining through 3× — saturating rather than inverting, but the same "moderate captures it" story.

**PRE-REGISTERED for every remaining sweep (written before those sweeps run):** the expected shape is **inverted-U with the optimum at a MODERATE dose**. Therefore **a full-throttle "winner" — a sweep whose best value sits at the top of its tested range — gets EXTRA SCRUTINY before any install**: extend the grid past the apparent optimum (an edge of the grid is not an optimum, it is an unfinished sweep), check whether the CI at the extreme is genuinely separated from the moderate values, and treat "more is always better" as a likely artifact of a mis-specified cost until proven otherwise. Cited whenever a dose-response result is reported.

## 🛑 D10 — STOOD DOWN (Cory, 2026-08-08): stack stays at 1.0
Exp 6's peak-at-0.5 finding is a **LEAN priced against a MODELED rho (0.35)**, not a measured correlation — and **installing on a modeled parameter would break D9's own conservatism standard** (D9 installed on a measured dose-response with the environment caveat stated; this one's key input is an assumption). **Nothing installed. The stack weight remains 1.0.** The peak-at-0.5 finding is **pre-registered for September's quantile re-run**, when the quantile model supplies real correlation structure. **The DISPLAY correction ships now** (Stack Routes: single-partner ranks first, double-stack marginal shown as ~$0) because that is a faithful presentation of the measurement, not an engine change.

## 🔥 THE GATE SWEEP (2026-08-08) — power-through applied to the Lab

Cory's correction: "queued behind mocks" was never a gate. Every experiment re-audited against the FOUR legitimate gates (Cory's inputs · external events · season data that doesn't exist · draft-path SURFACE freeze). **Result: 3 experiments were wrongly held and are now FIRED; 4 more are runnable-now and auto-fire on the next Lab run; the rest name a real gate.** The standing auto-fire rule is in `the-lab.md §3b` and mechanically enforced by `lab.yml`.

| # | experiment | was | now | gate (if any) |
|---|---|---|---|---|
| 2 §5 | phase shapes (H1 vs 3 rivals) | "queued behind mocks" ❌ | **FIRED — H1 REFUTED** | none |
| 2 §6 | conditional policy mining | "queued behind mocks" ❌ | **FIRED — 0 rules clear** | none |
| 6 | stack/correlation dose-response | "no wf" | **FIRED — pays, peaks 0.5×** | none |
| 21 | mean-variance frontier | queued | FIRED (prev leg) | none |
| 19b | Cory-conditional archetypes | queued | FIRED (prev leg) | none |
| 1, 19 | strategy + archetype (league-general) | — | FIRED, auto-reruns behind bridge gate | none |
| 7 | ceiling dose-response | own entry | **SUBSUMED by 21** (same knob, better design) | none |
| 3 | slider micro-sweeps (7 weights) | "no wf" | **runnable in CI** — needs the REAL engine's 7 weights, so it rides the replay path, not the local proxy | none — next fire |
| 4 | flex-pricing validation (D3) | "no wf" | **runnable in CI** — same reason (engine internals) | none — next fire |
| 10 | slot-conditional strategy | "no wf" | **runnable NOW** (race from all 10 slots; pick numbers derive from the snake) | none — next fire |
| 11 | keeper-decision retro | "no wf" | **runnable NOW** (2024/25 keeps vs the optimizer; local history) | none — next fire |
| 12, 23 | pick-trade valuator + loser's-curse prior | "no wf" | runnable NOW (MC rooms) | none — queued behind 10/11 |
| 25 | RB dead zone | **FIRED + LOCATED on our data** | BBM full N: RB cliffs after R4 (137→80→63, 200k/cell). League-conditional (exp25_deadzone.py, n=395, LOCAL): RB ~170 through overall pick 60 → ~110 after; WR holds ~140, overtakes RB at **overall pick ~61**. Agrees with BBM in the overall-pick invariant (~50–61). EXP25-OURS.md. Board: informational dead-zone line shipped in deviation.js. | corroborated prior + labeled board marker; a re-WEIGHTING still needs the money gate |
| 25b | value pockets (dead zone generalised) | **FIRED — corroborates 25 + locates the WR pocket** | Within-position persistence (mean-in-band ÷ own-premium-band; QB-scale confound diagnosed + first instrument DISCARDED, not retuned). n=395, LOCAL. **RB reproduces the dead zone** (0.91 at 51–60 → 0.52–0.57 at 71–110, prereg check PASSED). **WR mid-round pocket** (0.81–0.86 at picks 51–70, where RB collapses). Late-QB 111–120 reads 1.00 but thin (n=10, one band) — hypothesis, not install. EXP-VALUE-POCKETS.md, test_value_pockets.py 4/4. | corroborated prior from a 2nd instrument; no board change beyond exp25's existing line; installs nothing without the money gate |
| 25c | composite Stage-2 washout | **DIAGNOSED from committed tournament output** | Weight profiles flip only 0.5–3.3 picks/draft through B3 (composite), and the most-diverging (upside_late) spends them on QBs that don't clear the weekly-high band → $0. Explains B3=$0/0-divergence, all-profiles≈$0, and why the ensemble (41) is blocked. B0 (pure ADP, fade the RB dead zone) is the only null-clearing candidate. EXP-COMPOSITE-WASHOUT.md. | pre-registered next build: a BEHAVIORAL Stage-2, gated exactly as the tournament; nothing installs before it clears the null in dollars |
| 26 | Konami QB premium | spec | runnable NOW (board rushing splits) | none — queued |
| 5 | LRM threshold tuning | spec | **needs LRM modeled in the sim** — a build, not a gate | none — queued |
| 8 | survival calibration | partial | runs behind the bridge gate (egress) | none |
| 24 | best-ball translation | **PARTIAL — FIRED (finals cut)** | BBM GCS host reachable from sandbox; finals dump ingested, winning-shape run (EXP24.md); full-field dead-zone → `bbm-probe.yml` (CI, 4.8 GB stream) | finding is `bbm-supporting`, caveat-walled; no install |
| 27 | championship-week stacking | spec | **needs the playoff bracket resim** (a build) | none — queued behind resim |
| 28, 29 | ambiguous backfields · availability curves | spec | runnable NOW (depth-chart + games-expected on the board) | none — queued |
| **9, 20, 31(1)** | behavior-ADP split · herding fade · historical adherence | spec | **GATED — data that does not exist** | historical Sleeper rankings for 2023–25 are NOT archived; LEAN-capped vs proxy |
| **22** | team-context projection layer | spec | **GATED — September quantile model** | season data / model that doesn't exist yet |
| **13–18** | in-season slate | spec | **GATED — season data** | no 2026 weeks played |
| **30** | recency-bias trade timing | spec | **GATED — in-season** | needs live trade market |
| **19b-real, shadow grading** | real-slate reruns | — | **GATED — external event** | keeper designations + Sleeper draft room |

**Nothing on this board is waiting on a mock, a session, or "time".**

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

## 🔬 FOUNDATIONS slate (33–34) — "would this raise my confidence?" (Cory, 2026-08-08)
**These two sit ABOVE the research slate in priority.** Everything else in the Lab tunes a tool whose two load-bearing assumptions have never been tested: that our projections are good, and that our recommendations beat the market. Both experiments are designed so that **a loss is a shippable finding** — if we lose, the surface says so, loudly, and the tool's claimed value moves to where the evidence actually is.

| # | experiment | pre-registered criterion | state |
|---|---|---|---|
| **33** | **PROJECTION SOURCE BAKE-OFF** — the foundational weak link. Race four sources on 2023–25 actual weekly points, **by position**: (a) our blend, (b) raw FFC ADP as an implied ranking, (c) Sleeper's own projections, (d) a naive **prior-year + opportunity** model. Three metrics — **MAE**, **rank correlation**, and **top-decile hit rate** (the one that matters: does it find the league-winners) — then **priced in dollars through the money grader**, so the gap is stated in E[$] and not just in points. | **A LOSS IS THE HEADLINE.** If our blend loses to the naive baseline on top-decile hit rate or on dollars, **every pick recommendation inherits that error and the War Room must say so on the surface** — a standing provenance banner naming the better source, not a footnote. No tuning of the blend is permitted inside this experiment; it measures, it does not fit. Ships a source change only if the winner clears null + leave-one-season-out CV. | **spec — TOP PRIORITY** · CI-gated (nflverse + FFC egress) · **partial gate: historical Sleeper projections may not be retrievable for past seasons — if so, run the other three and say the fourth was unavailable rather than substituting a proxy** |
| **34** | **RECOMMENDATION-VS-MARKET SCOREBOARD** — the honest self-test. At each of my REAL picks in the three historical drafts, three-way compare: **what the tool would have recommended** · **what ADP said** · **what I actually took** — all graded on realized season points AND dollars through the substituted-seat grader (now playoff-complete). Uses the certified roster-aware replay path, so the "what I actually took" arm reconciles to history exactly. | **IF THE TOOL DOES NOT BEAT ADP ON PLAYER SELECTION, IT IS NOT A *SELECTION* EDGE** — and the registry records that in those words. **But that is not a verdict on the tool.** Cory's framing, verbatim and binding: a tool that loses on player selection "can still be worth hundreds per season" through **strategy selection · the doctrine and QB-window verdicts · Sunday lineup execution · waiver speed · the discipline layer (legality, bench-disaster prevention, remembering what I'd forget at pick 61)". **The point of 34 is to learn WHICH claim carries the weight**, so the surface can display **honest confidence PER COMPONENT rather than uniform authority.** Deliverable is therefore an attribution table, not a pass/fail: each claimed source of value with its measured dollars, its evidence class, and — where the evidence is absent — that stated plainly. Report all three arms with CIs and per-season sign consistency. | **spec — TOP PRIORITY** · behind the (green) bridge gate · ~36 decisions total — underpowered by construction, and that must be stated with the answer |

| **35** | **LINEUP-POLICY CAPTURE RATE** — prices the component I'd lean on all season, and it is gradeable NOW without waiting for 2026. Replay every 2023–25 weekly lineup under four policies using **only information available at decision time**: (a) **my actual lineups** (the baseline), (b) **pure projection-max**, (c) the **dual-objective optimizer** (win-prob + weekly-high chase), (d) a naive **start-your-studs** heuristic. Grade each in dollars through the money grader — matchup wins, entry equity, and weekly highs captured — and report **CAPTURE RATE against L0's hindsight ceiling**: what fraction of the $445–595/team/season is actually reachable with real information. Also report **where capture concentrates** — which start/sit decision types are winnable in advance at all. | **THE HINDSIGHT CEILING IS UNREACHABLE BY CONSTRUCTION** (it knows the outcomes). Pre-registered: **30–50% capture is a strong result; anything near 100% is a leak, not a triumph** — treat it as lookahead contamination until proven otherwise. **This is enforced, not merely expected:** every policy input comes through `backtest/asof.py`'s `AsOfDataStore`, which raises `TimeTravelError` on a future read, so a contaminated run fails rather than reporting an uncollectable edge. A near-100% result is therefore evidence the store was bypassed, and the report must name the path that bypassed it. Ships a lineup policy only if it beats **my actual lineups** on held-out dollars past null. | **spec — TOP PRIORITY** · **data inventory VERIFIED 2026-08-08, and it is better than assumed:** `league_history.json` carries, for every week of every season, per roster — `starters`, the full `players` list, `players_points` for **every rostered player** (not just starters), and `starters_points`. So arm (a) is read directly, the **weekly roster composition is known** (waivers and trades handled for free), and L0's hindsight ceiling is the best legal lineup over `players_points`. **The one genuinely missing input is decision-time projections** — no pre-week projections are archived for 2023–25. They must be reconstructed from prior-weeks-only rolling data through the AsOf store, which **narrows the claim honestly**: not "what would OUR tool have done" but **"what could any decision-time policy have captured"**. Report it as that question, and state that the reconstructed projections are almost certainly weaker than a live 2026 projection would be — making the measured capture rate a **FLOOR**, not an estimate |
| **36** | **ADP-EFFICIENCY AUDIT (by round and position)** — registered because **the Anchor Doctrine names it as a dependency and it did not exist**. Where is consensus ADP actually right? Grade ADP as a predictor of realized season dollars across 2023–25, **sliced by round and by position**, against the same money grader everything else uses. Output is a **reliability surface**: for each (round × position) cell, how well ADP predicted, with CIs and cell counts. **EXTENDED per the Consensus Quality Upgrade:** run the same audit **per SOURCE** (FFC · Sleeper board · Underdog if a stable public endpoint is confirmed) **and on the weighted composite**, so the anchor's own weights come from measurement — and answer explicitly whether **the composite beats its best single member** (it usually does; prove it here rather than assuming it). | The audit **feeds the Anchor Doctrine's shrinkage directly** — cells where ADP is measurably efficient shrink our deviations toward zero, cells where it is measurably wrong widen them. No hand-set shrinkage anywhere. **Pre-registered honesty:** 3 seasons × ~15 rounds × 6 positions is a lot of cells and not much data, so most cells will be **too thin to rank and must be reported as such**, with pooling rules (by round-band, by position group) declared BEFORE seeing the numbers. A cell with n below the declared floor contributes **no** shrinkage adjustment — it defaults to full market anchoring, which is the conservative direction. | **spec — dependency of the Anchor Doctrine** · CI-gated (FFC + nflverse egress) · **bundle a TIER-MODEL CALIBRATION instrument with it** — the doctrine's fourth reliability input, currently unmeasured, and the same class of question · **also carries the FORMAT-MATCH check**: our 6-pt pass TD vs 4-pt-sourced ADP systematically underprices QBs, which compounds with the late-QB verdict (−$212), so grade QB cells with and without a format adjustment and report both |
| **37** | **IN-SEASON DOLLAR ATTRIBUTION** — instrument **every** recommendation the system makes during the live season: lineup start/sits, waiver claims, streams, trade evaluations, doctrine calls. Each logged **with its counterfactual** — what I'd plausibly have done without it (my historical baseline behavior, or the naive alternative). Grade weekly in dollars through the money grader: matchup outcomes, weekly-high captures, entry-equity movement. **January deliverable: realized dollars per component with confidence intervals** — the definitive filling of the attribution table's empty cells with **live evidence instead of simulation**. | **Pre-registered honesty: one season is n=1 with enormous variance.** CIs stated prominently, and **nothing certifies on a single season** per the multi-season gates. Two deeper limitations that must ride with the report: (a) **THE COUNTERFACTUAL IS MODELLED, NOT OBSERVED**, and its quality varies sharply by component — see the table below; where the baseline is weak the attribution is weak, and that must be said per row rather than averaged into one number. (b) **This is observational with no control**: it cannot separate "the tool helped" from "the tool's advice correlated with what a competent manager would have done anyway". The only causal route is randomising compliance on genuine near-ties. **DECLINED FOR 2026 (Cory, 2026-08-08)**, recorded with his reasoning so it is a decision on the record rather than an omission: (i) **the shadow season already provides a quasi-experimental comparison at zero cost to real decisions**; (ii) the marginal causal information from near-tie randomisation is **small by construction** — near-ties are where the effect is smallest; (iii) *"I want to play this season believing my own decisions."* **RE-RAISE IN THE JANUARY ANNUAL as a 2027 option**, once the tool has real evidence behind it. Consequence to carry in the January report: 37's numbers are **associational for 2026 and must not be worded causally** — no "the tool earned X", only "X was realised on decisions where the tool recommended Y". | **spec — GATED on the 2026 season existing** · the instrumentation itself is buildable NOW (it is `PredLedger` extended to in-season kinds, same decision-time-capture rail the draft ledger already runs) and is **HARD-DATED, because an un-instrumented September cannot be recovered in January**. **HARD DEADLINE 2026-09-01, NON-SLIPPABLE (Cory, 2026-08-08)** — a full week before week 1, slotted as the **first post-draft build item after the draft-week work**, and carrying **its own line on the pre-draft checklist**. *(I had proposed splitting it — waiver/trade logging at draft night, lineup logging at kickoff — on the grounds that the roster-move clock starts at the draft. Cory's single date stands. **Known and accepted gap: ~10 days, 2026-08-22 → 09-01, of post-draft waiver/trade decisions go unlogged.** Partial mitigation, worth stating because it bounds the loss: Sleeper's `transactions` are retrievable retroactively and we already ingest them per week, so the ACTIONS TAKEN in that window survive — what is lost is only the tool's decision-time RECOMMENDATION record, i.e. that window contributes outcomes but cannot contribute attribution.)* |
| **39** | **PAID-SOURCE VALUE TEST** — *gated on 33*. **Only runs if our projections lose to market consensus.** Evaluate paid sources (FantasyPoints · 4for4 · PFF) on a **trial** basis before any annual commitment: grade each against 2025 actuals on **33's exact metrics** (MAE · rank correlation · top-decile hit rate), then price the improvement in dollars through the money grader. | **BUY ONLY IF the measured dollar improvement exceeds the subscription cost by a clear margin.** Cory's pre-registration, verbatim and binding: **"it feels more professional" is not a criterion.** Three additions that decide whether this is answerable at all: **(a) THE BAR IS 33's WINNER, NOT OUR BLEND.** If consensus beat us, the thing a paid source must beat is *consensus* — a source that beats our losing blend while losing to free FFC ADP would read as a buy and would be a waste. **(b) "CLEAR MARGIN" GETS A NUMBER BEFORE THE DATA:** the *lower bound* of the dollar-improvement CI must exceed the annual cost. A point estimate over cost is not a margin, it is a coin flip with a receipt. **(c) ⚠️ LIKELY BLOCKER, flag it first:** grading against 2025 actuals needs each source's **2025 PRE-SEASON** projections, and a trial almost certainly ships *current* projections, not an archive. Same archival gate that hit 33's Sleeper arm and 35's decision-time inputs. **Confirm archive access before paying for or building anything**; if no source will supply history, this experiment cannot run and that is the finding — not a reason to buy on feel. | **spec — GATED on 33** · CI-gated (egress) · no work until 33 reports |
| 38 | **DECISION-DENSITY VALUE** — the tournaments already say **~2 contested decisions per draft carry the entire strategic edge** (19b: WR Feast diverges from control on a mean of **1.9** picks and earns +$187 doing it). This asks WHICH TWO. Classify every divergent decision, across historical replays **and** Monte Carlo rooms, into: **tier-cliff call · QB timing window · flex-vs-position · onesie timing · stack completion · value-fall vs need** — then measure the **dollar swing per type with CIs**. | Deliverables: (1) the **decision-type leaderboard by dollars-at-stake**; (2) the **per-draft frequency** of each type; (3) the practical output — **where the tool's precision budget should concentrate** (which cards earn the deepest analysis and the most explanation) and, symmetrically, **which decisions are near-ties where the surface should say "even money, pick your guy" instead of manufacturing a recommendation.** Note the surface hook already exists: the engine's `DG_NOISE_BAND` + `even_money` verdict + the Paths panel's coin-flip banner are all currently driven by **one global $4 band** — 38's real product is **replacing that one constant with a per-decision-type band**, which is a calibration, not a new mechanism. **Honest power note, pre-registered:** the historical arm is ~2 decisions × 3 drafts ≈ **6 observations and is nearly powerless on its own**; the Monte Carlo arm carries this, and it inherits the simulator's standing limitations (points-based playoff seeding, `runs_per_draft` unreproduced). Report per-type CIs and say plainly which types have too few observations to rank. | **spec — LOW PRIORITY by Cory's own call** ("it optimizes the small pool while 35 measures the big one") · runnable behind the bridge gate + local sim; no new data needed |

**COUNTERFACTUAL BASELINE INVENTORY FOR 37 (verified against `league_history.json`, 2026-08-08).** The attribution is only as good as the "what would I have done otherwise" it is measured against, and that differs per component:

| component | baseline available? | quality |
|---|---|---|
| lineup start/sits | ✅ `starters` + `players_points` for every week, every roster, 2023–25 | **strong** — his actual start/sit behavior is fully observable, including the players he benched |
| waiver claims / streams | ✅ `transactions` per week (adds, drops, type, `waiver_bid`) | **good** — claim timing, aggression and bid sizing are all recoverable |
| trade evaluations | ⚠️ transactions include trades, but our history is sparse | **weak** — too few events to model a baseline; report n, do not infer a rate |
| doctrine calls | **RESOLVED (Cory, 2026-08-08): measured against the BALANCED ARCHETYPE, not against a real behavioral history** | **defined, and narrower than the other rows on purpose.** There is no "what I'd have done without a doctrine" in the record, so none is invented. The counterfactual is the control archetype the Lab already races against. **VERBATIM REPORT LABEL, required on the row (Cory 2026-08-08):** `measured vs Balanced archetype; no behavioral baseline exists in the historical record`. His standard: *narrow and honest beats empty.* **This fixes the wording the report may use:** the number answers *"what did running WR Feast earn versus running Balanced"* — NOT *"what did the doctrine feature earn versus Cory without it."* Those are different claims and only the first is measured. **Benefit of the choice:** same denominator as 19b, so the live figure is directly comparable to its **+$187 simulated** edge — a simulation-vs-reality check on the same axis, which no other row gets |

**THE SURFACE CONSEQUENCE OF 34 — per-component confidence (standing design rule, Cory 2026-08-08).** The War Room currently speaks with **uniform authority**: a pick recommendation, a doctrine verdict, a legality guarantee and a survival estimate all render in the same voice, as if equally well-evidenced. They are not. 34's output is what licenses each voice, and the surface must inherit it:

| component | claim | evidence today |
|---|---|---|
| player selection | "take this player over that one" | **untested vs ADP — this is 34's arm 1** |
| strategy selection | "run WR Feast" | 19b paired rooms, +$187 CI [150, 224], simulated |
| the doctrine / QB-window verdicts | "Early-QB pays, Late-QB burns −$212" | 19b, simulated; co-leaders inseparable |
| Sunday lineup execution | "start these nine" | **L0 measured the LEAK ($445–595/team/season) — the capture is untested** |
| waiver speed | "claim him now" | not yet built, not yet measured |
| the discipline layer | legality · bench-disaster prevention · remembering at pick 61 | **mock #1 proved this is where the tool FAILED, which is also where it should be strongest — no dollars measured yet** |

The rule: **no component may render with more confidence than its row supports**, and a component with an empty evidence cell says so rather than borrowing the tone of one that has data. This is the provenance discipline (already enforced on projections) extended from data to CLAIMS.

**Why these outrank the research slate:** experiments 20–30 all ask "does this tilt earn dollars?" — a question that only matters if the underlying projections and recommendations are sound. 33 and 34 test that premise. A tilt tuned on bad projections is a tilt tuned on noise, however well it clears its own gate.

**Honest sequencing note (2026-08-08):** both are registered and gated, and neither is running yet — the draft-critical queue out of mock #1 (seat identity ✅, legality strip, need bug, path labels, sync) owns the lane until mock #2 can run. They fire under the standing auto-fire rule once that clears. 33's dollar-pricing arm and 34 both need CI egress, so neither was ever a sandbox job.

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

**🏁 FIRST TOURNAMENT VERDICTS LANDED (2026-08-08, run f1d8b34 — `LAB-TOURNAMENT.md`).** The pre-registration held almost perfectly: **divergence 0–4 decisions/draft for every real strategy, edges $0/±5, ALL PARKED under the null p95 ($30)** — the clear-board finding made quantitative; profile/archetype differences on historical boards are seasoning, and the report says so in the same table as the dollars. Internal consistency proven: `B3` ≡ `arch:balanced` exactly (0 divergence, $0 — the control is the unconstrained composite, structurally). **The one CANDIDATE verdict — B0 (raw market ADP) +$50 pooled, both seasons positive, 12–14 divergent decisions/draft — must be read through the D1 confound:** B3 drafts on our crude walk-forward projection while B0 drafts on the real contemporaneous market, so this is **the projection gap priced in dollars (~$25–50/team/season), NOT "raw ADP beats the composite."** D1's boring outcome stands: no strategy install off this projection. B0 goes to Phase-H shadows as flagged — the live 2026 season grades it against the composite running on REAL current projections, which is the clean test. September quantile re-run pre-registered.

**🔥 THE GATED BATCH IS FIRED (2026-08-08).** Experiments **1, 2, 19** now RUN in CI behind the green bridge gate (`lab.yml` replay-bridge job → `tournament.py`): 15 candidates (6 weight profiles = exp 1; the round-ramping profiles are exp 2's phase-shape candidates; 8 archetype constraint-overlays = exp 19, Balanced-BPA as control) drafted ROSTER-AWARE per seat per season, money-graded (weekly-high+RS, era-correct), edges vs control, **decision-divergence column** (how many picks per draft actually separated each candidate — the Phase-S pre-registration from the shadows' clear-board finding), 200-draw within-position outcome-shuffle null (same best-of-K search), leave-one-season-out consistency, ship/park verdicts — **nothing installs itself**; CANDIDATE verdicts get flagged for Phase-H shadows. Results commit as `LAB-TOURNAMENT.md` per run. Caveats carried in-report: 2 graded seasons (2025 weekly 404 upstream), v1 dollars, playoff-$ pending, fixed-room ghost replay. **The doctrine banner's enrollment waits on exp 19's Cory-conditional verdict** — when it lands, banner + opening script + Paths vocabulary inherit the winner in one pass (note: current run is league-general across all seats; the Cory-conditional race on MY 2026 seat with keepers locked is the follow-up increment).

**THE HARNESS'S FINAL INCREMENT — the draft-replay → money bridge: WRITTEN + CI-GATED (2026-08-08).** The bridge is built and routed exactly as ordered — its real test lives in CI where nflverse/FFC egress works:
- `grade.weekly_points_table` + `cli.py --weekly-out` — per-week per-player points for ALL NFL players under our scoring (a counterfactual roster can't be scored from `league_history`, which only carries rostered players).
- `dump-replay.js` — runs the SAME `replaySeason` the backtest uses and dumps every policy's per-pick choice.
- `bridge.py` — reconstructs each policy's counterfactual seat roster (keepers + choices, **ghost-duplicates deduped and counted**), scores it week-by-week, money-grades via `grade_substituted`, reports **coverage** (players with ≥1 scored week — the honesty floor; absent ≠ 0.0).
- **`test_bridge.py`, two layers:** STRUCTURAL (5 tests, run everywhere — reconstruction, 'actual' identity, dedupe, coverage, money wiring on real history) + **CI GATE** (3 tests, skip cleanly without the egress artifacts): 'actual' reproduces each seat's true drafted roster, every policy grades bounded, actual-roster coverage ≥ 0.6.
- **`lab.yml` `replay-bridge` job** (needs: lab, so certification runs first): build bundles+weekly points → dump replay → **BRIDGE GATE** → run bridge → upload `bridge-results.json` as an artifact. Deliberately a separate job so a nflverse outage can't take down certification + L0. **Experiments consuming the full replay path (1/2/19, money-graded parts of 20/21/24/25/26) run only behind this gate.**
- Still open: the **substituted-seat playoff resim** (entry/title $ for counterfactual rosters) — the one remaining grader increment; weekly-high + RS are exact today.

---

## Exp 40 — THE DEVIATION-EDGE SURFACE (sensitivity lens) — a HYPOTHESIS, not a doctrine

_Registered 2026-08-09 (Cory's options frame). **Deliberately not a doctrine:** a
doctrine governs something the system does; this is a lens for choosing what to
measure and it has produced no measured finding yet. Writing a constitution for an
untested frame would be "surface no mechanism the code does not have" applied to
governance. If the measurements pay, the doctrine writes itself from the evidence.
No options vocabulary reaches any surface — measure the quantities, name them plainly._

**The frame:** the cost and value of deviating from consensus are not constant
across the board; a single threshold T ignores dimensions that are all measurable
(the cap's inertness at flat T=4.0 is the symptom). The primary application is
**exp 34's deviation-edge surface** (`EXP34-METHODOLOGY.md`) — board position, tier
proximity, round decay, market dispersion — which turns Stage 2's threshold into a
calibrated function. THAT MEASUREMENT COMES FIRST.

**Three quantities already implicit in the engine, currently expressed badly
(draft-relevant, measurable from existing data):**

1. **Survival SLOPE, not just level.** The board shows "72% to survive to your next
   pick"; the rate of change matters more — 90→40% across three picks is a different
   decision than flat 65%. A steep negative slope is the real urgency signal and is
   currently invisible. Measure and (once it clears a gate) surface the slope.
2. **Cliff convexity, PRICED not flagged.** "Last of Tier 1, 100% gone by next pick"
   is convexity in words. Price it continuously: value lost per pick of delay as a
   function of proximity to the tier boundary — spikes near a cliff, ~flat inside a
   tier. That curve should feed the recommendation, not a binary flag.
3. **Remaining-picks decay.** Eleven picks left to recover at 34, none at 141. The
   only current expression is the phase-based ceiling ramp, which **the Lab refuted**
   (−$37 → the reversal was playoff-driven, not phase) — so the mechanism is real
   but our implementation was wrong. Measure the realized cost of a bad pick by round
   and let THAT shape late-draft risk weighting, from data not a guessed ramp.

**Where the frame is likely strongest — IN-SEASON (registered now, built with those systems):**

4. **The weekly-high chase is an option** — mostly out of the money. Chase-variance
   vs protect-the-matchup is a moneyness question (distance from the week's winning
   band × how much variance moves P(clear)). The lineup optimizer's dual objective
   already; the frame says the chase threshold is state-dependent, not fixed.
   **Folds into exp 35's design.**
5. **Trade timing has decay** — the week-11 deadline is an expiry; a player's value to
   a contender vs a seller diverges as it approaches. The trade radar's desperation
   index is this, unnamed. Folds into the in-season trade spec.
6. **Waiver claims have sensitivity to roster need** — the same add is worth wildly
   different amounts by what the roster is missing and weeks remaining to use him.
   Folds into the waiver spec.

**Gate:** nothing here reaches the surface until measured and past the gates, same
as everything else. Items 1–3 are the draft slice; 4–6 wait for their systems.

---

## Exp 41 — CALIBRATION-WEIGHTED ENSEMBLE (registered 2026-08-09; build behind exp 34)

**Idea:** the most robust finding in forecasting is that aggregating diverse models
beats selecting the best one. We have 8 strategy profiles and a Lab that grades them
— so combine them with weights earned by **measured calibration**, not preference,
not equal. **Why it aims at our actual problem:** an ensemble deviates only where its
members AGREE; disagreement collapses the recommendation toward market. That is an
anchor that emerges from STRUCTURE rather than an imposed threshold — it may do what
the T=4.0 cap could not, and member disagreement may be a better contested-decision
detector than any hand-tuned threshold (possibly free).
**Build:** (1) score every candidate under all 8 profiles per pick; (2) combine into
one recommendation weighted by each profile's Lab-measured historical accuracy;
(3) agreement level = the confidence number the surface has been missing (strong
agreement → confident, may deviate; split → collapse to consensus and say so);
(4) race the ensemble vs the single composite in the paired-room harness,
money-graded, null-baselined, same gates.
**Report:** ensemble vs composite in dollars; its intervention rate vs the composite's
74%; whether member disagreement predicts the tournament's contested decisions.
**PRE-REGISTERED:** expect the ensemble deviates **LESS often and more accurately.**
If it deviates just as often, the profiles are not diverse enough to be an ensemble —
and THAT is the finding. Ships nothing to the surface until measured past the gates.

## Exp 42 — THE BENCH AS CONTINGENT CLAIMS (registered 2026-08-09; behind exp 34; needs exp 29)

**Idea:** bench picks are not lottery tickets, they are **contingent claims on a
specific, nameable failure** — a handcuff pays out only when a particular starter
breaks; an ascending role player only when a depth chart shifts. Price them:
`value = P(triggering event) × value-if-triggered − roster-spot cost`, with P from
availability data + depth-chart context, not a vibe.
**Why different from now:** current bench logic maximizes ceiling, treating all upside
as fungible. It is not — **upside CORRELATED WITH MY OWN FAILURE MODES is worth more**
than independent upside. If my RB corps is fragile, the back who inherits those
touches is worth more to me than an equal back on someone else's roster. The reframe
of the last six picks: not "which upside guys" but "which of my failure modes am I
insuring, at what price."
**Build:** (1) compute my roster's failure modes after each pick (fragile starters,
positions with no replacement, uncovered byes); (2) per bench candidate identify the
triggering event + estimate P and value-if-triggered; (3) price the claim vs the
roster spot, surface in plain language ("insures your RB2 — pays if Henry misses
time, ~X%"); (4) race vs the ceiling-maximizing endgame, money-graded.
**Dependency:** needs exp 29's availability curves for real probabilities — sequence
29 ahead or run together.
**PRE-REGISTERED CAVEAT:** in a 10-team league the wire is deep, which cuts against
insurance — you can often just claim the replacement AFTER the failure. The
experiment must test exactly that: is a rostered handcuff worth more than the
waiver-claim OPTION on the same player post-injury? **If the wire makes insurance
redundant, that is the finding and the bench goes back to ceiling.** No surface until
measured past the gates.

---

## STANDING RULE + AUDIT — report in dollars where the grader supports it (2026-08-09)

**Rule (Cory):** every experiment producing a verdict about DRAFT DECISIONS reports
in **E[dollars]** (era-correct payouts, harvested weekly-high thresholds, real
field, decomposed high-pool/entry/RS) as the answer, with points-based metrics
(rank correlation, MAE, top-N) as the statistically-robust COMPANION at thin n —
never the whole answer. Points ≠ money in this league: ranking players well does
not mean building rosters that clear the weekly-high band or buy the top-4 door.

**Audit of the registry against this rule:**
- **exp 34** — WAS the outlier (points-only). FIXED: dollar arm added to
  `EXP34-METHODOLOGY.md` (policy rosters through `grade_substituted`, dollars per
  band alongside hit rate, report-both-and-whether-they-agree). Points kept primary
  at n≈19; the interesting case is ranks-better-but-earns-same → portfolio doctrine,
  not projections.
- **exp 2 (tournament) · 6 (stack) · 19b · 21 (frontier) · what-would-have-worked**
  — already dollar-graded, null-baselined, CV'd. Compliant.
- **exp 36** — its spec already grades ADP as a predictor of realized season
  DOLLARS (per (round×position) cell). Compliant.
- **exp 33** — accuracy by nature (MAE / rank correlation / top-decile). Its
  DOLLAR pricing lives downstream in **exp 39** ("price the improvement in dollars
  through the money grader"). Acceptable, but 33's report must LINK to that pricing
  so its accuracy verdict is never read as a value verdict on its own.
- **exp 40/41/42** — registered with dollar-graded success criteria already.

No other experiment produces a draft-decision verdict in points alone.

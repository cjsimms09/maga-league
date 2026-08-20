# THE AUDIT'S THREE ATTACKS — what the DP already bounds, and the two live experiments
<!-- TERRITORY: relay. 2026-08-20. Preregs committed BEFORE any run, per house rule.
     Source: the external audit directive Cory relayed 08-20 ("attack this hypothesis:
     ... a DISTRIBUTIONAL / COMPLETED-ROSTER objective"). -->

## 0. The ablation ladder, checked against math we already own

The directive orders ablations A→F and warns, correctly, that the failed VONA
heuristic does not disprove the value of future-availability information. It
doesn't — but **the exact DP does, inside this evaluation framework, and that
needs saying precisely before anyone spends draft week on rungs it covers.**

In the replay the opponents are the recorded picks, so future availability is
not a probability — it is a fact the DP already conditions on perfectly.
`objective_dp.js` computes the optimum over ALL policies that use point
values + perfect availability + completed-roster optimization. That is rungs
**B (availability), D (multi-pick availability), E (completed-roster
simulation), and F's core** — and the answer is measured: **< 5% above the
myopic greedy in 30/30 seats, median 0.00%, and the optimal rosters GRADE
WORSE (−10.6 skill/season).** These rungs are not "untested"; they are
bounded, and the bound is ~zero. What the DP does NOT bound:

* **Rung C — player outcome UNCERTAINTY.** The DP used point values. A
  distributional value signal changes the input, and the bound is
  conditional on the input. **LIVE — experiment 1 below.**
* **The STOCHASTIC room** (real Saturday: availability is genuinely
  uncertain). The replay cannot grade this against reality — any "room
  model" substitutes its own assumption for the recorded truth, and the
  grade measures the assumption. The honest instrument is the **draft-night
  shadow ledger** (already built): it captures the tool's recommendation at
  every real pick Saturday, and the 2026 season grades myopic-vs-whatever
  on a room nobody simulated. Deferred there, deliberately.
* **The GRADING itself** (the audit's second attack). **LIVE — experiment 2.**
* **Keeper-induced scarcity** (third attack): §4 below — mostly a power
  problem, one actionable piece routed to the Friday keeper-lock rebuild.

## 1. EXPERIMENT 1 — DISTRIBUTIONAL MLV (`--mlv-dist`), prereg before the run

**Mechanism.** Each player's value is a DISTRIBUTION, not a point: the
leave-target-season-out empirical outcomes of his 15-pick draft bucket (the
§11 curve's buckets, raw season points, busts included as the 0 they scored).
At each pick, candidate score = Monte Carlo estimate of

    EV(c) = E[ L(roster + c) ] − E[ L(roster) ]

with every held and candidate player's outcome drawn independently from his
bucket distribution, M = 100 draws, fixed seed 20260820. L = the same
best-legal-lineup value (dedicated + flex). K≤1/DEF≤1 retained. E[max] >
max[E], so a roster's value now rewards genuine diversification and a
candidate is priced by what he does to the whole distribution — the
directive's rung C, in the smallest testable form.

**Pruning, declared:** only the top-2 available per position by bucket mean
are evaluated per pick (12 candidates); expected marginal is approximately
monotone in bucket mean within position and top-2 hedges the approximation.

**Controls:** `--mlv` byte-guard (+45.84/+29.33); anchor arm — the same code
with draws forced to the bucket MEAN must reproduce deterministic
points-MLV behavior (P135 proved points-mean MLV = rank MLV picks), asserted
by comparing its 30 deltas to `--mlv`'s within noise; seed printed.

**Bars (waiver-graded, frozen beside):** the §14 set — actual > +2.6 AND
skill > +2.1, h2h ≥ 16/30 vs MLV-cap, 30/30 legal. Reported beside (no
bar): vs the depth arm's +25.9/+18.6.

**P149, blind:** NULL — within ±10 of MLV-cap's means on the waiver grading.
The Jensen term largely cancels in the displacement DIFFERENCE, and 30
seat-years cannot resolve what survives. A clear would mean uncertainty
belongs in the live engine's objective, which nothing currently supports.

## 2. EXPERIMENT 2 — WHAT DID REAL WAIVER ADDS ACTUALLY SCORE? (the grading attack)

**The audit's question:** is `WAIVER_WK` (QB 19.0 · RB 4.6 · WR 7.3 · TE 7.7
· K 7.6 · DEF 5.9 per week) the value of the replacement you could actually
ACQUIRE, or an availability upper bound no one realizes? `waiver_supply.js`
measured demand and says itself it never measured what replacements SCORED —
and the join it declared missing (transactions × realized weekly points) is
on disk today: 1,091 week-stamped adds, full weekly scores.

**Measurement (`draft/tools/waiver_realized_level.js`):** for every
completed add 2023-25, the added player's realized points per week over the
next 4 weeks (weeks he had a game), by position. Report mean, median, and
the fraction of adds that ever beat the floor, per position, with n. Rule 3e
control: the K/DEF rows are the known positive — kicker cycling is so free
(83-100% of the pool) that realized-add level ≈ floor there, or the join is
broken.

**P150, blind:** at QB/RB/WR/TE the realized-add weekly mean lands BELOW the
floor (the floor is what the best sitting on the wire scores; competition,
priority and timing mean the add you actually get scores less), and at K/DEF
it lands within ±2/week of the floor. **Decision rule, committed now:** if
realized < 80% of floor at ≥3 of QB/RB/WR/TE, the waiver-aware grading gains
a second variant floored at the REALIZED-ADD level, the three headline arms
(shipped, MLV-cap, depth) are re-graded under it, and the truth is declared
to sit between the frozen and floored gradings. No bar moves after results.

## 3. THE RANKING — graded 08-20, and the program closure that follows from it

**Cory, same day, before experiment 1 could be re-run:** *"I'm done with
roster problem. Move on to in season tools and improving our player
projections this year."* The ruling agrees with the measurements. Experiment
2 ran (P150 FALSE — the waiver floor SURVIVES: realized adds score 0.90-1.02×
the floor at QB/WR/TE/K, RB 1.47×, K/DEF control passed); experiment 1 was
ABANDONED mid-validation (its anchor control failed its first run — the
instrument, not the idea — and the owner closed the program before the fix
could be validated; the arm code was discarded, not shipped).

**The audit's seven candidates, ranked by measured effect:**

1. **Better weekly projections.** The measured monster: hindsight lineups
   beat owners by +15.3/week while our fallback projections LOSE by
   14.5/week — a ~30 pt/week swing on projection quality alone, dwarfing
   every draft-construction effect ever measured here (largest: ~26
   pts/SEASON). Distinguishing experiment: **P143** (blend projections into
   the lineup backtest, D, 09-01), then the 09-15 scoreboard bar vs
   Sleeper/FP.
2. **Projection uncertainty modeling.** Weekly start/sit is argmax under
   noise; the floor/ceiling-by-win-prob rule waits gated behind P143.
   Experiment: variance-aware start/sit backtest on the same rig.
3. **Opponent behavior, in-season.** P144 (E, 09-03) vs the persistence
   null; feeds start/sit tie-breaks, waiver blocking, the trade scanner.
4. **Waiver replacement modeling.** P150 says the floor is calibrated —
   remaining edge is the RB 1.47 anomaly (the wire under-credits RB
   breakouts), folded into D's waiver-signal backtest.
5. **Completed-roster optimization / future availability.** DP-bounded at
   ~zero in-frame; the stochastic-room version is only honestly gradeable
   through Saturday's shadow ledger. Closed.
6. **Keeper-induced scarcity.** n=3 seasons, keeper variation ±1-2 picks —
   unmeasurable; the actionable piece (recompute depth/replacement on the
   locked 2026 slate) rides Friday's board rebuild. Closed as an experiment.
7. **The thing we had missed** — named: **conversion.** Points held that
   never reach a starting slot are worth more than the whole acquisition
   edge (engine conversion 0.740 vs owners' 0.828). It is not a new signal;
   it IS items 1-3. The in-season program is the answer, and it is running.

## 4. Keeper-induced scarcity (third attack) — the honest power statement

Three seasons, one of them keeper-free, is n=3 at season grain: 2023 drafted
TE 13 with zero keepers, 2024/25 drafted 14/15 with 1-2 TE keepers — a shift
of one-ish pick, unmeasurable against year noise. The depth discount already
conditions on each draft's own supply (repl_q is read from the target draft,
keepers included). **The actionable piece:** Friday's keeper lock fixes the
real 2026 removal state; the board rebuild after lock should recompute
positional depth and replacement on the actual slate — routed to A, since
the rebuild is theirs. A generic keeper-scarcity curve is exactly the kind
of low-power invention the directive told us not to spend draft week on.

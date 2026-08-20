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

## 3. The ranking the audit asked for — filled in after both experiments run

(Committed as a placeholder so the answers land against a declared frame:
the seven candidates will be ranked by measured effect size where one
exists, with the distinguishing experiment named per candidate. No ranks
declared pre-run beyond what is already graded.)

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

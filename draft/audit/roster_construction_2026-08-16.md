> **Scope of the conclusion (added after external audit):** BPA/VORP-adjacent
> and the shipped policy lead *under the current simulation, measured-opponent
> and replacement assumptions*; the study does not establish a universally
> optimal strategy, and the wire-floor robustness arm shows the one apparent
> CI-clear winner collapsing to zero under realistic replacement levels.

<!-- TERRITORY: A -->
# ROSTER-CONSTRUCTION ARCHETYPES, END TO END — 2026-08-16

## 0. The mandate, verbatim, and what had never been measured

Cory, 2026-08-16:

> "If edge for this year isn't going to come from using own projections this
> year. It's going to come from our roster building. Have we ran enough test
> on roster building in draft to make sure we have best methods possible?"

The honest answer at the start of this pass: **no — not end to end.** The
PICK-VALUE engine is deeply tested (VONA wire, KOV measured ramp, survival
with the ROOM_MIX prior, the bench-wire three-arm sim, the seat plan, the
opening script), and the 08-15 roster-construction audit established the
machinery is *sound* (legal lineups in 200/200 rooms, K/DEF timing free,
flex fills right). But no measurement had ever compared roster-construction
ARCHETYPES — zero-RB, robust-RB, late-round-QB, TE-early, pure BPA, pure
market, the seat plan itself — through to SEASON OUTCOMES under this
league's exact scoring, slots, 10 teams, snake order, and Cory's real
keeper situation. This pass is that comparison. Everything below is
**SIMULATION** — model outcomes, never measurements — and the doc says so
at every load-bearing point.

## 1. What was simulated (and what was reused unmodified)

**One room = one full 10-team, 150-slot snake draft from the real geometry:**
Cory at slot 8, his real keepers (Chase WR / Henry RB / Walker RB) consuming
picks 8/13/28, his 12 live picks at 33/48/53/68/73/88/93/108/113/128/133/148,
and the REAL designated keeper slate from `draft/config/keepers.json`
(source: sleeper): three opponent teams keeping 8 players (Jeanty+Chase
Brown; JT+London+Gibbs; JJ+Achane+JSN), removed from the pool, forfeiting
rounds 1..N at their provisional slots. The six undesignated teams are
simulated keeping zero — UNKNOWN, not assumed empty; robustness arm below.

**My picks: the SHIPPED engine, unmodified.** Every one of my picks calls
the real `E.recommend()` through the real `live_context.js` under production
`MEASURED_WEIGHTS` and shipped flags (`VONA_WIRE_BENCH=true` per the
08-16 ruling, `VONA_SLOT_AWARE=false`; the bench wire supplied exactly as
`bench_wire_room_sim.js` supplies it). An ARCHETYPE is a constraint/
preference function on the engine's own ranked candidate list
(`draft/tools/archetype_policy.js`) — never a second draft brain:

| arm | preregistered constraint (fixed a priori, commit `4411e713` / `c9158361`, before any ranking run) |
|---|---|
| `shipped` | engine `recs[0]` every pick — the live policy (control) |
| `seat_plan` | seek the shipped seat plan's scheduled position (`public/seat_plan.json`) among engine candidates; engine order at BENCH seats |
| `zero_rb` | no RB before round 10 (keepers already start two RBs) |
| `robust_rb` | seek RB while RBs < 5 and round ≤ 10 |
| `early_qb` | seek QB in rounds 4-6 until QB1 |
| `late_qb` | no QB before round 11 |
| `te_early` | seek TE in rounds 4-7 until TE1 |
| `bpa_vorp` | highest raw VORP among engine top-25 candidates |
| `market_adp` | lowest ADP among engine top-25 candidates |

Overlay rules, same for every arm: a FORCED pick (legality rails) is never
overridden; a legality warning defers to the engine; K/DEF are never sought
or banned by an overlay (except `seat_plan`, whose shipped schedule
explicitly names K/DEF seats — still only inside the engine's candidate
slice); an unsatisfiable constraint DEFERS to `recs[0]` rather than
reaching into the tail. **No archetype parameter was tuned on any
simulation output, on any seed pool** — the parameters were committed
before the first ranking room ran, and seeds 9000+ are reserved for
mechanics smoke tests and excluded from every ranking.

**Opponents: the measured league model, used as a generator.** Each
opponent pick samples a POSITION from `survival.js
positionProbabilities()` — the shipped need/value softmax with the ROOM_MIX
league prior (ON per Cory's 08-16 ruling; the 2023-25 bucket mix over 377
non-keeper decisions) — and a PLAYER from `positionSoftmax()`'s D6
room-mixture over the league's 10 profiled managers (per-owner profiles
deliberately NOT bound to seats: the draft-behavior forward test measured
owner signatures as non-persistent). Two declared rails: hard caps
(K≤1 DEF≤1 QB≤3 TE≤3 RB≤7 WR≤7 — three seasons of real drafts contain one
backup K and zero backup DEF) and a legality mirror of
`applyRosterLegality` so every opponent fields a complete lineup (they did:
0 missing starter slots across every room of every arm).

**Season scoring (`draft/tools/archetype_season.js` + the repo's
championship machinery):** each of the 10 final rosters becomes a 15-week
expected starting-lineup series — per-player weekly mean is `proj_mean`
spread over non-bye weeks (proj_mean/16; bye week 0; unknown bye =
proj_mean/17 flat, counted, never coerced to zero), weekly optimal legal
lineup by the exact greedy-plus-flex fill. **`proj_mean`/board inputs are
the priced projections; `proj_ownmodel` (own_v6) is display-only and is
NOT read anywhere in this pass.** League standings are a seeded Monte
Carlo (2,000 sims/room): weekly Normal draws at the MEASURED league weekly
sd (21.3, from 30 team-seasons 2023-25 — `champodds.CFG.WEEKLY_SD`),
random pairings (no 2026 schedule exists), top-4 playoff, bottom-3 bust.
Championship probability comes from `src/routes/champodds.js simulate()` —
the bracket pinned by test to the league's real playoff format — on the
same rosters. A rule-11 cross-path test holds the two simulators' playoff
numbers together on identical inputs (worst per-team |Δ| < 0.025 at 6,000
sims); in the rooms themselves the flat-mean bracket path and the
bye-aware weekly path differ by at most ~0.05, which is the price of the
bracket path not seeing byes, reported not hidden.

**Runs:** primary — 120 paired seeds (1-120) × 9 arms, measured opponents,
designated keepers (`draft/data/archetype_rooms.json`). Robustness —
noisy-ADP opponents (seeds 1-40, `archetype_rooms_adp.json`),
mine-only keepers (seeds 1-40, `archetype_rooms_mineonly.json`), and the
wire-floor replacement model (seeds 1-120,
`archetype_rooms_wirefloor.json`, §5). Paired design throughout: the same
seed drives the same opponent randomness in every arm, so an arm
difference is attributable to the overlay, not to a different room. Every
artifact is regenerable from its recorded seeds by one command
(`node draft/tools/archetype_rooms.js --rooms … --seed …`), deterministic
byte-for-byte (pinned by test).

## 2. The primary ranking — 120 paired rooms/arm, measured opponents, real designated keepers

`draft/data/archetype_rooms.json` (seeds 1-120, 2,000 season sims/room).
**SIMULATION — model outcomes, not measurements.** Absolute levels are
inflated (limitation 4) — read the paired deltas, never the levels.

| arm | weekly pts (SE) | playoff % | champ % | bottom-3 % | overlay picks/room | QB2 rooms | modal shape |
|---|---|---|---|---|---|---|---|
| bpa_vorp | 123.2 (0.2) | 79.0 | 28.5 | 5.1 | 5.0 | 83% | QB2/RB3/WR6/TE2 |
| shipped | 122.6 (0.1) | 77.5 | 27.1 | 5.5 | 0 | 5% | QB1/RB6/WR5/TE1 |
| te_early | 122.5 (0.2) | 77.2 | 27.0 | 5.7 | 0.4 | 3% | QB1/RB6/WR5/TE1 |
| zero_rb | 122.6 (0.1) | 76.9 | 26.7 | 5.6 | 2.5 | 11% | QB1/RB5/WR6/TE1 |
| seat_plan | 122.5 (0.2) | 76.8 | 26.6 | 5.8 | 2.5 | 27% | QB1/RB6/WR5/TE1 |
| early_qb | 121.6 (0.1) | 73.7 | 24.3 | 6.8 | 0.7 | 6% | QB1/RB5/WR6/TE1 |
| late_qb | 121.2 (0.1) | 72.6 | 23.9 | 7.4 | 2.6 | 1% | QB1/RB6/WR5/TE1 |
| market_adp | 120.1 (0.2) | 67.5 | 21.0 | 9.7 | 6.3 | 25% | QB1/RB6/WR5/TE1 |
| robust_rb | 118.5 (0.1) | 61.4 | 17.5 | 12.3 | 2.6 | 1% | QB1/RB7/WR4/TE1 |

**Paired deltas vs the shipped control (same seed, same opponent
randomness), mean [95% CI]:**

| arm | Δ weekly pts | Δ playoff | Δ champ | Δ bottom-3 |
|---|---|---|---|---|
| bpa_vorp | **+0.64 [+0.30,+0.98]** | **+0.015 [+0.004,+0.027]** | **+0.014 [+0.005,+0.022]** | −0.004 [−0.009,+0.001] |
| zero_rb | −0.03 [−0.21,+0.15] | −0.005 [−0.012,+0.001] | −0.005 [−0.010,+0.001] | +0.002 [−0.001,+0.004] |
| te_early | −0.09 [−0.30,+0.12] | −0.003 [−0.011,+0.005] | −0.001 [−0.007,+0.005] | +0.002 [−0.001,+0.006] |
| seat_plan | −0.08 [−0.33,+0.17] | −0.007 [−0.016,+0.003] | −0.005 [−0.012,+0.002] | +0.003 [−0.000,+0.007] |
| early_qb | −0.94 [−1.20,−0.69] | −0.038 [−0.048,−0.028] | −0.028 [−0.035,−0.021] | +0.014 [+0.010,+0.018] |
| late_qb | −1.33 [−1.57,−1.10] | −0.048 [−0.058,−0.039] | −0.032 [−0.039,−0.026] | +0.019 [+0.015,+0.023] |
| market_adp | −2.44 [−2.78,−2.09] | −0.099 [−0.114,−0.085] | −0.061 [−0.070,−0.052] | +0.043 [+0.036,+0.050] |
| robust_rb | −4.10 [−4.44,−3.75] | −0.161 [−0.175,−0.146] | −0.097 [−0.106,−0.088] | +0.069 [+0.062,+0.076] |

## 3. How many rooms is enough — stability shown, not asserted

The ranking was recomputed independently on three disjoint 40-seed batches
(1-40 / 41-80 / 81-120). By champ probability, the order is essentially
stable: `bpa_vorp` is first in ALL three batches; the
{shipped, te_early, zero_rb, seat_plan} cluster occupies places 2-5 in all
three with internal order shuffling (their pairwise gaps are ~0.1-0.5pp —
inside one batch's MC noise, i.e. the cluster is a measured TIE);
{early_qb, late_qb} are 6-7 in every batch; market_adp 8th and robust_rb
9th (worst) in every batch. The same structure holds ranked by weekly
points. 120 paired rooms is therefore enough for THIS question's answer —
the seed noise moves ordering only within a cluster the CIs already call
indistinguishable, and every CI-clear conclusion (bpa_vorp's nominal win,
the four losers) is batch-stable. What 120 rooms is NOT enough for is
separating the top cluster, and no feasible seed count would be: their
paired CIs straddle zero at widths already below one weekly point.

## 4. Robustness arms — the ranking under a different room and a different board

**Noisy-ADP opponents** (the shipped sims' opponent model; 40 paired seeds,
designated keepers, `archetype_rooms_adp.json`) — paired deltas vs shipped,
mean [95% CI]:

| arm | Δ weekly pts | Δ playoff | Δ champ | Δ bottom-3 |
|---|---|---|---|---|
| seat_plan | +0.20 [−0.11,+0.51] | +0.006 [−0.004,+0.015] | +0.003 [−0.014,+0.020] | −0.001 [−0.003,+0.001] |
| zero_rb | −0.22 [−0.49,+0.04] | +0.003 [−0.006,+0.011] | +0.001 [−0.012,+0.014] | −0.001 [−0.002,+0.001] |
| te_early | −0.11 [−0.24,+0.03] | −0.002 [−0.007,+0.002] | −0.000 [−0.010,+0.009] | +0.001 [0.000,+0.002] |
| early_qb | −0.52 [−0.75,−0.30] | −0.001 [−0.011,+0.009] | −0.004 [−0.021,+0.014] | +0.000 [−0.002,+0.002] |
| bpa_vorp | −0.32 [−0.62,−0.01] | −0.007 [−0.017,+0.004] | −0.018 [−0.035,−0.000] | +0.001 [−0.001,+0.003] |
| late_qb | −0.79 [−1.07,−0.51] | −0.013 [−0.023,−0.004] | −0.026 [−0.042,−0.009] | +0.002 [−0.000,+0.004] |
| robust_rb | −2.15 [−2.43,−1.87] | −0.021 [−0.032,−0.010] | −0.037 [−0.055,−0.020] | +0.002 [0.000,+0.004] |
| market_adp | −2.01 [−2.53,−1.49] | −0.035 [−0.048,−0.021] | −0.047 [−0.065,−0.029] | +0.005 [+0.003,+0.008] |

**Mine-only keepers** (the unconfirmed-slate geometry: opponents' designated
keepers NOT removed from the pool; 40 paired seeds, measured opponents,
`archetype_rooms_mineonly.json`):

| arm | Δ weekly pts | Δ playoff | Δ champ | Δ bottom-3 |
|---|---|---|---|---|
| bpa_vorp | **+0.65 [+0.03,+1.26]** | +0.019 [+0.001,+0.037] | +0.017 [+0.002,+0.031] | −0.006 [−0.013,+0.001] |
| zero_rb | −0.08 [−0.52,+0.37] | −0.006 [−0.021,+0.009] | −0.006 [−0.019,+0.006] | +0.002 [−0.003,+0.007] |
| seat_plan | −0.08 [−0.58,+0.42] | −0.007 [−0.028,+0.013] | −0.005 [−0.020,+0.011] | +0.004 [−0.004,+0.011] |
| te_early | −0.21 [−0.49,+0.08] | −0.010 [−0.022,+0.002] | −0.010 [−0.020,+0.001] | +0.002 [−0.001,+0.006] |
| early_qb | −1.15 [−1.71,−0.58] | −0.042 [−0.062,−0.022] | −0.030 [−0.046,−0.014] | +0.015 [+0.008,+0.023] |
| late_qb | −1.16 [−1.58,−0.73] | −0.040 [−0.057,−0.024] | −0.033 [−0.045,−0.020] | +0.015 [+0.008,+0.021] |
| market_adp | −2.23 [−2.96,−1.50] | −0.092 [−0.120,−0.064] | −0.060 [−0.079,−0.041] | +0.040 [+0.027,+0.053] |
| robust_rb | −3.87 [−4.42,−3.33] | −0.151 [−0.173,−0.129] | −0.095 [−0.109,−0.080] | +0.064 [+0.055,+0.074] |

**Wire-floor replacement model** (every starting slot floored at the
measured wire level — the streaming-priced season model; 120 paired seeds,
measured opponents, designated keepers, `archetype_rooms_wirefloor.json`):

| arm | Δ weekly pts | Δ playoff | Δ champ | Δ bottom-3 |
|---|---|---|---|---|
| bpa_vorp | −0.06 [−0.22,+0.10] | −0.004 [−0.011,+0.003] | −0.003 [−0.007,+0.001] | +0.002 [−0.001,+0.005] |
| late_qb | −0.11 [−0.25,+0.03] | −0.003 [−0.009,+0.003] | −0.002 [−0.006,+0.002] | +0.001 [−0.001,+0.004] |
| te_early | −0.25 [−0.40,−0.10] | −0.012 [−0.018,−0.005] | −0.007 [−0.011,−0.003] | +0.005 [+0.003,+0.008] |
| seat_plan | −0.45 [−0.63,−0.28] | −0.021 [−0.029,−0.014] | −0.013 [−0.018,−0.008] | +0.009 [+0.006,+0.013] |
| zero_rb | −0.66 [−0.80,−0.53] | −0.032 [−0.039,−0.026] | −0.021 [−0.025,−0.017] | +0.013 [+0.011,+0.016] |
| early_qb | −0.80 [−1.01,−0.59] | −0.031 [−0.040,−0.022] | −0.020 [−0.026,−0.015] | +0.013 [+0.009,+0.017] |
| market_adp | −0.97 [−1.16,−0.77] | −0.038 [−0.046,−0.029] | −0.025 [−0.030,−0.019] | +0.016 [+0.012,+0.020] |
| robust_rb | −1.88 [−2.12,−1.64] | −0.068 [−0.078,−0.058] | −0.041 [−0.048,−0.035] | +0.027 [+0.022,+0.031] |

Worth noticing: with streaming priced, EVERY overlay is ≤ 0 against the
shipped policy — and the losers' penalties shrink (streaming rescues bad
constructions too), which is the direction reality should move them.

**Reading the spread:** `bpa_vorp` is positive under the measured room
(+0.64 primary, +0.65 mine-only), NEGATIVE under the ADP room (−0.32
[−0.62,−0.01], champ CI-clear negative), and zero under the wire floor —
§5 locates the mechanism and dismantles the positive cells. The four
CI-clear losers (robust_rb, market_adp, early_qb, late_qb) lose in every
configuration where their CI clears zero anywhere, so those conclusions
are robust to the room model, the keeper slate, and the replacement
assumption.

## 5. The bpa_vorp cell interrogated — and it does not survive its own instrument check

The one arm that beats shipped with a clear CI in the primary is not a
construction shape at all — it is the composite with its adjusters
stripped back to raw VORP. Before believing it, the instrument was
attacked (the 10d lesson: a measurement that derives from the thing the
sim orders by cannot be trusted until the derivation is broken):

- **Mechanism:** raw VORP in this 6-pt-pass-TD league buys a second QB
  (83% of bpa_vorp rooms vs 5% of shipped) and a second TE, at the cost of
  RB depth (3.3 RBs vs 5.9).
- **The instrument bias that rewards exactly that:** the season model
  scores a bye/empty starting slot as ZERO, but this league streams
  replacements — the repo's own measured wire prices a streamed QB at
  **23.4 pts/week** (`wire_level.json`, 422 scored acquisitions 2023-25),
  which is most of a starting QB. Under zero-replacement, a QB1-only
  roster eats a ~20-point hole on its QB's bye (≈ −1.3 weekly mean); QB2
  coverage of that hole is worth more than bpa_vorp's whole +0.64 edge.
- **The decomposition points the same way** (post-hoc slice, read as a
  lead not a verdict): in the 100 primary rooms where bpa_vorp took a QB2
  its paired delta is **+1.13 wk**; in the 20 rooms where it did not, it is
  **−1.83 wk**. The entire edge lives where the zero-replacement bias pays.
- **The sensitivity arm kills it** (`--wire-floor`: every dedicated slot
  floored at the measured wire level, FLEX at the lowest flex wire; same
  120 seeds, `archetype_rooms_wirefloor.json`): with streaming priced,
  bpa_vorp's paired delta is **−0.06 wk [−0.22, +0.10]**, champ −0.3pp
  [−0.7, +0.1] — the entire +0.64 evaporates, and `shipped` is first or
  statistically tied-first in all three seed batches. The zero-replacement
  model and the wire-floor model bracket reality (the wire's 23.4 is a
  selection-biased median of adds that were actually started); an edge
  that exists only at one end of the bracket, flips sign under the ADP
  room, and has its mechanism located exactly in the bracketed assumption
  is an instrument artifact, not a draft strategy.
- **And the robustness arms already disagreed:** under noisy-ADP opponents
  bpa_vorp is NEGATIVE (−0.32 wk [−0.62,−0.01], champ −1.8 pp CI-clear) —
  the composite's survival/VONA timing is calibrated against ADP dynamics
  and beats raw VORP in an ADP room, while raw VORP looks better against
  the behavioral room. A sign that flips with the opponent model is not an
  edge you can draft on.

## 6. THE VERDICT — does anything beat the shipped policy from Cory's seat?

**No. The value engine already dominates, and that is the finding.**
Across four model configurations — measured room / real keeper slate
(primary, 120 paired rooms), measured room + wire floor (120), ADP room
(40), unconfirmed-slate board (40) — the shipped policy (composite value;
the seat plan rides within noise of it) is first or statistically
tied-first in every configuration except the bpa_vorp cells under the
zero-replacement season model (primary and mine-only), which §5
dismantles as one instrument artifact. Concretely, in units of this model:

- **No construction archetype helps.** The best-behaved constraints
  (zero_rb, te_early, seat_plan) are FREE at best — every CI includes
  zero in the primary, and each goes CI-clear NEGATIVE in at least one
  robustness configuration. Nothing pays.
- **Several popular archetypes measurably hurt in-model, everywhere:**
  robust_rb (−4.1 wk, champ −9.7pp in the primary; worst arm in all four
  configurations), market_adp (−2.4 wk, champ −6.1pp — the engine's edge
  over simply following ADP at this seat, which is also the honest
  size of the whole draft-policy edge inside this model: ~2 weekly
  points), early_qb (−0.9 wk) and late_qb (−1.3 wk primary; ~0 under the
  wire floor) — forcing QB timing in either direction against the
  engine's own judgment does not pay.
- **The deltas among sane policies are fractions of a weekly point** —
  far inside the 3-9 MAE/position projection error that dominates real
  seasons. Where the archetype deltas are inside the noise, that IS the
  answer: the roster-building edge Cory asked about does not live in
  choosing a different construction shape. It lives where the engine
  already spends its effort — pick-level value against the actual board —
  and, per the robustness spread, in the opponent model itself (the same
  policy is worth ±1-2 pp of champ probability depending on which room
  model is true, which is why the room-behavior work keeps mattering).

**Answer to the mandate, direct form:** yes — the roster-building test
Cory asked for has now been run end-to-end, from his seat, his keepers,
the real designated slate, through season outcomes. The current method
(composite value + rails + seat plan) survived it against eight
challenger constructions under four model configurations. No change to
the draft policy is recommended, and none ships.

## 7. Named limitations — what these numbers cannot say

1. **Everything is conditioned on `proj_mean` being right, and it is not.**
   The FP-archive benchmark prices projection error at 3–9 MAE points per
   position per player-season; the between-archetype weekly deltas above
   are fractions of a point to a couple of points. The RANKING is valid
   *inside the model* (every arm is scored by the same projections, so a
   shared bias cancels — the strategy_compare.js argument), but a real
   season's realized outcome differences between these archetypes would be
   dominated by projection error, not by construction shape. **That is
   itself the answer to Cory's question** (§6).
2. **Opponent-model fidelity.** The measured model was forward-tested as a
   *predictor* of 2025 picks (position log-loss 1.408 vs 1.479 baseline);
   using it as a *generator* is a new use. The ADP robustness arm bounds
   this: conclusions that hold under both rooms are reported; the one cell
   that flips (bpa_vorp) is named unstable.
3. **Constant weekly sd (21.3) for every team.** The measured league
   constant is variance-blind between rosters, so archetypes that differ
   mainly in weekly VARIANCE (boom/bust builds) are not separable here —
   only mean-level and schedule (bye) structure moves these numbers.
   proj_sd is priced on the board but a per-roster weekly-sd derivation
   would be a new unvalidated instrument; deliberately not invented in
   draft week.
4. **Absolute levels are inflated and meaningless; only deltas matter.**
   My seat wins 70-95% playoff probability in these rooms because the
   engine maximizes the same proj_mean the season model scores — the
   drafter is graded by its own ruler while opponents follow a behavioral
   model. Every conclusion above is drawn from PAIRED deltas, never levels.
5. **Keeper slate.** Six teams' designations are unknown (simulated
   keeping zero — stated, not assumed silently); the three designated
   opponents sit at provisional slots. The mine-only arm bounds the other
   direction.
6. **Bench value enters only through byes.** No injuries, no in-season
   variance, no waiver interaction — the same named blind spots as
   season_lineup.js, biased AGAINST depth-heavy archetypes (robust_rb's
   penalty here is therefore, if anything, an underestimate of its bench
   insurance value; its −2 to −4 wk starting-lineup deficit is real inside
   the model but the insurance side is unpriced).
7. **The seat plan arm follows the plan's POSITIONS, not its names** —
   its shortlists and "re-read when the board moves" rule are not
   simulated. And the plan itself was solved against an ADP room, so its
   near-tie with shipped under the measured room is evidence the schedule
   is robust, not proof the DP's 13.7-point edge claim transfers.

## 8. What shipped, what did not — and the prepared-diff clause

- **No default changed, no weight changed, no behavior surface changed.**
  The engine, survival, composite, seat plan and war room are untouched.
  Everything new is Lab tooling (`draft/tools/archetype_*.js`), tests,
  committed research artifacts (`draft/data/archetype_rooms*.json`), and
  this doc.
- **Deliverable 3's gated-diff clause is NOT triggered:** it licenses a
  prepared (not applied) diff only "if an archetype wins meaningfully."
  None did — preparing a diff for a null would manufacture a decision
  where the evidence says hold. The one cell that looked like a win is
  §5's artifact. If a future rerun on a confirmed keeper slate (post
  Aug 20 lock, one command: `node draft/tools/archetype_rooms.js --rooms
  120 --seed 1` after the board rebuild) moves a challenger's paired CI
  clear of zero in BOTH replacement models, the surfacing point is the
  seat plan artifact (`emit_seat_plan.js` — an `archetype_note` field the
  war room prints), and that diff goes through DECISIONS-NEEDED like
  every scoring-adjacent change. Nothing is queued there now, on purpose.
- **One incidental fix that did ship:** `config-check.yml` exempted by
  name in `test_core_needs_no_reviewer.py` (main's key-existence
  diagnostic vs this branch's reviewer guard — reference is
  diagnostic-only; observed red before the exemption was written).

## 9. Tests and rule-10 discharge

New suites, all green in the full sweeps: `archetype_policy.test.js` (37
checks — legality-rails supremacy, ban/seek/rerank domains, TOP_N boundary
both sides, seat_plan semantics), `archetype_season.test.js` (26 —
conservation identities at float epsilon, hand-computed lineup case with a
flex-flip boundary control, hand-computed wire-floor cases with a
floor+0.1 boundary control, MC determinism/non-vacuity, exact
sum(playoff)=4 / sum(bottom3)=3 identities, the rule-11 cross-path check
against champodds), `archetype_rooms.test.js` (18 — determinism,
seed variation, real seat/keeper geometry, overlay and opponent-model
non-vacuity controls, committed-artifact and engine-flag hygiene; smoke
seeds 9001+ only).

Rule 10, discharged this session (per-session, as SESSION-A records): six
deliberate breaks, six catches — `ban()` ignoring its ban list;
bottom-3 counting off by one AT the boundary (caught by the exact-identity
check, observed red by name: "IDENTITY: bottom-3 probabilities sum to
exactly 3"); the driver ignoring the overlay entirely (caught by the
non-vacuity CONTROL); the standings sort dropping the points-for tiebreak
(caught by the cross-path check); the seat_plan overlay ignoring its slot
(observed red by name: "seat_plan with planSlot TE takes the TE"); the
FLEX wire floor flipped min→max (three checks red by name, incl. the
hand-computed 105.88 case).

And rule 10's spirit applied to the INSTRUMENT, where it mattered most:
the bpa_vorp result was not accepted until the season model's
zero-replacement assumption — the exact quantity the winning arm's shape
exploits — was broken on purpose (the wire floor) and the result watched
change. It changed; §5 is that record.

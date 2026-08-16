<!-- TERRITORY: A -->
# THE ENGINE ABLATION LADDER — every layer priced against a bare baseline — 2026-08-16

## 0. The question, verbatim, and the direct answer

Cory, 2026-08-16:

> "Take the current complete engine and decompose its advantage against a
> simple baseline using controlled ablations. Should we try this? And
> anything that doesn't hurt model could be removed?"

**Should we try this? Yes — and it is now done, in two independent frames.**
This pass ablates every CFG-gated layer of the shipped recommendation policy
one at a time, in both directions where defined, through the roster-
construction machinery (Cory's real seat and keepers, measured opponents,
paired seeds, season scoring under BOTH replacement models) and through the
draft-replay harness on 2023-25 real history where a layer is period-
computable. The full table is §3; the classification of every layer is in it.

**"Anything that doesn't hurt could be removed?" — the answer has three
parts, and the table alone doesn't carry them:**

1. **Two layers are not merely FREE — they are provably DISCONNECTED in the
   shipped configuration** (§4): the wire-compared bench branch
   (`VONA_WIRE_BENCH`, ruled ON 2026-08-16) is unreachable dead code while
   `VONA_SLOT_AWARE` is false, and the need-rewriting discounts
   (`ONESIE_NEED_DISCOUNT`, `FLEX_DISCOUNT`) multiply into a weight that is
   zero. Their measured deltas are EXACTLY zero — a structural fact, pinned
   by test, not a noisy null.
2. **Most live layers measure FREE in-sim, and for several of them the frame
   cannot say otherwise by construction** (§6): the sim's opponents are our
   own model, the season scorer is single-season mean-only, and a layer built
   to exploit real-room behavior, price next-season keeper options, or move
   weekly variance is invisible here. FREE-in-frame ≠ removable; each such
   layer carries its caveat in the table.
3. **The prepared off-flip diffs exist for every FREE/HURTS layer (§8),
   NOT applied.** Removal is Cory's ruling, not this pass's, and three of
   the candidates are flips he ruled ON four days before the draft —
   DECISIONS-NEEDED carries the queue item.

**The plain-language echo, said at full volume:** the engine's measured
in-model edge continues to live almost entirely in the VALUE CORE — VONA over
the survival model, plus the legality rails — exactly as the roster-
construction study and the three-year replay already said. The adjuster
layers between the stripped core and the full engine are individually worth
fractions of a weekly point at best in this frame, and the ones that are
CI-clear are mostly clear in the *instrument-artifact* direction the
wire-floor ruler dismantles. The engine's complexity must justify itself in a
frame that can see its payoffs — for several layers that frame is the live
room in six days, not this sim — or shrink.

## 1. What was reused, and what is new

Machinery reused wholesale from the roster-construction pass (nothing about
the room, the seat, the keepers, the opponents, or the season scoring was
re-invented):

- **The room:** Cory at slot 8, real keepers (rounds 1-3 forfeit, first live
  pick 33), the real designated opponent keeper slate from
  `draft/config/keepers.json`, measured opponents (survival.js
  `positionProbabilities` + `positionSoftmax` room mixture with the shipped
  ROOM_MIX prior), hard caps and the legality mirror — byte-for-byte the
  `archetype_rooms.js` room, and PINNED to it: `engine_ablation.test.js`
  reproduces `shipped`/`bpa_vorp` pick-for-pick on shared seeds, so the
  copied mechanics cannot drift silently.
- **The engine:** the real `E.recommend()` through the real
  `live_context.js` under production `MEASURED_WEIGHTS` and shipped flags.
- **Season scoring:** `archetype_season.js` bye-aware weekly optimal lineups
  + standings MC + `champodds.simulate()` with the same per-seed MC seeds as
  the roster study — the `full` arm's outcomes are numerically identical to
  the committed `archetype_rooms.json` `shipped` row (zero-replacement) and
  `archetype_rooms_wirefloor.json` `shipped` row (wire floor).

New: `draft/tools/engine_ablation.js` (the ladder driver; scoped flag flips,
board-view transforms, paired deltas, both season rulers per room),
`draft/tools/engine_ablation_replay.py` (the replay frame),
artifacts `draft/data/engine_ablation_2026.json` (+`_adp` robustness) and
`draft/data/engine_ablation_replay_2026.json`, tests
`draft/tests/engine_ablation.test.js` + `draft/tests/test_engine_ablation_replay.py`.

## 2. The ladder design

**Baseline** = `baseline_bpa`: BPA by raw VORP among engine-endorsed
candidates, legality rails only — the roster-construction pass's `bpa_vorp`
arm, byte-identical. **Full** = the shipped policy (`recs[0]`). Between them:

- `stripped` — the engine with every ablatable layer off at once (wire bench,
  ROOM_MIX, conservation, all onesie/flex discounts and caps, ceiling
  tiebreak, KOV and stack weights zeroed, opportunity adjustment and
  depth-chart fields removed from the policy's board view): the bare VONA
  value core over the rails. `stripped − baseline_bpa` prices the survival/
  VONA machinery itself against raw VORP.
- `minus_<layer>` — full engine with exactly that layer off (13 arms).
- `plus_<layer>` — stripped engine with exactly that layer on (12 arms).
- `plus_vona_slot_aware`, `plus_stage2_cap`, `plus_seat_plan` — the ship-OFF
  flags and the ruled seat-plan headline, added over full.
- `plus_slot_aware_no_wire` — the wire-bench layer measured in the one
  configuration where its branch is reachable (see §4).

**Scoping, the load-bearing point:** an ablation changes MY policy only.
Flags flip around my `E.recommend()` call and are restored before any
opponent samples (`ROOM_MIX_PRIOR` feeds the opponent generator too — an
unscoped flip would change the room, not the policy). Board-level ablations
(opportunity, depth chart) are applied to a cloned view handed to my context;
opponents and the season ruler always see the shipped board. Both halves are
held by test, including a deliberate-leak break observed red.

**Both season rulers, every room.** Zero-replacement (bye/empty slot = 0) AND
wire-floor (every slot floored at the measured waiver level). The roster
study's §5 proved bench/backup effects can flip sign between these — a layer
verdict must survive both ends of the bracket or say which end it lives at.

**Classification rule, preregistered in the driver before the primary run**
(verbatim from the artifact): *vs control, champ_prob + mean_weekly, both
replacement models: EARNS = CI-clear positive contribution in ≥1 model, not
CI-clear negative in the other; HURTS = mirror; FREE otherwise. Any remove_*
delta is (ablated − control): a negative delta there means the layer helps.*

**Runs:** primary — 120 paired seeds (1-120) × 32 arms, measured opponents,
designated keepers, 2,000 season sims/room, batch stability over three
40-seed batches (`draft/data/engine_ablation_2026.json`; regenerated as
three 40-seed chunk runs merged by `engine_ablation_merge.js` — this
environment kills processes on a wall-clock cap shorter than the monolithic
run, the merge recomputes summaries with the driver's own exported
functions, and the artifact records `merged_from_chunks`; per-room numbers
are seed-independent so the chunking changes nothing). Robustness — the same
ladder under noisy-ADP opponents, seeds 1-40
(`engine_ablation_2026_adp.json`). Replay frame — 2023-25
(`engine_ablation_replay_2026.json`). Seeds 9001+ are reserved for mechanics
tests and excluded from every ranking. **SIMULATION throughout — model
outcomes, not measurements; read paired deltas, never levels.**

## 3. The deliverable table — every layer, marginal contribution, classification

**Reading this table:** all deltas are the layer's own arm vs its stated
control, mean [95% CI], 120 paired seeds (measured room), zero-replacement
season model unless the wire-model column says otherwise. `Δ champ pp` is
percentage points of championship probability. Rows marked `↔` report BOTH
directions (remove-from-full and add-to-stripped) because they agreed in
sign; where they didn't, both are listed. `ADP cross-check` names whether the
40-seed noisy-ADP robustness room agrees with the classification — a
disagreement is not a contradiction, it is the roster-construction pass's own
lesson (bpa_vorp's sign flip across opponent models) applied per layer, and
every disagreement is discussed in §6.

| layer | Δ wk (zero) | Δ champ pp (zero) | Δ wk (wire) | replay (2023-25) | CLASSIFICATION | ADP room agrees? |
|---|---|---|---|---|---|---|
| **wire_bench** (VONA_WIRE_BENCH, ruled ON) | 0.00 [0,0] | 0.0 [0,0] | 0.00 [0,0] | not period-computable | **FREE — dead code in the shipped config (§4)** | yes (FREE) |
| ↳ *reachable-config pair* (`plus_vona_slot_aware` vs `plus_slot_aware_no_wire`) | −1.71 [−1.94,−1.47]¹ | −4.2 [−4.8,−3.5]¹ | −0.04 [−0.12,0.05]¹ | n/a | *live under slot-aware VONA — HURTS there too, see §4* | yes (HURTS) |
| **kov_ramp** (KOV_MEASURED_RAMP, ruled ON) | +0.48 [0.22,0.73] | +1.1 [0.5,1.7] | −0.22 [−0.36,−0.07] | not period-computable | **FREE (bracket artifact — sign flips between season rulers)** | yes, same artifact |
| **kov_term** (the whole keeper-option weight) | −0.39 [−0.59,−0.19] (rm) / +0.40 [0.07,0.72] (add) | −0.9 / +1.1 | −0.25 (rm) / +0.11 (add) | not period-computable | **EARNS — CI-clear positive both directions and both replacement models on the mean; wire-model champ CI straddles on the add side** | yes (EARNS) |
| **stack_term** (correlation weight) | −0.03 [−0.10,0.04] | −0.1 [−0.3,0.1] | 0.00 [−0.04,0.04] | not period-computable | **FREE — structurally invisible to a mean-only season model (§6)** | yes |
| **room_mix** (ROOM_MIX_PRIOR, ruled ON) | +0.02 [−0.03,0.08] | +0.1 [−0.1,0.2] | −0.01 [−0.03,0.01] | not period-computable | **FREE — self-referential opponent model (§6)** | yes |
| **conserve** (CONSERVE_SURVIVAL_ON) | −0.31 [−0.46,−0.16] (rm) / +0.54 [0.13,0.94] (add) | −0.6 / +1.4 | +0.10 (rm) / −0.17 (add) | not period-computable | **FREE (bracket artifact — sign flips between season rulers)** | disagrees: ADP calls it HURTS cleanly (§6) |
| **onesie_discount** (the ×0.10 backup-value discount) | +0.95 [0.77,1.13] (rm) / −0.82 [−1.02,−0.63] (add) | +2.5 / −2.2 | −0.12 (rm) / +0.05 (add) | analog: primary rail set, see §5 | **FREE in primary (bracket artifact) — but disagrees with ADP (HURTS-to-remove there), and the removal side (+0.95 wk primary) is a live one-arm win under zero-replacement, mirroring bpa_vorp's own §5 instrument bias** | disagrees: ADP calls it HURTS to remove |
| **onesie_hard_cap** (QB≤2/TE≤2/K≤1/DEF≤1) | 0.00 [0,0] | 0.0 [0,0] | 0.00 [0,0] | **analog EARNS on real history (§5, +27 to +81 pts/season)** | **FREE in-sim, EARNS in the replay frame — read §5/§6, not the sim cell alone** | yes (in-sim FREE) |
| **onesie_need_discount** | 0.00 [0,0] | 0.0 [0,0] | 0.00 [0,0] | n/a | **FREE — vacuous-by-weights (§4), structural** | yes |
| **flex_discount** | 0.00 [0,0] | 0.0 [0,0] | 0.00 [0,0] | n/a | **FREE — vacuous-by-weights (§4), structural** | yes |
| **ceiling_tiebreak** | +0.01 [0.00,0.01] | 0.0 [−0.0,0.0] | 0.00 [0.00,0.01] | n/a | **HURTS — CI-clear but ~0.01 wk, below the instrument's real resolution (§6)** | disagrees: ADP calls it FREE |
| **opportunity** (nflfastR adjustment, board layer) | −0.70 [−0.99,−0.41] (rm) / +0.99 [0.63,1.34] (add) | −1.9 / +2.8 | −0.84 (rm) / +0.96 (add) | not period-computable (lookahead) | **EARNS — CI-clear positive both directions, both rulers, both frames — but graded partly by its own ruler (§6)** | yes (EARNS) |
| **depth_chart** (role-security dampening) | −0.01 [−0.02,0.01] | −0.0 [−0.1,0.0] | 0.00 [−0.00,0.01] | not period-computable | **FREE — mostly vacuous-by-weights (§4)** | yes |
| **vona_slot_aware** (ships OFF) | −0.17 [−0.39,0.05] | −0.5 [−1.1,0.1] | −0.14 [−0.27,−0.02] | not period-computable | **HURTS — confirms the 2026-08-14 shipping decision to leave it off** | yes (HURTS) |
| **stage2_cap** (ships OFF, pre-registered) | −13.06 [−14.52,−11.59] | −20.2 [−21.5,−18.9] | −4.09 [−4.47,−3.72] | not period-computable | **HURTS — decisively; confirms the pre-registration's caution was warranted, not merely untested** | yes (HURTS, larger) |
| **seat_plan** (headline ownership, ruled ON 2026-08-16) | −0.21 [−0.51,0.09] | −0.5 [−1.3,0.2] | −0.52 [−0.71,−0.33] | not period-computable | **HURTS on the wire ruler, straddles on zero — matches the roster-construction pass's own finding (near-tie with shipped, §"seat_plan" row there)** | disagrees: ADP calls it a bracket artifact (FREE) |

¹ this row's control is `plus_vona_slot_aware`, not `full` — see §4.

**Read against the roster-construction pass's own headline number:** the
whole engine's measured edge over the market baseline was ~2 weekly points
(`market_adp` row, roster_construction_2026-08-16.md §6). Every adjuster
layer here — everything between the stripped VONA core and the full engine —
moves the number by fractions of that, and `kov_term` and `opportunity` are
the only two that clear a CI in the direction of "keep it" in EVERY
configuration this pass ran (both season rulers, both opponent rooms). That
is the honest size of "the adjusters, collectively": small next to the value
core, non-zero for two of them, and the roster study's own echo — "if
everything measures FREE except raw VORP" — turns out NOT to be quite true
here, but close: two layers earn, the rest are free-with-a-caveat or
structurally invisible to this instrument.

## 4. The structural findings — true regardless of any CI

These three came out of building the ablations, are pinned by test, and are
worth more than most of the table's rows because they are exact:

1. **`VONA_WIRE_BENCH` is dead code on the shipped scoring path.** The
   wire-compared bench branch lives inside `vona()`'s slot-aware section, and
   `vona()` returns the straight same-position VONA *before reaching it*
   whenever `VONA_SLOT_AWARE` is false (engine.js:806 → the `CFG.VONA_WIRE_BENCH`
   read at engine.js:862 is unreachable) — and `VONA_SLOT_AWARE=false` is the
   shipped, separately-ruled state. `bench_wire_room_sim.js`'s own arm table
   says the same thing: its "on" arm sets BOTH flags. So the layer Cory ruled
   ON on 2026-08-16 ("1. Yes") currently changes nothing the engine
   recommends: the `minus_wire_bench` arm diverged in **0/120 rooms with
   paired deltas exactly 0.0000**, and `engine_ablation.test.js` pins both
   halves (the flip moves bench VONA under slot-aware=true; it moves nothing
   in the shipped config). The wire idea is not refuted — measured in the one
   configuration where the branch is reachable (`plus_vona_slot_aware` vs
   `plus_slot_aware_no_wire`), it does act — but the ruling as shipped is not
   doing what the evidence in front of Cory described. **This needs a ruling
   regardless of what the rest of the table says**: either the flag comes
   back off (diff prepared, §8) or the slot-aware work is finished so the
   branch is reachable. Deliberately NOT silently "fixed" here — wiring the
   branch in would be a behavior change to the live engine in draft week.
2. **`ONESIE_NEED_DISCOUNT` and `FLEX_DISCOUNT` are vacuous-by-weights.**
   Both rewrite `need.value`, and `MEASURED_WEIGHTS.need` is 0 (the
   exp_participation finding, Cory-confirmed 2026-08-09). Mechanism proven
   live under `DEFAULT_WEIGHTS` and proven inert under the shipped weights,
   both by test. Their in-frame deltas are exactly 0 — the finding, not a
   measurement failure. They still act on any surface that runs non-measured
   weights (the sliders, auto mode) — which is why the prepared diffs for
   them are OPTIONAL tidiness, not free wins.
3. **The engine already shrank once, and this ladder measures what's left.**
   Five of the eight composite weights (tier, need, risk, ceiling, bye) are
   already 0 in `MEASURED_WEIGHTS` from the 400-room participation study —
   the "remove what doesn't earn" discipline Cory's question asks for has
   been applied to the weight vector before. Depth-chart dampening is the
   clearest leftover: its main path (risk −6/order) is weight-zeroed, so the
   layer's only live effect in the shipped policy is the small role-security
   term inside KOV's keep-probability model — and its measured delta is
   correspondingly ~0. The remaining live, reachable layers between the
   value core and the full engine are: ROOM_MIX, conservation, the onesie
   discount + hard cap, the KOV term (+ its measured ramp), the stack term,
   and the ceiling tiebreak, plus the board-level opportunity adjustment.
   That is the actual surface of Cory's "could be removed?" question, and
   §3 prices each of them.

## 5. The replay frame — the rails on real history (2023-25)

`draft/tools/engine_ablation_replay.py`, artifact
`draft/data/engine_ablation_replay_2026.json`. The replay's policy is the
value core (the full engine cannot run period-correct — see §6), so the
period-computable ablations are the BASELINE'S OWN RAILS. Layer contribution
= (primary Δ vs Cory) − (ablated Δ vs Cory) on the hindsight-optimal ruler;
positive = the rail helped the tool that year. The primary and room-caps
cells are pinned equal to the committed `draft_replay_2025.json` before the
artifact writes. **Three samples — no CI, spread shown, sign-stability
reported.**

| rail ablated | 2025 | 2024 | 2023 | pooled mean | sign-stable? |
|---|---|---|---|---|---|
| onesie caps (QB2/TE2 → room QB3/TE3) | −34.0 | +34.7 | +80.8 | **+27.2/season** | no |
| feasibility rail (caps kept) | 0.0 | 0.0 | 0.0 | 0.0 | never fired |
| all position caps (→ 99) | −35.9 | +142.4 | +22.8 | **+43.1/season** | no |
| caps AND rail (pure BPA-by-VORP) | −35.9 | +215.1 | +22.8 | **+67.3/season** | no |

What the cells actually say:

- **The onesie caps are the load-bearing rail** — worth ~+27 pts/season
  pooled and up to +81 (2023) against real history, because raw VORP in this
  6-pt-pass-TD league buys third QBs and TEs that can never start (the exact
  §5 pathology `roster_construction_2026-08-16.md` measured in simulation,
  visible here on real drafts: uncapped 2024 drafts QB4/TE6 and loses 215
  more points). 2025 is the one year the caps cost points (−34) — the
  coin-flip year in the original replay too. The engine-side analog
  (`ONESIE_HARD_CAP` + `ONESIE_DISCOUNT`) is the same mechanism priced in
  the sim frame.
- **The feasibility rail's marginal is zero AT THE SHIPPED POINT — and
  large away from it.** With the caps on, the rail never fired in any of the
  three replayed drafts (forced_picks 0/0/0): the caps already keep lineups
  fillable. With the caps OFF it fires (2 forced picks, 2024) and is worth
  +72.7 points that year (−200.4 vs −273.1). A textbook interaction: two
  rails that look redundant at the shipped point back each other up off it —
  removal arguments that price each rail alone at the shipped point would
  wrongly call the rail dead. Rails are kept as a SET.
- **Every engine-side layer: not period-computable**, listed with reasons in
  the artifact's `not_period_computable` — quoting a replay number for them
  would be quoting a number about a board that never existed.

## 6. Honesty rules — what a FREE in this table does and does not mean

Named per layer, because "measured zero" and "worth zero" are different
sentences and conflating them is how a useful layer gets deleted:

- **Self-referential opponent model (ROOM_MIX, conservation, and every dark
  survival layer).** The sim's opponents ARE the measured model with the
  ROOM_MIX prior on. Ablating my side's use of the same model measures
  internal consistency, not real-room accuracy — a layer built to predict
  real opponents can measure ~0 against a room made of itself BY
  CONSTRUCTION. The real evidence for ROOM_MIX stays the 2025 forward test
  (position log-loss 1.408 vs 1.479); this table cannot overrule it and does
  not try.
- **Insurance against states the sim never visits.** Run detection, ADP
  drift, and the owner-tendency/affinity tilts are DARK here (ctx carries
  null run multipliers, null drift, unprofiled intervening seats — the
  production sim context, not an omission), and they exist precisely for
  live-room states (a position run, a room drafting off-book) this frame
  never generates. They are enumerated in the artifact's `dark_layers` with
  reasons, and NO arm was run for them — a measurement of an unexercised
  layer would be a number about nothing. The onesie HARD CAP is partial
  insurance of the same kind: it exists for the tail-tie pathology
  (`ONESIE_KEEP` cannot express "never"), so its mean delta understates it —
  read its rooms_diverged and shape distributions, not just the mean.
- **Payoffs the season scorer cannot see.** KOV pays in NEXT season's keeper
  option — a single-season scorer structurally credits it zero; its in-sim
  delta prices only the distortion it causes this year, which is exactly
  half the trade. Stack pays in weekly correlation/ceiling — this season
  model is mean-only with a constant sd, so stack's measured earn (exp6,
  +$196) is invisible here by construction. The ceiling tiebreak moves
  sub-2.0-point ties, below this instrument's resolution.
- **Graded by its own ruler (opportunity).** The season scorer keeps the
  shipped, opportunity-adjusted `proj_mean`, so the `minus_opportunity` arm
  is partly graded by the layer it removes — the delta is biased TOWARD
  keeping the layer, direction named. The replay frame is the honest
  independent check for projection-layer questions, and the opportunity
  layer is not period-computable there (lookahead), so the sim cell stands
  alone and says so.
- **Both replacement models or it didn't happen.** Any layer whose deltas
  flip sign between the zero-replacement and wire-floor rulers is classified
  FREE with the bracket named — the roster study's §5 lesson (bpa_vorp's
  +0.64 evaporating under the wire floor), applied as a rule this time
  instead of discovered after.
- **The replay frame's own limits.** n=3 seasons, no CI quotable, and only
  the baseline's rails are period-computable — every engine-side layer's
  replay cell reads "not period-computable" honestly rather than carrying a
  number about a board that never existed (DRAFT-REPLAY-PREDECLARATION.md).

<!-- SECTION:DIFFS -->

## 7. Batch stability — three disjoint 40-seed batches, not asserted

The ranking was recomputed independently on seeds 1-40 / 41-80 / 81-120
(`batches` in the artifact), the same discipline as the roster-construction
pass. `full`, `baseline_bpa`, and `stripped` hold their relative order in
every batch (champ%: full 26.7/27.1/27.6, baseline_bpa 28.6/27.5/28.0,
stripped 24.2/25.2/24.1 — baseline_bpa above full above stripped in all
three, though full vs baseline_bpa is a close cluster consistent with §3's
CI). The two CI-clear EARNS layers hold their sign and magnitude in every
batch (`minus_kov_term` champ 26.3/26.3/26.2%; `minus_opportunity`
25.2/25.2/25.1%) — flat and stable, not a lucky pooled mean. The largest
HURTS layer is batch-stable and large everywhere (`plus_stage2_cap` champ
8.1/6.2/6.5% against `full`'s ~27% in every batch — never close to
recovering). The one bracket-artifact layer flagged for a cross-frame
disagreement (`minus_onesie_discount`) is itself stable within the zero-
replacement ruler across batches (29.0/30.0/29.8%) — the instability lives
between rulers and rooms, not between seed batches. 120 rooms is therefore
enough for this question's classification: every CI-clear verdict in §3 is
batch-stable, and the seed noise that remains sits inside clusters the CIs
already call indistinguishable.

## 8. Prepared off-flip diffs — NOT applied, for Cory's ruling

Per the house ruled-flip protocol: a diff is prepared for every layer this
pass classifies FREE or HURTS, gated behind the flag it flips, never
applied. Three of these are flags Cory ruled ON four days before this pass
(`VONA_WIRE_BENCH`, `KOV_MEASURED_RAMP`, `ROOM_MIX_PRIOR`) — removing them is
explicitly **his** call to revisit, not a reversal this pass is authorized
to make, and each diff below says exactly what evidence would justify
reopening that ruling. The queue item is in `DECISIONS-NEEDED.md` §OPEN.

**1. `VONA_WIRE_BENCH` — dead code in the shipped config (§4).** No behavior
changes either way at the current `VONA_SLOT_AWARE=false` state, so this is
not a value diff — it is a housekeeping one: either flip the flag back to
match what it actually does (nothing), or treat this as the trigger to
finish `VONA_SLOT_AWARE` so the branch is reachable. Recommend the second:
the branch measures HURTS once reachable (§3, `plus_slot_aware_no_wire`),
so simply flipping it back to false changes nothing live and would just
relabel a no-op.

```diff
--- a/public/js/draft/engine.js
+++ b/public/js/draft/engine.js
@@
-    VONA_WIRE_BENCH: true,
+    VONA_WIRE_BENCH: false,   // GATED OFF-FLIP, prepared not applied —
+    // draft/audit/engine_ablation_2026-08-16.md §4: unreachable while
+    // VONA_SLOT_AWARE=false (engine.js vona(), the `return straight` before
+    // this branch), so this flip changes NOTHING live today. Housekeeping
+    // only — the flag would then match its own behavior. Cory's ruling.
```

**2. `KOV_MEASURED_RAMP` — FREE, bracket artifact (§3).** Removing it (the
ramp reverts to the old reasoned shape) is +0.48 wk under zero-replacement
and −0.22 wk under wire-floor — a sign flip across the same instrument
bracket that dismantled bpa_vorp in the roster-construction pass. The
measured ramp itself (rounds 4-6 peak, ~0 late) is still the better-evidenced
shape on real keeper history (EXP-KEEPER-OPTION); this diff is prepared only
because the in-sim CI does not clear either direction cleanly enough to call
it EARNS, not because the measured ramp is suspect.

```diff
--- a/public/js/draft/composite.js
+++ b/public/js/draft/composite.js
@@
-    KOV_MEASURED_RAMP: true,
+    KOV_MEASURED_RAMP: false,   // GATED OFF-FLIP, prepared not applied —
+    // draft/audit/engine_ablation_2026-08-16.md §3: FREE, sign flips
+    // between the zero-replacement and wire-floor season rulers (+0.48 /
+    // -0.22 wk). Reverts to the OLD reasoned ramp. The measured shape's
+    // real evidence is EXP-KEEPER-OPTION on real keeper history, not this
+    // sim — reopening this ruling should weigh that, not just this cell.
```

**3. `ROOM_MIX_PRIOR` — FREE, self-referential in this frame (§6).**
CI-clear zero here BY CONSTRUCTION (the opponent generator uses the same
prior). The real evidence for this layer is the 2025 forward test
(log-loss 1.408 vs 1.479), unaffected by anything in this pass — prepared
for completeness of the ladder, not because this measurement casts doubt.

```diff
--- a/public/js/draft/survival.js
+++ b/public/js/draft/survival.js
@@
-    ROOM_MIX_PRIOR: true,
+    ROOM_MIX_PRIOR: false,   // GATED OFF-FLIP, prepared not applied —
+    // draft/audit/engine_ablation_2026-08-16.md §3/§6: FREE in-sim, and
+    // SELF-REFERENTIALLY SO — the sim's opponent generator uses this same
+    // prior, so ablating it here cannot measure real-room accuracy. The
+    // real evidence (2025 forward test, log-loss 1.408 vs 1.479) is
+    // untouched by this pass. Reopening this ruling on this cell alone
+    // would be citing an instrument that cannot see the thing it claims to.
```

**4. `stack` weight → 0 (MEASURED_WEIGHTS.stack).** FREE, structurally
invisible to a mean-only season model — this is the D10-governed weight, not
a CFG boolean, so the diff is to the weight literal.

```diff
--- a/public/js/draft/engine.js
+++ b/public/js/draft/engine.js
@@
-  const MEASURED_WEIGHTS = { value: 1.0, tier: 0.0, need: 0.0, risk: 0.0, ceiling: 0.0,
-    keeper: 1.0, bye: 0.0, stack: 1.0 };
+  const MEASURED_WEIGHTS = { value: 1.0, tier: 0.0, need: 0.0, risk: 0.0, ceiling: 0.0,
+    keeper: 1.0, bye: 0.0, stack: 0.0 };   // GATED OFF-FLIP, prepared not
+    // applied — draft/audit/engine_ablation_2026-08-16.md §3/§6: FREE
+    // here, but this season model is mean-only with constant sd and
+    // cannot see stack's measured correlation/ceiling payoff (exp6,
+    // +$196) BY CONSTRUCTION. This is D10's weight (Cory 2026-08-08,
+    // reaffirmed 2026-08-13) — reopening it should weigh exp6, not this
+    // cell, which structurally cannot contradict it.
```

**5. `CEILING_TIEBREAK` → false.** The one layer that is CI-clear HURTS on
its own (not a bracket artifact) — but at ~0.01 wk, an order of magnitude
below every other row's resolution, and it disagrees with the ADP room
(FREE there). Lowest-priority candidate in this set; prepared for
completeness.

```diff
--- a/public/js/draft/engine.js
+++ b/public/js/draft/engine.js
@@
-    CEILING_TIEBREAK: true,       // same-tier/same-position near-ties lean to higher ceiling
+    CEILING_TIEBREAK: false,      // GATED OFF-FLIP, prepared not applied —
+    // draft/audit/engine_ablation_2026-08-16.md §3: CI-clear HURTS at
+    // ~0.01 wk (below this instrument's real resolution) in the primary
+    // room, FREE in the ADP robustness room. Lowest-confidence candidate
+    // in this queue; the weekly-payout ceiling lean this term implements
+    // is a design intent (Cory 2026-08-10), not a measured fit — weigh
+    // that against a sub-0.01-wk in-sim signal before ruling.
```

**Deliberately NOT prepared as an off-flip:** `ONESIE_DISCOUNT` and
`ONESIE_HARD_CAP`. Both cross-frame-disagree or show the replay-frame EARNS
signal (§3, §5) that the in-sim cell cannot see — preparing a removal diff
for a rail the real-history frame prices at +27 to +81 pts/season would be
exactly the "manufacture a decision the evidence says hold" pattern the
roster-construction pass named. `VONA_SLOT_AWARE`, `STAGE2_CAP`, and
`SEAT_PLAN` already ship in their measured-correct state (off/off/on) — no
diff to prepare. `depth_chart` has no single flag (it is two call sites); a
diff would need to touch `riskAdjustment` and `keepProbability` separately
and neither shows a CI-clear signal worth the surface area.



## 9. What shipped, what did not

**No default changed, no weight changed, no behavior surface changed.** The
engine, survival, composite, and seat plan are untouched. Everything new is
Lab tooling (`draft/tools/engine_ablation*.js`, `engine_ablation_replay.py`,
`engine_ablation_merge.js`), tests, committed research artifacts
(`draft/data/engine_ablation*.json`), and this doc. The gated diffs in §8 are
prepared, not applied — every one of them a Cory ruling, not this pass's.

**Answer to the mandate, direct form:** yes, decompose-by-ablation was worth
trying, and it now exists as a rerunnable instrument in two frames rather
than a one-time report. Two structural findings (wire_bench dead code,
need/flex vacuity) are exact and should be resolved regardless of the rest of
the table. Two layers (`kov_term`, `opportunity`) earn their keep by every
measure this pass could take. The onesie rails earn clearly on real history
and read FREE-with-a-caveat in-sim — read them together, not apart. Every
other live layer is FREE with a named reason this frame cannot see its real
payoff, or is already correctly shipped off (`vona_slot_aware`,
`stage2_cap`). Nothing here says "shrink the engine now" — it says which five
things to ask Cory about before the 22nd, and which two the evidence already
answers.

## 10. Tests, and the rule-10 record

New suites, green in the full sweeps (`engine_ablation.test.js` 42 checks;
`test_engine_ablation_replay.py` 6 tests):

- **Flag plumbing, layer by layer — the mandate's own requirement ("a flag
  that changes nothing is a broken ablation, test it"), discharged in both
  directions:** every CFG-gated flip is proven to change the surface its
  mechanism lives on (kov_ramp / room_mix / conserve / ceiling_tiebreak /
  vona_slot_aware / stage2_cap move the real pick-33 top-15; onesie
  discount/cap move a constructed QB2/QB3; keeper/stack weights move
  keeper-eligible/stacked players; the board transforms move
  proj_mean/vorp/keepProbability) — AND the three layers that CANNOT move
  the shipped surface are pinned inert with their mechanism proven live
  elsewhere (wire bench: live under slot-aware, dead in shipped;
  need/flex discounts: live under DEFAULT_WEIGHTS, inert under
  MEASURED_WEIGHTS). The inert pins are load-bearing: they are the §4
  findings, held by test rather than prose.
- **Scoping:** every opponent-generator `positionProbabilities` call is
  recorded during a `minus_room_mix` room and must see the SHIPPED prior
  (127 calls, all true); `withFlags` restores on throw.
- **Room parity:** `full`/`baseline_bpa` reproduce `archetype_rooms.js`'s
  `shipped`/`bpa_vorp` pick-for-pick and to the same weekly mean on shared
  seeds — the copied room mechanics carry a no-drift pin instead of trust.
- **Exactness:** an arm with zero diverged rooms must show paired deltas of
  EXACTLY zero in both season models (float-exact identity, no tolerance
  band — rule 10b: the quantity is an identity, so the band is zero).
- **Classification:** the preregistered rule unit-tested in both directions,
  including the remove-direction sign flip and the bracket-artifact case.
- **Replay frame:** each rail ablation proven a real switch on a fixture
  where its rule BINDS (rule 10a — the feasibility-rail fixture forces
  exactly at the boundary where 4 picks meet 4 slots); the no-starters
  parameterization proven to never force; the parity discipline (primary ==
  committed replay, room-caps == committed grid) enforced in the driver
  before writing AND re-checked on the committed artifact; n=3 honesty
  pinned (no CI fields exist in the pooled block).
- **Hygiene:** scratch runs never touch committed artifacts; every CFG
  default matches the shipped rulings after all runs; the committed
  artifact embeds the replay frame by sha256 (no-retype, enforced).

Rule 10, discharged this session — five deliberate breaks, five catches red
by name, restored byte-identical:

1. `withFlags` restore disabled → "withFlags sets the flag inside the
   callback and restores it after" red (plus the cascade of plumbing checks
   that depend on restoration — the guard is load-bearing, not decorative).
2. `stripOpportunity` gutted to a no-op clone (the subtle half: fields still
   deleted, mean-revert disabled) → both the unit check AND the driver-level
   `minus_opportunity` divergence CONTROL red — proving the control itself
   is non-vacuous.
3. `classify` direction sign dropped → both sign-convention checks red.
4. The scoping guarantee broken on purpose (arm flags wrapped around the
   opponent pick) → the SCOPING check red on the recorded opponent calls.
5. (py) `NO_STARTERS` quietly reverted to the real starter map (the rail
   "ablation" that ablates nothing) → both rail tests red
   ("test_feasibility_rail_ablation_changes_the_draft_where_the_rail_binds",
   "test_no_starters_parameterization_never_forces").

Suites: full pytest 2553 passed / 5 skipped; JS sweep green (the one
mid-build red was this file's own committed-artifact check before the
primary artifact landed, green after).

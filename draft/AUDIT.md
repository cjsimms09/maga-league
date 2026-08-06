# War Room — Technical Audit Brief

**Audience:** an engineer or model auditing this system for correctness and improvements.
**Scope:** the commissioner-only fantasy draft optimizer. Nothing here is user-visible to
league members; the route is behind a commissioner check.

This document is written to be *attacked*. Section 7 lists what I believe is weakest,
ranked, so an auditor can start where the expected value is highest rather than reading
top to bottom.

---

## 1. What it is

A keeper-league draft optimizer. Its job is to answer one question on the clock:

> Of everyone still on the board, who should I take **right now**, given who is likely to
> be gone before my next pick?

The primary metric is **VONA** (Value Over Next Available) — not raw projection, not ADP
value. VONA asks what you *lose by waiting*, which is the only question that matters when
you can only make one pick.

Format is config-driven throughout. It is currently pointed at a 10-team, 3-keeper,
half-PPR Sleeper league, but nothing about those numbers is hardcoded.

---

## 2. Architecture

Two tiers, no backend server for the draft logic.

```
  Sleeper API ─┐
               ├─► draft/*.py  (nightly, GitHub Action)  ─► public/draft_data.json
  nflfastR ────┘                                                    │
                                                                    ▼
                                          public/js/draft/*.js  (browser, live)
                                                    │
                                     ┌──────────────┼──────────────┐
                                 survival.js    engine.js     composite.js
                                   (A2)      (VONA + score)      (A3)
```

**Why split this way.** Everything slow and data-hungry (pulling play-by-play, blending
projections, rebuilding ADP around keepers, computing VORP) is offline and cached in a
committed JSON artifact. Everything latency-sensitive (survival, VONA, composite scoring,
re-scoring after every pick) runs client-side against that artifact. Consequence: during a
live draft there is no service that can go down and no network round trip in the hot path.

**File map**

| Path | Role |
|---|---|
| `draft/sleeper_import.py` | Module 0 — league import, history chain, prior drafts |
| `draft/config_schema.py` | Config schema + validator (fails with *all* problems, not the first) |
| `draft/scoring.py` | Stat line → fantasy points under *our* scoring table |
| `draft/projections.py` | Consensus baseline + nflfastR opportunity adjustment |
| `draft/keepers.py` | Keeper costs, true pick order, ADP re-fit, keeper optimizer |
| `draft/vorp.py` | Replacement level (iterative FLEX), VORP, tiers |
| `draft/managers.py` | A1 — per-manager behavioural profiles |
| `draft/build.py` | Orchestrator → `public/draft_data.json` |
| `public/js/draft/survival.js` | A2 — three-layer survival model |
| `public/js/draft/composite.js` | A3 — KOV, bye collision, correlation |
| `public/js/draft/engine.js` | VONA + composite orchestration |
| `public/js/draft/sync.js` | Live Sleeper draft polling |
| `public/js/draft/app.js` | UI controller |
| `public/js/draft/config-screen.js` | Import confirmation screen |

**Server surface.** Only three routes, all commissioner-gated:
`GET /admin/warroom`, `GET|POST /admin/draft-config` (+ `.json` export), and
`GET /admin/sleeper-proxy` — a **regex allow-listed** read-only passthrough used only if
the browser's direct Sleeper call is blocked by CORS. Sleeper's CORS headers could not be
verified from the build environment, so the client races direct-vs-proxy on first call and
remembers the winner.

---

## 3. Data flow, offline pipeline

1. **Import** (`sleeper_import.py`). `GET /league/{id}` → scoring, roster positions,
   settings. `/users` + `/rosters` → managers. `/drafts` → prior draft, from which each
   player's **original draft round** is recovered (needed for `original_round` keeper
   costs). `previous_league_id` is walked backward (max depth 15) to collect every prior
   season. All responses cached on disk with TTLs; a stale cache is preferred over a
   failed build.

2. **Validate** (`config_schema.py`). Refuses to proceed on a bad config and reports every
   problem at once. Derives `starters`, `bench_size`, `rounds`.

3. **Project** (`projections.py`). Consensus stat lines are rescored under *our* scoring
   table — a provider's precomputed points are never trusted. Opportunity metrics from
   nflfastR (WOPR = 1.5·target_share + 0.7·air_yards_share, RB opportunity share, RZ/GL
   share, aDOT) are recency-weighted 70/30 across two seasons, z-scored per position, and
   applied as a multiplier **capped at ±15%**. Floor/ceiling are the 25th/85th percentile
   of a positional-variance band.

4. **Keeper adjustment** (`keepers.py`) — *the highest-leverage module*. Public ADP is
   invalid in a keeper league in two ways at once, and both are corrected:
   - the **player pool** shrinks (kept players removed), and
   - the **pick sequence** shrinks (forfeited picks removed, everything renumbered).

   Keeper cost supports `original_round | fixed_round | escalator | no_cost`, plus a rule
   for undrafted/waiver adds. Two keepers costing the same round roll the second forward
   (a team cannot forfeit one pick twice). Then ADP is re-fit: the surviving pool is ranked
   by consensus and mapped onto the *true* remaining pick numbers, blended
   `0.7 × adjusted + 0.3 × shifted_raw` (weight is config) because human drafters partly
   anchor on public boards even when those boards are wrong here.

5. **VORP + tiers** (`vorp.py`). Replacement is the last-starter baseline. FLEX makes this
   circular — how many RBs start depends on how good the WRs are — so allocation iterates
   to convergence (≤5 passes, ε=0.01). Tiers break where a projection gap exceeds 1.5× the
   rolling mean gap at that position.

6. **Manager profiles** (`managers.py`) — see §5.

7. **Emit** `draft_data.json` (~110KB): league config, true pick order, my pick numbers
   before and after keepers, every player with projection/VORP/tier/adjusted ADP, manager
   profiles, and provenance notes.

---

## 4. A2 — the survival model (read this closely)

VONA is almost entirely a function of what survives the next 11–23 picks, so this is where
accuracy is worth the most.

**Layer 1 — ADP baseline.** `P(taken by n) = Φ((n − adp_mean) / adp_sd)`,
`adp_sd = max(3.0, 0.22 × adp_mean)`.

**Layer 1 conditioning — the subtle part.** Layer 2 only models picks from *now* forward,
so it is inherently conditional on the player being available now. Layer 1 is
unconditional. Blending those two directly mixes different quantities and miscalibrates
every survival number in the tool. Layer 1 is therefore conditioned:

```
P(taken by n | survived to c) = (F(n) − F(c)) / (1 − F(c))
```

**Layer 2 — roster-need aware.** For each intervening pick,
`P(team takes position p) = softmax(α · need(t,p) + β · bestAvailableValue(p))`.
`need` counts empty starting slots weighted by a per-position urgency curve over draft
progress (an empty QB slot in round 8 is urgent; an empty K slot is not until the end),
plus flex-driven need, plus a forced-pick term making K/DST near-certain in the final two
rounds. `α, β` come from the manager's `bpa_vs_need`. Within a position, the specific
player is drawn by softmax over VORP, with the temperature widened for known reachers.

**Composition, not blending.** Layer 2 can only speak to the window it was given picks for.
Past that window the two layers are **composed as a product of survivals**:

```
S(target) = S_window × S_layer1(windowEnd → target | survived window)
```

This is both correct and makes monotonicity in pick number *structural* rather than
something to test and hope for.

**Layer 3 — live run detection.** Rolling 10-pick window; observed vs ADP-expected
positional rate → `mult = clamp(1 + 0.5·(obs/exp − 1), 0.6, 1.8)`, applied to the **hazard**
(`taken = 1 − (1−taken)^mult`) so it can never produce >100%. Banner at ≥1.4.

**Performance.** Position probabilities and the board-thinning sequence are identical for
every player being scored, so they are precomputed once per `(currentPick, targetPick)` and
memoised on the context object. Without that, scoring a 200-player board across a 24-pick
window is ~30M inner ops per render. With it: **~8ms**. There is a test guarding <150ms.

---

## 5. A1 — manager behavioural profiles

Six metrics per manager from every prior draft: `reach_delta`, `positional_timing`
(mean round of first QB/TE/K/DST vs league), `homer_index`, `rookie_affinity`,
`bpa_vs_need`, `positional_mix`. Each is shrunk toward the league average by sample size
(`n / (n + 2)`), so one draft never drives a strong prior.

**Honesty note that matters for the audit.** Sleeper publishes no historical ADP and no
free source does. Two metrics (`reach_delta`, `bpa_vs_need`) need a value ordering, so they
proxy it with the player's *current* consensus rank — which is **hindsight-biased**: a
player who busted ranks low today, making whoever drafted him look like a reacher. Handled
three ways, never hidden: both are flagged `proxy: true`, shrunk twice as hard
(`n / (n + 4)`), and the four ADP-free metrics carry the profile when the sample is thin.

Output is `config/manager_profiles.json`, hand-editable; a `locked` flag on the file or on
any individual manager survives rebuilds.

---

## 6. A3 — composite score

```
Score = VONA
      + w_tier    · TierCliffUrgency
      + w_need    · StarterSlotMarginal
      + w_risk    · RiskAdjustment
      + w_ceiling · UpsideBonus
      + w_keeper  · KOV
      − w_bye     · ByeCollisionPenalty
      + w_stack   · CorrelationAdjustment
```

All seven weights are live UI sliders, persisted to `localStorage`, with a reset.

- **TierCliffUrgency** = `tier_drop × P(every remaining tier-mate is gone by my next pick)`.
- **StarterSlotMarginal** — full VORP for an empty starting slot; for bench, the upgrade
  over the incumbent discounted 0.35, plus an injury-rate-scaled insurance premium.
- **RiskAdjustment** — positional age cliffs (RB 27 / WR 30 / TE 31), injury status, depth
  chart, and opportunity-vs-consensus divergence.
- **UpsideBonus** = `(ceiling − mean)` weighted by draft progress, ×1.6 in the last 5 picks.
- **KOV** = `P(kept) × [E[VORP_next] − E[VORP at the forfeited round]] × 0.75`, ramped from
  zero at round 6 to full at round 12. `P(kept)` is a logistic over keeper cost implied by
  draft round, age vs positional peak, experience, depth chart, and breakout signal.
- **ByeCollisionPenalty** — *computed*, not a constant: only fires when the bye actually
  forces a replacement-level starter into the lineup, scaled by the drop and a positional
  weight (QB/TE hurt most).
- **CorrelationAdjustment** — QB↔own pass-catcher positive, same-team target competition
  negative, deliberately modest in redraft. A playoff-schedule term exists but is inert
  unless the artifact carries `playoff_sos` — it is never invented.

Every recommendation carries a `reasons[]` array and a full component breakdown (raw and
weighted) surfaced in a **Why?** modal, so any pick can be audited after the fact.

---

## 7. Where I think this is weakest — start here

Ranked by expected value of investigating.

1. **`search_rank` is not ADP.** The single most systemic weakness. Sleeper's
   `search_rank` is an internal popularity/search ordering, used throughout as the ADP
   proxy. It feeds `adjusted_adp`, every survival curve, VONA, and the A1 proxy metrics.
   If it diverges from real draft behaviour, *everything* downstream tilts. Worth: finding
   a free real-ADP source, or calibrating `search_rank → ADP` against the league's own
   prior drafts (we have them, and they are the ground truth for *this* room).

2. **Layer 2 treats intervening picks as independent.** Survival is `Π(1 − p_i)`, but if
   pick *i* takes the player, pick *i+1* cannot. Over a 12–24 pick window with small `p_i`
   the error is modest, but it systematically *understates* survival. A proper sequential
   formulation (or normalising so each pick's position probabilities consume board mass)
   would be more correct.

3. **The board-thinning approximation is greedy.** Between picks, only the single modal
   pick is removed. Real drafts branch. This biases the model toward whichever position
   looks hottest and probably makes tier-cliff estimates slightly overconfident. A cheap
   improvement: remove expected mass across the top few candidates rather than one player.

4. **`withinPositionProbability` is uncalibrated.** The `exp((v − max) · temp / 10)` scaling
   — particularly the `/10` — is an arbitrary choice that sets how sharply a manager picks
   the top man at a position. It has real influence on VONA and nothing calibrates it. The
   league's own prior drafts could fit it directly.

5. **Projection variance is a flat positional constant.** `POSITION_VARIANCE` treats every
   RB as equally volatile. Role (bell-cow vs committee), target concentration, and
   touchdown dependence all matter and are available in the data we already pull. Floor and
   ceiling — and therefore `UpsideBonus` — inherit this crudeness.

6. **KOV's `E[VORP available at the forfeited round]` uses *this* year's board.** Next
   year's draft class is unknown, so today's board stands in for it. Directionally fine,
   but it systematically misvalues positions whose replacement level is expected to shift.

7. **Opportunity metrics are unvalidated end-to-end.** The nflfastR code path has only ever
   run against fixtures — the build sandbox has no network. The column names and shapes are
   from the documented schema, not from an observed response. **First real CI run should be
   checked closely**; the code deliberately degrades to consensus-only on any exception,
   which means a silent schema mismatch looks like "no opportunity data" rather than an
   error. That is a deliberate tradeoff, but it hides breakage.

8. **`keepProbability` coefficients are hand-set, not fitted.** The logistic weights are
   reasoned, not learned. The league has years of keeper decisions in its history — those
   are labelled training data sitting unused.

9. **A1 profile→draft-slot mapping falls back to enumeration order** when profiles carry no
   explicit `draft_slot`. If that fallback is wrong, Layer 2 applies the wrong manager's
   tendencies to the wrong seat — quietly. Should fail loudly or require the mapping.

10. **No test uses real Sleeper data.** Every test is fixture-driven. Fixtures were
    corrected three times during development *because the fixtures were wrong, not the
    code* (see §8). That pattern is a standing risk.

---

## 8. Bugs found and fixed during development (for pattern-matching)

Listed because each was silent, and similar ones may remain.

- **Layer 1/Layer 2 quantity mismatch.** Layer 1 unconditional, Layer 2 conditional on
  current availability. Blending them miscalibrated every survival number. Fixed by
  conditioning Layer 1 and composing windows.
- **A2 never reached VONA.** `scorePlayer` passed `ctx.runMultipliers` (a bare
  `{POS: number}` map) into `vona()`. `normalizeCtx` correctly interpreted that as
  "run multipliers only", so the entire three-layer model was computed and then discarded
  in the metric the tool is built around. Now guarded by a regression test.
- **`expectedVorpAtPick` used nearest-ADP.** A single mispriced player at that ADP drove
  the whole KOV surplus. Now takes the best VORP among players expected to still be there.
- **Non-monotonic survival** past the modelled window (see the composition fix).

**Fixture errors that masked real behaviour** (each a passing test that proved nothing):
a VONA tier test whose tier-mates were ~100% gone in both arms; a KOV test with kickers
carrying 90 VORP; a manager-profile fixture where early-QB personas took a QB every round
and starved the late-QB personas.

---

## 9. Running it

```bash
cd league/draft
pip install -r requirements.txt

python -m pytest tests -q          # 28 tests: scoring, config, keepers, VORP, tiers, A1
node tests/engine.test.js          # 26: survival, VONA, composite
node tests/update.test.js          # 29: A2/A3 + regression + perf guard

python build.py --league-id <id> --slot 4    # real build (needs network)
python build.py --offline                    # fixtures only
```

83 tests total, all green. Notable acceptance tests:
scoring reproduces 10 hand-computed half-PPR lines exactly; zero keepers ⇒ `adjusted_adp`
tracks raw ADP within 1 pick; a full keeper slate shifts my pick numbers correctly and
removes every kept player; VONA is measurably higher for the last player in a tier;
survival declines monotonically; profiles beat a league-average baseline on a held-out
draft by log-loss; KOV ≈ 0 for a 30-year-old taken in round 2 and substantial for a
23-year-old in round 13.

---

## 10. Not built yet

Monte Carlo (Module 8) was never built. That blocks A4 (profile-driven opponent
simulation), A5 (pick-pair optimisation at the turn), A6 (regret minimisation — needs
simulated worst cases), and A7 (post-draft audit). The UI already detects when the top two
candidates fall within the 2.0-point tie threshold and says the tiebreaker is pending.
The keeper optimizer's math (`keepers.optimize_keepers`) is written and tested but has no
UI panel. All of Part B (in-season: lineup optimizer, playoff odds, waivers, trades) is
unstarted.

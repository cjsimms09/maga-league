<!-- TERRITORY: A -->
# LEAGUE DRAFT-ROOM BEHAVIOR — MEASURED, PREREGISTERED, GATED — 2026-08-15

The draft engine's survival model prices "will player X still be there at my
pick" off market ADP plus noise. This league's ten owners are not the market:
`draft/data/league_history.json` carries every real pick they made in 2023,
2024 and 2025. Nobody had measured how THESE owners actually draft — the
closest artifacts (`opponent_profiles.json`, `opponent_persistence.js`) are
descriptive or exact-player-graded, and the persistence tool's own verdict was
a tie that "does not distinguish the two worlds." This document measures the
room, preregisters a forward test, and gates any engine consumption on that
test's outcome. Draft is 2026-08-22 — seven days out. The deliverable is
evidence plus a gated feed, never a silent behavior change.

Everything below the PREREGISTRATION heading was written and fixed BEFORE
`draft/backtest/draft_behavior.py` produced a single validation number. The
data census was taken first (you cannot preregister a test against data whose
shape you do not know); the census contains no outcome of the test.

---

## 1. Data census (taken before preregistration; contains no test outcomes)

**Source:** `draft/data/league_history.json` `seasons[].drafts[0].picks`
(round, pick_no, roster_id, player_id, is_keeper), 150 picks per season,
2023/2024/2025 complete; 2026 pre_draft, 0 picks. Owner identity via each
season's `owners` map (roster_id → display_name), first names via the
`FIRST_NAME` table in `src/routes/history-data.js` — parsed out of that file
at runtime, not retyped (the no-retype rule). Positions via
`draft/data/player_positions.json` (the historical union map built for exactly
this join — see `draft/tools/position_map.js` for the five-times-repeated bug
it exists to prevent), with `draft/config/keepers.json` names as a secondary
source for two ids the union map lacks.

**The 2023 keeper trap, found by looking.** The 2023 main draft carries
**zero** `is_keeper` flags, and `src/routes/history-data.js` says "2023 has
none; 2024 is the first with keepers." Both are wrong about the season and
right about the flags: 2023's season object carries a SECOND 30-pick draft
(draft_id 990840142107619329, all `is_keeper: true`, rounds 1–3), and all 30
of its (roster_id, player_id) pairs reappear in the main 2023 draft — 25 at
the identical (round, pick_no) — occupying rounds 1–3 almost completely.
2023's keepers were recorded in a parallel keeper draft and placed unflagged
into the main board. **Every analysis here marks a 2023 main-draft pick as a
keeper when its (roster_id, player_id) pair appears in that parallel draft.**
Consequence worth stating: `opponent_profiles.json` and
`opponent_persistence.js` filtered on `is_keeper` alone, so their 2023
"decisions" include 30 keeper placements that were never decisions. The
counts below are the corrected ones.

| season | keepers | decisions | decisions in rounds 1–3 |
|--------|---------|-----------|--------------------------|
| 2023   | 30 (3/team, parallel-draft join) | 120 | 1 |
| 2024   | 23 (flagged) | 127 | 7 |
| 2025   | 20 (flagged) | 130 | 10 |

**Total: 377 non-keeper decisions** (not the ~420 a flag-only count gives).
2023 has essentially no early-round decisions — rounds 1–3 were keepers — so
any "early" behavior estimate for 2023 is built on one pick and is labeled
accordingly wherever it appears.

**Position coverage:** 376/377 decisions resolve to a position
(player_positions.json ∪ live board ∪ keepers.json names). One 2025 pick
(player_id 12530) resolves nowhere and is excluded from position-conditional
measures, counted in the artifact.

**Era-correct ADP: NOT on file, stated plainly.** Checked every archive the
audit docs name:
- `draft/data/adp_series.json` — 2026 only (7 daily snapshots, staleness instrument).
- `draft/data/external_adp_series.json` — 2026 only (5 snapshots, D3 archive).
- `draft/data/master_sheet_archive.json` — money/standings, no ADP.
- `draft/data/bbm/` — 2023 Underdog picks exist but under UUID player ids with
  no name column in the committed subset; no crosswalk to Sleeper ids.
- The FantasyPros/FFC/MFL historical fetches (`exp36`, `exp_source_grade`,
  `exp_fp_hist_proj`, `archived_adp.py`) all ran in CI with egress and
  committed only summaries — g-gate markers, per-cell rhos — never per-player
  boards. `exp36_picks.json` (adp+owner per pick) is a CI-side file, absent
  from the repo.
This sandbox has no egress, so per-pick reach against contemporaneous market
ADP cannot be computed here. **Fallback, labeled everywhere it is used: the
room's own prior-season pick order** ("room proxy") — for a 2025 target, a
player's mean decision-index across 2023–24; for 2024, his 2023 value. This is
the same symmetric-information-cutoff construction `opponent_persistence.js`
already uses and defends. It is NOT market ADP: it confounds market movement
with career trajectory, which is why per-owner "reach" below is centered
against the same-season field mean (shared drift cancels to first order) and
is presented as a room-relative tendency, never a market-relative one.

**The engine baseline, stated precisely** (read from
`public/js/draft/survival.js`, this branch): Layer 1 is
`P(taken by pick N) = Φ(liveIndex(N); μ=adp, σ)` with
`σ = min(ADP_SD_CAP=15, max(ADP_SD_FLOOR=3, ADP_SD_RATE=0.15 × adp))` when the
source provides no sd (`adpSd`, survival.js:133–137), conditioned on current
availability by `(F(N)−F(c))/(1−F(c))` (`layer1TakenGivenAvailable`,
survival.js:272–278), with pick numbers converted from board slots to the
selection scale (`liveIndexOf` — keeper slots removed from the numbering).
Layers 2–3 (roster-need softmax, run hazard) modulate this, but Layer 1 is the
long-horizon anchor and the thing "ADP plus noise" names. The forward test's
baseline arm is exactly this formula on the decision-index scale (which IS the
live-index scale: keepers excluded from the numbering), with the room proxy
standing in for ADP in both arms — symmetric, so neither arm wins on
information the other lacks.

---

## 2. PREREGISTRATION — fixed before any validation number was computed

### 2.1 The forward test

**Fit on 2023+2024. Predict 2025 pick-by-pick.** 2025 predictions use nothing
from 2025 except the live draft state at each pick: the board structure (slot
order, which slots are keepers — known before a keeper-league draft starts),
the keeper slate, and picks already made. Signatures, league rates, and the
room proxy are built from 2023–24 only.

**Scales.** All survival math runs on the decision-index scale: within a
season, non-keeper picks numbered 1..D in board order (D=130 for 2025).
Keepers consume board slots, never decision indices — the same conversion
`liveIndexOf` performs live.

**Population.** At each 2025 decision moment t (t = 1..130, evaluated before
the pick is made), the evaluation set is every player still on the board with
a room proxy (seen as a 2023 or 2024 non-keeper pick) and proxy ≤ (t−1) + 40.
Players without a proxy (rookies, never-drafted) are invisible to both arms
equally and are counted, not scored — the same construction, and the same
honesty note, as opponent_persistence.js.

**Baseline arm (the engine's effective Layer 1).**
`P(gone by decision t+h−1 | alive before t) = (F(t+h−1) − F(t−1)) / (1 − F(t−1))`,
`F(x) = Φ(x; μ=proxy, σ=min(15, max(3, 0.15·proxy)))`.

**Model arm (behavior-informed).** A simplified Layer-2 walk over the next 24
decision steps from t, using the known owner sequence:
- Step i's owner o, round r (of the board slot), bucket b = early(r≤3) /
  mid(4–9) / late(r≥10) — the live code's `ROUND_BUCKET`.
- Position distribution `q(pos) ∝ (n_{o,b}(pos) + m·league_share_b(pos)) /
  (n_{o,b} + m)` with pseudo-count **m = 8**, then multiplied by **0.35** for
  any position where o's dedicated starter slots (QB1 RB2 WR2 TE1 K1 DEF1)
  are already full at moment t (mirroring the engine's `needWeight = 0.35`
  when starters are full), renormalized. Roster state is frozen at t for all
  24 steps — a stated simplification.
- Within position: alive proxied players sorted by proxy; geometric weights
  `w_j ∝ exp(−(rank_j − 1)/2)` over the top 8, a shared tail budget of 0.01
  outside it (mirroring `WITHIN_POS_TAIL_P`'s budget-not-constant fix).
- Fractional thinning across steps (availabilities decremented in
  expectation, never a greedy delete — the same argument as
  `precomputeLayer2`). `P_model(gone by t+h−1) = 1 − Π_{i=1..h}(1 − p_i)`.

All constants above (m=8, 0.35, geometric /2, top-8, tail 0.01, horizon set)
are declared here, before results, and are not tuned afterward. No constant is
fit to 2025.

### 2.2 Metrics and decision rule

**(a) Survival calibration.** Horizons h ∈ {6, 12, 18, 24} decisions ahead
(a full snake round for this room is 9 opponent decisions or fewer, so this
spans the VONA window). For every (moment t, horizon h with t+h−1 ≤ 130,
player in eval set): predicted P(gone within h) vs what happened. Score:
**Brier score, pooled and per-horizon**, model vs baseline, plus a 10-bin
reliability table for each arm. Primary criterion: **pooled Brier,
model < baseline.**

**(b) Next-pick position.** For each of the 130 decisions: the model's step-1
position distribution for the owner on the clock, vs the league base-rate arm
(2023–24 league bucket shares, no owner term, no need term). Score: **top-1
hit rate and log-loss** (probabilities clipped at 1e-3). Secondary criterion:
**model log-loss < league-base log-loss.**

**Decision rule, fixed now:** the gated engine consumption path is built
**iff (a) AND (b) both hold**. If either fails, no engine hook of any kind —
the artifact and this document stand as the measured answer. Wins and losses
are reported either way, per-horizon, including any horizon the model loses.

**Also reported, not gating:** exact-player top-1 hit rate for both arms —
continuity with `opponent_persistence.js`'s harsh rule, so the two
measurements can be read side by side.

### 2.3 Stability (the load-bearing question)

Per-owner signatures computed on each season separately; Spearman correlation
across the 10 owners between seasons, per feature, for pairs (2023,2024),
(2024,2025), (2023,2025). Features, fixed now:

  f1 RB share of decisions · f2 WR share · f3 first-QB round · f4 first-TE
  round · f5 first-K round (never-drafted ⇒ 16) · f6 run-follow rate ·
  f7 need-fill rate

Summary: mean rho across features per pair, and a permutation test (1,000
shuffles of owner labels in the later season, two-sided) on the mean rho of
the (2024,2025) pair — the pair the 2026 use-case actually resembles.
**Interpretation rule, fixed now:** if the forward test fails AND mean
(2024,2025) rho is not separable from zero, the honest product is a
LEAGUE-level correction to market ADP, not per-owner models, and this
document will say so plainly. n=10 owners and 3 seasons means low power
either way; a null here is "not detectable at this sample," never "proven
absent."

### 2.4 Descriptive measures (reported with n, no gates)

- Per-owner room-relative reach (2024/2025 picks vs room proxy, centered on
  the same-season field mean), with sd and n. Labeled room-relative, not
  market-relative (no era ADP on file — §1).
- Positional tendencies: first-position rounds, bucket mixes, QB/TE-early
  identification.
- Run-chasing: a run of position p is active at decision t if decisions t−1
  and t−2 (same season) were both p. League-level lift
  P(pick=p | run) vs P(pick=p | no run), and per-owner follow rates with n
  (which will be single digits per owner — said where reported).
- Keeper-informed need: 2024+2025 owner-seasons (2023 has no keeper-count
  variation), decision share at position p in rounds 4–6 grouped by how many
  of p the owner kept (0 / 1 / 2+), pooled, RB and WR primarily (QB/TE keeper
  counts reported but too thin to group).
- League-level positional mass by round band vs what the CURRENT (2026-08-15)
  external ADP board implies for a 150-pick 10-team draft — the only
  market-relative statement possible without era ADP, and it carries an era
  mismatch on the market side, labeled.

### 2.5 Artifact and gate mechanics

`draft/backtest/draft_behavior.py` (TERRITORY: A, pure core unit-tested
offline in `draft/tests/test_draft_behavior.py`, no egress) writes
`draft/data/draft_behavior.json` with `_territory` as the first key:
signatures per owner, league aggregates, stability matrix, forward-test
results, provenance (source file, counts, the 2023 keeper join, the proxy
fallback). If and only if the decision rule passes, a `CFG` switch defaulting
**false** lands in the engine's survival layer (the `STAGE2_CAP: false` /
`VONA_SLOT_AWARE: false` pattern — shipped off, toggled only for
measurement), with the applied-vs-shipped delta measured here. The flip
itself is Cory's call via DECISIONS-NEEDED.md; the queue entry text is
drafted in §5 of this doc and NOT written into DECISIONS-NEEDED.md by this
session. `baseline_regression.test.js` iterates frozen CFG keys, so a new
gated-false key changes no frozen comparison and no emitted surface — which a
suite run must confirm, not assume.

---

## 3. Results

_(written after §2 was fixed; `draft/backtest/draft_behavior.py` and its
committed output `draft/data/draft_behavior.json` are the record)_

### 3.1 The forward test — preregistered arms

Both preregistered criteria PASSED, and then the decomposition took most of
the shine off — both halves reported, because both are the finding.

**(a) Survival calibration** (41,447 scored (moment, horizon, player)
observations; 48 of 130 2025 picks had no room proxy and were invisible to
both arms, counted):

| arm | pooled Brier | h=6 | h=12 | h=18 | h=24 |
|-----|-------------|------|------|------|------|
| model (behavior walk) | **0.099** | 0.044 | 0.084 | 0.121 | 0.155 |
| baseline (engine Layer-1 form) | 0.503 | 0.409 | 0.494 | 0.544 | 0.580 |

Model wins at every horizon. **But the calibration table says why, and it is
not flattering to anyone:** the baseline pairs the engine's market-calibrated
σ (`0.15·adp`, clamped [3,15]) with a room-proxy anchor whose real dispersion
— measured train-only, 2023 proxy vs 2024 outcomes — is **σ ≈ 28.7**, roughly
4–9× wider than the formula assumes. 18,720 of the baseline's observations sit
in its 0.9–1.0 bin with an actual taken-rate of 0.13: stale proxies clamped to
"he should already be gone; treat as gone" (survival.js's own documented
behavior at `fC ≥ 0.999`). The model's advantage is mostly that its bounded
position-mass walk cannot assert certainty. The model itself is overconfident
above p=0.2 (e.g. its 0.5–0.6 bin realizes 0.20) — reported, not hidden.

**Post-prereg diagnostics** (labeled exploratory in the artifact; they gate
nothing but they decide what the gated feed CONTAINS):

| arm | pooled Brier |
|-----|-------------|
| robust baseline (σ widened to the train-measured 28.7) | 0.206 |
| model, league mix only (no owner term, no need term) | **0.0983** |
| model, league mix + need (no owner term) | 0.0987 |
| model, full (owner + need) | 0.0988 |

The model beats even the σ-honest baseline (0.099 vs 0.206) — the walk's
structure is genuinely better than any truncated normal here. And **the owner
term contributes nothing to survival: league-mix-only is the best arm by a
hair.** The whole survival win is league-level.

**(b) Next-pick position** (130 decisions):

| arm | top-1 hit | log-loss |
|-----|-----------|----------|
| league base rates (2023–24 bucket shares) | 38.0% | 1.479 |
| league mix + need damping | **46.5%** | **1.408** |
| full model (+ owner term) | 45.0% | 1.428 |

The preregistered comparison (full model vs league base) passes: 1.428 <
1.479, hit 45.0% vs 38.0%. The decomposition again: **the need term is the
entire win, and the owner term strictly hurts** (1.408 → 1.428, −1.5pp hit).
Exact-player top-1 (harsh rule, continuity with opponent_persistence.js):
model 3.1%, room-proxy-BPA 2.3% — same ballpark as that tool's 2.3%/2.3% tie;
nothing new claimed there.

### 3.2 Stability — the load-bearing question, answered plainly

Spearman across the 10 owners, per preregistered feature:

| pair | mean rho | strongest feature | weakest |
|------|----------|-------------------|---------|
| 2023→2024 | 0.115 | first-K round 0.46 | first-TE −0.25 |
| 2024→2025 | **0.074** | need-fill 0.57 | first-TE −0.35 |
| 2023→2025 | 0.207 | RB share 0.73 | WR share −0.07 |

Permutation test on the (2024,2025) mean rho: **p = 0.56** (1,000 shuffles,
two-sided). **Per-owner draft signatures do not detectably persist year over
year at this sample.** The one whisper is RB share (0.35 / 0.47 / 0.73 across
the three pairs — positive every time); everything else, including the
timing features the live profile tilts are built on, is noise at n=10. Under
§2.3's interpretation rule combined with the ablations above, **the honest
product is the LEAGUE-level correction, and that is what the gated feed
carries. Per-owner signatures ship in the artifact as description — they do
not feed the engine.** This is consistent with, and sharpens, the existing
`opponent_persistence.js` tie: exact-player prediction tied because the
owner-specific part carries no out-of-sample signal; the league-level
structure (which that tool's market-proxy arm already embodied) is where the
predictive content lives.

A null at n=10 owners × 3 seasons is "not detectable at this sample," never
"proven absent" — but it is also exactly the evidence standard the room-layer
work has been asking for, and it says: do not build per-owner cleverness into
the engine on this data.

### 3.3 Descriptive room facts (artifact `signatures` and league blocks; n stated)

- **Run-chasing (league):** at the 104 run moments (two consecutive
  same-position decisions), the next decision continued the run 35.6% of the
  time vs 26.6% expected from base rates — a mild real tendency (+9pp,
  ~2.1σ). Per-owner follow rates ride on 5–15 moments each and did not
  persist (f6 rho −0.29 for 2024→2025); league-level only.
- **Keeper-informed need (2024+2025 owner-seasons, rounds 4–6 shares):**
  owners keeping 2+ RBs drafted RBs at **0%** of their r4–6 picks (n=4
  owner-seasons) vs 40% for owners keeping none (n=5); WR: 22% (2+, n=3) vs
  47% (none, n=5); QB/TE keepers → 0% r4–6 share at that position (n=3
  each). Direction uniform: **owners do avoid what they keep.** The engine's
  need mask already encodes this mechanism; the numbers say the mechanism is
  real in this room. Thin cells, labeled.
- **League vs current market mass** (era-mismatched by construction — room is
  2023–25, market is the 2026-08-15 home ADP snapshot; §1): the standout is
  **rounds 8–11: the room took 2.0 QBs per season where the market board
  implies 8**, and starts K/DEF (3.0/season) where the market implies none.
  Mid-round QBs survive materially longer in this room than an ADP-driven
  survival curve believes; K/DEF go earlier.
- **Reach (room-relative, NOT market-relative — no era ADP on file):**
  2025 vs 2023–24 proxy, centered: Bates +20.5 (lets his prior-year prices
  fall to him), Marian +12.4; Justin −13.9, Jeremy −12.3, Michael −10.0
  (take previously-seen players well before their prior room price). n≈13
  proxied picks per owner-season; sd ~15–25. Direction data for the war
  room's human reader; deliberately NOT fed to the engine (see 3.2).

### 3.4 What was NOT found

- No per-owner signature stable enough to act on (3.2).
- No owner-term improvement to any forward-test metric — it was negative
  everywhere it was separable.
- No era-correct market ADP anywhere in the repo (§1) — so no true
  market-relative reach measurement exists yet. If FFC/FP per-player
  historical boards are ever committed from CI (exp36_picks.json is already
  built there), the reach block upgrades from room-relative to
  market-relative with no design change.

---

## 4. The product — gated, off, measured

Per the preregistered rule (§2.2: both criteria passed) the gated consumption
path was built; per the decomposition (§3.1) and stability (§3.2) it feeds
**only the league-level prior**:

- **`draft/data/draft_behavior.json`** (committed, `_territory` first):
  signatures, league blocks, stability, forward test + diagnostics,
  provenance including the 2023 keeper join.
- **`public/js/draft/survival.js`**: `CFG.ROOM_MIX_PRIOR: false` (ships OFF —
  the STAGE2_CAP / VONA_SLOT_AWARE pattern) + `CFG.ROOM_MIX_W: 0.25`
  (deliberately equal to the existing BUCKET_BLEND, not a new tuned
  constant). When ON, `positionProbabilities` blends the measured
  `LEAGUE_MIX` bucket shares into the need/value softmax for every seat,
  before per-profile tilts; the block references no profile by construction.
  `LEAGUE_MIX` is a copy of the artifact's `league_bucket_mix`
  (a browser module cannot read the artifact), drift-guarded by test.
- **`draft/tests/room_prior.test.js`** (15 checks): ships-false, off-means-off
  (toggle round-trip bit-identical), copy-vs-artifact drift guard, blend
  bounded by W, distribution properties, gated block reads no profile.
  `baseline_regression.test.js` iterates FROZEN keys, so the new gated-false
  keys change nothing there — confirmed by running it, not assumed.
- **`draft/tests/test_draft_behavior.py`** (19 tests): the 2023 keeper join,
  decision-index scale, engine-formula mirror (σ clamps), run rule, need
  logic, mass conservation, blending, forward-test structure, and the
  committed artifact held to `_territory`-first and the corrected counts.
- **`draft/tools/room_prior_measure.js`** — the applied-vs-shipped delta:

  **Measured (live board, w=0.25):** unprofiled-seat position distributions
  move ≤3.8pp (RB down mid-draft, K/DEF up late, QB up mid); Layer-2 survival
  over an 11-pick window (picks 31→42), top-12 names: **mean |1.86|pp, max
  |3.07|pp** — top RBs' survival rises ~2–3pp (the room takes fewer mid RBs
  than the value softmax assumes), top WRs' falls ~1pp. Bounded nudges in the
  measured direction, nothing that can dominate a live board.

## 5. Drafted DECISIONS-NEEDED entry (NOT filed by this session — text ready)

> **ROOM PRIOR (gated, off): flip CFG.ROOM_MIX_PRIOR?**
> **Found:** the room's league-level positional behavior, fit on 2023–24,
> beat the engine's ADP-plus-noise survival form on a preregistered 2025
> forward test (pooled Brier 0.099 vs 0.503; vs 0.206 even after widening the
> baseline's σ to honest levels; next-pick position log-loss 1.408 vs 1.479).
> Per-owner signatures did NOT persist (mean rho 0.074, p=0.56) and are NOT
> in the feed.
> **Implies:** blending the measured league bucket mix into
> `positionProbabilities` (w=0.25) makes unprofiled-seat position
> probabilities and survival modestly more room-shaped.
> **Magnitude:** survival moves mean 1.9pp / max 3.1pp on the top-12 over an
> 11-pick window; distributions ≤3.8pp (draft/tools/room_prior_measure.js).
> **Confidence:** one target season (2025) — one cluster, direction+magnitude,
> no interval. The mechanism (bounded blend, renormalized, profile-free) is
> tested; the effect size is small by construction.
> **Cost of inaction:** unprofiled seats keep a pure need/value softmax that
> misprices mid-round QB (room takes 2 where the market implies 8 in r8–11)
> and late K/DEF timing.
> **Recommendation:** flip for the 22nd only if the mock rehearsals show no
> surprises with it on; the delta is small enough that leaving it off costs
> little. Evidence: draft/audit/draft_behavior_2026-08-15.md,
> draft/data/draft_behavior.json.

## 6. Honest limits

1. **One target season.** The forward test is one cluster (the same argument
   opponent_predict.js stamps into its records). A direction and a magnitude,
   not an interval.
2. **The proxy is not market ADP.** Both arms shared it symmetrically, but
   the baseline's σ was calibrated for real ADP; the robust-σ diagnostic
   exists precisely because of that, and the model beat it too.
3. **The model is itself miscalibrated above p≈0.2** (overconfident). The
   gated feed does not ship the walk — only the bucket mix — so this limit
   applies to the measurement, not the shipped surface.
4. **`early` bucket is n=18** (keeper rounds). The prior is weakest exactly
   where 2026 will also be keeper-dominated — which is also why it matters
   least there.
5. **48/130 2025 picks had no proxy** (rookies/never-drafted): invisible to
   both arms equally; the survival comparison says nothing about them.
6. 2023 keeper contamination in the PRIOR artifacts (`opponent_profiles.json`
   was built flag-only) is documented in §1; this measurement corrects it,
   the older artifacts were not rewritten by this session.



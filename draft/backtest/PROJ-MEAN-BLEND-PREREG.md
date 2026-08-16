<!-- TERRITORY: A -->
# BLENDED `proj_mean` — PREREGISTRATION (2026-08-16)

**Committed BEFORE the runner exists and before any number is produced. The
commit order is the proof.** Precedent: `EXP-FP-HIST-PROJ-PREREG.md`,
`SOURCE-WEIGHT-PRIOR-PREREG.md`, `draft/audit/edge_hunt_2026-08-16.md`.

---

## 0. The ruling this executes

Cory, 2026-08-16, verbatim:

> "What I think is defensible right now: not 'replace Sleeper with own_v6,'
> which the gate correctly blocks — but blend. Averaging independent forecasts
> is the single most reliable improvement in forecasting, it's the actual
> mechanism behind FantasyPros' strength, and we already have three sources
> attached to every player. A blended proj_mean is a smaller, safer change
> than a swap, and it captures the one thing pros are doing that we
> structurally can't buy. Let's do it"

This is an EXECUTED ruling. It is implemented **if and only if** the grade
below says it does not make the board worse. Cory ruled on the expectation
that blending helps; a change that measurably hurts the board six days before
his draft is worse than delivering nothing. **The bar is written here so it
cannot be moved after a result is seen.**

One factual correction to the ruling's premise, recorded here rather than
discovered later: **"three sources attached to every player" is not true of
this board.** Coverage is partial and unequal (§4). That is the hazard this
preregistration is mostly about.

## 1. What would change, precisely

Today (`draft/build.py`, `draft/projections.py:blend`):

    baseline := Sleeper season projection, rescored under our table
    proj_mean := baseline x (1 + opportunity_adj)
    proj_fantasypros, proj_ownmodel := attached alongside, DISPLAY ONLY

The change under test replaces **`baseline`** — the input to
`projections.blend()` — with a multi-source combination, leaving the
opportunity adjustment, VORP, replacement, tiers and ranking machinery
untouched. Nothing else in the pipeline moves. `proj_sleeper` continues to
carry the raw unblended Sleeper number so the blend is always decomposable.

## 2. THE CONSTRUCTIBILITY GATE — checked first, and a refusal is a verdict

Every arm below requires **per-player preseason values for the graded
season**. Aggregate MAE/rho cannot produce a blend: a blend is a per-player
average, and its accuracy depends on the ERROR CORRELATION between sources,
which no aggregate carries.

Declared before the check, per arm:

| arm | requires | where it would come from |
|---|---|---|
| Sleeper (control) | per-player 2023/24/25 preseason Sleeper projections | an archive |
| FantasyPros | per-player 2023/24/25 archived FP rows | `exp_fp_hist_proj` egress |
| own_v6 | committed weekly + component stores | `draft/backtest/own_model_v6.py` |

**Status vocabulary, fixed here:** `graded`, `unconstructible:<arm>`,
`no_control`. If the CONTROL arm (Sleeper alone) has no per-player historical
source, the status is `no_control` and **the ship decision is REFUSE** —
because with no control there is no measurement of "worse", and the ruling's
own condition ("does it make the board worse") is unanswerable.

**A substitute source is not the same test.** If Sleeper is unavailable, we
do NOT silently swap in FantasyPros as "the professional consensus" and grade
that instead while calling it the ruled test. Any substitution is reported as
a SEPARATE, NAMED probe (§5) that explicitly cannot license the ship.

## 3. THE GRADED TEST (primary — runs only if §2 passes)

- **Seasons**: 2023, 2024, 2025. Leak-free: every arm's information set must
  predate the graded season's week 1, proven by the marker gate already
  preregistered in `EXP-FP-HIST-PROJ-PREREG.md` §1 (a preseason-frozen file
  must still project a player whose season died in week 2 at full size).
- **Year weighting, declared now and for a stated reason**: 2025 = 1.0,
  2024 = 1.0, **2023 = 0.5**. FantasyPros' own measured accuracy degrades
  sharply 2023 -> 2025 (WR rho 0.9243 -> 0.7621 in `exp_fp_hist_proj.json`),
  which is a plausible signature of a 2023 archive revised after the fact.
  Down-weighting 2023 is the conservative reading and is fixed here so it
  cannot be chosen after seeing which way it helps.
- **Population**: per season, players carrying a value from EVERY arm under
  test AND ≥1 weekly row in that season's committed store AND a position in
  QB/RB/WR/TE per `draft/data/player_positions.json` (the RECORD, not a live
  board). Survivorship excluded-count travels with every cell, as in
  `model_accuracy_backtest`.
- **Cells**: per position. `n < 25` reports `unmeasurable`, never a number.
- **Arms**:
  - `A0` **Sleeper alone** — the control.
  - `A1` **equal-weight blend** — arithmetic mean of the sources present.
  - `A2` **accuracy-weighted blend** — weights per position ∝ `1 / MSE_src`,
    with `MSE` estimated per the already-committed
    `SOURCE-WEIGHT-PRIOR-PREREG.md` §2 normal approximation
    (`MSE = (1.2533 x MAE)^2`), normalised over the sources present.
    Weights are computed **leave-one-year-out**: the weights applied in year
    Y are fitted only on the other years. No weight is fitted on the year it
    grades.
- **Metrics**:
  - **PRIMARY — Spearman within position.** The board is ORDINAL: dollar
    values, VORP and pick order are all monotone in within-position and
    cross-position ranking. Rank is what a drafter consumes.
  - **SECONDARY — top-12 / top-24 / top-48 precision within position**: the
    share of the arm's top-N that lands in the realized top-N.
  - **TERTIARY — MAE.** Reported, **not a ship criterion**: a pure level
    shift moves MAE without moving a single pick.
- **THE BAR (strict, fixed here, not weakenable after a result):**
  1. On the year-weighted pooled grade, the blend arm's Spearman ≥ the
     control's at **all four positions**; and
  2. in **no single graded year** does the blend arm lose more than
     **0.010** Spearman to the control at any position; and
  3. top-24 precision ≥ control at **≥ 3 of 4** positions on the pooled
     grade.
  Missing any of 1–3 = **DOES NOT CLEAR**. Two blend arms may be tested; the
  shipped arm is the one that clears, and if both clear, the one with the
  higher pooled minimum-position Spearman margin. **If neither clears, the
  deliverable is the null and nothing ships.**

## 4. THE COVERAGE HAZARD (constructible regardless of §2 — the 2026 board)

**The failure mode this section exists to prevent.** own_v6 covers only
QB/RB/WR/TE with prior-season NFL production; rookies and K/DEF carry no
`proj_ownmodel`. FantasyPros coverage is also partial. If sources are averaged
naively, a veteran gets a 3-source average and a rookie gets Sleeper alone —
so the two groups are measured on **different instruments with different
level biases**, and the rookie/veteran ORDERING moves even when no individual
projection changed. On a draft board that silently reorders the draft for a
reason that has nothing to do with football.

- **Census (declared before counting)**: per position x {rookie, veteran},
  the count of players carrying 1 / 2 / 3 sources. Rookie := `years_exp == 0`
  on the board. **Sleeper is counted from `proj_baseline`, not
  `proj_sleeper`** — `proj_sleeper` is only stamped inside the FantasyPros
  attach block, so it is absent wherever FP is absent and would undercount
  Sleeper. Rows whose `proj_baseline` came from `projections._rank_fallback`
  (ADP decay, no real Sleeper projection) are counted and reported
  SEPARATELY: those carry zero real sources and must never be described as
  Sleeper-covered.
- **Candidate policies, all four declared now:**
  - `P0` control — Sleeper alone (today's board).
  - `P1` all-present-only — blend only where all three sources are present;
    Sleeper alone everywhere else.
  - `P2` level-corrected available-source blend — per position, each
    non-Sleeper source is shifted by the **median(source − Sleeper) measured
    on players carrying both**, then whatever is present is averaged. The
    shift is what stops a missing source from moving a player's level.
  - `P3` minimum-two-sources — blend where ≥2 present, Sleeper alone
    otherwise.
- **THE ROOKIE-BLOC BAR (fixed here, and it is a veto):** for a policy to be
  eligible to ship, **both** must hold:
  1. `|median Δ(board rank) for rookies − median Δ(board rank) for
     veterans| < 3.0` rank positions, and
  2. the same for the mean, `< 3.0`.
  A policy that moves rookies as a bloc relative to veterans is **rejected
  regardless of any accuracy result in §3.** That movement is a coverage
  artifact, not a football opinion, and it is the bug this section names.
- Also reported (descriptive, not a bar): overall rank churn, VORP churn,
  count of players whose overall rank moves ≥ 5 and ≥ 10, and the ten largest
  movers by name.

## 5. THE MECHANISM PROBE (secondary, declared now, CANNOT license the ship)

If §2 refuses, the shipped arms are ungradeable but the *mechanism* Cory
named ("averaging independent forecasts is the single most reliable
improvement") is still testable on arms that ARE per-player constructible
offline for 2025: `own_v6`, `own_v5`, `own_v4`, `own_v3`, `own_v2`,
`walk_forward_v1`, `recency_blend`, `naive_prev` — all reproducible from
committed stores by `own_model_v6.run()`.

- For every unordered pair of arms: build the equal-weight blend and the
  inverse-MSE blend; measure per-position Spearman against realized 2025
  points; record whether each blend beat the BETTER of the two parents.
- Also measure, per pair, the **Pearson correlation of the two arms' signed
  errors**. This is the quantity that decides whether averaging helps and it
  is measured nowhere in this repo today.
- **Declared before running: no outcome of this probe changes the ship
  decision.** It prices the mechanism and locates the shipped sources'
  error-correlation regime. It is reported as a probe and labelled as one.

## 6. Artifacts

- `draft/backtest/proj_mean_blend.py` — runner, refusal-first, pure gated core.
- `draft/backtest/proj_mean_blend.json` — the graded result OR the named
  refusal, gate evidence either way.
- `draft/audit/proj_mean_blend_2026-08-16.md` — the verdict Cory reads.
- `draft/tests/test_proj_mean_blend.py` — every gate two-armed.

## 7. What ships, and what a refusal does NOT touch

If the bar clears: the blend lands as the input to `projections.blend()`,
behind **one named module-level constant** so it is reversible by one obvious
edit, and the REC-2 gate documentation is struck through — **never deleted** —
with Cory's override quoted and the original rationale left visible.

If the bar does not clear, or §2 refuses: **nothing in the board changes.**
`proj_mean` stays Sleeper-only, the third-opinion columns stay display-only,
REC-2 stays as written, and the null is the deliverable.

---

# AMENDMENT 1 — THE COVERAGE FALLBACK, RULED (2026-08-16)

**Committed BEFORE the runner was executed. Nothing in this file has been
changed; this is appended, per the strike-through-never-erase habit.** The
runner existed in draft when this landed but had produced no artifact — the
commit order still carries the proof.

**Cory's question, verbatim:** *"Can we use sleeper or fantasy pros on
rookies, k and def"*

**The answer, and the correction that comes with it.** Yes — Sleeper and/or
FantasyPros are the fallback for rookies, K and DEF, and those players are
never dropped. But "fall back to whatever sources we have" **implements the
hazard rather than avoiding it**, and the arithmetic is already in the repo:

    own_v6 bias (2025):  QB +10.87  RB  +2.38  WR  +8.72  TE  +2.12
    FantasyPros (2025):  QB +15.45  RB  -0.72  WR  -3.88  TE -12.48

own_v6 OVER-projects WR by +8.72 while FP UNDER-projects WR by −3.88. A
veteran WR averaged from (Sleeper, FP, own_v6) therefore sits systematically
HIGHER against truth than a rookie WR averaged from (Sleeper, FP) alone —
**not because either player's football changed, but because the veteran bloc
caught a high-biased third source.** That is the rookie-vs-veteran ordering
distortion §4 exists to prevent.

## Two additional policies, both preregistered here, both measured

- **`P4` — bias-corrected blending (Cory's option (a)).** Subtract each
  source's measured per-position bias against realized points before
  averaging, so every source enters on a common scale and a missing one
  shifts nothing. own_v6's biases from `model_accuracy_v6.json`; FP's from
  `exp_fp_hist_proj.json`, averaged across years under §3's weighting (2023
  at 0.5).
  **Its named weakness, stated before the result: Sleeper's own bias against
  realized points is exactly the quantity that does not exist** (§2). P4 can
  therefore de-bias FP and own_v6 to the truth scale but must leave Sleeper's
  own correction at **0 by assumption** — an unmeasured term sitting inside
  the correction that is supposed to remove unmeasured terms. Also: the
  biases are measured on past seasons and may not hold for 2026.
- **`P5` — rank-space blending (Cory's option (b)).** Per position, express
  each source as a within-position percentile, average the percentiles a
  player actually has, map the blended percentile back onto the control
  (Sleeper) points distribution for that position.
  **Population correction, declared here because the naive version has the
  same bug it is meant to fix:** a percentile taken inside own_v6's coverage
  (veterans with prior production) is not comparable to one taken inside
  Sleeper's full coverage. So each non-Sleeper source contributes a
  **percentile DISAGREEMENT measured on the shared population** it covers
  with Sleeper — `δ_s(i) = pct_s(i) − pct_sleeper(i)`, both computed inside
  `C_s = {players carrying Sleeper AND s}` — and the blended percentile is
  Sleeper's global percentile plus the mean of the δ a player actually has.
  δ is centred on the shared population by construction, so **a missing
  source contributes exactly nothing to level.**
  The back-map is an exact within-position permutation of the Sleeper
  baseline values, which yields a property worth stating in advance:
  **the multiset of `proj_baseline` at each position is unchanged, so
  replacement level, the flex allocation and the cross-position dollar scale
  cannot move — only ordering within a position can.** The residual at the
  `proj_mean` layer (the per-player `opportunity_adj` rides on top and is not
  permuted) is MEASURED and reported rather than assumed to be zero.

## K and DEF — fixed here

own_v6 has never covered K or DEF and no blend can. Those positions are
**Sleeper/FP-only by necessity**, that is stated in `PROJECTION_PROVENANCE`
rather than implied, and the runner reports **their replacement level and
per-position value distribution before and after** under every policy, so a
silent rescale of K/DEF dollars relative to QB/RB/WR/TE is caught rather than
trusted.

## What does NOT change

The §4 rookie-bloc veto still governs every policy including P4 and P5, and
still overrides any accuracy result. The §3 bar is still the ship criterion,
and §2's refusal still means nothing ships.

---

# AMENDMENT 2 — "USE WHATEVER HAS PROVEN SUPERIOR" (2026-08-16)

**Appended before the position-weighted arm was run. Nothing above is edited.**

**Cory, verbatim:** *"I want to use whatever version of model has proven
superior at this point!!"*

## The thing that instruction cannot resolve, stated first

What has been measured, per position, 2025:

    QB   own_v6 72.29 / rho .7225    FP 63.70 / rho .7515   -> FP clearly better
    RB   own_v6 37.54 / rho .7968    FP 37.63 / rho .7649   -> own better on order
    WR   own_v6 33.63 / rho .7634    FP 31.05 / rho .7621   -> tie on order
    TE   own_v6 23.33 / rho .7987    FP 22.50 / rho .7824   -> own better on order

own_v6 is also the champion of its own lineage (Cory: "YES on V6") and the
better DRAFT instrument against market-derived season projections (0 of 15
head-to-head tests cleared for the market arm; own_v6 won top-24 .5833 vs
.5417 and top-48 .7292 vs .6458).

**And SLEEPER — the source the board actually ranks on — is the one arm in the
comparison whose skill has never been measured and cannot be measured before
January 2027.** So "use whatever has proven superior" cannot be executed as a
swap: it would move the board toward a measured arm and away from an
UNMEASURED one, which is a guess wearing evidence's clothes. That is the same
wall §2 already hit, arrived at from the opposite direction.

## (a) The position-weighted arm — added to §3

- `A3` **position-weighted blend** — per position, weights ∝ measured inverse
  MSE per source, so FP carries QB and own_v6 carries RB/TE rather than a flat
  1/3 discarding the one consistent signal in the table.

## (b) Leak discipline, and the consequence declared in advance

Weights must be fitted on seasons OTHER than the one graded — fit on
2023/2024, apply to 2025 — or they are the answer key.

**Declared before checking: if that fit is not constructible leak-free, A3 is
DROPPED, not reported.** A fitted-on-itself position weight would be the
strongest-looking number in this study and would mean nothing.

## §5's probe gains a position-weighted variant, with its limit named

Inside the offline-constructible arms, the probe also compares an
inverse-MSE **position-weighted** blend against the equal-weight blend and
against the better parent, with weights fitted by **2-fold cross-fit over
players** (fit on one half of the position's players, grade the other, both
directions; halves split deterministically by player id).

**This is a PLAYER holdout, NOT a season holdout, and that is a real
limitation, declared here rather than discovered in review:** it cannot see
whether weights transfer across seasons, which is the transfer that actually
matters, because every offline arm can only predict 2025 (own-model arms need
two prior seasons and the committed weekly stores are 2023/2024/2025 only).
It is the friendly case. A position weighting that fails even here has failed
in the easiest available test.

**It still cannot license the ship** — §5's declaration is unchanged.

## (c) The refusal condition, restated and strengthened

If no blend arm beats Sleeper-alone on the §3 bar, **SHIP NOTHING**. Cory
wants the superior model used; if the evidence does not identify one, the
honest execution of that instruction is to say so, not to ship the arm that
looked best by chance.

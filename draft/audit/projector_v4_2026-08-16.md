<!-- TERRITORY: A -->
# PROJECTOR v4 — TARGETED QB SECOND ATTEMPT AGAINST THE REC-3 BAR — 2026-08-16

v3's honest negative stands in `draft/audit/projector_v3_2026-08-15.md`: it
cleared RB, WR and TE against both baselines on both metrics and lost ONLY the
QB cells to the 0.7/0.3 recency blend — by 0.67 MAE and 0.0025 Spearman. v4 is
a TARGETED second attempt at exactly those two cells, justified by one
identified angle, not a broad re-search. It is built beside v2 and v3 — no
shipped projector code, no engine CFG default, no v2/v3 file touched.
Promotion remains a written decision for Cory even on a clean pass.

## 1. The angle, and the data-audit finding behind it — stated honestly

v3's report listed "per-week usage (targets/carries/attempts) and TD counts"
as a named data-need and implied the weekly grain needed for a better QB
opinion was off-disk. The audit that triggered v4 checked that belief against
`draft/data/league_history.json` and found it wrong in one specific respect —
and right in another:

- **Verified on disk:** `seasons[].weeks[wk][].players_points` carries
  per-player weekly FANTASY POINTS for every rostered player, all 10 rosters,
  weeks 1–18, seasons 2023–2025 (~15 players per roster entry; players move
  across rosters mid-season). The claim in the trigger finding is real.
- **Coverage rule, stated:** a player absent from every roster's
  `players_points` map in a week is UNROSTERED that week — missing data,
  never a zero. All comparisons below grade only weeks present in both
  stores and count the rest.
- **But for QBs it adds nothing informative over what the program already
  reads:** the committed nflverse weekly stores
  (`draft/backtest/nflverse_weekly_points_{2023,2024,2025}.json`) carry the
  same weekly grain for the full player pool. Measured (2023/2024): ZERO QB
  players the league store has that nflverse lacks (48/45 the other way);
  values agree within 0.05 pts on ~99% of overlapping weeks (scoring parity —
  the league store corroborates the nflverse reconstruction); and the league
  store's only extra player-weeks are 0.0 "rostered, didn't play" entries
  (40 in 2023, 31 in 2024 — every one), the same availability fact the
  nflverse store encodes by row-absence. This audit is embedded in the
  artifact (`league_history_weekly_audit`) and pinned by test.
  *Correction against the prereg commit, made when the artifact landed: the
  prereg text and test stated this as "zero league-history-only player-weeks";
  the correct statement is zero league-history-only players and zero
  INFORMATIVE league-history-only player-weeks (the lh-only weeks exist and
  are all 0.0 DNP entries). The corrected test asserts the true invariant.
  Nothing in the model, constants, protocol or bar depends on this block —
  the QB arm never reads league_history.*

So the genuinely new resource is not new player-weeks — it is the **angle**
the finding forced into view: the weekly grain (already on disk) supports
decomposing a QB season into AVAILABILITY (active games) and PER-GAME RATE,
and v3's QB arm used neither. v3 instead bet half its QB weight on the league
draft market, whose 2025 QB board went dead (rank-vs-outcome ρ 0.054 after
0.43/0.27). v4 removes that dead opinion and replaces it with the smallest
model the availability mechanism supports. Usage splits and TD counts remain
genuinely absent — that named need was and stays correct.

## 2. The bar (Cory-ratified, quoted, not weakened)

From REC-3, verbatim rule: *"promotion of ANY own model (v1, v2, or successor)
into the composition requires beating BOTH naive baselines (naive_prev AND
recency_blend) at ALL four positions on BOTH metrics (MAE and Spearman) in the
leak-free walk-forward protocol, then a reviewed promotion decision file for
Cory — never an automatic flip."* Strict inequalities; ties lose; an
unmeasurable cell fails the bar.

## 3. Preregistered protocol (fixed before the 2025 comparison was run)

The commit that adds this section, `draft/backtest/own_model_v4.py` and
`draft/tests/test_own_model_v4.py` precedes the commit that adds
`draft/backtest/model_accuracy_v4.json`. Commit order is the proof — the same
discipline v2 and v3 established.

**Evaluation — v2's harness and v3's machinery, imported, not re-implemented:**

- graded season **2025**, weeks 1–17 — the only held-out season the committed
  stores allow (nothing from 2025 was read during design; see tuning
  discipline below).
- population: per position (QB/RB/WR/TE per `draft/data/player_positions.json`),
  players with ≥1 weekly row in the 2025 store and a forecast; MIN_N = 10.
  v4's coverage is constructed to equal v3's (= v2's) exactly, so the shared
  denominator is identical to `model_accuracy_v2.json`'s and
  `model_accuracy_v3.json`'s.
- metrics: MAE, mean signed bias, Spearman within position.
- models head-to-head on the SHARED population: `own_v4`, `own_v3`, `own_v2`,
  `walk_forward_v1`, `naive_prev`, `recency_blend` — grading code imported
  from `own_model_v2._grade_models`, v3 predictions from
  `own_model_v3.build_v3`, verdict from `own_model_v3.promotion_verdict`.
- reproduction contract, asserted by test: every non-v4 cell reproduces
  `model_accuracy_v3.json` **bit for bit** (protocol identity), and own_v4's
  RB/WR/TE cells equal own_v3's exactly (arm identity — those arms are
  inherited unchanged). The QB cells must differ, or the override never ran.
- v3's marker gate is retained unchanged (v4 inherits the market-bearing
  RB/WR/TE arms): no dead top-75 pick in the 2025 draft ⇒ status
  `no_markers`, nothing graded — refusal is the artifact.
- verdict: `promotion_verdict` — REC-3 applied to `own_v4`.

**The candidate.**

| position | v4 opinion | information set |
|---|---|---|
| RB, WR, TE | v3's ensemble, byte for byte (v2 + blend + marker-gated league-draft market, v3's frozen weights, imported) | unchanged from v3 |
| QB | **blend × availability-correction** — no v2 term, no market term | weekly stores ≤ 2024 only |

QB arm, exactly:

    act        active games in 2024: weeks 1–17 with ≥ QB_TAU points
    blend      0.7·total₂₀₂₄ + 0.3·total₂₀₂₃  (the baseline's own value)
    E[G]       QB_LAM·act + (1−QB_LAM)·mu_g,  mu_g = mean act over 2024 QBs
               with act ≥ QB_MU_MIN_ACT (none ⇒ correction ≡ 1.0, declared)
    corr       act < QB_MIN_ACT ⇒ 1.0 (a bench profile is not an injury
               profile — never inflated); else
               clamp(E[G]/act, [1/QB_RATIO_CAP, QB_RATIO_CAP])^QB_THETA
    pred       max(0, blend · corr), rounded 2dp

Frozen constants: **QB_TAU 8.0, QB_LAM 0.7, QB_THETA 0.75, QB_MIN_ACT 2,
QB_MU_MIN_ACT 4, QB_RATIO_CAP 2.0.**

The mechanism: a QB season total is rate × availability; availability
regresses to the mean harder than rate (an injury-shortened 2024 under-prices
2025, a 17-game 2024 over-prices it), and the blend prices last season's
availability at face value. The correction is a one-parameter-family
perturbation of the strongest baseline — QB holds the least out-of-sample
signal in this program, so it gets the smallest model.

**How the constants were chosen (tuning discipline, stated honestly).**
Grid-searched on THREE folds built strictly from seasons ≤ 2024 — no 2025
value was read at any point during design:

    A  2023 features → realized 2024 totals (the real transition; the blend
       degenerates to naive_prev here — no 2022 store exists)
    B  2023 weeks 1–9 → 2023 weeks 10–17  (within-season availability split)
    C  2024 weeks 1–9 → 2024 weeks 10–17

Selection rule, fixed before the search ran: a configuration qualifies only
if it beats its base on BOTH metrics in ALL THREE folds; among qualifiers,
maximize the minimum-across-folds MAE gain, tie-break on minimum Spearman
gain. 17 configurations qualified; the winner, re-verified under the exact
production definitions:

    fold A: base 81.36 / 0.6014 → 80.23 / 0.6068   (ΔMAE +1.12, Δρ +0.0054)
    fold B: base 38.06 / 0.7248 → 37.75 / 0.7273   (ΔMAE +0.31, Δρ +0.0025)
    fold C: base 37.38 / 0.7139 → 36.39 / 0.7236   (ΔMAE +0.99, Δρ +0.0097)

Rejected on the same folds, before any 2025 contact: multiplicative
rate×availability models (shrunk rate × regressed games — smaller naive gains,
rho losses in ensembles) and OLS on weekly features (rate / late-rate /
volatility / availability — leave-one-out MAE 79–84, ρ ≤ 0.55 at n≈59:
overfit). Named residual risk: three folds from two seasons is thin, the fold
gains (+0.3..+1.1 MAE, +0.003..+0.010 ρ) are the same order as the margin v4
must close (0.67 MAE, 0.0025 ρ), and the within-season folds test the
mechanism at half-season horizon. The 2025 arm is one honest shot, not a
search.

**The ≤2024 arms are deliberately absent** from v4's artifact: fold A consumed
realized 2024 and folds B/C consumed 2023/2024 late-season weeks in tuning, so
any ≤2024 grade of v4 is in-sample and reporting one would manufacture a
flattering second sample.

**Post-grade analysis, preregistered as artifact blocks (never features):**
the availability-vs-rate variance decomposition of QB season totals
(var(log total) = var(log games) + var(log rate) + 2cov) for 2023, 2024 and
2025, and the league-history corroboration audit of §1.

**Not re-litigated** (standing negatives honored): everything v3's §2 lists —
pace-of-play, age tie-breaks, the FP-archive Week-1 source prior (REC-2 stays
blocked until January 2027), the 2025-replay projector comparison — plus v3's
own QB-market finding: the league's 2025 QB draft board is not re-used in any
form at QB. The FP benchmark remains the sanity context: FP's measured edge
over the blend is 3–9 MAE points per position; any v4 number beating FP's
2025 cells by a wide margin is treated as a leak until proven otherwise.

**Named data-needs (absent from committed disk, not faked):** unchanged from
v3 — per-player FP archived preseason projections; per-week usage
(targets/carries/attempts) and TD counts (league_history's `players_points`
does NOT supply these — points only, and for QBs a strict subset of the
nflverse stores); team-assignment history; any pre-2023 store.

## 4. Results — 2025 arm, shared population (the single preregistered run)

Marker gate: **ok** — same two dead RB picks as v3's run (pick 48, realized
29.3; pick 63, realized 8.3): the 2025 draft is preseason-frozen. Shared
population identical to v2's and v3's artifacts (QB 58 / RB 99 / WR 150 /
TE 84); every non-v4 cell below reproduces `model_accuracy_v3.json` bit for
bit, and own_v4's RB/WR/TE cells equal own_v3's exactly — both asserted by
`test_own_model_v4.py`.

MAE / Spearman, head-to-head on the shared population. The REC-3 baselines
are `naive_prev` and `recency_blend`; `walk_forward_v1` is the shipped
display-only own-model column:

| pos | n | **own_v4** | own_v3 | own_v2 | walk_forward_v1 | naive_prev | recency_blend | v4 beats both baselines? |
|---|---|---|---|---|---|---|---|---|
| QB | 58 | **72.29 / 0.7225** | 74.76 / 0.7189 | 76.14 / 0.7166 | 103.88 / 0.6712 | 78.89 / 0.7080 | 74.09 / 0.7213 | **yes (MAE −1.80, ρ +0.0012)** |
| RB | 99 | **38.66 / 0.7957** | 38.66 / 0.7957 | 40.81 / 0.7751 | 56.37 / 0.7434 | 42.37 / 0.7612 | 41.86 / 0.7682 | yes (MAE −3.20, ρ +0.0275) |
| WR | 150 | **34.05 / 0.7530** | 34.05 / 0.7530 | 34.08 / 0.7465 | 46.69 / 0.6909 | 37.72 / 0.7339 | 36.82 / 0.7344 | yes (MAE −2.77, ρ +0.0186) |
| TE | 84 | **23.73 / 0.7920** | 23.73 / 0.7920 | 23.71 / 0.7813 | 34.06 / 0.6866 | 26.73 / 0.7440 | 24.04 / 0.7871 | yes (MAE −0.31, ρ +0.0049) |

Signed bias (v4, own coverage): QB +10.87, RB +7.25, WR +9.27, TE +3.16 —
the same optimistic-side survivorship caveat as every model in this protocol.

## 5. Verdict against REC-3

**v4 CLEARS the promotion bar: it beats both naive baselines on both metrics
at all four positions — including the QB cells that killed v2 and v3 (MAE
72.29 vs the blend's 74.09, Spearman 0.7225 vs 0.7213) — so, per Cory's
ratified rule, a written promotion decision goes to Cory; nothing flips
automatically.**

Margin honesty, before anything else: the QB MAE margin is real (−1.80 on
n=58), but the QB Spearman margin (+0.0012) is roughly one adjacent
rank-swap wide. The strict-inequality bar is met on the preregistered single
shot; the fair reading of the QB ordering evidence is "no worse than the
blend at ranking, measurably better at pricing" — that fragility is stated
here so the promotion decision is made on it, not around it.

Sanity check against the FP benchmark: v4's QB 72.29 does not approach FP's
2025 QB cell (66.32) — v4 recovers about a quarter of the ~8-point headroom
FP proves exists, from stores that carry points only. RB/WR/TE are v3's
cells, already vetted inside FP's 3–9-point band. Nothing here beats FP by a
wide margin; the result is scale-plausible, not leak-shaped.

## 6. Where the QB win came from — availability vs rate (post-grade analysis)

**The decomposition the weekly grain was resurfaced for** (artifact block
`qb_variance_decomposition`, var(log total) = var(log games) + var(log rate)
+ 2·cov, QBs with positive totals):

| season | n | var(log total) | games term | rate term | 2·cov | availability share |
|---|---|---|---|---|---|---|
| 2023 | 67 | 2.416 | 0.522 | 1.107 | 0.787 | **37.9%** |
| 2024 | 67 | 3.393 | 0.642 | 1.541 | 1.209 | **36.7%** |
| 2025 | 68 | 3.614 | 0.513 | 1.755 | 1.345 | **32.8%** |

A third of QB season-total variance is availability, stable across all three
seasons — the mechanism the correction prices, and the reason a points-only
store still had something left to say about QB.

**Which side of the correction paid** (shared population, per-QB MAE gain vs
the blend): the 21 QBs scaled DOWN (full 2024 availability regressed toward
the mean) paid **+5.89 per QB** — the blend's QB optimism (+9.77 bias) lives
exactly in last year's 16-17-active-game seasons repriced at face value. The
22 QBs scaled UP (short 2024) cost **−0.88 per QB** — injury/benching
bounce-back did NOT reliably materialize in 2025 (e.g. act=2 QBs at picks
8160/829: boosted to ~90-96, realized ~11). The 15 below-gate QBs were
untouched. Net: the win is a REGRESSION-DOWN win; the boost half of the
correction is approximately a wash and survives on the cap and the theta
tempering. A future candidate could plausibly keep only the downward half —
that is a NEW hypothesis for a future prereg, not a post-hoc edit to this
one.

**The drafted-QB tier is still not ordered** — v3's second failure cause
stands: drafted-15 rho is 0.1214 for v4 (blend 0.1071, v3 0.0571); undrafted
43 at 0.6107 (blend 0.6077). v4 wins by pricing availability, not by solving
top-tier ordering — that ceiling (FP's remaining ~6 points) still lives
behind usage/TD/team data this repo does not hold.

## 7. The gated promotion diff (prepared, NOT applied)

Per REC-3 the clear produces a written promotion decision for Cory — never an
automatic flip. No shipped file, no engine CFG, no v2/v3 file, and no
recommendation record is modified by this pass. The exact diff that
acceptance would apply:

**(a) `draft/data/model_update_recommendations.json` — REC-3's record:**

    recommendations[REC-3-own-model-stays-display-only]
      .promotion_bar.candidates += {
        "own_model_v4": <the promotion_bar block of model_accuracy_v4.json,
                         verbatim — clears: true, all eight cells true>
      }
      .status: "standing-negative"
        → "cleared-by-own_model_v4-2026-08-16 — awaiting Cory's written
           acceptance; display-only until then"
      .evidence += ["draft/backtest/model_accuracy_v4.json — head_to_head_
                     shared_population", "draft/audit/projector_v4_2026-08-16.md"]

**(b) `draft/own_projections.py` — the algorithm behind `proj_ownmodel`:**
`compute_own_projections()` switches its season-total core from v1
`walk_forward` to the v4 construction — v2's fitted OLS + declared blend
(+ the marker-gated league-draft market layer once the 2026 draft is a
completed record in `league_history.json`; until then every player prices
through the no-market arm, exactly the formula the undrafted 43/99/150/84
were graded under) with the QB availability correction (frozen constants
from `own_model_v4.py`) replacing any QB market/v2 term. The board label
changes from `proj_ownmodel (walk_forward)` to `proj_ownmodel (own_v4)` so
no one reads v1 numbers as v4's.

**(c) What this diff deliberately does NOT do:** it does not put `own_v4`
into `proj_mean`'s composition against Sleeper. The bar v4 cleared measures
it against the NAIVE baselines; Sleeper's own accuracy is unmeasurable until
January 2027 (REC-2's block, unchanged), so no evidence prices a
Sleeper-vs-own_v4 mixing weight today. The promotion this evidence supports
is: v4 becomes the own-model source (replacing v1's numbers everywhere
`proj_ownmodel` surfaces), still a labeled third opinion beside Sleeper and
FantasyPros. Entering the composition proper is a second decision that
should wait for the January 2027 grade of the frozen 2026 `proj_series`.

**Caveats that travel with the decision, named:** the QB Spearman margin is
one rank-swap wide (§5); the QB constants rest on three folds from two
seasons; the 2026 pre-draft deployment shape is the no-market arm for ALL
players until the 2026 draft completes (the graded 2025 evidence covers that
arm only for the undrafted subpopulation); and the whole protocol's
optimistic-side survivorship caveat applies to every cell equally.

<!-- TERRITORY: A -->
# EXP-FP-HIST-PROJ — PREREGISTRATION (fixed BEFORE any fetch)

_Committed before the CI dispatch that fetches anything, and before any result
artifact exists. Every threshold, gate, status, metric, and baseline below is
frozen here; the runner (`exp_fp_hist_proj.py`) implements this document and
its tests enforce both arms of every gate. If a number in the eventual artifact
was not licensed by this document, it does not count._

## The question (Cory, 2026-08-15)

> "don't feel like I've gotten real confirmation that we are confident of our
> points projections, have we ran through previous years to test for sanity"

The model/learning audit (draft/audit/model_learning_audit_2026-08-15.md
§1.1–1.8) already verified the shipped projection's **arithmetic** (scoring
recomputed to the cent, 6-pt-TD priced at +43.67 for top-12 QBs, magnitudes
sane). The ONE gap it named as unmeasurable: the forecast's **skill** has no
previous-years test, because no provider's 2023–25 *preseason* projections were
ever archived by us, and a retroactive fetch normally leaks (exp33). This
experiment tests whether FantasyPros' API serves **genuinely archived,
preseason-frozen** projections for 2023/2024/2025 — and only if that is PROVEN
does it grade them.

## What one CI dispatch will answer

1. Does FP serve historical season projections at all (stat lines or points)?
2. Are they preseason-frozen, or post-hoc revised (the exp33 leak in costume)?
3. If frozen: under OUR scoring, does a professional projection source beat the
   two naive baselines the own-model backtest used — and by how much, per
   position? That delta is what forecast skill is WORTH in this league.

## What this experiment can never answer

Sleeper's own historical preseason skill. Nobody archived it anywhere;
`draft/data/proj_series.json` (frozen daily since 2026-08-09) makes 2026 the
first gradeable Sleeper season, in January 2027. That grading is already armed
and is not part of this experiment.

## Data sources (all read-only; no scoring/weight/CFG defaults touched)

- Archived FP ADP, per year: `fantasypros_adp.fetch(year)` — already proven
  genuine by exp_source_grade (2023→358 rows, 2024→343; plausible pre-draft
  ordering incl. ghost rows for since-departed players). This is the trusted
  anchor.
- Archived FP projections, per year: `fantasypros_adp.fetch_projections(year)`
  — the object under test.
- Realized outcomes: committed stores
  `nflverse_weekly_points_{2023,2024,2025}.json`, weeks 1–17 (same
  `LAST_SCORED_WEEK` as model_accuracy_backtest; 2025 carries that module's
  caveats).
- Positions: `draft/data/player_positions.json` (the RECORD, not the live
  board).
- Scoring: `draft/config/league_config.json['scoring']` via
  `scoring.score_stat_line` — **never** FP's own points for any graded number.
- Crosswalk: `adp.build_index(sleeper_import.fetch_players())` +
  `adp.match_player` — the same matcher exp_source_grade used. Match rates are
  reported honestly per year.

## Preregistered constants

| constant | value | meaning |
|---|---|---|
| YEARS | 2023, 2024, 2025 | graded seasons, each gated independently |
| LAST_SCORED_WEEK | 17 | realized total = weeks 1–17 |
| POSITIONS | QB, RB, WR, TE | K/DEF structurally ungradeable (stores are offense-only) |
| MIN_N | 10 | a cell below this reports `unmeasurable`, never a number |
| PROJ_ROWS_FLOOR | 50 | fewer parsed projection rows → `no_rows` |
| ADP_ANCHOR_FLOOR | 100 | fewer parsed archived-ADP rows → `no_adp_anchor` (gates underivable → refuse) |
| MARKER_ADP_MAX | 75.0 | markers drawn from archived-ADP picks ≤ 75 |
| MARKER_REALIZED_MAX | 30.0 | realized (wk 1–17) ≤ 30 pts marks a season lost early |
| MARKER_FULL_SEASON_MIN | 100.0 | marker's archived projection ≥ 100 → full-season-sized |
| MARKER_LEAK_MAX | 60.0 | marker's archived projection < 60 → injury already priced in → leaked |
| GHOST_MIN | 10 | fewer since-departed players in the archive → regenerated from a current DB |
| ANCHOR_RHO_MIN | 0.60 | Spearman(−adp, proj) below this → `anchor_divergent` |
| ANCHOR_JOIN_MIN | 100 | fewer ADP∩projection name joins → `thin_anchor_join` |
| CROSSWALK_MIN | 100 | fewer Sleeper-pid matches → `thin_crosswalk` |
| STATLINE_COVERAGE_MIN | 0.5 | below this fraction of rows with stat lines → rank-order-only mode |
| RECENCY_WEIGHTS | 0.7, 0.3 | the config's declared (not fitted) blend, identical to model_accuracy_backtest |

## Authenticity gates — order, both arms, refusal-first

Run per year, in this order. The FIRST failing gate names the year's status;
**no accuracy number of any kind is computed or emitted for a year that fails
any gate**. A refusal is itself the filed verdict.

**G0 — served at all.** No fetchable text → `no_fetch`. Parsed projection rows
< PROJ_ROWS_FLOOR → `no_rows`.

**G1 — anchor present.** Archived ADP rows < ADP_ANCHOR_FLOOR → `no_adp_anchor`
(markers and the anchor correlation derive from it; without it the year is
ungateable and therefore ungradeable).

**G2 — marker players (the leak detector).** Markers are derived from data,
not hand-picked: every archived-ADP player with adp ≤ MARKER_ADP_MAX, position
in POSITIONS, crosswalked to a Sleeper pid, whose realized weeks-1–17 total in
that season is ≤ MARKER_REALIZED_MAX (a top-75 preseason pick whose season
died early — or never started). A genuinely preseason-frozen file MUST still
carry a full-season-sized projection for such a player; a post-hoc file
already knows the injury.

For each marker, look up his projection **within FP's own file by normalized
name** (same provider, same naming — no crosswalk noise), valued under our
scoring where stat lines exist, else FP's printed points (magnitude gate only;
never a graded number):
  - zero markers derivable → `no_markers` (undecidable → refuse to grade)
  - any marker **missing** from the projection file, or valued < MARKER_LEAK_MAX
    → `leaked` — the filed verdict, full stop
  - any marker in [MARKER_LEAK_MAX, MARKER_FULL_SEASON_MIN) → `ambiguous_markers`
    (refuse; false refusal is the acceptable error direction)
  - all markers ≥ MARKER_FULL_SEASON_MIN → pass

**G3 — retired-since ghosts.** Count crosswalked projection players with ≥ 1
weekly row in the graded season but ZERO rows in the 2025 store (existed then,
gone now — the ADP ghost-row logic). For 2023/2024: count < GHOST_MIN →
`regenerated` (a file built from today's player DB). For 2025 this gate is
structurally undecidable (no later store) → recorded `not_applicable`, the
marker gate still binds.

**G4 — anchor cross-check.** Spearman(−adp, projection value) on the
name-joined ADP∩projection population. Join < ANCHOR_JOIN_MIN →
`thin_anchor_join`. Rho < ANCHOR_RHO_MIN → `anchor_divergent` (the trusted
archive and the claimed archive disagree wildly — named, not papered over).

**G5 — crosswalk breadth.** Projection rows matched to Sleeper pids <
CROSSWALK_MIN → `thin_crosswalk`. Match rate reported either way.

All gates pass → `graded`.

## Grading (only after ALL gates pass)

- **Value under OUR scoring**: `score_stat_line(row.stats, league scoring)`.
  If < STATLINE_COVERAGE_MIN of rows carry stat lines, the year grades in
  `points_only_rank_order` mode: Spearman only, NO MAE (FP's printed points
  encode FP's league, not ours), limitation stated in the artifact.
- **Per position** (QB/RB/WR/TE, MIN_N floor): n, MAE (statline mode only),
  mean signed bias, Spearman — on FP's own coverage.
- **Survivorship**: projected players with no graded-season weekly row are
  EXCLUDED and COUNTED (MAE optimistic by an unmeasured amount — the same
  caveat model_accuracy_backtest and C's calibration carry).
- **Baselines, identical semantics to model_accuracy_backtest.build_models**:
  - `naive_prev` = last season's realized total, unchanged — requires the y−1
    store: available for graded 2024 (from 2023) and 2025 (from 2024);
    for 2023 → `no_prior_store`, no baseline number invented.
  - `recency_blend` = 0.7×last + 0.3×prior (per-player fallback to last alone
    when the prior season is missing) — requires BOTH y−1 and y−2 stores:
    available only for graded 2025 (2024+2023); for 2024 → `no_prior_prior_store`
    (NOT silently collapsed onto naive).
- **Head-to-head on the SHARED population** (the deliverable): per position,
  FP vs each available baseline on the intersection of their populations —
  the only denominator on which "FP beats naive" is one quantity. Reported as
  MAE and Spearman per model plus the FP−baseline delta.

## Artifact

`draft/backtest/exp_fp_hist_proj.json`, `_territory` first key, one block per
year carrying: every gate's status and evidence (marker table, ghost count and
sample, anchor rho/n, crosswalk rate), the year's overall status, fetch
diagnostics (endpoint that served, or everything tried), and — only for
`graded` years — the metrics above. Committed by the workflow whether the
verdict is a hit, a null, or a refusal: a refusal that lives only in a job log
gets re-asked in three weeks.

## Mechanics

- Workflow: `.github/workflows/exp-fp-hist-proj.yml`, `workflow_dispatch` only,
  fixture tests gate the egress (external-odds-probe pattern: collect-check
  first, "gate failed" vs "gate could not run" distinguished), artifact
  committed with retry + main-only guard, `[skip deploy]` (touches no served
  path).
- Runner: `draft/backtest/exp_fp_hist_proj.py` — pure gate/grade core, thin
  egress wrapper, every failure mode one of the named statuses above, never a
  plausible number.
- Tests: `draft/tests/test_exp_fp_hist_proj.py` — a passing fixture AND a
  leaked fixture per gate (both arms), scoring parity with score_stat_line,
  baseline parity with model_accuracy_backtest semantics, refusal paths.

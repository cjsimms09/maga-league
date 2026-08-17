# ADVANCED METRICS (EPA / AIR YARDS / CPOE) — closing Cory's gap, 2026-08-16

## 0. Cory's directive, verbatim

Relayed through the build brief: **"we need to add those to the loop and
close them, fix this"** — referring to EPA, air yards and CPOE, which the
research relay found already live inside a nflverse release this repo
already fetches from (the same release host `fetch_component_stats.py`
uses), but which that file's own docstring names as deliberately trimmed:
*"no EPA/air-yards/CPOE analytics columns (unused by v5 — trimmed for
size)."* This is a genuinely free opportunity — no new key, no new cost,
unlike the concurrent paid props studies running the same night. This
document closes the gap end to end: extraction, a concrete candidate use,
preregistration, leak-free grading, and an honest verdict.

## 1. What was confirmed present in the real nflverse schema — measured, not assumed

Two different nflverse parquet releases live on the same GitHub host
`fetch_component_stats.py` already fetches from. Both were downloaded and
their columns inspected directly (not inferred from documentation) for all
five seasons 2021-2025 before any code was written:

| release | years reachable | has EPA (pass/rush/rec) | has air yards (pass/rec) | has CPOE | has RACR/WOPR |
|---|---|---|---|---|---|
| `player_stats/player_stats_<year>.parquet` (the store `fetch_component_stats.py` prefers) | 2021-2024 only (2025 404s) | YES | YES | **NO — checked all four years, absent every time** | YES |
| `stats_player/stats_player_week_<year>.parquet` (that file's fallback, used there ONLY for 2025) | **2021-2025, all five — verified reachable, not only the one year `fetch_component_stats.py` ever tries it for** | YES | YES | **YES — populated for every attempt-bearing QB row, all five years** | YES |

The load-bearing finding: CPOE does not exist in the schema
`fetch_component_stats.py` prefers, in any year checked. It exists only in
the schema that file treats as an occasional fallback — and that fallback
schema turns out to be fetchable for every season, not only the one year the
existing file's primary happens to 404. `fetch_advanced_stats.py` (this
study's extraction) therefore fetches EXCLUSIVELY from `stats_player_week`
for all five seasons — a deliberate, measured departure from
`fetch_component_stats.py`'s URL preference, made possible by this probe,
not assumed from its docstring. `dakota` and `pacr` were also observed
present in one or both schemas; neither was requested by the build brief and
neither is extracted — named here rather than silently grabbed or silently
ignored.

**EPA grain — checked, not assumed.** EPA is fundamentally a per-play stat.
The player_stats-family tables provide it ALREADY AGGREGATED to one
player-week total per category (`passing_epa`, `rushing_epa`,
`receiving_epa`). This was verified against the data itself: `rushing_epa`
is NaN for every 2024 row with `carries == 0`; `receiving_epa` is NaN for
every row with `targets == 0`; `passing_epa` is NaN for every row with
`attempts == 0` — i.e. the column IS the play-level EPA summed over exactly
the plays the corresponding volume column counts. A true per-play grain
(one row per play) would require the separate play-by-play (pbp) release, a
much larger, different data source. Per the build brief's explicit
instruction, that fetch was **not attempted** — out of scope, named plainly
rather than silently worked around.

## 2. Extraction (deliverable 1)

`draft/backtest/fetch_advanced_stats.py` — a NEW sibling store.
`fetch_component_stats.py` and its committed `component_stats_*.json` bytes
were **not edited** (other agents' parity tests depend on those exact bytes
during draft week; this file only imports its `_download` and `_crosswalk`
helpers, read-only). Extracts, per QB/RB/WR/TE player-week, regular season
weeks 1-18:

- `pass_epa` / `rush_epa` / `rec_epa` — continuous, NaN stripped, a real
  `0.0` KEPT (a scrambled kneel-down is a measured value, not a missing one)
- `pass_air_yd` / `rec_air_yd` — integer, zero-stripped (same convention as
  every prior store)
- `cpoe` — QB-relevant, present exactly when `attempts > 0`
- `racr` — receiving air conversion ratio, NaN-stripped, real zero kept
- `wopr` / `ay_share` — always-defined share stats, zero-stripped

Committed: `draft/backtest/advanced_stats_2021.json` through `_2025.json`.
Sizes 804KB-822KB each, well under the 2MB commit ceiling. Crosswalk
(`nfl_data_py.import_ids()`) mapped 636-648 gsis IDs per season with 0-11
unmapped (kept as `gsis:<id>`, never dropped). **0 duplicate player-week rows
found in any of the five seasons** (unlike `fetch_component_stats.py`'s
primary schema, which does carry a documented mid-week-trade duplicate
artifact) — the extraction still guards against it defensively.

**Parity.** Running `fetch_advanced_stats.py` a second time, unforced,
against the live network reports `"status": "unchanged"` for all five
committed seasons — the only way that status is reachable is a byte-identical
rebuild of the `weeks` payload from the same URL:

```
{"season": 2021, "status": "unchanged", ...}
{"season": 2022, "status": "unchanged", ...}
{"season": 2023, "status": "unchanged", ...}
{"season": 2024, "status": "unchanged", ...}
{"season": 2025, "status": "unchanged", ...}
```

**Cross-store coverage** against the existing `component_stats_2024.json`
(the store the candidate use joins against): 569 of 570 component-store
players (99.8%) also appear in the advanced store; 28 additional players
appear in the advanced store but not the component store (a different
release of the same underlying nflverse pipeline — expected, not identical
row-for-row, and stated as such rather than silently assumed equal).

13 tests in `draft/tests/test_advanced_stats.py`: shape/provenance, the
two-family missing-vs-zero rule (share stats zero-stripped, continuous
metrics real-zero-preserved — with a test asserting the zero-preserving
branch is actually exercised, not dead code), plausible-range sanity (wide,
because these are WEEKLY not season ratios — measured full-panel extremes
`cpoe [-89.5, 72.4]`, `racr [-86, 116]`, `wopr [-0.22, 1.79]`,
`ay_share [-0.9, 1.84]` are quoted directly in the test rather than an
invented tight band), the schema-choice claim itself (pinned: `cpoe` absent
from `component_stats_2024.json`'s recorded columns, present in
`advanced_stats_2024.json`'s).

## 3. Candidate use — which target the data actually supports (deliverable 2)

The build brief named two natural targets and asked which the data actually
supports, building whichever is real, reporting both:

**(b) Breakout-equity air-yards trend — NOT buildable here.**
`draft/tools/breakout_equity.py` and `draft/audit/breakout_equity_2026-08-16.md`,
named in the brief as an existing study to enhance, **do not exist anywhere
on this branch** (`claude/fantasy-football-research-926y6z`) at the commit
this study started from (`b61f536d`) — confirmed by repo-wide search, not
merely a missing-file guess. `git log --all` shows the work landed on a
**different, still-separate worktree branch** (commit `998ca53b`,
titled *"Breakout equity: ... preregistered and graded against real 2023-25
drafts — NULL, published"*) that has never merged into this branch. Per the
brief's own stated contingency — *"if it's mid-flight by another agent avoid
touching it, just import its published functions IF COMMITTED"* — there is
nothing committed here to import, and reaching across an unmerged sibling
branch to grab the file would itself be exactly the kind of edit this study
has no authorization to make. Worth naming for expectations either way: that
sibling commit's own title says its primary preregistered test did NOT clear
— a null, published under the same house discipline this study follows
below. Nothing was lost by not chasing it.

**(a) EPA/air-yards efficiency term on own_model_v5's component opinion —
BUILT, preregistered, graded.** `own_model_v5.comp_opinion()` regresses a
player's raw box-score volume to LEAGUE box-score efficiency
(points-per-attempt/carry/target) — a construction that carries no
information about HOW a player earned that box score. This is buildable
directly from data and code already on this branch (`fetch_advanced_stats.py`
+ the committed `component_stats_*` stores + `own_model_v5`'s own imported
machinery), so it is the whole of what was built and graded.

## 4. Preregistration (committed separately, before grading — commit-order is the proof)

`draft/backtest/advanced_efficiency_study.py`'s module docstring, committed
before `advanced_efficiency_study.json` existed. Full form:

- **Construction**: `adv_rate = v5_rate * (1 + ADV_W * clip(composite_z, -CLIP, CLIP))`
  — a multiplicative tilt, the same structural pattern v5 already uses for
  its Vegas week-1 tilt (reviewed, accepted, not a new mechanism).
- **composite_z**, league Y-1 z-score (0.7/0.3 blended with Y-2 where
  qualified — v5's own `RATE_RECENCY`, not refit):
  - QB: `0.5·z(cpoe) + 0.5·z(pass_epa/att)`, qualify at `pass_att ≥ 100`
  - RB: `z(rush_epa/carry)`, qualify at `rush_att ≥ 50`
  - WR/TE: `0.5·z(rec_epa/tgt) + 0.5·z(receiving_air_yards/tgt)`, qualify at
    `tgt ≥ 20`
  - below the volume floor: `composite_z = 0.0` (no opinion, not a penalty)
- **ADV_W = 0.20, CLIP = 2.5 — declared, not tuned.** No grid was run over
  this weight; there is no fold this study used to pick it, so — unlike
  v5's own BETA/GLAM/weights, which consumed both leak-free folds in tuning
  — there is no possibility of fold-fit contamination for this parameter.
  The magnitude was chosen by analogy to v5's own Vegas tilt (`VG=0.50` on a
  noisier, more-removed team-total signal), scaled down by roughly half,
  rounded to one decimal. Stated exactly as that: a defensible default, not
  backed by any grade run before the file was committed.
- **Three genuinely held-out folds** (2023, 2024, 2025) — because nothing
  was tuned, all three leak-free transitions the stores make available are
  legitimately available to THIS question, unlike v5's own tuning which had
  to spend both folds and leave only 2025 to grade.
- **Graded at the comp_opinion level**, not the full v5 ensemble — stated
  before grading: comp_opinion is the layer this signal modifies directly;
  the full ensemble additionally depends on the current 2025 league draft
  market and QB availability correction, neither cleanly re-derivable for a
  2023/2024 "as-of" league state on this branch. A narrower, more surgical
  grade than v5's own `arm_2025`; a result here says nothing about full
  ensemble promotion.
- **Clearing bar, same shape as REC-3**: `comp_adv` beats `comp_control` on
  BOTH MAE and Spearman, at ALL FOUR positions, in ALL THREE folds, strict.
  No partial credit.

`draft/tests/test_advanced_efficiency_study.py` (11 tests) pins the
machinery before the results existed: hand-computed `_zscores` and
`advanced_rates` (including attempt-weighted CPOE aggregation), the
volume-floor exclusion (not zero-fill), the leakage guard
(`comp_opinion_adv` raises on `(2023,2024)→2024`, same as v5's own guard),
and — the strongest correctness check — **`ADV_W=0` reproduces
`own_model_v5.comp_opinion()` EXACTLY** on the real committed 2025 fold
(>100 players, every value within `1e-9`), proving the reimplementation
changes nothing except the one preregistered term.

## 5. Graded result — leak-free, three folds, own_v6's baseline for context

`comp_control` (v5's unmodified comp_opinion) vs `comp_adv` (tilted), all
three folds:

| fold | pos | n | control MAE/ρ | adv MAE/ρ | beats control (both metrics) |
|---|---|---|---|---|---|
| 2023 | QB | 56 | 84.90 / 0.5594 | 89.56 / 0.5429 | **NO** |
| 2023 | RB | 108 | 46.15 / 0.6049 | 45.62 / 0.6147 | **yes** |
| 2023 | WR | 135 | 33.80 / 0.7535 | 33.30 / 0.7544 | **yes** |
| 2023 | TE | 75 | 24.42 / 0.7464 | 25.26 / 0.7410 | **NO** |
| 2024 | QB | 59 | 73.24 / 0.6262 | 73.59 / 0.6502 | **NO** (MAE worse) |
| 2024 | RB | 102 | 44.72 / 0.7249 | 43.24 / 0.7394 | **yes** |
| 2024 | WR | 147 | 37.77 / 0.7160 | 38.63 / 0.7272 | **NO** (MAE worse) |
| 2024 | TE | 78 | 25.45 / 0.7111 | 24.97 / 0.7138 | **yes** |
| 2025 | QB | 58 | 74.33 / 0.7188 | 80.72 / 0.7156 | **NO** |
| 2025 | RB | 99 | 39.22 / 0.7895 | 39.04 / 0.7851 | **NO** (ρ worse) |
| 2025 | WR | 151 | 33.73 / 0.7552 | 34.18 / 0.7491 | **NO** |
| 2025 | TE | 84 | 22.13 / 0.8003 | 23.88 / 0.7817 | **NO** |

**4 of 12 (position, fold) cells clear; 8 do not. The preregistered bar
(all 12) does NOT clear.**

For context, own_v6's live baseline (promoted model, shared population,
`model_accuracy_v6.json`): QB 72.29 MAE / 0.7225 ρ (n=58), RB 37.54 / 0.7968
(n=99), WR 33.63 / 0.7634 (n=150), TE 23.33 / 0.7987 (n=84). This study
grades `comp_opinion` alone (a component of v5, upstream of the full
ensemble), not the full v6 pipeline — the numbers above are not directly
comparable to v6's row and are not claimed to be; they are quoted here only
so the reader has the live bar in view.

**Read honestly.** RB is the only position that beats control in more than
one fold (2023, 2024; not 2025) — the closest thing to a real, if
inconsistent, signal in this construction. QB is the clearest miss:
`comp_adv` is WORSE than `comp_control` on MAE in **all three** folds — the
CPOE+EPA composite, z-scored among only `pass_att ≥ 100` qualifiers (a
small, committee-QB-inclusive pool with genuinely wide weekly CPOE tails,
per §2's measured range), appears to be adding noise rather than signal at
this grain and volume floor for QB specifically. No position clears in all
three folds.

## 6. Verdict — honest null, published, no ruling manufactured

**The preregistered construction does NOT clear its own bar.** Per house
discipline (`year2_escalator`'s null in `league_benchmark_2026-08-16.md`,
§4b), this is published as-is: **no diff is prepared, no
`DECISIONS-NEEDED.md` ruling item is created.** This is a genuine, if
unevenly-distributed, null for the ONE preregistered construction tested —
not evidence that no EPA/air-yards/CPOE signal exists at any construction or
weight. The RB-specific partial signal (2 of 3 folds) is named as the most
promising loose thread for a possible future re-preregistration with a
different, RB-specific form — not attempted here, since re-forming after
seeing this result would be exactly the post-hoc tuning this study's own
discipline forbids.

**What this means for §1's directive.** "Add those to the loop and close
them" is satisfied at the DATA layer regardless of this grade: EPA, air
yards, and CPOE are now extracted, committed, tested, and available for any
future candidate construction to draw on — the "loop" that was open (real
columns, in a source already fetched, never extracted) is closed. Whether
THIS PARTICULAR use of them earns a place in the live model is a separate,
honestly-negative question, answered above.

## 7. Machinery, tests, honesty

- `draft/backtest/fetch_advanced_stats.py` — extraction, network-touching,
  parity-verified by hand (§2).
- `draft/backtest/advanced_stats_2021.json` .. `_2025.json` — committed
  stores.
- `draft/backtest/advanced_efficiency_study.py` — the candidate use
  (preregistration in the docstring, machinery below it).
- `draft/backtest/advanced_efficiency_study.json` — the graded result
  (this document's §5/§6).
- `draft/tests/test_advanced_stats.py` — 13 tests, network-free.
- `draft/tests/test_advanced_efficiency_study.py` — 11 tests, network-free
  except the structural-parity test which reads committed stores only (no
  live fetch).
- Full `draft/tests/` suite: 2653 passed, 5 skipped, 11 failed — every
  failure is a PRE-EXISTING, date-sensitive regeneration-parity check
  (`test_own_model_v2` through `v6`, `test_playoff_sos`,
  `test_source_weight_prior`, `test_model_accuracy_backtest`,
  `test_draft_replay_2025`, `test_adp_sd_measured`) unrelated to this
  study's files — confirmed by re-running the same failing tests with this
  study's files stashed out of the tree: identical failures, identical
  messages, before this study touched anything.
- `own_model_v2.py` through `own_model_v6.py`, `fetch_component_stats.py`,
  `draft/tools/breakout_equity.py` — none edited. STAY OUT OF list honored.

## 8. What was NOT done, named plainly

- No play-by-play (pbp) fetch — out of scope per the build brief; EPA
  extracted at the player-week grain the `player_stats`/`stats_player_week`
  tables actually provide (§1).
- No grid search over `ADV_W`/`CLIP`/`MIN_VOL` — a single preregistered
  value, by design (§4), so the three folds stay genuinely held out for this
  question.
- No breakout-equity enhancement (§3(b)) — the target file does not exist on
  this branch.
- No edit to `fetch_component_stats.py`, `own_model_v2.py`-`v6.py`,
  `draft/tools/breakout_equity.py`, or any file outside this study's own
  deliverables.

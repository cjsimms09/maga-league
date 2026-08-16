<!-- TERRITORY: A -->
# THE LEAGUE BENCHMARK — does the tool lose to everyone, or just Cory? — 2026-08-16

## 0. The questions, verbatim

Cory, 2026-08-16, after reading the draft replay's verdict
(`draft/audit/draft_replay_2025_vs_actual.md`: the tool lost to his real
drafts, pooled −65.7/season on the optimal arm):

> "Does model lose to everyone's drafting or just mine? We need to make this
> model better or at least better than most of the league at drafting, how
> do we do that?"

> "Should we identify what things I did better?"

and the addendum:

> "Do we need to find who the best drafter were? Top 3 and study what they
> do better then make sure model can do that or better"

**To the second question directly: YES.** The pick-by-pick replay tables and
this doc's league tables ARE the systematic record of where his reads beat
the board, and the shadow ledger
(`draft/data/draft_shadow_2026.jsonl` machinery) will capture every 2026
disagreement between his picks and the tool's recommendation as data, pick
by pick, on draft night. Rookies, roster-status news, and ascending year-2
players are that record's first three quantified components — the replay
named them, and §2 below turns two of them into testable layers (the third
is already priced on the live board and is verified rather than rebuilt).

This doc is written in the house order: §1–2 (protocol + preregistration)
were committed BEFORE any layer grade existed; §3 onward are the results,
appended afterward without touching §2's forms.

## 1. What runs — the all-seats replay

`draft/tools/replay_all_seats.py` drives the EXISTING single-seat machinery
(`draft/tools/draft_replay_2025.py`, imported and never edited) for **every
seat, every season 2023–25**: the tool sits in owner X's real seat with X's
real keepers, every other owner's picks byte-identical to history, K/DEF
mirrored from X's actual picks (they cancel exactly), and both frozen
rosters graded on actual weekly points under both lineup arms — hindsight-
optimal (the roster-quality primary) and realistic start-of-week. The
policy, projections, caps, rails, and grading are IDENTICAL to the
committed single-seat replay's primary arm; seat 1 (Cory) reproduces
`draft_replay_2025.json`'s numbers exactly (pinned by test before anything
else ran).

**Per-seat caveat, named up front:** each seat-year is one alternative
history under fixed opponents. Ten seats are ten SEPARATE counterfactuals —
they cannot happen simultaneously, and the tool's rosters may overlap
across seats. The league table reads "the tool in X's chair vs what X
actually drafted", ten times over, never "the tool re-drafting the league."

Artifact: `draft/data/replay_league_table.json` (deterministic,
`_territory` first). Tests: `draft/tests/test_replay_all_seats.py`,
`test_rookie_prior.py`, `test_year2_escalator.py`.

## 2. PREREGISTRATION — the candidate layers, forms frozen before grading

The single-seat replay named three mechanisms behind the Cory gap (§5 of
its audit doc): no rookies on a walk-forward board, no roster-status news,
under-ranked ascending year-2 players. Two are buildable walk-forward and
are preregistered here as layers; the third is a verification, not a build.
**The forms below — buckets, thresholds, clips, fit windows, and the
clearing bar — are frozen in this commit. Changing any of them after seeing
a replay grade is a NEW layer requiring a new prereg, not a fix.**

### 2a. Rookie prior from NFL draft capital (`draft/tools/rookie_prior.py`)

- **Store:** `draft/backtest/nflverse_draft_picks.json` — NFL draft picks
  2021–2025, QB/RB/WR/TE only, from the nflverse `draft_picks` release,
  committed with provenance. Period-correct by construction: the source's
  career-outcome columns (games, career yards, w_av, `to`, …) are DROPPED
  at build time; what remains is the draft-night information set of each
  class year plus the gsis→sleeper crosswalk (nfl_data_py `import_ids()`,
  the component stores' own source; unmapped picks keep `sleeper_id: null`
  and are counted, never dropped — 1 of 397 rows).
- **Fit for replay season Y:** classes C ∈ {2021…Y−1} only. Outcome of a
  class-C pick = his total scored points in season C (weeks 1–17, committed
  stores; component stores under the frozen table for 2021–22), **0.0 when
  he never recorded a scored row — busts count, that is the base rate.**
- **Form:** capital buckets by overall pick **1–10, 11–32, 33–64, 65–105,
  106+**; `Prior(pos, bucket)` = mean outcome in the cell; a cell with
  **n < 4** falls back to the position's pooled mean over all its fit rows
  (every n and every fallback reported in the artifact).
- **Application in replay Y:** every class-Y pick with a sleeper id not
  already on the walk-forward board enters the board at its cell value;
  position from the store; replacement levels recomputed. Nothing else
  changes.
- **Leakage guard:** `fit_rookie_prior(Y)` asserts every fit class < Y; the
  test traces every file open on the layer path and fails on any ≥Y store.

### 2b. Year-2 escalator (`draft/tools/year2_escalator.py`)

- **Cohort of transition S→S+1:** NFL draft class S (committed store,
  sleeper-mapped) with year-1 scored total **≥ 50.0** points. Undrafted
  rookies are not in the store and thus not in the fit — named.
- **The distribution itself is a deliverable** and is reported per position
  per transition (n, mean ratio, median ratio, ratio of sums) whatever the
  escalator grades — this is the "measure the actual year-1→year-2
  progression" half of the ask, and it is reported even if it kills the
  layer.
- **Escalator for replay Y:** pool transitions with S+1 ≤ Y−1
  (2023: 2021→22; 2024: adds 2022→23; 2025: adds 2023→24);
  `m(pos) = clip(Σyear2 / Σyear1, 1.00, 1.30)`; a position with pooled
  **n < 5** keeps m = 1.0. Ratio of sums, not mean of ratios (one 5→80
  season must not own the cell). **Clip floor 1.00 means the layer only
  escalates — it tests the ascending-sophomore hypothesis and nothing
  else.**
- **Application in replay Y:** every player on the walk-forward board whose
  NFL draft class is Y−1 gets projection × m(pos); replacement recomputed.

### 2c. Roster-status — verify, don't build

The live 2026 board already carries `team`, `depth_chart_order`,
`injury_status` per player. The claim to verify against the COMMITTED
`public/draft_data.json`: **no retired or teamless player carries a
draftable projection** (zero players with null team at all, and zero
teamless players with `proj_mean > 0`). If verified, the doc states this
edge is already priced live and NO layer is built. The Brady-2023
pathology is a walk-forward artifact, not a live defect.

### 2d. The clearing bar (preregistered)

Baseline pooled Cory-seat optimal gap is **−65.7/season** (the committed
single-seat replay). A layer **CLEARS** if, on the optimal arm, it

1. closes ≥ 25% of the pooled Cory gap (change ≥ +16.4 points/season), OR
2. lifts the tool's pooled league-table position by ≥ 2 seats
   (`beats_n_of_10`, pooled mean deltas).

Per-year deltas are reported in full either way — a layer that helps 2024
and hurts 2023 is published as exactly that, and a clearing layer whose
help is concentrated in one year is routed with that concentration named.
A layer that clears gets a **prepared, gated diff for the live 2026 board
path — NOT applied; Cory rules** (queued in `DECISIONS-NEEDED.md`).

### 2e. Drafter-skill study (the addendum — metric fixed here)

- **Skill metric, tool-independent:** VALUE OVER SLOT. Every non-keeper
  skill-position pick in each season's real 150-pick draft is graded
  `actual season total − league mean actual of non-keeper skill picks in
  the same round that year`; owner score = sum over his picks, pooled
  2023–25. Keepers (measured separately as keeper leverage: actual minus
  the occupied round's mean), K/DEF (no committed weekly stores; timing
  measured as a behavior), and the one position-less pick (2025 pid 12530)
  are excluded, each named. The ranking never touches the tool's
  projections.
- **Behaviors profiled** (pooled, n stated on everything): rookie rate +
  hit rate + surplus; year-2 rate + surplus; late-round (pick ≥ 101) hits
  + surplus; first-QB / first-TE round; earliest K/DEF round; keeper
  leverage. A "hit" = surplus > 0. A behavior counts as "what the top 3 do
  better" only if it separates them from BOTH the tool's replayed behavior
  in their seats AND the league's bottom half.
- **NOT computable, named:** ADP-deviation behaviors (reaches vs value
  falls). No season-stamped 2023–25 ADP exists in committed stores
  (`adp_series.json` is 2026-only; the BBM archive holds one 2023 finals
  subset). Absent, not approximated.
- **Small-n rule:** ~12 live skill picks per owner-year, ~36 pooled. No
  "best drafter" is crowned on a margin the table itself can't support;
  the top3-vs-bottom-half GROUP contrast is the only quotable read.
- **"Can the model do that or better":** graded as the tool's replayed
  optimal-arm delta in each top-3 seat, baseline vs layered — did the
  layers move the tool past the top drafters in their own chairs?

*(Sections §3+ appended after this prereg was committed.)*

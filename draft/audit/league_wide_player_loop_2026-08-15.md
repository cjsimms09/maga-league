# The League-Wide Player Loop — closed (2026-08-15)

**Cory's directive:** *"We should at least be projecting players in every matchup
not just my own. It at least gives us data to make our projected points better.
We need to add this, close the loop, and use it to help model get smarter."*

**The gap this closes.** The forecast rail already carried TEAM-level claims
league-wide (claims-cron: matchup win probabilities + the weekly-high pick),
and the resolution path already read Sleeper's `players_points` — realized
per-player points for every rostered player, every matchup, every week. The
realized half of a player-level loop flowed; the predicted half did not exist.
Now it does, and the loop grades itself.

## What emits, and when

**`player-projection-cron`** (new scheduled function, **Thursday 10:00 UTC** —
before Thursday Night Football, whose earliest kickoff is ~00:20 UTC Friday).
One `forecast` ledger row per player-week-arm, method
**`player-week-projection-v1`**, ftype `point`, deterministic key
`wk|<season>|<week>|player|<player_id>|<arm>`:

- **Coverage:** every rostered player on every roster (~150/week), both
  starters and bench, with `subject.starter` and `subject.owner_id` on each row.
- **Arm `ours`** — the strictly-prior blend: the board's `proj_mean` (already
  scored under OUR table; `proj_feed`'s one-scorer argument) on a per-week
  basis (`/17`), weighted as **3 pseudo-weeks**, plus the player's own
  in-season realized appearances (weeks `< w`, bye week excluded, 0.0 weeks
  excluded as DNP-indistinguishable — a declared assumption). Pre-week-3 the
  prior dominates; realized takes over as weeks accumulate. No board prior +
  fewer than 3 appearances ⇒ **no row** (status `absent` — refusal, never an
  invented number).
- **Arm `sleeper`** — Sleeper's own weekly projection line
  (`pts_half_ppr ?? pts_ppr ?? pts_std`), fetched from
  `/v1/projections/nfl/regular/{season}/{week}` with bundle()'s TTL +
  negative-cache discipline and the empty-payload guard (≥50 priced rows, the
  zeroes-board trap from `sleeper_import.py`). Taken **as-is** — see gaps.
- **Bye/inactive-aware, both arms:** a player on bye or ruled out projects 0
  and the row says why (`proj_feed.reason()` semantics; the zero over a
  Sleeper number is labeled `zeroed(guard-over-sleeper)`).
- **Timing honesty:** every row carries `emitted_late` — `false` only when the
  run happened before 22:00 UTC on the week's Thursday (derived from Sleeper's
  `season_start_date`; a two-hour margin before any possible kickoff). Late or
  unknown-timing rows are **excluded from grading and counted**, never
  silently graded.
- **Re-run safety:** an emitted-marker doc dedupes re-runs; the grader's
  earliest-per-key join is the backstop. `predledger.appendBatch` (new,
  additive) reserves the seq block before writing so a crash leaves a harmless
  gap, never a colliding counter.

**Team sums, alongside:** `playerproj:teamsums:<season>:<week>` — per-owner
bye-aware starter totals under arm `ours`, with a **null total whenever any
starter has no number** (a partial sum reads exactly like a real one). This is
the per-matchup projected-points input the analyzer-prior hypothesis consumes:
the sibling backtest measures that prior on history; this doc is its forward
feed. (Their files untouched; the connection is this artifact's shape.)

## How it resolves and grades

- **Resolution** (claims-cron, Sunday 13:00 UTC): the same `players_points`
  read that settles team scores now settles player rows — one
  `forecast_resolution` per forecast key, `outcome` = realized points under
  league scoring. A player with no realized entry (dropped mid-week) stays
  pending — not a miss. Marker-guarded against duplicate re-runs.
- **Grading** (grade-cron, Tuesday 12:00 UTC): player-week rows are
  **partitioned out by method before the generic grader runs**, so
  `forecasts.point` keeps meaning what it always meant. The snapshot gains one
  additive block, `player_weeks`: per-position **per-arm n / MAE / bias**, a
  cumulative `better_arm` per position (named only at n≥10 per arm), mean
  within-week Spearman per arm, and a `by_week` table. Aggregates only — no
  per-player rows in the calibration ledger.
- **Three jobs on purpose:** emit (Thursday) / resolve (Sunday) / grade
  (Tuesday) — no run settles or grades a row it just wrote.

## How the grades reach the learning machinery

The `player_weeks` block rides inside the **calibration snapshot** grade-cron
appends (`calibration:<season>:<ts>`) — the exact ledger the evidence-weight
consumption and the REC-2 source-weight recommendations read. As weeks
accumulate, the per-position per-arm skill table gives that machinery
player-week evidence (~hundreds of residuals/week) instead of waiting for
season-end draft grades: which arm to trust per position is a *measured,
cumulative* quantity from week 2 onward.

## Known skill at ship time (offline, committed 2023/2024 stores, OUR scoring)

Protocol: `exp_weekly_env` eval semantics — strictly-prior features, MAE vs
realized, weeks 5–18, ≥3 prior appearances, prior mean ≥5.0. Cross-check
first: the pure running-mean baseline rebuilt from the committed stores lands
within 0.03 MAE of `exp_weekly_env.json`'s committed baseline (2023: 5.676 vs
5.673; 2024: 5.713 vs 5.737) — stores and experiment agree about reality.

Arm `ours` (blend), 2024, prior stand-in = walk-forward-lite from the 2023
store (see caveats):

| Cut | n | MAE | bias | weekly Spearman |
|---|---|---|---|---|
| Blend, **identical population** as baseline (w5–18) | 2282 | **5.59** | −0.65 | 0.514 |
| Running-mean baseline, same population | 2282 | 5.71 | −0.02 | 0.496 |
| Blend, full priced population (w2–18) | 4419 | 4.74 | −0.40 | 0.599 |
| Blend, early weeks only (w2–4) | 766 | 4.57 | −0.39 | 0.600 |
| Prior-only, early weeks (w2–4) | 749 | 4.70 | −0.70 | 0.568 |

Per position, blend vs baseline on the identical population (2024):

| Pos | n | blend MAE | baseline MAE | blend bias |
|---|---|---|---|---|
| QB | 386 | 8.28 | 8.28 | −2.22 |
| RB | 590 | **5.36** | 5.52 | −0.20 |
| WR | 968 | **5.09** | 5.22 | −0.23 |
| TE | 338 | **4.39** | 4.49 | −0.87 |

Reading: the blend beats the pure running mean at RB/WR/TE, ties at QB (with a
known under-projection bias the live grading will keep measuring), improves
rank skill everywhere, and — the real gain — **prices the weeks and players
the baseline must refuse** (early season, thin history) at better accuracy
than prior-only. K sweep (2/3/4 pseudo-weeks): MAE 4.7353 / 4.7355 / 4.7399 —
the declared K=3 is measured, flat, and stays.

2023 validates the realized-mean regime only (no committed 2022 store to build
a prior from): baseline MAE 5.68 / Spearman 0.50, consistent with 2024.

Artifacts: `draft/backtest/player_week_projection_skill.py` → `.json`;
mechanics pinned by `draft/tests/test_player_week_projection_skill.py`
(strictly-prior perturbation proof included) and
`draft/tests/weekly_player_projection.test.js` (68 assertions).

## Honest gaps

1. **Sleeper-arm availability is unverified from this sandbox** (egress
   blocked here). The endpoint shape is the one `sleeper_import.py`'s probe
   verified and production egress to Sleeper demonstrably works (claims-cron),
   but the first live Thursday is the real test. Fails soft: arm `ours` ships
   alone and the cron response names the fetch status.
2. **Sleeper's scoring is not our scoring.** `pts_half_ppr` assumes 4-pt pass
   TDs; we score 6. Arm `sleeper` is taken as-is (correcting it would make it
   partly our number), so it carries a known negative QB bias that the
   per-position grading will measure rather than hide.
3. **The historical prior is a stand-in.** No committed 2023/2024 board
   exists, so validation rebuilt the prior walk-forward-style
   (`lab_projections` constants). The live prior (`proj_mean/17`) is of the
   same species but not the same number; live grading measures the real one.
4. **Roster vintage.** Forecasts price Thursday's rosters; resolutions read
   the week's matchup rows. A player dropped between Thursday and Sunday stays
   pending (never a miss); a player added after Thursday has no forecast that
   week. Coverage counts make both visible.
5. **0.0-week ambiguity.** Live `players_points` cannot distinguish
   played-for-zero from did-not-play; both are excluded from the realized
   history (declared above, measured both ways in the validation JSON).
6. **Ledger volume.** ~300 forecasts + ~300 resolutions/week ≈ 10k rows by
   season end. Emission and resolution use `appendBatch` (one key-listing per
   batch), but **grade-cron's read side loads every `pred:` key sequentially**
   every Tuesday — that side is owned by the sibling that just rewired it and
   will need batching by midseason. Flagged, not touched.
7. **K/DEF skill is unvalidated.** The historical stores carry QB/RB/WR/TE
   only; K/DEF rows emit live (board prior + realized) and will be graded by
   the loop itself, but ship with no offline number.

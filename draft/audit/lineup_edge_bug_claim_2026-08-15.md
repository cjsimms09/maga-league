CLAIM: `infer_positions()` (both `draft/backtest/roster_sim.py` and its JS port,
`inferPositions()` in `src/routes/lineup.js`) silently drops any player who only
ever started via a FLEX-type slot from position classification, causing
`best_lineup_points()`/`bestLineup()` to undercount the hindsight-optimal lineup
whenever such a player actually started. This affected the "certified" L0
lineup-ceiling-money figures published in EFFICIENCY-LEAK.md since the file was
first written (2026-08-08), understating the leak. The fix (fall back to
`draft/data/player_positions.json`'s ground truth for unresolved ids, the same
remedy already used elsewhere in this repo for the identical defect class in
`wire_level.js`) is correct and the corrected numbers are the true ones.

WHAT RAN:
1. `draft/tools/lineup_edge_backtest.js` — a new, leak-free backtest replaying
   every real 2023-25 team-week with a strictly-prior-information projection.
   Its per-row invariant check (`optimal >= actual`, since a hindsight-perfect
   lineup can never score less than what a human actually played) failed on
   first run with concrete counterexamples, e.g. season=2023 roster_id=3 week=3:
   optimal 121.28 < actual 125.18.
2. A direct census (`node -e` one-off) of every season counting starters whose
   `inferPositions()` position came back undefined: 10 in 2023, 10 in 2024, 16
   in 2025 (36 distinct players total).
3. Cross-checked those 36 ids against `draft/data/player_positions.json`: 28/29
   sampled ids covered (the one gap, id 7045, remains unresolved after the fix —
   no regression, same as before).
4. After the fix: `draft/tests/lineup_edge_backtest.test.js` (13 checks, JS) and
   `draft/tests/test_roster_sim.py` (13 checks including a new per-row Python
   equivalent, `test_hindsight_ceiling_beats_realized_every_week`) both pass —
   including the previously-failing invariant.
5. Re-ran the certified grader's own documented refresh command,
   `python draft/backtest/lab.py` (experiment L0), and diffed the regenerated
   `lab-results.json`/`LAB-REPORT.md` against the pre-fix committed versions.
6. Full regression suites after all changes: `bash scripts/js-sweep.sh` (256/256
   entry points) and `python -m pytest draft/tests/` (2148 passed, 6 skipped).
7. Separately, ran the actual lineup-edge backtest (not just its unit tests) to
   answer Cory's original question — does the live tool's fallback projection
   beat human play — using the corrected code.

WHAT CAME BACK:
- The per-row invariant violation was real and reproducible before the fix, and
  is gone after it (all three season parametrizations pass in both languages).
- L0's re-run numbers moved from $470/595/445 (2023/24/25) to $520/637.50/520,
  Cory's 3-yr total from $2,100 to $2,400, mean efficiency from ~89-90% to
  87-88% — an INCREASE in measured leak, i.e. the bug was an undercount, not an
  overcount.
- The lineup-edge backtest itself: the tool's own fallback projection loses to
  actual human play by 11-18 FANTASY POINTS per week (not dollars — the script
  only ever computes points, never calls the money grader) and beats it only
  16-22% of weeks across all three seasons (bye-corrected for 2023/24 via real
  nflverse schedule data, uncorrected for 2025 since nflverse has no 2025 data
  yet).

WHAT IT PROVES:
- The FLEX-classification gap is a real, reproducible defect, not a
  measurement artifact — the same code, unmodified, produces a mathematical
  impossibility (optimal < actual) that only the ground-truth-fallback fix
  resolves.
- The certified L0 figures published in EFFICIENCY-LEAK.md and propagated to
  ~8 other docs were stale/wrong in a specific, quantified, and directionally
  consistent way (understated) for the entire time the file has existed.
- The live in-season lineup tool does NOT currently beat human play using its
  fallback (non-live-Sleeper) projection path — this is a negative finding
  about projection quality on that path, not about the assignment/solver logic
  (which `lineup_skill.test.js`, pre-existing and unmodified, separately proves
  is exhaustively optimal given whatever projections it's handed).

WHAT IT DOES NOT PROVE:
- Whether any OTHER function sharing `inferPositions()`/`infer_positions()`
  (e.g. `positionSigmas()`, `weeklyHighBand()`, or any Python Lab experiment not
  explicitly re-run here) is materially affected beyond what's already checked —
  I re-ran `lab.py`'s full registered-experiment set implicitly via the script,
  but did not individually re-verify every downstream consumer of
  `infer_positions()` beyond `roster_sim.best_lineup_points`/`roster_weekly_scores`
  and the money-grade pipeline.
- Whether the live optimize() recommendation path (as opposed to the backtest's
  replay of bestLineup()) has any separate defect — this claim is scoped to the
  position-inference bug and its effect on hindsight/ceiling measurement, not a
  full audit of the live recommender.
- Whether 2026's projections (draft-time or in-season) are accurate — that is a
  separate, not-yet-completed audit.

UNCERTAINTY:
- The one player (id 7045) still unresolved after the fallback is a known,
  small, unchanged gap — not new uncertainty introduced by this change.
- I did not verify this fix against a THIRD independent data source beyond
  `player_positions.json` and the starters-array heuristic; both derive
  ultimately from the same harvested Sleeper history, so this is not a fully
  independent cross-check of ground truth, only of internal consistency between
  two different derivations already present in the repository.

NEXT STEP: hand this claim, the diff, and the corrected numbers to A for
awareness (already done via ROUTES.md's `## TO: A` section, 2026-08-15 entry) —
no code action is pending on this specific finding. Continuing separately to
the deep audit of 2026 draft/in-season projection accuracy Cory asked for, which
this claim does not cover.

<!-- TERRITORY: A -->
# COMPOSED-TREE COHERENCE REVIEW — 2026-08-15

Mandate (Cory, verbatim): *"I want fable to continue reviewing everything that
could affect our draft or other tools and make sure they're sound."* Scope of
this pass: ~8 agent worktrees merged into
`claude/fantasy-football-research-926y6z` today, each green in isolation. Green
suites do not check that one agent's MEASUREMENTS still hold after another
agent's change — this review re-runs the measurements on the composed tree.

Method: measure, never assert. Every number below is from a command run today
on the composed tree (merge head includes `1612b273`), or a cited committed
artifact. Baselines before any change: `python3 -m pytest draft/tests -q` →
**2274 passed, 5 skipped, exit 0**; `bash scripts/js-sweep.sh` → **267 JS entry
points, all green, exit 0**.

## VERDICT TABLE

| # | interaction | verdict | the number |
|---|---|---|---|
| 1a | REC-1 measured proj_sd × roster-room audit (legality, K/DEF timing, FLEX) | **HOLDS** | composed tree, shipped board: bit-identical to the committed artifact (0/100 rooms differ, timing +2.04, flex 98/100). Simulated post-rebuild board (measured sd applied): legality 100/100 both arms, timing **+2.03** (vs +2.04), flex **98/100**, K r15 95%, DEF r14 96% — every verdict survives |
| 1b | REC-1 proj_sd × bench mix | **HOLDS** | sim bench mix identical under both boards (RB 3.4 / WR 1.9 / QB 0.5 / TE 0.2); the realized-history side (`exp_bench_mix.py`) consumes realized points only — no proj_sd input to go stale (grep-verified) |
| 1c | REC-1 proj_sd × tie rates (TIE_THRESHOLD × score spreads) | **HOLDS** | contested% per pick identical to ±1pt under the measured-sd board (12-pick mean ~32%, pick 33 still 55%). Mechanism verified: `MEASURED_WEIGHTS.ceiling = 0` and survival.js reads no sd-derived field, so sd reaches the list only through the bounded ceiling TIEBREAK — which is exactly where movement shows (ceiling-promotion-in-top-5 at pick 128: 5% → 29%) without moving gap_to_second |
| 2 | pre-draft survival filter arms (`preDraftPool`) | **HOLDS** | only `app.js context()` sets `preDraftPrep` (`pickEvents===0 && cur>1`); `live_context.js` defaults false with the documented simulator rationale; every hand-built-ctx tool checked (`freeze_baseline`, `emit_seat_plan`, the ~30 tool callers) simulates removals first, so board-is-ground-truth → filter-off is the intended arm; `cheatSheet` routes through the app ctx. `predraft_survival_filter.test.js` 12 PASS on the composed tree |
| 3 | KOV_MEASURED_RAMP flag hygiene + decision numbers | **HOLDS** | `kov_measured_ramp.test.js`: **11 checks passed** on the composed tree; flag FALSE; DECISIONS-NEEDED numbers (+7.1 / +1.4 / −1.1 / 0; round-1 keeper −11.7 mean n=28) match `exp_keeper_option.json` q1/q3 cell-for-cell; ramp table 1.0/0.2/0.0/0.0 is the measured shape normalized (1.4/7.1 = 0.197) |
| 4a | opening_script on current board | **HOLDS** | `python3 draft/opening_script.py` regenerates **bit-identical** (no git diff), board fingerprint 317dc3ee3052 |
| 4b | seat_plan staleness (known, routed) | **MOVED-BUT-BENIGN** | regenerated on the 677 board: all 12 **seat assignments identical**, plan players identical, measured edge identical (13.7); only shortlists refresh and tossup flags flip at picks 88/93. Refreshed artifact committed (judgment call, below). Did not get worse; the regeneration-hook fix stays routed |
| 4c | cheat-sheet | **HOLDS** | computed live through `recommend()` per request (engine.js `cheatSheet`) — no committed artifact to go stale; wire numbers in seat plan match `wire_level.json` per_week exactly |
| 5 | grade-cron / claims-cron hand-resolved merge | **HOLDS** | semantics verified, not just green: `partitionLedger` runs FIRST (grade-cron:57) keyed on `method === 'player-week-projection-v1'`, which both the emitter (player-projection-cron:99) and the resolver (claims-cron:273) stamp — no player-week row can reach `gradeForecasts`/`gradeDecisions` or the by_kind/by_week roll-ups; roll-up key spaces are disjoint (forecast kinds derive from method → `weekly_claims`/`analyzer_checkpoint`; decision kinds are the four INSEASON names); no double-resolution (claims-cron: marker doc + first-resolution-wins; analyzer-cron: forecast_key dedupe + season-final gate + method-scoped filter; checkpoint subjects carry `through_week`, never `subject.week`, so they cannot enter claims-cron's prior-week filter; ftype guards back that up); FG import used (grade-cron:17,58-72). Tests on composed tree: claims_cron 14/14, analyzer_cron 23/23, weekly_player_projection 68/68, weekly_grade_readside 9/9. `netlify.toml` ships `wire_level.json` via included_files |
| 6 | NEW: waiver surface tests faked the REAL shipped board in place | **DEFECT-FIXED** | see below — the one thing this review found that could bite |

Engine flag state on the composed tree (measured, not read from docs):
`VONA_SLOT_AWARE false · VONA_WIRE_BENCH false · CEILING_TIEBREAK true ·
TIE_THRESHOLD 2 · KOV_MEASURED_RAMP false ·
MEASURED_WEIGHTS {value 1, tier 0, need 0, risk 0, ceiling 0, keeper 1, bye 0, stack 1}`.
No CFG/scoring/weight default was changed by this review.

## THE ONE NUANCE MONDAY'S REVIEWER MUST KNOW ABOUT REC-1

**"REC-1 went live" is true of the CODE, not yet of the SHIPPED BOARD.** The
last board rebuild (`86e42bc2`, built 17:52Z) predates the REC-1 commit
(`bb1d115a`, 19:47Z): all 677 rows of `public/draft_data.json` still carry the
old position-variance sd (Allen 89.21, Gibbs 117.26) and **no row has
`proj_sd_source`**. The measured table ships on the NEXT `build.py` run — the
REC-1 commit says so itself. This review therefore measured BOTH sides:

- **Shipped board, composed engine**: bit-identical to the committed roster
  audit (0/100 rooms differ). Today's engine merges are genuinely inert where
  the flags say they are.
- **Simulated post-rebuild board** (measured sd applied offline via
  `projection_error.proj_sd_for` exactly as `blend()` will — reproduces the
  claimed Allen 89→110.5, Gibbs 117→169.6; 530 rows move; ceiling/floor/
  variance/weekly_sd rederived): across 100 paired rooms, exactly **one pick in
  one room changes** — seed 64, pick 93, **Stevenson→Pollard, which is one of
  the four bench flips REC-1's decision arm preregistered**
  (PROJ-SD-DECISION-ARM.md). Every aggregate verdict is unchanged.

So the rebuild can land without invalidating the roster audit's evidence, and
the audit's evidence is valid TODAY. Both directions checked; no re-measurement
debt is created by the rebuild.

## THE DEFECT (found, fixed, tested)

`draft/tests/waiver_surface.test.js` and `waiver_stream_surface.test.js` (both
landed today) exercised GET /waivers' artifact read by **rewriting the real
`public/draft_data.json` in place** with a 15-player fixture and restoring it
in a `finally`. Two consequences, one of them measured live during this review:

1. **Concurrent readers see a fake board.** My first 100-room roster-audit run
   executed while `js-sweep` was running those tests, and produced silently
   different results (seed 1's contested pick 93 flipped Dobbins→Purdy,
   cascading through 4 later picks; tie rates moved ±1pt at four picks). A
   plausible-looking, wrong measurement — the exact failure class this repo
   documents. Clean re-run: bit-identical to the committed artifact.
2. **A hard crash between write and restore leaves the fixture as the real
   shipped board** — which the war room, keeper UI, and every board-reading
   tool would then consume, and which an artifact-committing pass could commit.

Fix (minimal, tested): `src/routes/member.js`'s /waivers artifact read now
honors `process.env.DRAFT_DATA_PATH` (production never sets it — same path,
same behavior); both tests write their fixture to a `mkdtemp` scratch file and
set the env var, never touching the real artifact. After the fix:
waiver_surface **22/22**, waiver_stream_surface **15/15**,
`git status public/draft_data.json` clean throughout a full sweep.

Standing caution it leaves behind: do not run measurement tools concurrently
with the suites; any test that mutates a shipped artifact in place is a defect
even when it restores.

## OTHER SWEEP RESULTS (composed diff, origin/main...HEAD, all code files read)

- **Hand-copied WIRE constants** (the {QB 20.9…} class): already closed on this
  branch — `free_picks.js`/`draft_card.js`/`wire_vs_bench.js` now require
  `wire_level.js`'s measured levels; `emit_seat_plan.js` reads `WL.measure()`.
  `wire_level.json` regenerates bit-identical (timestamp-only diff, reverted).
- **`predledger.appendBatch`** (new): validate-before-reserve, counter reserved
  ahead of writes so a crash leaves a harmless seq gap, never a colliding
  counter. Sound.
- **`lineup.js` FLEX-position fallback** (new): now reads
  `player_positions.json`. Interaction with the roster audit's known finding
  (that file is missing the three current keepers) is benign here — the
  fallback only serves ids the starters-heuristic can't resolve, and the
  keepers resolve normally; the writer fix stays routed as the audit filed it.
- **`weights-read.js`** (new): read-only by construction (no store.set),
  key-gated. Sound.
- **`deviation.js` / `keeperui.js` / app.js instrumentation-panel diffs**: read;
  documentation-grade and guarded; the keeperui fixture-refusal fix correctly
  preserves the specific diagnostic. Sound.
- **`preDraftPool` + `wireBenchValue`**: the only engine-surface changes in the
  composed diff; both flag- or ctx-gated, both proven inert-by-default by the
  0/100-rooms-differ result above and their own tests (12 PASS, 9/9).

## JUDGMENT CALLS (documented, reversible)

- **Committed the regenerated `public/seat_plan.json`** (677-player board).
  Same committed emitter, same seats, same edge; only shortlists/tossups
  refresh to match the board Cory actually has. The routed workflow-line fix
  (nothing regenerates this file automatically) is still needed and still
  routed — this is a data refresh, not the fix.
- **Did not** rebuild the draft board (network + owner's pipeline), regenerate
  `room_read.*` or `predicted_keepers.json` (network), or touch
  `draft/audit/loop_review*` (sibling's).

## HONEST LIMITS

- The post-rebuild board here is a SIMULATION of what `blend()` will emit
  (measured-sd cells only; K/DEF and unmeasured bands untouched, kept_players
  ranked in the full pool as blend does). The real rebuild also refreshes ADP/
  projections from the wire; those inputs were frozen in this comparison. The
  claim proven is "the new sd TABLE does not move the audit's verdicts," not
  "tomorrow's board is this board."
- Room-sim caveats are the audit's own: noisy-ADP opponents, one seat, one
  keeper configuration, seeds 1-100.
- Why the earlier contaminated run differed was root-caused to the fixture
  write (the faked file is the only shared input the audit reads); the exact
  test that was mid-flight was not identified — with the fix in, the channel
  no longer exists.

## FINAL SUITES ON THE COMMITTED TREE

Recorded in the commit that carries this review: pytest and js-sweep both
green, run foreground after all changes (see REPORT / commit message for exit
codes).

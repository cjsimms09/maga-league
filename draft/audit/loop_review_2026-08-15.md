<!-- TERRITORY: A -->
# LOOP REVIEW — every loop, closed / actionable / faster — 2026-08-15

Cory's order, verbatim: *"I want fable to review all our loops, makes sure
they're all closed and actionable, and look for ways to make them better and
learn more. Possibly improve quicker without lowering standards."* The
standard applied is Cory's own: **a loop whose grades reach only a human page
is NOT closed** — every arc below is judged against a scheduled mechanism and
a machine consumer, walked in code, run offline where a self-check path
exists. Audited AGAINST the four existing maps (learning_loop_closure,
prediction_loop_closure, league_wide_player_loop, model_learning_audit §2),
not re-derived from scratch.

Mid-review ruling folded in: Cory on the FP-archive source-weight prior,
verbatim — **"Yes! If it works."** It did not work. §3 is the honest negative.

---

## 1. THE VERDICT TABLE

| # | loop | CLOSED? | ACTIONABLE? | acceleration |
|---|---|---|---|---|
| 1 | Draft-time predictions (room_seat/survival/lrm/run/opp + rec/pick/override, deviation capture) | **YES** — client emits (forecast.js, predledger), client resolves at board-final (app.js:8346, forecast.js:122), grade-cron Tue grades, calibration ledger consumed into evidence weights | YES — accuracy page + `cory_beat_model`/override tallies + the weights' graded-n; ⏳ doctrine/doctrine_decline/shadow_pick blocked on outcomes that don't exist yet (loop_closure.js keeps them visible; resolvers still owed before week 1) | **BUILT**: the claimed-but-nonexistent parity test for the server mirror (§4.3) |
| 2 | In-season decisions (lineup/waiver/stream/override) | **YES** — member.js captures w/ deterministic keys → claims-cron Sun resolves (buildDecisionResolutions over real players_points) → grade-cron Tue by_kind/by_week | YES — mean_edge per kind is the keep-trusting-vs-override decision; decisions.scored feeds the evidence-weight n. trade_eval stays uncaptured (product gap, PARKED — correctly not wiring) | none needed; runner self-check PASS today (4 fixture decisions over real 2023 box scores, hand-summed) |
| 3 | League-wide player-week projections (NEW today) | **YES, after this pass** — emit Thu (marker-deduped) → resolve Sun → grade Tue into `player_weeks`… **which had ZERO consumers** (grep: writer only; not even a page). Fixed: weights-read exposes it, runner mirrors it, learning_loop consumes it as REC-2's in-season arm evidence | NOW yes — `better_arm` per position lands in the recommendation artifact weekly from the first graded week | **BUILT ×2**: the consume arc (§4.1) + the Thursday emission self-check (§4.2) |
| 4 | Analyzer checkpoints | **YES** — emit Sun 13:05 (fixed seed, deterministic keys), NEW season-final resolution pass (forecast_key-deduped, own-emissions excluded, per-claim pinned cut), grade-cron Briers into the ledger | YES at season grain (calibration → accuracy + weights). The measured K=4→K≈1–2 crossover is the actionable output — exact diff written for B, §5.1, gated on Jan 2027 skill evidence per the prereg's own decision rule | **PROPOSED** (B's file — not applied) |
| 5 | Projection-calibration (proj_sd) | **YES AND APPLIED** — the one loop that already moved a live parameter under ruling (REC-1: blend() calls proj_sd_for, per-row `proj_sd_source`, decision arm re-verified on the fresh board, guarded both sides) | YES — it acted. Refresh cadence is manual/January (2026 error rows add a 4th season); named, acceptable | none — this is the template the others should converge to |
| 6 | Source-weight learning (REC-2) | **YES as machinery** — prereg fixed 08-15 before any outcome; unlock machine-checked every Tuesday (0/17 today, verified); mirror wired; the January grade is the same pure function the unit test drives | YES in Jan (one reviewed composition change). Until then: NEW in-season arm-evidence stream (§4.1) + the prior attempt's negative recorded in the block | **ATTEMPTED under Cory's conditional ruling — FAILED ITS GATES; honest negative filed (§3)** |
| 7 | Season-long forecast grade + FP benchmark | **YES** — proj_series frozen DAILY by the nightly rebuild (draft-data.yml 08:00 UTC; 13 snapshots, sleeper+fantasypros, verified on disk), graded Jan 2027 by the preregistered path; FP-archive benchmark committed (3/3 years authentic, FP worth 3–9 MAE pts/position over the blend) | YES — the benchmark prices projector-v2's honest headroom (REC-3's bar context) and was the prior attempt's evidence base | consumed by §3; nothing further without leaking |
| 8 | Weekly matchup/weekly-high claims | **YES** — claims-cron emits week N & resolves N−1 in one Sunday run (order proven safe), grade-cron Tue, by_kind on accuracy | YES — the weekly-high claim IS the calibrated baseline any cleverer rule must beat (its stated purpose); grades count into the weights' n | backstop-only dedupe is CORRECT at this batch size — documented as discipline, not fixed (§4.4) |

**Honest negatives carried forward, restated:** trade_eval uncaptured;
doctrine/doctrine_decline/shadow_pick owed resolvers before their outcomes
land; grade-cron's sequential `pred:` read needs batching by midseason
(sibling-flagged, untouched); Sleeper-arm availability untestable until the
first live Thursday; REC-4's live-parameter consumer deliberately unwired
pending a design ruling.

---

## 2. WHAT WAS RUN (measure, never assert)

- `node draft/tools/loop_closure.js` — 27 kinds, **zero open loops closable
  today**; the three ⏳ rows named with resolve-when events.
- `node draft/tools/weekly_grade_runner.js` — **exit 0**: component
  self-check PASS, resolution-pipe self-check PASS (real 2023 box scores,
  independent hand-sums), REC-2 unlock 0/17 named, mirror a named absence
  (SITE_URL is a repo secret, correctly unset here), recommendation artifact
  regenerated — and byte-idempotent (clean `git status` after).
- Baseline suites green before any change: weekly_player_projection (68→74),
  claims_cron, analyzer_cron, loop_closure_live (20), forecast,
  test_learning_loop (10) — then the full suites after all changes (§6).
- Schedules verified in netlify.toml + workflows, not assumed: grade-cron
  `0 12 * * 2`, claims-cron `0 13 * * 0`, player-projection `0 10 * * 4`,
  analyzer `5 13 * * 0`, weekly-grade.yml `30 13 * * 2`, draft-data (the
  proj_series freezer) `0 8 * * *` daily.

---

## 3. THE FP-ARCHIVE PRIOR — Cory said "Yes! If it works." It did not.

Preregistration committed BEFORE construction (`SOURCE-WEIGHT-PRIOR-PREREG.md`,
commit a61a90fd): construction only from committed aggregates (no fetches, no
per-player FP rows exist on disk — the per-player blend validation the ideal
gate wants is impossible offline and the prereg says so), leave-one-year-out
gates with fixed thresholds, shrinkage schedule with a named January handoff,
wiring confined to the recommendation artifact (proj_mean untouched).

**Result (`source_weight_prior.py`, artifact committed):**

- **G1 skill-sign (FP beats every baseline, both h2h years, all positions): PASS 8/8.**
- **G2 bias-sign persistence (LOO, 3 folds): PASS** — QB(+)/WR(−)/TE(−)
  stable in every fold, RB correctly exempt (no claim under 5 pts).
- **G3 error-scale transfer (LOO, ±40% band): FAIL** — 11/12 cells pass;
  RB held-out-2023 misses (fitted 38.36 vs realized 25.92, rel err 0.48).
- Plus a second negative found by the gate tests: **the prereg's own n0 rule
  (t²·mean_n) conflicts with its G5 dominance bar** — at January n a
  maximally-opposed prior deviates ~0.06 > the 0.05 bar. Pinned in
  `test_source_weight_prior.py`, recorded in the artifact.

**The verdict is NO.** The failing cell is in the conservative direction (the
fit OVER-estimates FP's error in the held-out year), and relaxing the band
after seeing that would be exactly the tuning the prereg exists to prevent.
Nothing wired; defaults untouched; the flat start stands until January's
measured cells; the negative is recorded in REC-2's `week1_prior_attempt`
block so the machinery that would have consumed the prior carries the reason
it doesn't. A re-attempt requires a NEW preregistration (wider band or
smaller t) — **that is Cory's call, and this review does not recommend it**:
the year-to-year error-scale drift G3 measured is real, and a prior that
cannot predict next year's error scale within 40% is not an "informed" start,
it is a guess with confidence. En route, the gate tests caught a real bug
(gate4's falsy-zero date-spread trap) — the two-armed-test discipline paying
for itself again.

---

## 4. BUILT (all offline-tested, committed on this branch)

**Ranked by learning-per-week gained:** (1) the player-week consume arc —
~hundreds of residuals/week that previously reached nobody now reach the
recommendation artifact weekly, the largest new evidence flow in the system;
(2) the Thursday emission self-check — no new evidence, but 5 days less
latency on detecting a broken emitter, protecting the flow in (1);
(3) the K diff proposal (§5.1) — zero learning until January, then it converts
an already-measured finding into one reviewed line; (4) the FP prior — would
have ranked first (informed Week 1 instead of flat) and resolved to zero
gain by its own gates: the honest rank of a failed gate is nothing, recorded;
(5) parity pin + dedupe doc — insurance, not evidence flow.

1. **The player-week consume arc** — `weights-read.js` exposes the latest
   calibration snapshot's `player_weeks` block (read-only, pinned),
   `weekly_grade_runner.js` mirrors it into
   `draft/data/evidence_weights_latest.json`, `learning_loop.py` consumes it
   as REC-2's `inseason_arm_evidence` (named absence until the first graded
   week). The newest loop's grades no longer terminate at an unread store
   key. (+2 checks in weekly_grade_readside, artifact keys pinned by
   test_learning_loop.)
2. **The Thursday emission self-check** — `WPP.emissionSanity`: per-position
   emitted mean vs the realized history the same run already fetched;
   `drift` outside [0.6, 1.67]× at n≥10, `thin`/`no_history` named,
   response-only (moves no number, grades nothing). A zeroed board vintage
   or broken feed now flags in Thursday's run log — **5 days before** the
   next Tuesday grade would surface it, with zero new inputs. (+6 checks.)
3. **Draft-night resolution parity** — `draft_resolution_parity.test.js`:
   forecast.js's comment claimed a parallel test that never existed while
   `FG.buildDraftResolutions` sat with zero callers and zero tests. Parity
   holds today (10 checks); now it cannot silently drift.
4. **`LEDGER-DEDUPE-DISCIPLINE.md`** — the four shipped re-run patterns
   named, when each is right (batch size decides), the one no-exemption rule
   (no run settles what it wrote), and the helper unification deferred to
   the next marker user by design.
5. **The prior machinery + its negative** (§3) — builder, 12 two-armed gate
   tests, artifact-equals-regeneration pin, and the shipped verdict pinned
   so a quiet re-run cannot flip it without review.

## 5. PROPOSED (exact designs, deliberately not applied)

1. **K=4 → K≈1–2 in `projectStandings` (B's file).** The analyzer-prior
   backtest measured a good projection prior's shelf life at W1–W2 while K=4
   gives the prior 80% weight at W1 and 50% at W4 — and its preregistered
   decision rule was NOT met, so nothing changes today. The exact diff, for
   the day January's proj_series grading shows real skill (both known
   defects fixed in one guarded block, after `strength` is built in
   `src/routes/standings.js`):

   ```js
   // inside projectStandings, after strength is built:
   const K_PRIOR = 1.5;   // measured crossover: W1–W2 asset, not month-long
   if (opts.projMeans) for (const rid of Object.keys(strength)) {
     const t = strength[rid], pm = Number(opts.projMeans[rid]);
     if (Number.isFinite(pm)) {
       const w = t.gp / (t.gp + K_PRIOR);
       t.mean = w * t.mean + (1 - w) * pm;
     }
   }
   ```

   This also makes the `opts.projMeans` doc-comment true (today it is
   documentation without implementation) and closes the `throughWeek=0`
   full-season leak by giving that path a real prior to use. Routed to B via
   ROUTES.md.
2. **Marker-guard helper** — adopt at the NEXT marker-using cron; churn now
   buys nothing (LEDGER-DEDUPE-DISCIPLINE.md §unification).
3. **Prior re-prereg** — possible, not recommended (§3).

## 6. THE META-LOOP — do the loops see each other?

The joins, named: **one junction store-side** (the calibration snapshot —
forecasts, decisions, and player_weeks all ride `calibration:<season>:<ISO>`),
**one junction repo-side** (`evidence_weights_latest.json` — now carrying
weights AND player_weeks), and **one ruling surface**
(`model_update_recommendations.json`, regenerated by scheduled machinery
every Tuesday, where REC-1's applied state, REC-2's prior negative + unlock +
in-season evidence, REC-3's promotion bar, and REC-4's wiring state all
land). Before this pass the player loop fragmented off that spine (grades
written, nowhere read); that was the one real fragmentation found and it is
fixed. The FP benchmark → prior attempt → REC-2 record is the first case of
one loop's output being consumed as another loop's evidence THROUGH the
spine rather than through a human remembering — the negative outcome doesn't
change that the route now exists.

## 7. SUITE RESULTS (after all changes, before final commit)

- `python3 -m pytest draft/tests -q` — **2286 passed, 5 skipped**, exit 0
  (foreground, direct exit code).
- `bash scripts/js-sweep.sh` — **268 JS entry points, all green**, exit 0
  (foreground, direct exit code).

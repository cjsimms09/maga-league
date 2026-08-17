CLAIM: The prediction loop — captured → resolved → graded → readable →
evaluated-for-edge — is VERIFIABLY CLOSED for every in-season decision kind
except `trade_eval`, whose blocker is explicit, minimal, and guarded by a
test; the draft/forecast kinds were already closed and remain so; and the
loop now RUNS on real schedules (claims-cron Sundays resolves, grade-cron
Tuesdays grades and writes the per-kind/per-week aggregates the accuracy
page reads, weekly-grade.yml Tuesdays refreshes the repo artifact and proves
the shared pipe still computes). Commissioner's requirement, verbatim:
"Complete verification of all predictions, making sure they're graded
properly and evaluated for future edge identification."

WHAT RAN, all of it committed, none of it prose:

1. `node draft/tools/loop_closure.js` — the source-derived scanner: 27
   declared kinds, zero open loops closable today; the three ⏳ rows
   (doctrine, doctrine_decline, shadow_pick) are blocked on outcomes that do
   not exist yet, each with its resolve-when event named in the tool.
2. `node draft/tests/waiver_stream_resolution.test.js` — 34/34. The three
   previously-unresolved kinds' resolvers, proven on REAL history: real 2023
   box scores (league_history.json), a real 2023 acquisition windowed and
   hand-summed independently (via wire_level.js's own acquisitions()/
   weeklyPoints()), and the waiver window re-derived fresh from the real
   764-add transaction log inside the test (median dropped-hold 1 week,
   all-adds censored median 2 → WAIVER_WINDOW_WEEKS = 3, pinned to the
   measurement, src/forecast_grade.js:442).
3. `node draft/tests/loop_closure_live.test.js` — 20/20. The WHOLE loop
   through the REAL surfaces: seven HTTP POSTs to the six live capture
   routes as the commissioner → predledger.readAll → claims-cron's own
   buildDecisionResolutions (netlify/functions/claims-cron.js:144) over real
   2023 per-player points → each resolution appended through the REAL
   predledger guard → grade-cron's own runGrade → buildAccuracyView mapped
   exactly as /lineup/accuracy maps it, with the by-kind table showing
   Start/sit calls / Waiver calls / Streaming calls, scored counts and mean
   edges, and PENDING_KINDS === ['trade_eval'].
4. `node draft/tests/inseason_resolution.test.js` (15/15),
   `inseason_decisions.test.js` (24/24), `inseason_capture_routes.test.js`
   (21 passed), `waiver_stream_surface.test.js` (15 passed),
   `grade_cron.test.js` (17/17), `scope_agreement.test.js` (14 passed, now
   including resolver-branch reachability checks for the shrunk
   PENDING_KINDS), `weekly_claims.test.js` (18 passed).
5. `node draft/tools/weekly_grade_runner.js` — exit 0: component grades
   written (all no_data, every row naming what it awaits — correct in
   August), component self-check PASS, resolution-pipe self-check PASS (4
   fixture decisions over real 2023 box scores, every number matching an
   independent hand-sum, labelled fixture per rule 10d).
6. Full suites: `python3 -m pytest draft/tests/ -q` → 2161 passed, 6
   skipped. `bash scripts/js-sweep.sh` → 262 JS entry points, all green.

WHAT CAME BACK — THE MATRIX. Every ledger kind × the five loop stages.
"n/a" = the kind is an observation/resolution row with no outcome to grade
(classified per-kind in loop_closure.js OUTCOMES, the one place that
judgement lives). Citations are the evidence for the YES, not decoration.

  kind              captured                 resolved                       graded                       readable                     evaluated-for-edge
  ----------------- ------------------------ ------------------------------ ---------------------------- ---------------------------- --------------------------------
  lineup_call       YES member.js:3221       YES forecast_grade.js:450      YES gradeDecisions            YES by_kind → byKindRows     YES by_kind {n,scored,accuracy,
                    (/lineup/log, now with   (lineup branch; run weekly by  (inseason block; loop_        (accuracy.js:49 PENDING_     mean_edge} + by_week; loop_
                    payload.key)             claims-cron.js:258)            closure_live 20/20)           KINDS shrunk)                closure_live "labelled" checks
  waiver_claim      YES member.js:2839       YES forecast_grade.js:450      YES (same)                    YES (same)                   YES (same); rule + limitation on
                    (key + chosen + drop)    (windowed w..w+2, drop-delta                                                              every resolution's `source`
                                             or wire-median baseline)
  stream_call       YES member.js:2925       YES forecast_grade.js:450      YES (same)                    YES (same)                   YES (same)
  inseason_override YES member.js:3283,2951, YES for post-fix entries       YES, with its OWN tallies     YES (decisions card +        PARTIAL BY DESIGN: waiver-side
                    2873 (lineup + stream    (payload.actual captured at    (override_human_won/          captured card)               overrides have no knowable
                    now capture `actual`)    the routes; pre-fix entries    override_tool_won — sign                                   `actual` (honest null,
                                             honestly pending)              convention guarded)                                        member.js:2888)
  trade_eval        NO — no capture surface  n/a until captured (grader     would grade if captured       label declared PENDING       BLOCKED, EXPLICIT, GUARDED:
                    exists anywhere          branch deliberately absent —   (gradeDecisions reads the     (accuracy.js:49)             scope_agreement.test.js asserts
                                             scope_agreement CONTROL)       kind already)                                              both the pending declaration and
                                                                                                                                       the absent resolver branch
  forecast          YES (draft client +      YES buildDraftResolutions      YES gradeForecasts            YES calibration ledger →     YES Brier/reliability/bias +
                    claims-cron emit)        :342 + weekly_claims.js:114    (forward guarantee            /lineup/accuracy             by_kind via deriveByKind
                                             /127 via claims-cron           enforced)
  survival/lrm/run/ YES (war-room client)    YES (client resolvers emit     YES (gradeForecasts/          YES (same surface)           YES (same)
  opp_prediction                             *_resolved rows, app.js:8297-  gradeDecisions; ledger
                                             8430)                          test emitted⊆registered)
  recommendation/   YES (client)             YES (pair join)                YES (override rate,           YES (decisions card)         YES (cory_beat_model /
  pick/override                                                             cory_beat_model)                                           model_beat_cory)
  doctrine,         YES                      ⏳ BLOCKED ON OUTCOME (no      —                            —                            named in loop_closure.js
  doctrine_decline,                          enrolled plan / no weekly                                                                 RESOLVES_WHEN; resolver owed
  shadow_pick                                dollars until week 1)                                                                     before outcomes land
  *_resolved, pick_reconciled, correction, coverage, freeze, mock_platform_sample, weekly_brief — resolution rows / observations / denominators: nothing later makes them right or wrong (loop_closure.js OUTCOMES); weekly_brief additionally has no writer yet, and is a summary of rows graded individually.

DEFECTS FOUND AND FIXED BY THIS PASS (each with the test that would have
caught it, because "remembering" has failed four times in this repo):

  a. NO CAPTURE ROUTE WROTE A JOIN KEY — every real in-season capture was
     permanently unjoinable to any resolution; every fixture had a key, so
     the loop read closed in tests and was open in data. Fixed: deterministic
     keys (member.js:1446) + entry-id fallback on BOTH sides of the join
     (forecast_grade.js:186). Guard: loop_closure_live "EVERY capture now
     carries a deterministic payload.key" + waiver_stream_resolution §6.
  b. THE RESOLUTIONS COULD NOT BE APPENDED — predledger.assertForecast
     refuses a forecast_resolution without `outcome`; the resolver's output
     had none, so every live Sunday write would have thrown. Caught by
     driving the REAL append path; the realized edge now rides as `outcome`.
     Guard: loop_closure_live "survived the REAL append guard".
  c. OVERRIDES WERE STRUCTURALLY UNGRADEABLE — recommended === counterfactual,
     the human's action never captured. Fixed at capture (payload.actual;
     honest null when the page cannot know). Guard: waiver_stream_resolution
     §5 + loop_closure_live honest-null arm.
  d. DOUBLE-TAP DOUBLE-COUNTING — two same-key captures each became a row and
     both joined one resolution. Fixed: earliest-commitment dedupe (same rule
     as pair()), duplicates counted, one resolution per key per pass. Guard:
     loop_closure_live double-tap arm.
  e. DECISION RESOLUTIONS POLLUTED FORECAST DIAGNOSTICS — every graded
     decision would have appeared in orphan_resolution_keys. Fixed by shape
     filter (forecast_grade.js gradeForecasts). Guard: waiver_stream §8.
  f. OVERRIDE WINS CREDITED TO THE WRONG SIDE — an override's chosen side is
     the HUMAN; counting its win into tool_won inverts the meaning. Fixed:
     split tallies. Guard: waiver_stream §5(d) + loop_closure_live.

WHAT IT PROVES: every gradeable prediction kind that is captured either
closes the full loop against real data through the real code paths (capture
kinds over real HTTP, resolution through the real append guard, grading by
the real cron cores, reading through the real view builder), or carries a
named, tested, minimal blocker (trade_eval: no capture surface — a product
decision, not wiring; waiver-side overrides' `actual`: unknowable by the
page, recorded as unknown). The weekly machinery exists on real schedules
and its preseason state is distinguishable from a broken state (both
self-checks, labelled as fixtures).

WHAT IT DOES NOT PROVE:
  - That any 2026 decision has actually been graded — the season has not
    started; every live count is 0 by construction. The first real execution
    is not the first execution (the runner and both cron cores execute today
    against history), but Sleeper's live players_points feed itself is only
    shape-proven (mergePlayersPoints vs the archived field), not
    live-exercised — no live week exists to exercise it.
  - That the waiver rule measures the value of holding priority. It measures
    "did this claim beat its real roster delta (or the median wire add) over
    the league's median hold window" — priority position, FAAB-style pricing
    and the option value of waiting are unmodelled, and every wire-based
    resolution says so in its `source`.
  - That `actual` at override time equals the lineup finally played — a
    post-tap Sleeper edit is invisible; the graded record is the
    decision-time one, which is the ledger's stated contract.
  - K/DEF waiver claims without a captured drop: no wire sample exists
    (nflverse is offence-only) — honestly pending, never defaulted.
  - doctrine / doctrine_decline / shadow_pick remain blocked on outcomes
    that do not exist (no enrolled plan; no weekly dollars until week 1) —
    resolvers for these are still owed before those outcomes land, and
    loop_closure.js keeps them visible as ⏳ rows.

NEXT STEP: nothing in this pass needs a ruling — no scoring/weight default
moved. On B's return: review the member.js/views crossings (TERRITORY.md
Override #5, appended entry). If trade capture is ever wanted, the grader
and read side are already waiting; the open question is product (whose
trades, priced how — PARKED.md), not plumbing.

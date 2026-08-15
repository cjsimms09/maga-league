CLAIM: the relay branch (`claude/fantasy-football-research-926y6z`) is, as of
this commit, in the state A needs on Monday: every mechanical claim verifies by
one command (`bash scripts/verify-relay-session.sh`, 7/7 PASS at time of
writing), both nightly-rebuild blockers are fixed AND cherry-picked to main
with the rebuild re-fired, the prediction loop is closed end-to-end for
lineup_call/waiver_claim/stream_call/inseason_override (trade_eval alone
pending, with the reason documented), and the self-directed edge program has
two preregistered verdicts filed. No draft-scoring or weight default moved;
the two ship/no-ship judgment calls remain deliberately undecided for Cory.

This claim is the WHOLE-BRANCH pre-audit for A. Per-piece claims and audits
with their own evidence chains:
  - draft/audit/vona_slot_aware_isolation_2026-08-15.md
  - draft/audit/bench_wire_comparison_claim_2026-08-15.md (+ reaudit file)
  - draft/audit/scoring_gap_correction_backtest_2026-08-15.md
  - draft/audit/lineup_edge_bug_claim_2026-08-15.md
  - draft/audit/prediction_loop_closure_2026-08-15.md
  - draft/audit/self_directed_edge_program_2026-08-15.md

WHAT RAN (the pieces landed since the last independent review):

1. THE MARKET-SPARE BOUND + THE 11-GHOST PRUNE. The first in-CI diagnosis of
   a refused candidate board (run 31897110098, via
   draft/tools/diagnose_refused_board.py running in the workflow's failure
   path) named the defect: dormant()'s market exemption treated ANY adp
   number as a vouch, so FantasyPros deep-table ghost rows (Gronkowski at
   adp 298.0, proj_mean 0.0) were spared forever. Fix:
   board_activity.market_vouches() — known adp > MARKET_SPARE_DEPTH
   (DEPTH*1.5 = 225) does not vouch; priced-with-no-adp stays fail-safe
   spared — called by BOTH dormant()'s spare and the pruning audit's clause,
   one definition. The rule convicted 11 ghost rows on the committed board
   (all adp 275-299, proj_mean 0.0, no scored week 2024-25); pruned with the
   build's own step, 686 -> 675. All 13 board_activity mutations re-run for
   real through mutation_gate (KILLED; manifest re-recorded by record(),
   never hand-edited). New regression:
   test_a_DEEP_TABLE_GHOST_PRICE_does_not_vouch.

2. THE REPLACEMENT-STEP RE-DERIVATION. The characterisation test pinned the
   flex flip at exactly +2% — the committed board's knife edge. The fresh
   board's +2% "move" was +3.78 = 189.02 * 0.02, pure smooth scaling, no
   flip. Re-derived per the test file's own docstring: scan +0.5%..+10%,
   assert existence, direction (RB gains the slot, level steps DOWN), and
   discontinuity (> 5 pts across one 0.5% increment). On the committed board
   the scan finds the same step (+2.0%, RB21 -> RB22, -18.64).

3. BOTH cherry-picked to main (5b14778c, 1f44a543) after full suites on main
   itself (2137 passed / 6 skipped; 248 JS entry points green);
   draft-data.yml re-fired (run 31899419770, in progress at time of writing).

4. THE LOOP-CLOSURE PASS (isolated worktree, merged after suites): resolvers
   for waiver_claim (window = league's own measured median hold; baseline =
   captured dropped player or measured wire median; priority cost stated
   unmodelled) and stream_call (chosen vs held, one real week); the capture
   routes wrote NO payload.key — every real capture was unjoinable while
   every fixture had a key — deterministic keys + entry-id fallback added on
   both join sides; overrides now record payload.actual (honest-null where
   the page cannot know); claims-cron resolves weekly, grade-cron writes
   by_kind/by_week; PENDING_KINDS is down to ['trade_eval'].
   Proof: waiver_stream_resolution.test.js (34), loop_closure_live.test.js
   (20, real HTTP -> real append guard -> cron cores -> accuracy view).

5. THE EDGE PROGRAM (isolated worktree, merged after suites): preregistered
   BEFORE results (EXP-WEEKLY-ENV-PREREG.md, commit 5e89a131). Verdict 1:
   pace-of-play arms are NULL against 200 within-week permutation nulls on
   2023+2024 (real pbp, this league's scoring, ~2.2k eval player-weeks per
   season). Verdict 2: prior-environment proxies are HARMFUL; the
   perfect-foresight game-totals ceiling is +0.23 MAE, tail-shaped. Plus a
   ranked six-entry preregistered agenda.

6. BOOKKEEPING THAT KEEPS THE GATE HONEST: TERRITORY.md Override #5
   appendices document every cross-lane file with Cory's verbatim
   authorisations; verify-relay-session.sh pins the territory refusal to
   EXACTLY the current 11 files (a twelfth appearing later fails the
   script); ROUTES.md routes all of the above TO:A with routes_integrity
   green.

WHAT CAME BACK: verify-relay-session.sh 7/7 PASS on the branch (Python 2176
passed / 6 skipped; 262 JS entry points; wire/sim/opening-script artifacts
match their generators; no engine CFG default moved vs origin/main; refusal
set == documented set). Main: 2137/248 green with the cherry-picks.

WHAT IT PROVES: the branch is mechanically verifiable in one command; the
rebuild blockers are fixed at root with the defect named from CI's own
diagnosis rather than guessed; the loop's capture->resolve->grade->read chain
executes on real data end-to-end; the edge program's verdicts are leak-free
by construction (preregistered, permutation-nulled, strictly-prior features).

WHAT IT DOES NOT PROVE:
  - That run 31899419770 publishes green — in progress at time of writing;
    the acceptance gate decides, not this claim.
  - That VONA_WIRE_BENCH or the scoring-gap correction should ship — both
    remain gated on Cory, evidence complete, defaults unchanged.
  - That the waiver_claim resolver's unmodelled priority cost is negligible —
    it is stated on every resolution, not estimated.
  - That build.py embeds wire_level onto the board (documented follow-up;
    the engine reads ctx.wireWeekly which app.js/live_context.js supply from
    state.data, but the build does not yet write wire_level into the
    artifact).

UNCERTAINTY: the exact flip location on future fresh boards (the scan handles
±, but a board where NO scale ≤ +10% flips would fail the existence arm by
design — that is an alarm, not a flake); h2h_agreement.test.js has a known
live-network flake unrelated to this branch.

NEXT STEP: A runs `bash scripts/verify-relay-session.sh`, reads the two
judgment-call files, and merges via the documented Override #5 bypass — or
refuses with the specific claim that failed.

REVISION HISTORY

[2026-08-15, review run 31899571772, gpt-5, against commit 5b2faceb]
VERDICT: **ACCEPT_WITH_REQUIREMENT**. 7 PROVEN, 4 SUPPORTED, 4 NOT_PROVEN,
**0 CONTRADICTED**. Verbatim close: "Most of the branch's substance is
present and well-scoped... However, the headline 'one-command verifier 7/7
PASS' is unevidenced here and the JS suite has one red test in this
environment, so accepting the change with a requirement to either show the
verifier run passing (and reconcile the red test) or narrow the claim is
the honest middle stance." Three required actions, each answered with
evidence, not prose:

1. "Provide a captured run of verify-relay-session.sh at this HEAD."
   Captured at commit `5b714a2d` (post-fixes): exit 0, all seven lines PASS
   — Python suite (2196 passed / 5 skipped), JS sweep (263 entry points all
   green), wire_level generator match, canonical sim artifact, fresh
   opening-script fingerprint against the published 2026-08-15 board, no
   engine CFG default moved vs origin/main, and the territory refusal
   matching Override #5's now-10-file set exactly.

2. "Resolve or explicitly quarantine the failing JS test
   (h2h_agreement.test.js)." RESOLVED at the mechanism, not quarantined
   (commit `988bc1b4`): the no-bundle arm deletes sleeper-cache and hits
   /matchup, whose bundle() then attempts a LIVE Sleeper fetch — so the
   test passed only where api.sleeper.app was unreachable and flaked on
   runners with egress (exactly the reviewer's environment). SLEEPER_BASE
   is now pinned to the discard port before any require, making the arm's
   premise enforced rather than hoped. 9/9 across three consecutive runs;
   crossing documented in Override #5 (B-lane file, no assertion changed).

3. "Add links or IDs for the cherry-picks to main and the re-fired
   rebuild." Main commits `5b14778c` (market-spare bound + 11-ghost prune)
   and `1f44a543` (replacement-step re-derivation); rebuild run
   **31899419770** completed SUCCESS, publishing board commit `86e42bc2`
   (677 players, proj_ownmodel on 364 rows, built 2026-08-15T17:52:22Z);
   tracking issue **#3** auto-closed by that run at 17:55:07Z
   (state_reason: completed, closed_by github-actions). The published
   board re-verified with board_activity's own predicate: dormant() n=0,
   projection health 99.4%.

Also noted from the review's non-blocking findings: the
scoring-gap-correction confound (2026 ADP on 2023-25 drafts) stays scoped
to paired comparisons exactly as the reviewer prescribes — that scoping is
already stated in the report and repeated here so external claims never
quote the absolute MAE outside it. Events postdating the reviewed commit
(deploy-policy settlement, inbox tooling, the pre-draft survival filter)
are NOT covered by this verdict; per REVIEW-POLICY.md they fold into the
next scheduled pre-handoff moment rather than a re-fire.

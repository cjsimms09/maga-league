# TODO — the real count, in plain English (regenerated 2026-08-15, mid-week; refreshed
# again later the same day — see "LATER THE SAME DAY" below the fold, read that first)

_Regenerated from STATUS.md, PARKED.md, DECISIONS-NEEDED.md and this week's findings —
not from memory. Draft is **Aug 22** (7 days out). **A and B are both unreachable until
Monday** (weekly session limit) — everything below this line that isn't marked ✅ was
done by the research-relay session on `claude/fantasy-football-research-926y6z`.
Session B keeps the site/in-season half of this list separately._

**UPDATED policy, same day, Cory's call:** the relay session pushes anything with a
passing test straight to `main` — no pre-approval, no per-item check-in, EXCEPT
draft-scoring/weight changes (still held for a ruling). **⚠ CORRECTED, later the same
day: every commit now carries `[skip deploy]`, no exceptions — "no reason to deploy
til everything is done, I will tell you when to deploy" (Cory).** The earlier version
of this note said pushing to `main` never deploys on its own — THAT WAS WRONG, see the
🚨 entry immediately below. Batching is now enforced by the commit message, not by an
assumption about the gate.

**🚨 READ THIS BEFORE TOUCHING A SERVED FILE (`public/`, `views/`, `src/`,
`server-app.js`, `package*.json`, `netlify.toml`, `netlify/functions/`):** the deploy
gate (`netlify-ignore.sh`) flipped to **opt-out on 2026-08-09** — it builds BY DEFAULT
on any served-path change now, `[skip deploy]` is the ONLY suppressor. `DEPLOY-POLICY.md`
still describes the OLD opt-in gate and is one day older than the flip; it has a
correction banner now but still needs a real rewrite. **This was not caught in time** —
two real, unintended deploys already fired today before the mistake was found (confirmed
directly from `deploy-verify.yml`'s own logs, not inferred). Standing rule now: `[skip
deploy]` on every commit, verified working (checked the actual gate output after adding
it, three separate times, all skipped correctly) — nothing deploys again until Cory says
go. The build-minute budget question (below) is still separately unresolved.

## LATER THE SAME DAY, 2026-08-15 — read this section first, everything below it is the morning/midday pass

Cory pushed hard on "actually fix things, in a way A will approve and push" and "we'll
deploy everything together in large sums." Real builds, all tested, all `[skip deploy]`,
all on `main` right now — check `git log`, don't re-derive from this prose.

**🔴 A REAL BUG, NOT A JUDGMENT CALL, FOUND AND FIXED: every in-season capture form
was silently corrupting its own payload.** `views/lineup.ejs` and `views/waivers.ejs`
built their hidden JSON fields as `JSON.stringify(...).replace(/"/g, '&quot;')` INSIDE
an EJS `<%= %>` tag — which already HTML-escapes by default. The manual replace ran a
SECOND time on top of that, so the real page contained `&amp;#34;` instead of `&#34;`.
A browser decodes HTML entities in one non-recursive pass, so the value it actually
SUBMITS still has the literal text `&#34;` where a quote belongs — not valid JSON.
`safeJson()` on the server silently falls back to storing the mangled raw string.
**This predates today** — it hit `/lineup/log`/`/lineup/override` (built earlier)
exactly as much as the `/waivers` and `/stream` forms built today, and
`override_capture.test.js` never caught it because it posts a hand-built body and
renders the form separately, never combining the two. Found only because a NEW
end-to-end test (render real HTML -> extract the real `value=` text -> POST exactly
that -> read the ledger back) was built for the stream forms and failed. Fixed in
7 places across 4 views; two new tests
(`draft/tests/waiver_stream_surface.test.js`, `draft/tests/lineup_capture_escaping.test.js`)
prove it round-trips correctly now, including with a player name carrying both an
apostrophe and a literal double quote. Full JS + robot-mock + Python suites green after.

**Follow-up, same finding: is any REAL captured data corrupted?** This sandbox has no
access to the live site's Netlify Blobs store, so it can't check production directly.
`draft/tools/ledger_corruption_check.js` is the one-command answer for whoever does:
log in as commissioner, visit the already-shipped `/admin/api/ledger/predict?season=
2026`, save the response, run the tool against it. It flags any entry whose
recommended/counterfactual/chosen/drop is a raw string instead of parsed JSON (the
exact signature the bug leaves) — deliberately NOT flagging `waiver_claim`'s
`counterfactual`, which is a hardcoded `'hold priority'` string by design, not a bug.
8/8 tests pass, including that exact false-positive trap. **Someone with real access
needs to actually run this** — not done here, can't be from this sandbox.

**The single biggest finding of the day about the MODEL (as opposed to the bug above):
our core projection formula was already
audited and found to LOSE, and nobody was ever told.** Experiment 33 (`EXP33.md`,
reported 2026-08-09, six days before this was surfaced) — our blend loses to a naive
prior-year+opportunity model on every metric, both tested seasons: top-decile hit rate
0.41 vs 0.57-0.59 (the metric the experiment itself named as the one that matters),
worse MAE, worse rank correlation, and $200 vs naive's $100 vs raw FFC ADP's **$1,200**
through the money grader. `deviation.js` already had a complete, honest, carefully-
reconciled banner mechanism for exactly this (`projectionProvenance()`) — built,
correct, exported, **never called from anywhere**. Now wired into the board checklist.
See PARKED.md's "THE CORE PROJECTION FORMULA WAS ALREADY AUDITED" entry for the full
numbers. **Read as: lean on tier structure and scarcity, not on the point projection
itself — the model's own honest self-assessment, now actually visible.**

**Own-model projections are now live on the board, additively.** `draft/own_projections.py`
(extracted, shared, no more two-places-disease) attaches `proj_ownmodel` in `build.py`
the same way FantasyPros was added; `consensus.js` folds it into the displayed
consensus number automatically. Does NOT touch `proj_mean`/VORP/ranking — no clean
grade exists to justify a swap, and exp 33 (above) argues AGAINST swapping our
existing blend in as authoritative for anything, which is exactly why this stayed
additive. Full build.py run couldn't be verified end-to-end from this sandbox (Sleeper
blocked); the new attach block WAS verified against the real live board+config
directly, and the full test suite passed. Check the next real nightly build's log for
"own model 3rd source on N players".

**Draft-night pick capture — closed a real, dangerous gap.** `log_draft_picks.py`'s
`--sync` mode was fully built and rehearsed against a real 150-pick draft and NOTHING
ever called it during a live draft — grepped every workflow and doc, zero automation,
zero manual step. `.github/workflows/draft-night-sync.yml` now exists:
workflow_dispatch-triggered (start it by hand when the draft opens, paste the Sleeper
draft_id), polls every 20s, commits only on real change, stops when every pick is
logged. **Someone needs to actually trigger this when the draft opens Aug 22** — it is
not automatic, by design (a snake draft's start time isn't predictable).

**In-season prediction capture — genuinely confusing, resolved.** First pass (via
`loop_closure.js`) reported 5 kinds uncaptured (lineup_call, waiver_claim, stream_call,
trade_eval, inseason_override). **That tool had two real bugs** (no directory
recursion into `src/routes/`; blind to the server-side `predledger.append(store,
{kind:...})` capture shape) — both fixed. Re-run: `lineup_call` and `inseason_override`
were ALREADY captured (`src/routes/member.js`, `/lineup/log` + `/lineup/override`,
predate this session). Built client-side helpers for all 5 before discovering this,
then **reverted them** — wrong pattern, would never have been called. `waiver_claim`
was genuinely missing; built to match the proven `/lineup/log` pattern exactly
(`/waivers/log`, `/waivers/override` in `member.js` + `views/waivers.ejs`).
**Still genuinely open: `stream_call`, `trade_eval`** — no existing page to attach
either to, so this is small feature-design work, not a wiring gap.

**Weekly in-season projection snapshot — verified live, not just read.** `weekly-proj-
snapshot.yml` existed, had never fired (added the day before its first scheduled
Sunday). Triggered it manually to check: ran clean end-to-end in real CI, correctly
detected preseason and did nothing rather than writing a mislabelled snapshot. Real
verification of "will this work when the season starts," not an assumption.

**Two real bugs in test/tooling infrastructure, fixed while doing the above:**
`loop_closure.js` (directory recursion + capture-shape detection, above) and
`draft/tests/authority.test.js` (a structural check used a raw string-match that
returned the wrong shape, silently breaking its own exemption mechanism — the SAME
class of bug the two-line-up fix repaired, in a governance-sensitive file).

**Scoring-logic prototypes tested but NOT shipped, awaiting Cory's explicit ruling
(not swept into "fix everything" — these are judgment calls, not bugs):**
- `ONESIE_MAX_SPARE.TE: 1→0` — tested, looked clean on a 12-pick simulator, then
  found to conflict with 3 years of real draft history (TE2 happens 47% of the time)
  — WALKED BACK, see PARKED.md's correction.
- `CFG.ONESIE_ENDGAME_PICKS: 2→~4-5` — the better-evidenced replacement, matches
  when real duplicate QB/TE picks actually land (89-94% coverage vs ~44-50% today).
  Not shipped.
- A wire-compared bench-branch formula for `vona()` — prototyped in a scratch copy of
  `engine.js`, fixes the RB-wipeout bug when `VONA_SLOT_AWARE=true`, but has an
  unexplained gap (100% of sim rooms take a 2nd QB vs 57% in real history) that
  wasn't resolved before time ran out on it. Full write-up and numbers in PARKED.md.
- Random Forest / XGBoost for the core model — real precedent exists (`mattgilgo/
  fantasy_football`, `RESOURCES.md`), genuinely plausible, explicitly NOT for this
  draft (7 days, thin data, leak-free discipline gets harder) — flagged for the
  post-draft learning engine.

**A systematic sweep for other "built, exported, never called" gaps (the pattern
behind exp 33's banner and three earlier findings today) found one more, then went
clean.** Checked every `public/js/draft/*.js` module's exported API against the rest
of the codebase — the only unreferenced exports left are `PredLedger.pending/flush/
lastError`, already explicitly flagged in-code as "routed to B" for a status-UI
surface that doesn't exist yet, not a new discovery. **Separately found the SAME
class of bug right next to the exp33 fix**: the "In-season instrumentation live"
checklist item (`app.js` ~line 3289) read `window.INSEASON_LEDGER_LIVE`, which
nothing in the codebase ever set — it permanently reported "NOT LIVE" regardless of
what was actually captured. Fixed to report the real state (lineup/waiver/override
are logging; stream/trade aren't). **Also checked whether the other "spec, not run
yet" Lab experiments (34/35/36) had the same dormant-result problem as exp 33** —
they don't. All three have real result files, and unlike exp 33, all three are
already correctly wired: exp34's verdict is the same one already in `deviation.js`'s
`EVIDENCE_STATE`, exp35's finding is already accurately summarized in
`DECISIONS-NEEDED.md` #2, and exp36 is wired into `deviation.js`'s `MARKET_EFFICIENCY`
constants with its own CI regression test (`test_cited_constants.py`) guarding
against drift. Exp 33's dormant banner was the genuine exception, not a symptom of a
wider backlog — useful to have checked rather than assumed.

**Checked whether `stream_call`/`trade_eval` had a shortcut before writing them off
as a bigger build — they don't.** No K/DEF-specific logic exists anywhere to attach
a stream capture to (the whole waiver tool is built around priority-spending, a
different decision shape from a free matchup-based stream); no trade-evaluation
logic exists at all beyond one passing mention of the word "trade" in `analyzer.ejs`.

**`stream_call` — built, same day, after the plan above.** `POST /stream/log` +
`/stream/override`, mirroring the proven `waiver_claim` pattern with one real
difference: the counterfactual is a specific alternative (the K/DEF already
rostered) rather than a fixed phrase, because this page actually has one. No new
scoring logic — reuses the same tested `evaluateClaims` ranking, filtered to K/DEF,
honestly labelled on the page as season-value rather than matchup-tuned. Real-data
render tests (with and without a current K/DEF rostered), not just an EJS compile
check. Full suite green after.

**`trade_eval` remains genuinely unbuilt** — needs a real product decision first
(whose trades get evaluated, priced how), no evaluator exists to attach a capture
to. Belongs with the post-draft work, plan is in `PARKED.md`.

**The 4 new capture routes only had hand verification — same gap as `attach_own_model`
had, closed the same way.** `/waivers/log`, `/waivers/override`, `/stream/log`,
`/stream/override` were checked by syntax, an EJS render test, and the full suite
passing — never by actually POSTing to them and reading the ledger back.
`draft/tests/inseason_capture_routes.test.js` now does exactly that: boots the real
app, logs in as commissioner, hits all four, reads `predledger.readAll()` and checks
kind/method/payload on each (21 checks, all pass). Also fixed a stale line in
`app.js`'s "In-season instrumentation live" checklist — it still said `stream_call`
was NOT YET captured after `stream_call` had already been built earlier the same day;
now reads `lineup_call, waiver_claim, stream_call, inseason_override — logging` with
only `trade_eval` flagged open. Full JS + Python suites green after (2135 passed / 6
skipped, 0 failed).

**`consensus.js` (contract C3) had zero dedicated test file — found while looking for
more of the same class of gap.** It's the ONE shared projection-consensus derivation
Cory asked for so the draft board / waivers / lineup tools can never label or value
the same player differently. Only indirect coverage existed (`waivers.test.js`
exercises it through `src/routes/waivers.js`'s delegation); nothing tested
`proj_ownmodel` (today's third source) or `higherProjectionAlt()` at all.
`draft/tests/consensus.test.js` now hits the module directly — 23 checks, all pass
first run: 1/2/3-source averaging + honest labelling, the `proj_mean`+provenance
fallback, `cleanSource`, and `higherProjectionAlt`'s same-position-only /
self-exclusion / `withinTop`-window behavior.

**Checked the rest of `public/js/draft/*.js` for the same "zero test hits" pattern —
found two more, `config-screen.js` and `keeperui.js`.** First conclusion (below, then
corrected same day): both are DOM-only IIFEs with no `module.exports`, so closing this
looked like it needed a new jsdom-style test harness — not worth adding seven days
before the draft without checking first. **That was wrong, and cheap to find out:**
`draft/tests/rehearsal-mock3.js` already established Playwright + the pre-installed
Chromium as a working pattern in this exact project. `draft/tests/rehearsal-keepers.js`
now pins `keeperui.js`'s `guardFixture()` — the function that refuses to open the
keeper editor against synthetic/offline data — using that same pattern, self-contained.
6/6 checks pass, and building it found a real SECOND bug: `boot()`'s catch handler was
unconditionally clobbering `guardFixture()`'s specific refusal message with a generic
one the instant after it was written. Fixed in the same commit. `config-screen.js`
remains genuinely uncovered (smaller, lower-stakes, same fix available whenever it's
worth the time). Full story, including the correction, in `PARKED.md`'s
"`config-screen.js` / `keeperui.js` HAVE ZERO TEST COVERAGE" entry.

---

## THE FULL SWEEP, 2026-08-15 — every claimed-open item checked against real code

Cory asked for a systematic pass rather than reacting to items one at a time. This is
that pass, in one place, so "is X actually still open" never needs re-deriving:

**Confirmed ALREADY DONE, docs were stale (fixed in DECISIONS-NEEDED.md, no code
changed by finding this):**
- F4-excluded-league replay — ruled 2026-08-11, implemented, verified.
- Sunday alert cron timing — shipped, tested (`sunday_cron.test.js`).
- Stack weight (~0.5 vs 1.0) — resolved by D10, 2026-08-13, code was already right.
- Ceiling weight (0 vs 0.65) — deliberately settled at 0 twice (2026-08-10, 2026-08-14),
  not a gap.
- needrule-vs-composite reconciliation — already built (A10 "Two reads" guard).
- Position-normalized ceiling (units defect) — already shipped, 2026-08-13.
- Rule 10d self-referential-fixture clause — authorized 2026-08-11, already in
  `SESSION-A.md`. Its own follow-on extension (10d covers any measuring instrument,
  not just fixtures) is flagged for authorization there and is NOT yet in this file —
  a gap in the other direction, worth Cory's eyes.
- RB=0.9-per-draft and TE=3.6-per-draft — roster shape has reversed (see #0000/#00000
  for the numbers), **but the cause is genuinely unclear — see the correction inside
  those entries**, don't take the first pass at "why" as settled.
- Projection-source snapshot capture (#6, part a) — already running, 6 days of both
  sources in `proj_series.json`.

**Confirmed GENUINELY STILL OPEN (checked against code, not assumed):**
- D14 (Stage-2 as a real market anchor) — `CFG.STAGE2_CAP` is explicitly OFF by
  default in `engine.js`. Not built. Recommendation (hold) still stands.
- The offline survival-calibration grader (#5, mock-draft evidence) — no such tool
  found anywhere in `draft/`. Not built.
- The Lab experiment queue (exp41, third-arm dollars, exp35 dollar-grade) — all blocked
  on the same `sleeper_import.fetch_players()` 403, confirmed by direct execution, not
  assumption.
- DEF projection gap, WR/TE source disagreement, REGRESSION_WEIGHT dollar-arm — same
  network wall, ready-to-run commands left in `DECISIONS-NEEDED.md`.
- RB-concentration risk (single-team injury exposure) — smaller now that RB depth
  improved, not measured as zero.

**Actually built and shipped to `main` today (not just documented):**
- Seat-plan CSS ordering fix — recommendation was buried below the fold on phone;
  now visible immediately. Tested, screenshotted before/after.
- Doctrine-governance duplicate-pill fix — redundant clipped text removed. Tested.
- `draft/tools/decisions_drift_check.js` — new mechanical checker for exactly this
  class of staleness going forward.

**Before trusting anything in `DECISIONS-NEEDED.md`'s OPEN section:** run `node
draft/tools/decisions_drift_check.js`. Four "open" items today turned out already
resolved in code (F4, the Sunday alert cron, and two weight values in #3) —
three of those four were a literal quoted value that had drifted from the code, which
is now mechanically checked. It's advisory only (one confirmed false positive already,
matching the English word "value" in an unrelated sentence) — a clean run doesn't mean
an entry is current, but a flagged one is worth checking before acting on it.

---

## ALREADY SETTLED — DO NOT RE-DERIVE THESE

Found this week, each after real time spent re-discovering something already true in
the code. Listed here specifically so nobody (A, B, C, or a future me) burns another
hour on them:

- **The composite-vs-needrule disagreement is already reconciled.** `needrule.js` +
  the "Two reads" guard in `app.js` (~line 4169, spec A10, 2026-08-10) already handle
  it — deliberate, measured, working. `coherence.js` is a *different*, still-unwired
  feature (dead-zone/market-reliability/plan-adherence resolution for one candidate),
  not the fix for this.
- **The position-normalized ceiling fix (upsideBonus units defect) already shipped**
  — 2026-08-13, `computeCeilingScales` in `engine.js`. Don't re-propose the
  `group_by(pos)`-style normalization; it's built.
- **The F4-excluded-league replay question is CLOSED, not open.** Ruled 2026-08-11
  ("✅ RULED — F4 GATES OUTCOME-DEPENDENT GRADING ONLY"), implemented, verified
  end-to-end. A near-identical heading below it, marked SUPERSEDED, is kept only as
  an unedited historical record per this file's own audit discipline — reading only
  that section (a partial/tail read) makes it look open. It isn't. Mistakenly
  re-surfaced as a live decision on 2026-08-15; corrected same day.
- **Mid-draft need-blindness is a real, still-open gap** (not new) — already measured
  and dated 2026-08-14 in `engine.js` (~line 427, `composite_roster_blindness.test.js`).
  See the two 2026-08-15 PARKED.md entries on this for the full trail, including a
  correction — read those first, they already record two false starts on this exact
  question.

## THIS WEEK, in dependency order (no calendar gates — sequenced by risk and what unblocks what)

### 0. Zero-code — needs only Cory's ruling, unblocks everything else
- ✅ **GO for mock #4 — Cory ruled YES (2026-08-15).** Accounting green + deployed.
  Actually running it is a live event (needs real participants) — schedule with
  A/B, not something a session executes alone.
- ◻ **D14:** build the real Stage-2 anchor, or hold? Recommendation: hold, because
  wiring it now would suppress the exact deviations exp 33/34 need to measure
  cleanly. Still open as of 2026-08-15.
- ◻ **REGRESSION_WEIGHT install (0.35→0.1 or 0.0)?** Accuracy + overfitting gates
  cleared; dollar-arm sizing is the one remaining gate — in progress below.
- ✅ **F4-excluded league replay** — was ALREADY RULED 2026-08-11, before this week
  started (`DECISIONS-NEEDED.md`, "✅ RULED — F4 GATES OUTCOME-DEPENDENT GRADING
  ONLY"), fully implemented and verified. Mistakenly re-surfaced as open on
  2026-08-15 from a partial read of the file — corrected same day. Nothing to do.
- ◻ **Deploy policy after Aug 22** — low urgency, not blocking anything now.

### 1. Safe to build now — confirmed no network needed before starting (learned the hard way: check this first)
- ◻ TE-at-3.6-picks term-isolation diagnostic (board data only) — next up.
- ◻ What-would-have-worked audit vs the 3 historical drafts (uses `league_history.json`, local).
- ◻ Exp41 paired-room race — combiner core already built + tested; needs checking whether its
  race arm hits Sleeper before assuming it's clear.
- ◻ Third arm: composite vs ADP in dollars (JS replay) — needs checking whether it's local-data
  only or needs live rosters, before starting.
- ◻ Dollar-grade the exp35 sweep — same underlying grader as REGRESSION_WEIGHT below, so
  almost certainly blocked the same way; verify before spending time on it.

### 2. Blocked on live network access (Sleeper/FantasyPros egress, this sandbox can't reach either) — guidance written, needs A or any session with egress
- ◻ **DEF projections missing `def_fum_td` AND `def_kr_td`** (bigger than originally
  scoped — see `DECISIONS-NEEDED.md` #0, 2026-08-15 addendum, for the exact next step:
  pull raw rows for all 32 DEFs in one pass, not one alias at a time).
- ◻ **WR/TE projection-source ~20% disagreement** — see `DECISIONS-NEEDED.md` #000,
  2026-08-15 addendum, for a concrete first hypothesis (PPR-assumption confound in
  FP's raw data) before assuming it needs deeper novel diagnosis.
- ◻ **REGRESSION_WEIGHT dollar-arm sizing** — see `DECISIONS-NEEDED.md` #2, 2026-08-15
  addendum. Confirmed blocked at `sleeper_import.fetch_players()` specifically, not
  the rest of the pipeline (nflverse access works fine). One command to run once
  someone has Sleeper access: `python draft/backtest/exp35_regression_sweep.py --out
  draft/backtest`.

### 3. Higher-risk — needs real design + a full backtest cycle, not a date
These aren't calendar-gated; they're blocked on missing design work, and building that
design under this week's time pressure is exactly how the bench-branch anchor broke
before (documented, not hypothetical). Recommend treating these as genuinely
after-draft rather than squeezing them in — but that's a recommendation, not a rule;
override if you disagree.
- ◻ RB drafts 0.9 in every weight arm (`DECISIONS-NEEDED.md` #0000) — needs an unbuilt
  concentration/insurance term, not a coefficient tweak.
- ◻ `ONESIE_MAX_SPARE` cap re-evaluation now that the ceiling-units fix has landed —
  `draft/tests/onesie_cap.test.js`'s retirement check was still red as of last check;
  needs re-measurement against the fixed ceiling term before any design decision.

## WAITING ON THE WORLD (nothing to do, just read it when it lands)
- ◻ Covariance / portfolio rho verdict — runs in CI on push.
- ◻ Anything needing a live 2026 season (in-season tools, continuous re-grading).

## GENUINELY AFTER THE DRAFT (blocked on data that won't exist until then, not on a calendar preference)
- ◻ The learning engine (weekly re-grading) — needs live weekly outcomes.
- ◻ Site optimization Phase 2.
- ◻ Revisit deploy policy once the draft-week reserve is no longer live.

---

_Session B owns the site/in-season half — matchup page follow-ups, Sunday alert, the
lineup optimizer's in-season surfaces, the deployed-vs-main health strip, and the
design sweep. Regenerate that slice the same way when B is back._

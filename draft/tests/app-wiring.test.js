/* APP-LEVEL WIRING — does the caller actually PASS what the engine reads?
 *
 * THE SEAM THIS POLICES, and it has now failed three times:
 *   1. THE FROZEN CLOCK   — the app never advanced the pick it passed
 *   2. SEAT IDENTITY      — the app passed the wrong seat
 *   3. THE DOCTRINE TILT  — the app passed no doctrine at all, so Stage 3 was
 *                           wired in the engine, green across 20 tests, and
 *                           NEVER RAN in production
 *
 * Every engine-level guard passed through all three. They had to: they build
 * their own ctx. A capability can be correctly implemented, correctly tested,
 * and still never reach production because nobody passes it in — and no test
 * that constructs its own inputs can ever catch that.
 *
 * So this is a different test class, and it asserts the opposite direction:
 * every ctx field the ENGINE READS must be SUPPLIED BY THE APP.
 *
 * It works by SOURCE INSPECTION rather than by running app.js, which is a
 * browser IIFE with no exports. That is a real limitation and is stated in the
 * checks themselves — this catches "the app never mentions it", not "the app
 * mentions it but computes it wrong". The second failure mode belongs to the
 * browser rehearsal, which is where all three of these were actually caught.
 *
 * Run: node draft/tests/app-wiring.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

const DIR = path.join(__dirname, '..', '..', 'public', 'js', 'draft');
// EVERY MODULE THE APP FEEDS, not just the engine. The first version of this
// suite read engine.js alone — and the seam sweep immediately found ctx fields
// read by survival.js and composite.js that engine.js never mentions. A wiring
// guard scoped to one consumer is a wiring guard with a hole the exact size of
// every other consumer.
const CONSUMERS = ['engine.js', 'survival.js', 'composite.js'];
const engineSrc = CONSUMERS
  .map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

// Every ctx.<field> the engine reads.
const reads = new Set();
(engineSrc.match(/ctx\.[a-zA-Z_][a-zA-Z0-9_]*/g) || [])
  .forEach(m => reads.add(m.slice(4)));
// Internal caches the engine sets on ctx itself are not the caller's job.
// Fields a consumer sets on ctx itself, or derives internally — not the
// caller's job. Each is named with WHY, so the exemption list cannot quietly
// become a place to hide real gaps.
const INTERNAL = new Set([
  '_flexAltSorted',   // engine's own sort cache
  '__l2cache',        // survival's layer-2 memo
  '__l',              // same, prefix-matched below
  'bestByPos',        // survival computes it inside precomputeLayer2
  'progress',         // survival DERIVES it from ctx.totalPicks (see note)
]);

// What context() supplies.
const ctxBlock = (appSrc.match(/function context\(\)[\s\S]*?\n  \}/) || [''])[0];
const supplies = new Set(
  (ctxBlock.match(/^\s{4,8}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm) || [])
    .map(m => m.trim().replace(/:$/, '')));

check('the engine actually reads ctx fields (non-vacuity)',
  reads.size >= 10, 'found ' + reads.size);
check('context() was located and parsed (non-vacuity)',
  supplies.size >= 8, 'parsed ' + supplies.size + ' supplied fields');

const missing = [...reads]
  .filter(f => !INTERNAL.has(f) && !f.startsWith('__') && !supplies.has(f)).sort();
check('EVERY ctx field the engine reads is supplied by the app',
  !missing.length,
  'the app never passes: ' + JSON.stringify(missing)
    + ' — the engine reads them, so they are undefined at runtime. This is the '
    + 'frozen-clock / seat-identity / doctrine seam.');

// ── THE NAMED CAPABILITIES, asserted individually so a regression says WHICH ──
// Each of these requires caller cooperation and has its own failure story.
const CAPABILITIES = [
  { field: 'doctrine',
    why: 'Stage 3 was green in 20 tests and never ran in production without it' },
  { field: 'roster',
    why: 'need, legality and the onesie rule all read it' },
  { field: 'currentPick',
    why: 'the frozen clock — the app advanced its display but not the ctx' },
  { field: 'board',
    why: 'the drafted set feeds this; a stale board resurrected picks' },
  { field: 'myPickIndex',
    why: 'the doctrine tilt evaluates roster-relative weights at this index; '
       + 'absent, pickIndexOf FALLS BACK TO A GUESS' },
  { field: 'totalPicks',
    why: 'draft progress -> urgency curves and the ceiling term. ALSO survival\'s '
       + 'per-team progress, which fell back to a flat 0.5 for every intervening '
       + 'team while this was unsupplied — a second-order effect the seam sweep '
       + 'surfaced and nobody would have traced from the symptom' },
  { field: 'currentKeepers',
    why: 'the keeper-option BAR. Redundant today because myRoster carries '
       + 'keepers, but the redundancy is one function\'s behaviour, not a '
       + 'guarantee' },
];
CAPABILITIES.forEach(c => {
  check(`the app supplies ctx.${c.field}`, supplies.has(c.field),
    c.why + ' (engine reads it: ' + reads.has(c.field) + ')');
});

// ── THE BOARD VERSION COUNTER — a capability with no ctx field ───────────────
// survival memoises on an explicit version; every in-place board mutation must
// bump it or the memo serves a stale pool, silently and wrongly.
check('the app bumps the board version on in-place mutation',
  /DraftSurvival\.bumpBoard\(/.test(appSrc),
  'no bumpBoard call in app.js — the survival memo will serve stale pools '
    + 'after an undo restores a player to the board');

// ── THE OTHER CONSUMERS — the seam sweep, widened ───────────────────────────
// engineSrc above scans engine/survival/composite. But the app also feeds ctx to
// doctrine.js (DoctrineState.update's 3rd arg), and a guard scoped to three of
// four consumers has a hole the exact size of the fourth. This sweeps the rest:
//   - doctrine.js: every ctx field it reads must be PASSED at the update() site.
//     (Value may be a deliberate stub like projected:null — the seam is about the
//     field being present, not undefined; a stub is a choice, an omission is a bug.)
//   - mcts.js reads many ctx fields but is NOT wired into the app (Lab-only), so
//     its ctx is out of the app seam. Asserted, so wiring MCTS in later without
//     supplying its ctx trips this guard instead of failing silently.
{
  const doctrineSrc = fs.readFileSync(path.join(DIR, 'doctrine.js'), 'utf8');
  // Extract ctx reads from CODE only. A `ctx.foo` inside a comment (e.g. a
  // sentence like "ctx.doctrine reads `current`") is prose, not a runtime read;
  // matching it would demand the app pass a field nothing actually consumes.
  const doctrineCode = doctrineSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const dReads = [...new Set((doctrineCode.match(/ctx\.[a-zA-Z_][a-zA-Z0-9_]*/g) || [])
    .map(m => m.slice(4)))].filter(f => !f.startsWith('_'));
  check('doctrine.js is a real consumer (non-vacuity)', dReads.length > 0, dReads.join(','));
  // The app feeds doctrine at the update() call site, NOT via context().
  const updateCall = (appSrc.match(/\.update\(\s*scores\b[^{]*\{([\s\S]*?)\}\s*\)/) || ['', ''])[1];
  const dPass = new Set((updateCall.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g) || [])
    .map(m => m.replace(/:$/, '').trim()));
  check('located the doctrine update() call site (non-vacuity)', dPass.size > 0, [...dPass].join(','));
  dReads.forEach(f => check('doctrine seam: app passes ctx.' + f + ' at update()',
    dPass.has(f), 'doctrine.js reads it in the switch sentence — absent means undefined at runtime'));

  check('mcts.js is NOT app-fed (its ctx is outside the app seam by design)',
    !/\bDraftMcts\b|\bmcts\.|runMcts|MctsSearch/.test(appSrc),
    'MCTS got wired into the app — add it as a consumer above and supply its ctx '
      + '(blocked, cfg, myRoster, mySlot, schedule, seed, valuer)');
}

// ── NEW SURFACES MUST BE CALLED, not merely defined ─────────────────────────
// The stack line and the movement line are the doctrine-tilt risk again: a pure
// engine helper (liveStackRoutes / movementLine), green in isolation, that the
// render path forgets to call reaches production as dead code. Assert the SEAM:
// renderRecommendations must invoke both, and each must consult its engine helper.
{
  // Slice the WHOLE renderRecommendations body, not a fixed char count: the
  // function grows (rule headline, design passes) and a fixed window silently
  // drops the calls off its end, failing green code. End at the next top-level
  // `function ` decl (two-space indent inside the IIFE) or EOF.
  const rrStart = appSrc.indexOf('function renderRecommendations');
  const rrNext = appSrc.indexOf('\n  function ', rrStart + 1);
  const rr = appSrc.slice(rrStart, rrNext === -1 ? undefined : rrNext);
  check('renderRecommendations calls the stack line', /renderStackLine\(/.test(rr));
  check('renderRecommendations calls the movement line', /updateMovement\(/.test(rr));
  check('the stack line consults E.liveStackRoutes', /E\.liveStackRoutes\(/.test(appSrc));
  check('the movement line consults E.movementLine', /E\.movementLine\(/.test(appSrc));
  check('the movement snapshot advances only on a NEW pick (guards the diff basis)',
    /prev\.pick !== pick/.test(appSrc),
    'without the pick-change guard, a same-pick re-render moves the comparison '
      + 'basis and every diff reads steady');
}

// ── #queue-slip: B builds the shell, A wires it. Proven here so "is it wired?"
// is a green/red suite, not a recurring question. The slip alert is the feature
// Cory most wanted from promoting the queue; it fires when a QUEUED player is
// >=60% likely gone by the next pick — empty queue or nobody slipping shows
// nothing BY DESIGN, which is not the same as unwired. ──────────────────────────
{
  const warroom = fs.readFileSync(path.join(DIR, '../../../views/admin/warroom.ejs'), 'utf8');
  check('queue-slip: B\'s host div exists in warroom.ejs', /id="queue-slip"/.test(warroom));
  check('queue-slip: renderQueueSlip is defined', /function renderQueueSlip\(/.test(appSrc));
  check('queue-slip: the render loop CALLS it with the scored board',
    /renderQueueSlip\(out\.scored\)/.test(appSrc));
  check('queue-slip: it reads survival_to_next (the same math the recs use)',
    /survival_to_next/.test(appSrc.slice(appSrc.indexOf('function renderQueueSlip'),
      appSrc.indexOf('function renderQueueSlip') + 1200)));
  check('queue-slip: it reads state.lists.queue (the queue is the source)',
    /state\.lists\.queue/.test(appSrc.slice(appSrc.indexOf('function renderQueueSlip'),
      appSrc.indexOf('function renderQueueSlip') + 1200)));
  check('queue-slip: the alert carries the "I took him" action (data-draft-me)',
    /data-draft-me/.test(appSrc.slice(appSrc.indexOf('function renderQueueSlip'),
      appSrc.indexOf('function renderQueueSlip') + 1600)));
}

// ── THE TAKE BUTTON IN THE ONE-ANSWER VIEW ──────────────────────────────────
// SEV1 from a live mock: the clock/one-answer card recommended a player with NO
// way to draft him — the take button lived only on the full-board recs cards. It
// lives in warroom.ejs (B's shell), so a clobber there silently re-breaks the
// single most important control. Assert BOTH ends: the host button and the wiring.
{
  const warroom = fs.readFileSync(path.join(DIR, '../../../views/admin/warroom.ejs'), 'utf8');
  check('clock take: the one-answer card has a take button (warroom.ejs #clock-take)',
    /id="clock-take"[^>]*data-draft-me/.test(warroom),
    'the ONE ANSWER view must carry a take control, or it recommends a player you cannot draft');
  const rc = appSrc.slice(appSrc.indexOf('function renderClock'),
    appSrc.indexOf('function renderClock') + 3000);
  check('clock take: renderClock points it at the shown player',
    /clock-take/.test(rc) && /setAttribute\('data-draft-me'/.test(rc),
    'renderClock must set #clock-take data-draft-me to the player the view is showing');
}

// ── HONEST LIMIT, asserted so nobody mistakes this for more than it is ──────
check('this suite knows what it cannot check (limitation is documented)',
  /catches "the app never mentions it", not "the app mentions it but computes it wrong"/
    .test(fs.readFileSync(__filename, 'utf8')));

console.log(`\n${pass}/${pass + fail} app-wiring checks passed`);
process.exit(fail ? 1 : 0);

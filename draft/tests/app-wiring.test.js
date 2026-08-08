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

// ── HONEST LIMIT, asserted so nobody mistakes this for more than it is ──────
check('this suite knows what it cannot check (limitation is documented)',
  /catches "the app never mentions it", not "the app mentions it but computes it wrong"/
    .test(fs.readFileSync(__filename, 'utf8')));

console.log(`\n${pass}/${pass + fail} app-wiring checks passed`);
process.exit(fail ? 1 : 0);

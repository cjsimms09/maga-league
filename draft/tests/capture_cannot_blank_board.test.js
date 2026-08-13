// TERRITORY: A
// THE LEDGER MUST NEVER BE ABLE TO BLANK THE BOARD.
//
// I introduced this risk myself. The decision-capture block inside
// renderRecommendations was UNGUARDED, while the renderRuleHeadline call one
// line above it has always been wrapped — the file already knew a subsidiary
// concern must not break rendering, and the capture was the exception.
//
// That was survivable until I added a call to `PredLedger.boardState`, a NEW
// export. A browser holding a cached predledger.js without it throws a
// TypeError inside the function that DRAWS THE BOARD, at the table. Losing a
// ledger row is a bad night. Losing the recommendations is a lost draft.
//
// This is a STRUCTURAL test rather than a DOM one: app.js is a browser module
// with no headless entry point, so instead of booting it, this asserts the
// guarantees on the source and then proves the DEGRADATION PATH works against
// the real serializer.
//
// Run: node draft/tests/capture_cannot_blank_board.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(d).slice(0, 300) : '')); }
};

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

// ── 1. THE CAPTURE IS INSIDE A TRY ─────────────────────────────────────────
// Matched on the shipped text so the guarantee cannot be removed silently.
const capIdx = SRC.indexOf("if (typeof PredLedger !== 'undefined' && out.scored && out.scored.length)");
ck('the recommendation-capture block still exists', capIdx > 0);
const capLine = SRC.slice(capIdx, SRC.indexOf('\n', capIdx));
ck('THE CAPTURE BLOCK IS GUARDED (`) try {` on the same line)',
  /\)\s*try\s*\{\s*$/.test(capLine), capLine);
ck('and it has a catch that logs rather than rethrows',
  SRC.indexOf("catch (e) { console.error('[rec-capture]'", capIdx) > capIdx);

// ── 2. THE POST IS GUARDED SEPARATELY FROM THE LOCAL LOCK ─────────────────
// The lock is what reconcile reads. If a failed ledger POST skipped it, a
// network blip would silently cost the local record of what was recommended —
// which is the more important of the two.
const postCatch = SRC.indexOf("catch (e) { console.error('[ledger-capture]'", capIdx);
const lockIdx = SRC.indexOf('state.lockedRecs = state.lockedRecs || {};', capIdx);
ck('the ledger POST has its own inner catch', postCatch > capIdx);
ck('THE LOCAL LOCK RUNS AFTER THAT CATCH, so a failed POST cannot skip it',
  lockIdx > postCatch, { postCatch, lockIdx });
// The regression this pins: an earlier edit of mine closed the try before the
// lock and left the lock inside `if (false)`, which made it dead code.
ck('the lock is NOT inside a disabled branch',
  SRC.slice(capIdx, lockIdx).indexOf('if (false)') < 0);

// ── 3. boardState IS CALLED DEFENSIVELY ──────────────────────────────────
// The specific failure: a cached bundle without the new export.
ck('boardState is feature-detected before being called',
  /typeof PredLedger\.boardState === 'function'/.test(SRC));
ck('and there is a fallback payload when it is absent',
  /taken_state: 'unavailable'/.test(SRC));

// ── 4. THE DEGRADATION ACTUALLY WORKS, against the real module ───────────
// Structure checks can pass on code that still throws, so this exercises it.
global.window = global;
const PL = require(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'));
ck('the shipped PredLedger really does export boardState',
  typeof PL.boardState === 'function');

// Reproduce the exact expression app.js evaluates, with the export removed —
// i.e. the stale-cache case — and confirm it yields a payload instead of throwing.
{
  const stale = Object.assign({}, PL);
  delete stale.boardState;
  let threw = null, payload = null;
  try {
    payload = Object.assign({ mock: false },
      (typeof stale.boardState === 'function'
        ? stale.boardState(new Set(['1', '2']), 10)
        : { taken_state: 'unavailable' }),
      { weights: {}, top: [] });
  } catch (e) { threw = e; }
  ck('STALE-CACHE CASE — the payload builds without throwing', threw === null, threw && threw.message);
  ck('and it degrades to a labelled row rather than a silent gap',
    payload && payload.taken_state === 'unavailable' && payload.mock === false);
}

// The healthy case must still carry the real fields — a fallback that fired
// always would "pass" the check above while destroying the evidence.
{
  const p = Object.assign({ mock: false },
    (typeof PL.boardState === 'function'
      ? PL.boardState(new Set(['1', '2']), 10)
      : { taken_state: 'unavailable' }), {});
  ck('HEALTHY CASE — the real board state is present, not the fallback',
    Array.isArray(p.taken_player_ids) && p.taken_count === 2 && p.taken_state === undefined,
    JSON.stringify(p));
}

// ── 5. FAIL ARM — the structural checks must be able to go red ───────────
// Without this, section 1 is a regex that has never been shown to fail.
{
  const mutant = SRC.replace(/\)\s*try\s*\{\s*\n(\s*var c = ledgerCtx\(\);)/, ') {\n$1');
  const mIdx = mutant.indexOf("if (typeof PredLedger !== 'undefined' && out.scored && out.scored.length)");
  const mLine = mutant.slice(mIdx, mutant.indexOf('\n', mIdx));
  ck('FAIL ARM — removing the guard makes the guard check fail',
    mutant !== SRC && !/\)\s*try\s*\{\s*$/.test(mLine), mLine);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED — the capture can still break the board.'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a throwing or missing ledger degrades to a labelled');
console.log('row and, failing that, to a logged error — and the board still renders.');
console.log('WHAT IT DOES NOT: this reads the source and exercises the expression; it does');
console.log('not boot a DOM. A rendering failure with a different cause is out of scope.');

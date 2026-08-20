/* TERRITORY: A
 *
 * A PLAYER WHO IS GONE MUST NOT REACH ANY PANEL.
 *
 * Cory reported this twice on 2026-08-20:
 *   "Roster builder model is recommending players that are already gone"
 *   "Mock draft is not working. It's telling me to take players already taken."
 *
 * The first fix went inside mlv.js — correct, and TOO NARROW. It protected one
 * panel while twenty places in app.js read `state.board` directly, including
 * DraftNeedRule.recommend, DraftShadows, the left rail, the shortlist and the
 * board count. Guarding those one at a time is how the next surface gets missed,
 * so the prune now happens ONCE in renderAll() before anything paints.
 *
 * ⚠️ EXECUTED, NOT GREPPED. A regex would prove the function exists; only
 * running it proves a drafted player actually comes out. This session already
 * shipped a check that grepped for a string, was fooled by dead code below an
 * early return, and passed while the defect was live.
 *
 * Run: node draft/tests/no_drafted_player_reaches_a_render.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0;
const fails = [];
const check = (n, ok, d) => {
  if (ok) { pass++; return; }
  fails.push(n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 240) : ''));
};

/* ── THE FUNCTION, PULLED OUT AND RUN ────────────────────────────────────── */

const start = APP.indexOf('  function pruneDraftedFromBoard()');
const end = APP.indexOf('\n  function renderAll()', start);
check('pruneDraftedFromBoard() exists', start >= 0 && end > start);
if (start < 0) { fails.forEach(f => console.log('  FAILED  ' + f)); process.exit(1); }
const src = APP.slice(start, end);

function makePrune(state) {
  const logs = [];
  // eslint-disable-next-line no-new-func
  const fn = new Function('state', 'console',
    src + '; return pruneDraftedFromBoard;')(state,
    { error: function () { logs.push(Array.prototype.slice.call(arguments)); } });
  return { fn: fn, logs: logs };
}

/* ── 1. THE DEFECT CORY SAW ──────────────────────────────────────────────── */
{
  const state = {
    board: [{ player_id: '1', name: 'Saquon Barkley' },
      { player_id: '2', name: 'Omarion Hampton' },
      { player_id: '3', name: 'Breece Hall' },
      { player_id: '4', name: 'Available Guy' }],
    drafted: new Set(['1', '2', '3']),
  };
  const { fn, logs } = makePrune(state);
  fn();
  check('THE FIX: drafted players are gone from the board before any render',
    state.board.length === 1 && state.board[0].name === 'Available Guy',
    state.board.map(p => p.name));
  check('the removal is COUNTED, so the upstream cause is not buried',
    state.staleBoardDrops === 3, state.staleBoardDrops);
  check('and the removed players are NAMED in the log, not just counted',
    logs.length === 1 && JSON.stringify(logs[0]).indexOf('Saquon Barkley') > 0,
    logs);
}

/* ── 2. IT IS A NO-OP ON A HEALTHY BOARD ─────────────────────────────────── */
{
  const board = [{ player_id: '4', name: 'A' }, { player_id: '5', name: 'B' }];
  const state = { board: board, drafted: new Set(['9']) };
  const { fn, logs } = makePrune(state);
  fn();
  check('a healthy board is untouched', state.board.length === 2);
  check('and nothing is logged — a warning that fires normally is noise',
    logs.length === 0, logs);
  check('the drop count reads zero rather than stale',
    state.staleBoardDrops === 0, state.staleBoardDrops);
}

/* ── 3. IT DOES NOT REPEAT ITSELF EVERY RENDER ───────────────────────────── */
{
  const state = {
    board: [{ player_id: '1', name: 'Gone' }, { player_id: '2', name: 'Here' }],
    drafted: new Set(['1']),
  };
  const { fn, logs } = makePrune(state);
  fn(); fn(); fn();
  check('renderAll runs constantly, so the same staleness is reported ONCE, '
    + 'not once per paint', logs.length === 1, logs.length);
  check('and the board stays pruned across repeated calls',
    state.board.length === 1, state.board.map(p => p.name));
}

/* ── 4. IT DEGRADES SAFELY ───────────────────────────────────────────────── */
{
  const cases = {
    'no board': { drafted: new Set(['1']) },
    'no drafted set': { board: [{ player_id: '1', name: 'A' }] },
    'empty drafted': { board: [{ player_id: '1', name: 'A' }], drafted: new Set() },
    'null entries on the board': {
      board: [null, { player_id: '1', name: 'A' }], drafted: new Set(['9']) },
  };
  Object.keys(cases).forEach(label => {
    let threw = null;
    try { makePrune(cases[label]).fn(); } catch (e) { threw = e.message; }
    check('does not throw with ' + label + ' — a crash here would freeze every '
      + 'panel after it in renderAll', threw === null, threw);
  });
}

/* ── 5. IDS ARE COMPARED AS STRINGS ON BOTH SIDES ────────────────────────── */
{
  /* Sleeper returns ids as strings in some payloads and numbers in others. A
   * guard that misses on a type mismatch is the same as no guard, and it fails
   * in the direction that puts a drafted player back on Cory's screen — the
   * exact bug found in mlv.js's first version of this same guard, hours ago. */
  const state = {
    board: [{ player_id: 1, name: 'Numeric Id' }, { player_id: '2', name: 'Keep' }],
    drafted: new Set(['1']),
  };
  makePrune(state).fn();
  check('a NUMERIC board id is matched against a STRING drafted id',
    state.board.length === 1 && state.board[0].name === 'Keep',
    state.board.map(p => p.name));
}

/* ── 6. IT ACTUALLY RUNS, AND RUNS FIRST ─────────────────────────────────── */

const ra = APP.slice(APP.indexOf('  function renderAll()'),
  APP.indexOf('  function renderAll()') + 900);
check('renderAll() calls it', /pruneDraftedFromBoard\(\)/.test(ra));
check('and calls it BEFORE any safeRender — a prune after the first panel has '
  + 'painted is a prune that came too late',
ra.indexOf('pruneDraftedFromBoard()') < (ra.indexOf('safeRender') < 0
  ? Infinity : ra.indexOf('safeRender')));
check('the call is guarded, so a throw here cannot freeze the render chain',
  /try \{ pruneDraftedFromBoard\(\); \} catch/.test(ra));

console.log('\n  NO DRAFTED PLAYER REACHES A RENDER\n');
if (fails.length) {
  fails.forEach(f => console.log('  FAILED  ' + f));
  console.log('\n  ' + pass + ' passed, ' + fails.length + ' FAILED\n');
  process.exit(1);
}
console.log('  ' + pass + ' checks passed\n');

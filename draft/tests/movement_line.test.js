/* THE MOVEMENT LINE — the model thinking out loud as the board moves.
 *
 * Pure over two snapshots taken at two DIFFERENT picks. The load-bearing honesty
 * property: it invents NO causal claim. A move with no supplied reason produces a
 * bare factual line, never a fabricated explanation — and the "why" is only ever
 * the reason the caller passed in from the board's own run machinery.
 *
 * Run: node draft/tests/movement_line.test.js
 */
'use strict';
const E = require('../../public/js/draft/engine.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

const snap = (pick, topId, topName, topScore, secondName, secondScore) =>
  ({ pick: pick, topId: topId, topName: topName, topScore: topScore,
     secondName: secondName, secondScore: secondScore });

// --- DID IT MOVE ------------------------------------------------------------
{
  const prev = snap(31, 'a', 'McMillan', 20.0, 'Montgomery', 16.0);
  const curr = snap(34, 'b', 'Montgomery', 19.0, 'McMillan', 18.0);
  const m = E.movementLine(prev, curr);
  check('a changed top yields kind:moved', m.kind === 'moved', m.kind);
  check('names the new top', /Shifted to Montgomery/.test(m.line), m.line);
  check('with NO reason, the line is bare — no invented why',
    m.line === 'Shifted to Montgomery.', m.line);

  const m2 = E.movementLine(prev, curr, { reason: 'RB run on' });
  check('a supplied reason is appended factually', /Shifted to Montgomery — RB run on\./.test(m2.line), m2.line);
}

// --- ALMOST MOVED -----------------------------------------------------------
{
  // Same top (id 'a'), but the runner-up closed from a 6-pt gap to a 1.5-pt gap.
  const prev = snap(31, 'a', 'Chase', 30.0, 'McMillan', 24.0);   // gap 6.0
  const curr = snap(34, 'a', 'Chase', 29.0, 'McMillan', 27.5);   // gap 1.5
  const m = E.movementLine(prev, curr, { reason: 'WR run' });
  check('top held but runner-up closed -> kind:almost', m.kind === 'almost', m.kind);
  check('reports how close, and that it did not pass',
    /McMillan closed to within 1\.5 pts on the WR run — didn't pass\./.test(m.line), m.line);
}

// --- STEADY: gap unchanged or widening is not "almost" -----------------------
{
  const prev = snap(31, 'a', 'Chase', 30.0, 'McMillan', 28.0);   // gap 2.0
  const curr = snap(34, 'a', 'Chase', 30.0, 'McMillan', 26.0);   // gap 4.0 (widened)
  const m = E.movementLine(prev, curr);
  check('a WIDENING gap is steady, not almost', m.kind === 'steady', m.kind + ' ' + m.line);
  check('steady yields an empty line', m.line === '');
}

// --- STEADY: a gap that is close but did not actually shrink -----------------
{
  const prev = snap(31, 'a', 'Chase', 30.0, 'McMillan', 29.0);   // gap 1.0, already close
  const curr = snap(34, 'a', 'Chase', 30.0, 'McMillan', 29.2);   // gap 0.8, barely moved (< minShrink)
  const m = E.movementLine(prev, curr);
  check('a gap that was already close and barely moved is steady (no flap)',
    m.kind === 'steady', m.kind + ' ' + m.line);
}

// --- guards -----------------------------------------------------------------
{
  check('null prev -> steady (first pick has nothing to diff)',
    E.movementLine(null, snap(4, 'a', 'X', 10, 'Y', 8)).kind === 'steady');
  check('null curr -> steady', E.movementLine(snap(4, 'a', 'X', 10, 'Y', 8), null).kind === 'steady');
  check('missing runner-up scores never crash the almost-path',
    E.movementLine(snap(31, 'a', 'X', 10, null, null), snap(34, 'a', 'X', 10, null, null)).kind === 'steady');
}

console.log('');
console.log(pass + '/' + (pass + fail) + ' movement-line checks passed');
if (fail) process.exit(1);

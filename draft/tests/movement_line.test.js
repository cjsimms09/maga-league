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

const snap = (pick, topId, topName, topScore, secondName, secondScore, topPos, secondPos) =>
  ({ pick: pick, topId: topId, topName: topName, topScore: topScore,
     secondName: secondName, secondScore: secondScore,
     topPos: topPos || null, secondPos: secondPos || null });

// --- DID IT MOVE ------------------------------------------------------------
{
  const prev = snap(31, 'a', 'McMillan', 20.0, 'Montgomery', 16.0);
  const curr = snap(34, 'b', 'Montgomery', 19.0, 'McMillan', 18.0);
  const m = E.movementLine(prev, curr);
  check('a changed top yields kind:moved', m.kind === 'moved', m.kind);
  check('names the new top', /Shifted to Montgomery/.test(m.line), m.line);
  check('with NO reason, the line is bare — no invented why',
    m.line === 'Shifted to Montgomery.', m.line);

  /* RELEVANCE, NOT JUST PROVENANCE. The old assertion passed `reason: 'RB run on'`
   * and demanded it be appended — which is satisfied whether or not the run has
   * anything to do with the player who moved. `runs`/`pos` make that checkable. */
  const rel = E.movementLine(prev, snap(34, 'b', 'Montgomery', 19.0, 'McMillan', 18.0, 'RB'),
    { runs: ['RB'] });
  check('a run AT THE MOVED POSITION earns the causal em-dash',
    rel.line === 'Shifted to Montgomery — RB run on.', rel.line);

  const unrel = E.movementLine(prev, snap(34, 'b', 'Loveland', 19.0, 'McMillan', 18.0, 'TE'),
    { runs: ['RB'] });
  check('a run ELSEWHERE is reported as concurrent, never as the cause — "Shifted '
    + 'to a TE — RB run on" is a causal sentence about an unrelated fact',
  unrel.line === 'Shifted to Loveland. RB run also on.', unrel.line);

  const many = E.movementLine(prev, snap(34, 'b', 'Loveland', 19.0, 'McMillan', 18.0, 'TE'),
    { runs: ['RB', 'WR'] });
  check('two running positions pluralise, which the old string-concat could not',
    /RB\/WR runs also on\./.test(many.line), many.line);
}

// --- ALMOST MOVED -----------------------------------------------------------
{
  // Same top (id 'a'), but the runner-up closed from a 6-pt gap to a 1.5-pt gap.
  const prev = snap(31, 'a', 'Chase', 30.0, 'McMillan', 24.0);   // gap 6.0
  const curr = snap(34, 'a', 'Chase', 29.0, 'McMillan', 27.5);   // gap 1.5
  const m = E.movementLine(prev, curr, { runs: [] });
  check('top held but runner-up closed -> kind:almost', m.kind === 'almost', m.kind);
  check('reports how close, and that it did not pass',
    m.line === "McMillan closed to within 1.5 pts — didn't pass.", m.line);

  /* THE GRAMMAR DEFECT THIS FIXTURE USED TO HIDE. The app passed
   * `runs.join('/') + ' run on'` while this suite passed 'WR run', and the almost
   * branch wrapped it as `' on the ' + reason` — so PRODUCTION read "on the WR
   * run on" and the test read "on the WR run". The suite was checking a string
   * shape production never sends. Phrasing now lives in one place. */
  const rel = E.movementLine(
    snap(31, 'a', 'Chase', 30.0, 'McMillan', 24.0, 'WR', 'WR'),
    snap(34, 'a', 'Chase', 29.0, 'McMillan', 27.5, 'WR', 'WR'), { runs: ['WR'] });
  check('a run at the runner-up\'s position reads grammatically, once',
    rel.line === "McMillan closed to within 1.5 pts on the WR run — didn't pass.", rel.line);
  check('FAIL ARM — and never doubles the word "run", which is what shipped',
    !/run on —/.test(rel.line) && !/run run/.test(rel.line), rel.line);

  const unrel = E.movementLine(
    snap(31, 'a', 'Chase', 30.0, 'McMillan', 24.0, 'WR', 'WR'),
    snap(34, 'a', 'Chase', 29.0, 'McMillan', 27.5, 'WR', 'WR'), { runs: ['RB'] });
  check('an unrelated run is an aside here too, not a cause',
    unrel.line === "McMillan closed to within 1.5 pts — didn't pass. RB run also on.",
    unrel.line);
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

// --- AN UNKNOWN TOP IS NOT A SAME TOP --------------------------------------
/* The moved branch required BOTH ids non-null. A null id therefore fell through
 * to the runner-up branch, which narrated a gap story while the top had actually
 * changed. Measured before the fix: prev Flowers / curr Loveland with a null id
 * yielded "Y closed to within 2.0 pts — didn't pass." A null must not resolve to
 * the reassuring answer. */
{
  const prevNull = snap(31, null, 'Flowers', 20.0, 'X', 14.0, 'WR', 'WR');
  const currB = snap(34, 'b', 'Loveland', 22.0, 'Y', 20.0, 'TE', 'TE');
  const m = E.movementLine(prevNull, currB, { runs: [] });
  check('a missing id falls back to NAMES rather than assuming the top held',
    m.kind === 'moved' && /Shifted to Loveland/.test(m.line), m.kind + ' ' + m.line);
  check('FAIL ARM — it does NOT narrate the runner-up, which is what shipped',
    !/closed to within/.test(m.line), m.line);

  const bothBlank = E.movementLine(
    { pick: 31, topId: null, topName: null, topScore: 20, secondName: 'X', secondScore: 14 },
    { pick: 34, topId: null, topName: 'Loveland', topScore: 22, secondName: 'Y', secondScore: 20 },
    { runs: [] });
  check('and when identity is genuinely unknowable on one side it says NOTHING '
    + 'rather than guessing', bothBlank.kind === 'steady' && bothBlank.line === '',
  bothBlank.kind + ' ' + bothBlank.line);

  const sameName = E.movementLine(
    snap(31, null, 'Chase', 30.0, 'McMillan', 24.0, 'WR', 'WR'),
    snap(34, null, 'Chase', 29.0, 'McMillan', 27.5, 'WR', 'WR'), { runs: [] });
  check('a same NAME with ids absent is treated as the same top, so the '
    + 'runner-up story is still available when it is the true one',
  sameName.kind === 'almost', sameName.kind + ' ' + sameName.line);
}

// --- NO RUNS, NO ASIDE ------------------------------------------------------
{
  const prev = snap(31, 'a', 'McMillan', 20.0, 'Montgomery', 16.0, 'WR', 'RB');
  const curr = snap(34, 'b', 'Montgomery', 19.0, 'McMillan', 18.0, 'RB', 'WR');
  check('an empty runs list yields the bare factual line — no invented why',
    E.movementLine(prev, curr, { runs: [] }).line === 'Shifted to Montgomery.');
  check('and so does omitting runs entirely',
    E.movementLine(prev, curr).line === 'Shifted to Montgomery.');
  check('a non-array runs value cannot crash or leak into the line',
    E.movementLine(prev, curr, { runs: 'RB' }).line === 'Shifted to Montgomery.');
}

console.log('');
console.log(pass + '/' + (pass + fail) + ' movement-line checks passed');
if (fail) process.exit(1);

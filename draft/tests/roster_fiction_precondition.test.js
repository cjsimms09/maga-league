/* THE PRECONDITION THAT MAKES `roster: []` FIXTURES LEGAL, AND ITS FAIL ARM.
 *
 * Register E31. A ruled the empty-roster fiction stays, on condition that
 * every roster-reading term is measured-dead or zero-weighted on the live
 * seat -- so that fiction never silently starts hiding a live signal. This
 * pins the guard and proves it actually fires.
 *
 * Run: node draft/tests/roster_fiction_precondition.test.js
 */
'use strict';
const { assertRosterFictionPrecondition } = require('./_empty_roster_fiction_precondition.js');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const E = require('../../public/js/draft/engine.js');

// ─────── 1. passes on the real, shipped weight vector
{
  const r = assertRosterFictionPrecondition(E);
  ck('the shipped weights pass the precondition (need/bye/risk all zero)',
    r.need === 0 && r.bye === 0 && r.risk === 0, r);
}

// ─────── 2. FAIL ARM: each of need/bye/risk going non-zero is caught
['need', 'bye', 'risk'].forEach(term => {
  const fake = Object.assign({}, E, {
    MEASURED_WEIGHTS: Object.assign({}, E.MEASURED_WEIGHTS, { [term]: 1 }),
  });
  let threw = false, msg = '';
  try { assertRosterFictionPrecondition(fake); } catch (e) { threw = true; msg = e.message; }
  ck('FAIL ARM: ' + term + ' going non-zero is caught by the guard',
    threw && msg.indexOf(term) !== -1, msg);
});

// ─────── 3. FAIL ARM: a missing MEASURED_WEIGHTS export is caught, not silently passed
{
  let threw = false;
  try { assertRosterFictionPrecondition({}); } catch (e) { threw = true; }
  ck('FAIL ARM: an engine with no MEASURED_WEIGHTS export throws rather than '
    + 'silently reporting safe', threw);
}

// ─────── 4. the keeper term is NOT falsely certified safe
{
  const r = assertRosterFictionPrecondition(E);
  ck('the guard does not claim keeper is safe -- it reports the known ceiling '
    + 'instead of asserting a false zero', r.keeper_weight === 1
    && typeof r.keeper_known_ceiling === 'number' && r.keeper_known_ceiling > 2.0,
  r);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

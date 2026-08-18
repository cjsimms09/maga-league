'use strict';
/**
 * Tests for the stranded-work report.
 *
 * The classification is pure and takes an injected clock, so none of these touch git
 * — a test that shelled out to the real repo would pass or fail on whatever branches
 * happen to exist today, which is the flakiness `intervention_rate.js` had to freeze a
 * pool to escape.
 */
const assert = require('assert');
const L = require('../tools/lane_status.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const NOW = Date.parse('2026-08-18T12:00:00Z');
const hoursAgo = h => new Date(NOW - h * 3.6e6).toISOString();
const daysAgo = d => hoursAgo(d * 24);

// --- collect is a plain join, so the ahead-count source stays injectable ----------
{
  const rows = L.collect(
    [{ branch: 'lane-d', lastIso: hoursAgo(20) }, { branch: 'lane-e', lastIso: hoursAgo(1) }],
    b => (b === 'lane-d' ? 19 : 0));
  check('collect pairs each branch with its ahead-count',
    rows.length === 2 && rows[0].ahead === 19 && rows[1].ahead === 0,
    JSON.stringify(rows));
}

// --- the case this tool was built for --------------------------------------------
{
  const [d] = L.classify([{ branch: 'lane-d', lastIso: hoursAgo(20), ahead: 19 }], NOW);
  check("D's real shape — 19 commits, ~20h old — is flagged STRANDED",
    d.stranded === true && d.abandoned === false, JSON.stringify(d));
}

// --- and the three ways it must NOT fire -----------------------------------------
{
  const [merged] = L.classify([{ branch: 'clean', lastIso: hoursAgo(30), ahead: 0 }], NOW);
  check('a fully merged branch is never stranded', merged.stranded === false);

  const [fresh] = L.classify([{ branch: 'in-flight', lastIso: hoursAgo(2), ahead: 25 }], NOW);
  check('work pushed two hours ago is IN FLIGHT, not stranded',
    fresh.stranded === false, JSON.stringify(fresh));

  const [tiny] = L.classify([{ branch: 'one-commit', lastIso: hoursAgo(48), ahead: 1 }], NOW);
  check('a single old commit is below the bar — this reports lanes, not commits',
    tiny.stranded === false, JSON.stringify(tiny));
}

// --- old divergence must not bury the real row -----------------------------------
{
  const rows = L.classify([
    { branch: 'ancient', lastIso: daysAgo(9), ahead: 850 },
    { branch: 'lane-d', lastIso: hoursAgo(20), ahead: 19 },
  ], NOW);
  const ancient = rows.find(r => r.branch === 'ancient');
  const laneD = rows.find(r => r.branch === 'lane-d');
  check('a 9-day-old 850-commit branch reads as ABANDONED divergence, not stranded work',
    ancient.abandoned === true && ancient.stranded === false, JSON.stringify(ancient));
  check('  and the real stranded lane still flags alongside it',
    laneD.stranded === true);
  check('  sorted by ahead-count, so the loudest number is not the most important row',
    rows[0].branch === 'ancient');
}

// --- boundaries, stated explicitly so a threshold change is a deliberate act ------
{
  const at = L.classify([{ branch: 'b', lastIso: hoursAgo(L.STRANDED_HOURS), ahead: L.STRANDED_COMMITS }], NOW);
  check('exactly at both thresholds counts as stranded (>=, not >)', at[0].stranded === true);
  const under = L.classify([{ branch: 'b', lastIso: hoursAgo(L.STRANDED_HOURS - 1), ahead: L.STRANDED_COMMITS }], NOW);
  check('one hour under the age threshold does not', under[0].stranded === false);
}

// --- a KNOWN-POSITIVE for the whole point: silence must not look like health ------
{
  const rows = L.classify([{ branch: 'lane-d', lastIso: hoursAgo(20), ahead: 19 }], NOW);
  check('KNOWN-POSITIVE — a lane with work and NO routed entry is still visible here, '
    + 'which is the entire reason the tool exists',
    rows.some(r => r.stranded), JSON.stringify(rows));
}

console.log('\n' + pass + '/' + (pass + fail) + ' lane-status checks passed');
assert.strictEqual(fail, 0);

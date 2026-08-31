// TERRITORY: A
/* THE RED BASELINE MUST NOT BECOME A PLACE TO HIDE THINGS.
 *
 * Register 300 phase (4). `draft/data/suite_red_baseline.json` lists the JS
 * suites known to be failing on `main`, so `suite_baseline_check.js` can tell a
 * NEW failure from the standing debt. That is a useful mechanism and a
 * dangerous one: the same file that makes a new break visible is one careless
 * commit away from being where breaks go to be forgotten.
 *
 * So the baseline gets its own guard, and it checks the two ways it rots:
 *
 *   A NAME THAT IS NOT A SUITE. A typo, or a suite deleted or renamed while its
 *   entry stayed. Its entry then matches nothing forever — the ratchet silently
 *   stops covering it, and a rename becomes a way to launder a failure.
 *
 *   A NAME THAT NOW PASSES. Not a failure — it is the goal — but it must be
 *   NOTICED, or the baseline only ever grows and the count it was built to
 *   watch becomes invisible again in the other direction. Reported loudly here
 *   and by the CI step, never silently.
 *
 * ⚠️ THIS FILE DOES NOT RE-RUN THE SUITES. That takes minutes and would double
 * CI's cost to re-derive something the JS glob already produces. The staleness
 * check that needs live results lives in the CI step; what lives here is the
 * part that is cheap and structural.
 *
 * Run: node draft/tests/red_baseline_is_honest.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BASELINE = path.join(ROOT, 'draft', 'data', 'suite_red_baseline.json');
const TESTS = path.join(ROOT, 'draft', 'tests');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else {
    fail++;
    console.log('FAIL  ' + n + (d !== undefined
      ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : ''));
  }
};

const doc = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const listed = doc.suites || [];
const onDisk = new Set(fs.readdirSync(TESTS)
  .filter(f => f.endsWith('.test.js'))
  .map(f => f.replace(/\.test\.js$/, '')));

// ── CONTROLS: without these every assertion below could be comparing two
//    empty sets and passing on nothing.
/* ⚠️ THIS CONTROL USED TO READ `listed.length > 0` — "the baseline carries
 * entries at all" — AND IT FIRED ON 2026-08-27 WHEN THE DEBT WAS ACTUALLY
 * CLEARED (register 371). The standing red went 5 → 0 that day, and this file
 * refused the result.
 *
 * It contradicted its own header, which says of a suite that starts passing:
 * *"Not a failure — it is the GOAL."* A guard that forbids the goal state of
 * the thing it guards is not strict, it is wrong, and the direction it is
 * wrong in is the worst one available: it makes an empty baseline look like a
 * broken file, so the cheapest way to get green is to put something back.
 *
 * THE ANTI-VACUITY WORRY IT WAS WRITTEN FOR IS REAL AND IS ALREADY COVERED
 * ELSEWHERE — the FAIL ARM at the bottom builds its own list with a ghost in
 * it and proves the ROT 1 check fires, on a synthetic set, with no dependence
 * on `listed` being non-empty. That arm is the load-bearing one.
 *
 * What genuinely must not pass unnoticed is `suites` being empty because the
 * FILE broke — key missing, wrong type, truncated write — which reads as zero
 * and would make every set comparison below vacuous. So the control now
 * separates the two: the key must be a real array, and an EMPTY one must be
 * DECLARED, carrying a ratchet-log entry that says which suites were removed
 * to get there. Empty-by-tightening passes; empty-by-accident does not. */
ck('CONTROL — `suites` is a real array, and if it is EMPTY that state was '
  + 'reached by TIGHTENING (the log names what was removed) rather than by a '
  + 'broken or truncated file — an empty baseline is this mechanism\'s goal, '
  + 'not a fault (register 371)',
Array.isArray(doc.suites)
  && (listed.length > 0
    || (Array.isArray(doc._ratchet_log) && doc._ratchet_log.length > 0
      && Array.isArray((doc._ratchet_log[doc._ratchet_log.length - 1] || {}).removed)
      && doc._ratchet_log[doc._ratchet_log.length - 1].removed.length > 0)),
{ listed: listed.length, is_array: Array.isArray(doc.suites),
  last_log_removed: ((doc._ratchet_log || []).slice(-1)[0] || {}).removed });

/* FAIL ARM for the control immediately above — an empty `suites` with NO
 * ratchet-log evidence is the accident case and must be rejected. Without
 * this, the clause that permits the empty state could permit anything. */
{
  const declared = d => Array.isArray(d.suites)
    && ((d.suites || []).length > 0
      || (Array.isArray(d._ratchet_log) && d._ratchet_log.length > 0
        && Array.isArray((d._ratchet_log[d._ratchet_log.length - 1] || {}).removed)
        && d._ratchet_log[d._ratchet_log.length - 1].removed.length > 0));
  ck('FAIL ARM — an empty baseline with no ratchet-log entry is REJECTED, and a '
    + 'missing `suites` key is rejected too, so "empty is allowed" cannot '
    + 'become "anything is allowed"',
  declared({ suites: [], _ratchet_log: [{ removed: ['x'] }] }) === true
    && declared({ suites: [], _ratchet_log: [] }) === false
    && declared({ suites: [], _ratchet_log: [{ removed: [] }] }) === false
    && declared({ _ratchet_log: [{ removed: ['x'] }] }) === false);
}
ck('CONTROL — suites were actually found on disk to compare against',
  onDisk.size > 100, { on_disk: onDisk.size });
ck('CONTROL — the baseline is a strict SUBSET of the suites that exist, so the '
  + 'two sets are genuinely comparable rather than disjoint',
listed.length < onDisk.size, { listed: listed.length, on_disk: onDisk.size });

// ── ROT 1: an entry that names no suite
{
  const ghosts = listed.filter(n => !onDisk.has(n));
  ck('every baselined name is a REAL suite — a renamed or deleted suite whose '
    + 'entry stayed behind matches nothing forever, and a rename would become a '
    + 'way to launder a failure',
  ghosts.length === 0, { ghosts: ghosts });
}

// ── ROT 2: the file must carry its own reason
{
  ck('the baseline states WHEN it was taken, so its age is visible rather than '
    + 'inferred', typeof doc._baseline_taken === 'string'
    && /\d{4}-\d{2}-\d{2}/.test(doc._baseline_taken), doc._baseline_taken);
  ck('and it states in its own text that it never makes CI pass — the one '
    + 'misreading that would turn this mechanism into the decay it was built to '
    + 'stop', JSON.stringify(doc._rules || []).toLowerCase().indexOf('never makes ci pass') >= 0,
  doc._rules);
  ck('the declared count matches the list, so the two cannot drift apart',
    doc.count === listed.length, { count: doc.count, listed: listed.length });
}

// ── ROT 3: no duplicates, sorted, so a diff on this file is readable
{
  const dupes = listed.filter((n, i) => listed.indexOf(n) !== i);
  ck('no duplicate entries — a name listed twice hides a removal',
    dupes.length === 0, dupes);
  const sorted = listed.slice().sort();
  ck('kept sorted, so adding or removing one shows as a one-line diff rather '
    + 'than a reshuffle nobody reads',
  JSON.stringify(listed) === JSON.stringify(sorted));
}

// ── FAIL ARM: the ghost check must be able to fire
/* A guard nobody has seen go red is an assumption. This one spends its life
 * passing, so it proves on demand that it can fail. */
{
  const withGhost = listed.concat(['a_suite_that_does_not_exist']);
  const ghosts = withGhost.filter(n => !onDisk.has(n));
  ck('FAIL ARM — inserting a name that is not a suite IS detected, so the check '
    + 'above is load-bearing rather than decorative',
  ghosts.length === 1 && ghosts[0] === 'a_suite_that_does_not_exist', ghosts);
}

// ── AND THE CHECKER ITSELF STILL PROVES ITSELF
{
  const { compare } = require(path.join(ROOT, 'draft', 'tools', 'suite_baseline_check.js'));
  const r = compare(['x'], ['y']);
  ck('suite_baseline_check.compare is importable and discriminates — a new name '
    + 'reads as fresh and a vanished one as fixed',
  r.fresh.length === 1 && r.fresh[0] === 'x'
    && r.fixed.length === 1 && r.fixed[0] === 'y', r);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('FAILED'); process.exit(1); }

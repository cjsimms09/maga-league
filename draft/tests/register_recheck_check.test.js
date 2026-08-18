/* TERRITORY: relay
 *
 * The enforcer for Cory's 2026-08-17 complaint — "tons of findings but no one
 * is following up or acting on any of them" — is only worth having if it can
 * actually fail. Every check here has a fail arm, because a nagging tool that
 * never nags is worse than none: it looks like accountability.
 */
'use strict';

const assert = require('assert');
const R = require('../tools/register_recheck_check.js');

let pass = 0;
function ok(name, fn) { fn(); pass++; console.log('PASS  ' + name); }

const HEADER = '| # | what | owner | status | next action |\n|---|---|---|---|---|\n';
const md = body => HEADER + body;

ok('FAIL ARM — an OPEN row past its recheck date is caught', () => {
  const a = R.audit(md('| 9a | something broken | C | OPEN | fix it, recheck 08-01 |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 1, 'an overdue open row must be flagged');
  assert.strictEqual(a.overdue[0].due, '2026-08-01');
});

ok('CONTROL — the same row BEFORE its date is not flagged', () => {
  const a = R.audit(md('| 9a | something broken | C | OPEN | fix it, recheck 08-19 |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 0,
    'a row whose date has not arrived must not fire — a check that fires on '
    + 'everything gets muted, which is the failure mode being guarded against');
});

ok('CONTROL — a CLOSED row past its date is not flagged', () => {
  const a = R.audit(md('| 9a | fixed already | C | ✅ CLOSED | shipped, recheck 08-01 |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 0, 'closing a defect must not keep nagging');
});

ok('FAIL ARM — "closed" in the PROSE does not exempt an open row', () => {
  const a = R.audit(md('| 9a | we CLOSED the loop on this ages ago | C | OPEN | recheck 08-01 |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 1,
    'only the STATUS CELL may exempt a row. If prose could, any row could talk '
    + 'its way out of the check by describing itself as done.');
});

ok('an OPEN row with NO recheck date is reported, never failed on', () => {
  const a = R.audit(md('| 9a | broken, no date | C | OPEN | somebody look at it |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 0, 'undated rows must not fail the build yet');
  assert.strictEqual(a.undated.length, 1, 'but they MUST be counted and surfaced, '
    + 'or the hole is invisible');
});

ok('the LIVE register parses, and is green today', () => {
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(
    path.join(__dirname, '..', '..', 'DEFECT-REGISTER.md'), 'utf8');
  const a = R.audit(text, '2026-08-17');
  assert(a.all.length > 20, 'should parse the real register, got ' + a.all.length);
  assert(a.dated.length > 0, 'the real register must carry SOME recheck dates, or '
    + 'this check is decorative on the file it was built for');
  assert.strictEqual(a.overdue.length, 0,
    'nothing should be overdue on the day this shipped — if this fails on 08-17 '
    + 'the check was mis-built, not the register');
});

ok('CONTROL — the LIVE register DOES go red at a future date, so it is not vacuous', () => {
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(
    path.join(__dirname, '..', '..', 'DEFECT-REGISTER.md'), 'utf8');
  const later = R.audit(text, '2026-09-01');
  assert(later.overdue.length > 0,
    'by 2026-09-01 every recheck date in the register has passed, so this MUST '
    + 'report overdue rows. If it does not, the check cannot fire on the real '
    + 'file and its green today means nothing.');
});

console.log(`\n${pass}/7 checks passed`);

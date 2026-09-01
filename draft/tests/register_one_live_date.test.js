'use strict';
/* TERRITORY: A.  ONE OPEN ROW, ONE LIVE RECHECK DATE (register 456).
 *
 * `recheckOf` takes the LAST date in a row, deliberately. That precedence is
 * correct and it is also a trap: an owner who rolls a date and leaves the OLD
 * one in place has changed nothing if the old one happens to sit later in the
 * prose, and the roll is silent either way. Which date governs then depends on
 * cell ORDERING rather than on anybody's decision.
 *
 * Row 307 is the recorded instance (rolled 08-31 -> 09-04, old date left live).
 * Sweeping the whole register on 2026-09-01 found FOUR more — 147, 193, 400,
 * 404 — none of which anybody had noticed.
 *
 * ⚠️ THIS IS A RATCHET ON A CLEAN STATE. The count is zero as it lands. Its
 * value is that it goes red on the day the next one appears rather than
 * whenever somebody happens to sweep, which is how all five got there.
 *
 * Run: node draft/tests/register_one_live_date.test.js
 */
const fs = require('fs');
const path = require('path');
const M = require('../tools/register_recheck_check.js');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const HDR = '| id | finding | owner | status | action |\n|---|---|---|---|---|\n';
const amb = t => M.audit(HDR + t, '2026-09-01').ambiguous;

// ── THE FAIL ARM FIRST. A guard that has only ever printed success has not
//    been tested, only run (rule 3e) — and this one is asserted to find NOTHING
//    on the live register below, which is exactly the shape that hides a probe
//    that can never fire.
ck('FAIL ARM — two DIFFERENT live dates in one open row FIRE',
  amb('| Z1 | a finding | A | OPEN | rolled it: recheck 09-04 but also recheck 09-20 |\n').length === 1);

ck('CONTROL — demoting the old one to `recheck WAS` clears it, which is the '
   + 'register\'s existing convention and therefore the documented fix',
  amb('| Z2 | a finding | A | OPEN | rolled it: recheck WAS 09-04, recheck 09-20 |\n').length === 0);

ck('CONTROL — the SAME date twice is not ambiguous and must not fire; a date '
   + 'quoted in prose is not a second decision',
  amb('| Z3 | a finding | A | OPEN | recheck 09-20, and again recheck 09-20 |\n').length === 0);

ck('CONTROL — a CLOSED row is out of scope: its dates are history',
  amb('| Z4 | a finding | A | ✅ CLOSED | recheck 09-04 and recheck 09-20 |\n').length === 0);

ck('CONTROL — the year-qualified form is recognised too, or a row written '
   + '`recheck 2026-09-20` would evade this guard entirely',
  amb('| Z5 | a finding | A | OPEN | recheck 2026-09-04 then recheck 2026-09-20 |\n').length === 1);

// ── AND THE LIVE REGISTER, WHICH IS THE RATCHET ────────────────────────────
const live = M.audit(fs.readFileSync(path.join(ROOT, 'DEFECT-REGISTER.md'), 'utf8'),
  new Date().toISOString().slice(0, 10));
ck('CONTROL — the register parsed into a real set of open rows, so a clean '
   + 'result below is not an empty scan',
  live.open.length > 100, { open: live.open.length });
ck('no OPEN row in the register carries two different live recheck dates',
  live.ambiguous.length === 0,
  live.ambiguous.map(x => [x.r.id, x.dates]));

console.log('\n' + pass + '/' + (pass + fail) + ' one-live-date arms passed');
process.exit(fail ? 1 : 0);

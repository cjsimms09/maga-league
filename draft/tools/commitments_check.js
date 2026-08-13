/* PART THREE'S CLOSURE: A DATE, AND A CHECK THAT FIRES IF THE DATE PASSES.
 *
 * Every row in draft/data/commitments.json carries a due date and a mechanical
 * verification. This runs all of them and applies the one rule that matters:
 *
 *   NOT MET and the date has PASSED  ->  OVERDUE, and this exits non-zero.
 *   NOT MET and the date is ahead    ->  pending, and that is fine.
 *   MET                              ->  held.
 *   CANNOT DETERMINE                 ->  treated as NOT MET, always.
 *
 * THE LAST LINE IS THE ONE THAT KEEPS THIS HONEST. An unreadable artifact, a
 * check that throws, a file that moved — every one of those has to count as
 * unmet, because "I could not look" rendered as "fine" is the exact failure
 * this whole mechanism exists to end. C's standing check states the same rule
 * as BLIND IS NOT QUIET; this is the same rule for commitments.
 *
 * AND IT IS A GATE, NOT A REPORTER. standing_check.py exits 0 always by design
 * — it watches archives and escalates through a marker. This does the opposite,
 * because a commitment that slips silently is indistinguishable from one that
 * was never made. A warning that is always printed is a warning nobody reads;
 * that is precisely how integrate.sh let thirty merges land on a red main.
 *
 * THE CLOCK IS AN ARGUMENT, NOT A CALL. `--today=YYYY-MM-DD` so the overdue
 * behaviour is testable without waiting for a date to arrive — a check whose
 * firing condition cannot be exercised is a check nobody has seen fire.
 *
 * Run: node draft/tools/commitments_check.js [--today=YYYY-MM-DD] [--quiet]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { CHECKS } = require(path.join(__dirname, 'commit_verify.js'));

const arg = n => {
  const a = process.argv.find(x => x.indexOf('--' + n + '=') === 0);
  return a ? a.split('=')[1] : null;
};
const TODAY = arg('today') || new Date().toISOString().slice(0, 10);
const QUIET = process.argv.indexOf('--quiet') >= 0;

let reg;
try {
  reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'commitments.json'), 'utf8'));
} catch (e) {
  console.log('CANNOT READ draft/data/commitments.json: ' + e.message);
  console.log('An unreadable registry is not an empty one. Failing.');
  process.exit(2);
}

const rows = reg.commitments || [];
if (!rows.length) {
  console.log('THE REGISTRY IS EMPTY. That is not a pass — a commitments check with');
  console.log('nothing to check is the vacuous-green shape this file exists to avoid.');
  process.exit(2);
}

const STATE = ['MET', 'NOT MET', 'CANNOT DETERMINE'];
const results = rows.map(row => {
  let r;
  if (!CHECKS[row.id]) {
    r = { code: 2, why: 'no verification is implemented for this id — a row with a '
      + 'date and no check is the intention-with-no-trigger this file exists to catch' };
  } else {
    try { r = CHECKS[row.id](); }
    catch (e) { r = { code: 2, why: 'check threw: ' + e.message }; }
  }
  const overdue = r.code !== 0 && String(row.due) < TODAY;
  return Object.assign({}, row, { code: r.code, why: r.why, overdue: overdue });
});

console.log('COMMITMENTS — a date and a check that fires if the date passes\n');
console.log('  today: ' + TODAY + (arg('today') ? '   (supplied, not the clock)' : '') + '\n');

const width = Math.max.apply(null, results.map(r => r.id.length));
results.forEach(r => {
  const tag = r.overdue ? '*** OVERDUE' : (r.code === 0 ? '   held   ' : '   pending');
  console.log('  ' + tag + ' ' + r.id.padEnd(width + 2) + 'due ' + r.due
    + '   ' + STATE[r.code]);
  if (!QUIET) console.log('      ' + r.why);
});

const overdue = results.filter(r => r.overdue);
const held = results.filter(r => r.code === 0);
const pending = results.filter(r => r.code !== 0 && !r.overdue);
const undet = results.filter(r => r.code === 2);

console.log('\n  ' + held.length + ' held, ' + pending.length + ' pending, '
  + overdue.length + ' OVERDUE'
  + (undet.length ? '   (' + undet.length + ' could not be determined, counted as unmet)' : ''));

if (overdue.length) {
  console.log('\n  OVERDUE COMMITMENTS — the date passed and the check does not hold:');
  overdue.forEach(r => {
    console.log('    · ' + r.id + ' (item ' + r.item + ', due ' + r.due + ', owner ' + r.owner + ')');
    console.log('      ' + r.what);
    console.log('      why that date: ' + r.why_that_date);
  });
  process.exit(1);
}
console.log('\n  Nothing is overdue. Pending rows are not failures — they have not come due.');
process.exit(0);

'use strict';
// TERRITORY: relay. Pins the ledger regression guard: a grade on main never
// silently reverts to OPEN. Real-history control: e9110671f is a main commit
// where P143's lost grade was still live — the guard must fire there forever.
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { regressions, fingerprint } = require(path.join(ROOT, 'draft', 'tools', 'ledger_regression_guard.js'));
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const CLAIM = 'the lineup tool binding constraint is projection quality not decision logic at all';
const fp = fingerprint(CLAIM);
const term = new Map([['P143|' + fp, 'GRADED']]);
const row = (id, claim, status, result) => `| ${id} | ${claim} | 08-20 | D | 09-01 | ${status} | ${result} | x |\n`;

ck('lost grade flags', regressions(term, row('P143', CLAIM, '🟡 OPEN', '—')).length === 1);
ck('intact grade passes', regressions(term, row('P143', CLAIM, 'GRADED', 'FALSE')).length === 0);
ck('same id, DIFFERENT claim (post-reconciliation reuse) passes',
  regressions(term, row('P143', 'a completely different row that inherited the id later on', '🟡 OPEN', '—')).length === 0);
ck('visible re-open passes', regressions(term, row('P143', CLAIM, '🟡 OPEN', 'REOPENED — new data invalidated the fold')).length === 0);
ck('never-graded row passes', regressions(term, row('P999', 'some brand new prediction never graded before now here', '🟡 OPEN', '—')).length === 0);

// real history, both arms
function guardExit(rev) {
  try {
    execFileSync('node', [path.join(ROOT, 'draft', 'tools', 'ledger_regression_guard.js')].concat(rev ? [rev] : []),
      { cwd: ROOT, stdio: 'pipe' });
    return 0;
  } catch (e) { return e.status == null ? -1 : e.status; }
}
let hasHist = true;
try { execFileSync('git', ['cat-file', '-e', 'e9110671f'], { cwd: ROOT, stdio: 'pipe' }); }
catch (e) { hasHist = false; console.log('SKIP real-history checks (shallow clone)'); }
if (hasHist) {
  ck('KNOWN-POSITIVE: the P143 loss fires at its historical rev', guardExit('e9110671f') === 1);
  ck('HEAD is green (the restore holds)', guardExit(null) === 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

'use strict';
// TERRITORY: relay. Pins the mailbox deletion guard's contract on REAL
// history, not synthetic strings alone: the register-190 clobber must fire
// forever, and the five legitimate operation classes must pass forever.
// If git history is unavailable (shallow clone), the synthetic half still runs.
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { check } = require(path.join(ROOT, 'draft', 'tools', 'mailbox_deletion_guard.js'));
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// ── synthetic contract ──
const row = (box, txt) => `- [${box}] 2026-08-21 · relay → A · ${txt}\n`;
ck('deletion flags', check(row(' ', 'KEEP ME AROUND FOR A GOOD WHILE LONGER'), '').lost.length === 1);
ck('append passes', check(row(' ', 'OLD'), row(' ', 'OLD') + row(' ', 'NEW ROW HERE')).lost.length === 0);
ck('plain tick passes', check(row(' ', 'SAME HEADLINE TEXT ALL ALONG'), row('x', 'SAME HEADLINE TEXT ALL ALONG')).lost.length === 0);
{ // closing rewrite: same prefix, new headline — pairs off
  const r = check(row(' ', 'TWO FINDABILITY FIXES FROM THE AUDIT'), row('x', 'BOTH ALREADY FIXED, CLOSING WITH POINTER'));
  ck('1-for-1 closing rewrite passes', r.lost.length === 0 && r.renumbered.length === 1);
}
{ // pairing must NOT absorb a real deletion: two rows in, one rewritten out
  const before = row(' ', 'FIRST ROW ABOUT THE BOARD PIPELINE') + row(' ', 'SECOND ROW ABOUT THE CAPTURE CRON');
  const r = check(before, row('x', 'A REWRITE OF JUST ONE OF THEM HERE'));
  ck('pairing never absorbs a real deletion', r.lost.length === 1, JSON.stringify(r));
}
{ // table-row renumber with surviving content passes; true removal flags
  const t = '| P250 | the REAL_VONA re-run under the include-self fix, prereg section 18 | x |\n';
  const renamed = '| P283 | *(provenance note)* the REAL_VONA re-run under the include-self fix, prereg section 18 | x |\n';
  ck('renumber-with-content passes', check(t, renamed).lost.length === 0);
  ck('table-row removal flags', check(t, '').lost.length === 1);
}

// ── real history (the reason this guard exists) ──
function guardExit(from, to) {
  try {
    execFileSync('node', [path.join(ROOT, 'draft', 'tools', 'mailbox_deletion_guard.js'), from, to],
      { cwd: ROOT, stdio: 'pipe' });
    return 0;
  } catch (e) { return e.status == null ? -1 : e.status; }
}
let hasHist = true;
try { execFileSync('git', ['cat-file', '-e', '57a4a95ea~1'], { cwd: ROOT, stdio: 'pipe' }); }
catch (e) { hasHist = false; console.log('SKIP real-history checks (shallow clone)'); }
if (hasHist) {
  ck('KNOWN-POSITIVE: the register-190 clobber fires', guardExit('57a4a95ea~1', '57a4a95ea') === 1);
  // MODE 2: fd33cd15 emptied 15 preregs/audits to zero bytes while claiming
  // to publish one prereg — the artifact-file class row-guarding cannot see.
  ck('KNOWN-POSITIVE: the fd33cd15 artifact-emptying fires', guardExit('fd33cd15~1', 'fd33cd15') === 1);
  ck('known-negative: the 88KB restore passes', guardExit('029478a5~1', '029478a5') === 0);
  ck('known-negative: E reconciliation merge passes', guardExit('712f1e6ca~1', '712f1e6ca') === 0);
  ck('known-negative: B closing rewrite passes', guardExit('24d18dbe4~1', '24d18dbe4') === 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

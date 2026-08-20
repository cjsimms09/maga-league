// TERRITORY: relay
// A MERGE THAT REVERTS A CLOSED FIX MUST BE VISIBLE BEFORE IT HAPPENS.
//
// The incident: `claude/in-season-surface-fixes-6nyayc` carries the PRE-FIX
// `src/dashboard.js` — `configured: true` as a literal — while `main` carries
// register 42's close and register 5m's. Merging it naively puts both back, and
// the revert is INVISIBLE: the pinned league-wide alert keeps showing the right
// date, it just returns to announcing a fallback with the authority of a ruling.
//
// What needs testing is the DISCRIMINATION, not the diffing. Across a
// 1,700-commit divergence, hundreds of files change on both sides — so the
// both-sides clause alone flags almost everything, and the register filter is
// the entire signal. That was learned the hard way: the tool's first control
// asserted a BRANCH-ONLY file existed in that pair, and it does not. Every file
// that branch touched was touched on main too.
//
// Run: node draft/tests/reopen_risk.test.js
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'draft', 'tools', 'reopen_risk.js'));

let pass = 0;
function ok(name, fn) { fn(); console.log('PASS  ' + name); pass++; }

const row = (id, status, body) => '| ' + id + ' | ' + body + ' | **A** | ' + status + ' | next action |';

// ── 1. WHICH ROWS COUNT ───────────────────────────────────────────────────
ok('a row closed TODAY that names a real file is picked up', () => {
  const rows = R.recentlyClosedRows(
    row('9a', '✅ CLOSED 08-18', 'fixed `src/dashboard.js` at last'), '2026-08-18', 7);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0].files, ['src/dashboard.js']);
});

ok('FAIL ARM — an OPEN row is not picked up. This check is about protecting '
  + 'fixes that landed; an open row has no fix on main to revert', () => {
  assert.deepStrictEqual(R.recentlyClosedRows(
    row('9b', '🔴 OPEN', 'broken in `src/dashboard.js`'), '2026-08-18', 7), []);
});

ok('a close older than the window drops out — an old fix has long since '
  + 'propagated into every live branch, and reporting it is the noise that '
  + 'gets a check switched off', () => {
  const old = row('9c', '✅ CLOSED 07-01', 'fixed `src/dashboard.js`');
  assert.deepStrictEqual(R.recentlyClosedRows(old, '2026-08-18', 7), []);
  //: and the SAME row is in scope with a wide enough window, so the filter is
  //: the date rather than a parse that silently failed
  assert.strictEqual(R.recentlyClosedRows(old, '2026-08-18', 90).length, 1);
});

ok('a row naming NO real file yields nothing, and a path that does not exist on '
  + 'disk is discarded — the rows are prose, and an invented path matches no '
  + 'branch, which is how a checker prints a confident clean nothing', () => {
  assert.deepStrictEqual(R.recentlyClosedRows(
    row('9d', '✅ CLOSED 08-18', 'fixed `src/does_not_exist_anywhere.js`'), '2026-08-18', 7), []);
  assert.deepStrictEqual(R.recentlyClosedRows(
    row('9e', '✅ CLOSED 08-18', 'fixed the draftAnnouncement function'), '2026-08-18', 7), []);
});

ok('an UNDATED close stays in scope — we cannot tell recent from ancient, and '
  + 'the safe direction is inclusion: it can only add a row to a report', () => {
  assert.strictEqual(R.recentlyClosedRows(
    row('9f', '✅ CLOSED', 'fixed `src/dashboard.js`'), '2026-08-18', 7).length, 1);
});

// ── 2. THE FILTER THAT IS THE WHOLE SIGNAL ────────────────────────────────
const guarded = new Map([['src/dashboard.js', ['5m', '42']]]);

ok('a both-sides-changed file behind a recent close is flagged, and it is the '
  + 'only one — the other two files changed identically and carry no fix', () => {
  const risky = R.riskyFiles(
    ['src/dashboard.js', 'public/css/style.css', 'views/draft.ejs'], guarded);
  assert.deepStrictEqual(risky, ['src/dashboard.js']);
});

ok('FAIL ARM — with an EMPTY guard map nothing is flagged, however many files '
  + 'changed. A detector that flags every touched file has told you nothing, '
  + 'which is exactly what the both-sides clause alone does here', () => {
  assert.deepStrictEqual(
    R.riskyFiles(['src/dashboard.js', 'public/css/style.css'], new Map()), []);
});

ok('MAILBOXES ARE EXCLUDED — ROUTES.md is edited by every lane every day, so it '
  + 'is both-sides-changed on every branch. The first real run flagged it on 4 '
  + 'of 7 and the report was mostly that; reverting a mailbox is a different '
  + 'failure with its own guard (merge_completeness.py, register 5o)', () => {
  const m = new Map([['ROUTES.md', ['5p']], ['src/dashboard.js', ['5m']]]);
  assert.deepStrictEqual(R.riskyFiles(['ROUTES.md', 'src/dashboard.js'], m),
    ['src/dashboard.js']);
  assert.ok(R.MAILBOXES.has('DEFECT-REGISTER.md'));
  assert.ok(R.MAILBOXES.has('PREDICTION-LEDGER.md'));
  assert.ok(!R.MAILBOXES.has('src/dashboard.js'), 'a source file is not a mailbox');
});

// ── 3. THE REAL REPO, PINNED SO IT CANNOT DECAY ───────────────────────────
ok('CONTROL — the REAL incident still reproduces from immutable commits: '
  + 'src/dashboard.js changed on both sides of b26e1713 vs 92c9d4de. Pinned to '
  + 'SHAs rather than branch names, because the branch merges and the name '
  + 'moves — the bug that killed the first weight-drift control', () => {
  const both = R.bothSidesChanged('b26e1713', '92c9d4de');
  assert.ok(both.includes('src/dashboard.js'), 'the incident no longer reproduces');
  //: the precondition that makes the arms above comparable at all
  assert.ok(both.includes('public/css/style.css'),
    'both control files must be both-sides-changed, or the arms differ by more '
    + 'than the register filter');
});

ok('CONTROL — the LIVE register really does yield guarded files, so a clean '
  + 'sweep is a measurement rather than a failed read', () => {
  const fs = require('fs');
  const text = fs.readFileSync(path.join(ROOT, 'DEFECT-REGISTER.md'), 'utf8');
  const rows = R.recentlyClosedRows(text, new Date().toISOString().slice(0, 10), 90);
  assert.ok(rows.length > 5, 'only ' + rows.length + ' closed rows named a real file');
  assert.ok(rows.some((r) => r.files.some((f) => f.endsWith('.js'))));
});

console.log('\n' + pass + '/' + pass + ' checks passed');

// TERRITORY: relay
// THE BACKLOG NUMBER THE RELAY QUOTES TO CORY MUST NOT COUNT WORK THAT IS DONE.
//
// Register-grade history: on 2026-08-18 the relay answered *"how's the queue
// looking?"* with unticked-item counts read off `main`. Correct arithmetic,
// wrong answer — four lanes were clearing on unmerged branches. B had to say so
// in a commit message ("flag the babysitting report's B numbers as merge-stale,
// not real backlog"), which is a lane correcting the relay's report of that
// lane. Measured with this tool the same night: B read 32 open on `main` and was
// truly 13; D read 14 and was truly 8.
//
// So what gets tested is the DISCRIMINATION, both directions: a branch-only tick
// must reconcile, and a branch that agrees with main must reconcile nothing. A
// reconciler that reconciles everything understates the backlog exactly as badly
// as `main` alone overstates it.
//
// Run: node draft/tests/routes_branch_reconcile.test.js
'use strict';
const path = require('path');
const assert = require('assert');
const R = require(path.join(__dirname, '..', 'tools', 'routes_branch_reconcile.js'));

let pass = 0;
function ok(name, fn) { fn(); console.log('PASS  ' + name); pass++; }

const doc = (a, b) => ['## TO: A', '',
  '- [' + a + '] 2026-08-18 · relay → A · ship the first thing',
  '- [' + b + '] 2026-08-18 · relay → A · ship the second thing', ''].join('\n');

ok('a tick that exists ONLY on a branch is reconciled, and the branch is named '
  + '— the fix for a stale count is a merge, and the report must say which', () => {
  const r = R.reconcile(doc(' ', ' '), [{ branch: 'lane/x', text: doc('x', ' ') }]).A;
  assert.strictEqual(r.open, 2);
  assert.strictEqual(r.reconciled.length, 1);
  assert.strictEqual(r.trueOpen, 1);
  assert.strictEqual(r.reconciled[0].branch, 'lane/x');
});

ok('FAIL ARM — a branch identical to main reconciles NOTHING. A tool that '
  + 'clears items merely because a branch mentions them would report an idle '
  + 'lane as a finished one, which is the same lie pointing the other way', () => {
  const r = R.reconcile(doc(' ', ' '), [{ branch: 'lane/x', text: doc(' ', ' ') }]).A;
  assert.strictEqual(r.reconciled.length, 0);
  assert.strictEqual(r.trueOpen, 2);
});

ok('an item ALREADY ticked on main is never counted as open, so it cannot be '
  + 'double-counted as reconciled either', () => {
  const r = R.reconcile(doc('x', ' '), [{ branch: 'lane/x', text: doc('x', 'x') }]).A;
  assert.strictEqual(r.open, 1);
  assert.strictEqual(r.reconciled.length, 1);
  assert.strictEqual(r.trueOpen, 0);
});

ok('identity is the TEXT, not the position — a merge that re-orders a section '
  + 'must not read as every item being different', () => {
  const reordered = ['## TO: A', '',
    '- [x] 2026-08-18 · relay → A · ship the second thing',
    '- [ ] 2026-08-18 · relay → A · ship the first thing', ''].join('\n');
  const r = R.reconcile(doc(' ', ' '), [{ branch: 'lane/x', text: reordered }]).A;
  assert.strictEqual(r.reconciled.length, 1);
  assert.strictEqual(r.reconciled[0].text.includes('second thing'), true);
});

ok('A DUPLICATED ITEM WHERE EITHER COPY IS TICKED COUNTS AS DONE — the 08-18 '
  + 'union-merge repair found a 5,884-char UNTICKED copy of an item whose '
  + '1,065-char twin was ticked, and reading that pair as open re-dispatches an '
  + 'ask the lane already answered', () => {
  const dupe = ['## TO: A', '',
    '- [ ] 2026-08-18 · relay → A · ship the first thing',
    '- [x] 2026-08-18 · relay → A · ship the first thing', ''].join('\n');
  const lanes = R.parseRoutes(dupe);
  const keys = Object.keys(lanes.A);
  assert.strictEqual(keys.length, 1, 'the two copies must collapse to one item');
  assert.strictEqual(lanes.A[keys[0]].ticked, true);
});

ok('lanes are kept separate — the same ask sent to two lanes is two items, and '
  + 'B ticking it must not close it for C', () => {
  const mainDoc = ['## TO: B', '', '- [ ] relay → x · do the thing', '',
    '## TO: C', '', '- [ ] relay → x · do the thing', ''].join('\n');
  const branch = ['## TO: B', '', '- [x] relay → x · do the thing', '',
    '## TO: C', '', '- [ ] relay → x · do the thing', ''].join('\n');
  const r = R.reconcile(mainDoc, [{ branch: 'lane/x', text: branch }]);
  assert.strictEqual(r.B.trueOpen, 0);
  assert.strictEqual(r.C.trueOpen, 1);
});

ok('a branch with no ROUTES.md at all (empty text) is harmless, not a crash — '
  + 'dispatch branches carry no mailbox', () => {
  const r = R.reconcile(doc(' ', ' '), [{ branch: 'sleeper-dispatch', text: '' }]).A;
  assert.strictEqual(r.trueOpen, 2);
});

ok('CONTROL — the REAL ROUTES.md on main parses into real lanes, so a clean '
  + 'reconcile is a measurement rather than a failed read', () => {
  const { execSync } = require('child_process');
  const text = execSync('git show origin/main:ROUTES.md', {
    cwd: path.join(__dirname, '..', '..'), encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
  });
  const lanes = R.parseRoutes(text);
  assert.ok(Object.keys(lanes).length >= 4, 'fewer than 4 lanes parsed: ' + Object.keys(lanes));
  const total = Object.values(lanes).reduce((n, l) => n + Object.keys(l).length, 0);
  assert.ok(total > 100, 'only ' + total + ' items parsed from the real mailbox');
});

console.log('\n' + pass + '/' + pass + ' checks passed');

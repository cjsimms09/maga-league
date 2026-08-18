// TERRITORY: relay
/* THE GATE THAT RAN IN CI WITH NO TEST AT ALL.
 *
 * Found 2026-08-18, NOT by anything failing — by asking the question ledger P69
 * asks: which of our gates has never been seen to fail? Seven tools run as gates
 * in CI. Five had a test file carrying a fail arm. `commitments_check.js` and
 * `weekly_grade_runner.js` had no test file whatsoever.
 *
 * `weekly_grade_runner.js` turned out to carry its OWN fixture self-check against
 * real 2023 box scores, hand-summed — that is a fail arm, just not in a test file,
 * and it is why this file covers the other one.
 *
 * `commitments_check.js` is the pure case, and the way it fails is worse than an
 * oversight: its own header says
 *
 *     "THE CLOCK IS AN ARGUMENT, NOT A CALL. `--today=YYYY-MM-DD` so the overdue
 *      behaviour is testable without waiting for a date to arrive — a check whose
 *      firing condition cannot be exercised is a check nobody has seen fire."
 *
 * The author saw the problem, built the hook, wrote the sentence — and no test
 * ever used it. The affordance existed and was never exercised. That is the same
 * shape as a check that cannot fail, one level up.
 *
 * Every arm below runs the REAL script as a subprocess and reads its real exit
 * code. Nothing here re-implements the logic, because a copy of the logic passing
 * is not evidence about the gate.
 *
 * Run: node draft/tests/commitments_check.test.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'draft', 'tools', 'commitments_check.js');

let pass = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('PASS  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
};

function run(args, env) {
  return spawnSync('node', [TOOL].concat(args || []), {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, env || {}),
  });
}

function withRegistry(obj, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-'));
  const f = path.join(dir, 'commitments.json');
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  try { return fn(f); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ── THE FIRING CONDITION, FINALLY EXERCISED ─────────────────────────────────

ok('FAIL ARM — a due date in the past with the check unmet is OVERDUE and exits 1', () => {
  // The whole point of the tool. Never once run before today.
  const r = run(['--today=2027-06-01', '--quiet']);
  assert.strictEqual(r.status, 1, 'exit ' + r.status + ':\n' + r.stdout);
  assert.ok(/OVERDUE COMMITMENTS/.test(r.stdout), r.stdout.slice(-400));
});

ok('CONTROL — the same unmet rows are NOT overdue before their dates, and exit 0', () => {
  // Without this the arm above proves only that the tool can exit 1 somehow.
  const r = run(['--today=2020-01-01', '--quiet']);
  assert.strictEqual(r.status, 0, 'exit ' + r.status + ':\n' + r.stdout);
  assert.ok(/Nothing is overdue/.test(r.stdout));
});

ok('CONTROL — today with no argument is the real clock, and the repo is green', () => {
  const r = run(['--quiet']);
  assert.strictEqual(r.status, 0, r.stdout.slice(-400));
});

// ── "BLIND IS NOT QUIET" — the arms that need the path override ──────────────

ok('FAIL ARM — an UNREADABLE registry exits 2, because "I could not look" is not "fine"', () => {
  const r = run(['--quiet'], { COMMITMENTS_PATH: path.join(os.tmpdir(), 'no-such-file.json') });
  assert.strictEqual(r.status, 2, 'exit ' + r.status + ':\n' + r.stdout);
  assert.ok(/CANNOT READ/.test(r.stdout), r.stdout);
});

ok('FAIL ARM — MALFORMED JSON exits 2 rather than being read as an empty registry', () => {
  withRegistry('{ not json at all', (f) => {
    const r = run(['--quiet'], { COMMITMENTS_PATH: f });
    assert.strictEqual(r.status, 2, 'exit ' + r.status + ':\n' + r.stdout);
  });
});

ok('FAIL ARM — an EMPTY registry exits 2: the vacuous green this file exists to end', () => {
  withRegistry({ commitments: [] }, (f) => {
    const r = run(['--quiet'], { COMMITMENTS_PATH: f });
    assert.strictEqual(r.status, 2, 'exit ' + r.status + ':\n' + r.stdout);
    assert.ok(/REGISTRY IS EMPTY/.test(r.stdout), r.stdout);
  });
});

// ── A ROW WITH A DATE AND NO CHECK IS THE INTENTION-WITH-NO-TRIGGER ─────────

ok('FAIL ARM — a row whose id has NO implemented check counts as UNMET, never MET', () => {
  // The failure this would otherwise become: add a commitment, forget the
  // verification, and the registry reports it held forever.
  withRegistry({ commitments: [{
    id: 'a-commitment-nobody-implemented', due: '2020-01-01', owner: 'relay',
    item: null, what: 'a promise with no trigger', why_that_date: 'in the past on purpose',
  }] }, (f) => {
    const r = run([], { COMMITMENTS_PATH: f });
    assert.strictEqual(r.status, 1, 'exit ' + r.status + ':\n' + r.stdout);
    assert.ok(/no verification is implemented/.test(r.stdout), r.stdout);
  });
});

ok('CONTROL — the SAME unimplemented row is merely pending while its date is ahead', () => {
  withRegistry({ commitments: [{
    id: 'a-commitment-nobody-implemented', due: '2099-01-01', owner: 'relay',
    item: null, what: 'a promise with no trigger', why_that_date: 'far ahead',
  }] }, (f) => {
    const r = run(['--quiet'], { COMMITMENTS_PATH: f });
    assert.strictEqual(r.status, 0, 'exit ' + r.status + ':\n' + r.stdout);
  });
});

ok('the default path is UNCHANGED when the override is absent', () => {
  // The override must be invisible to CI, or it is a new failure mode of its own.
  const r = run(['--quiet'], { COMMITMENTS_PATH: '' });
  assert.strictEqual(r.status, 0, r.stdout.slice(-300));
  assert.ok(/held/.test(r.stdout), r.stdout.slice(0, 300));
});

console.log(`\n${pass}/${pass} checks passed`);

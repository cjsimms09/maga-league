'use strict';
/**
 * Tests for the board-staleness check.
 *
 * The classifier is pure and takes injected timestamps, so most of these touch no git.
 * The two that DO are the ones worth having: they replay the real 08-18 incidents out
 * of this repository's actual history, which is a stronger control than any fixture —
 * a fixture proves the code does what I wrote, real history proves it would have caught
 * what actually happened.
 */
const assert = require('assert');
const { execSync } = require('child_process');
const B = require('../tools/board_input_staleness.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const T = 1000000;

// --- the classification ----------------------------------------------------------
{
  const r = B.classify(T, [
    { path: 'newer.py', time: T + 600 },
    { path: 'older.py', time: T - 600 },
    { path: 'exactly.py', time: T },
  ]);
  check('an input committed AFTER the board is stale',
    r.stale.length === 1 && r.stale[0].path === 'newer.py', JSON.stringify(r.stale));
  check('an input committed before it is not', r.fresh.some(f => f.path === 'older.py'));
  check('an input committed in the SAME second is not stale — a board built from it '
    + 'lands in that second too', r.fresh.some(f => f.path === 'exactly.py'));
  check('staleness is reported as a duration, not just a flag',
    r.stale[0].behindSeconds === 600, JSON.stringify(r.stale[0]));
}

// --- the ways it must not fire ---------------------------------------------------
{
  check('an input git knows nothing about is skipped, not counted as stale',
    B.classify(T, [{ path: 'ghost.py', time: null }]).stale.length === 0);
  check('with no board timestamp nothing is classified rather than everything',
    B.classify(null, [{ path: 'a.py', time: T + 1 }]).stale.length === 0);
  check('a clean board yields an EMPTY stale list, not an empty input list',
    (() => { const r = B.classify(T, [{ path: 'a.py', time: T - 1 }]);
             return r.stale.length === 0 && r.fresh.length === 1; })(),
    'if these ever agree at zero the check has gone blind');
}

// --- worst-first, because the biggest gap is the one to read ----------------------
{
  const r = B.classify(T, [
    { path: 'small.py', time: T + 60 },
    { path: 'huge.py', time: T + 99999 },
  ]);
  check('stale inputs sort by how far behind the board is',
    r.stale[0].path === 'huge.py');
}

// --- the input list itself, since a shrinking one fails silently -----------------
{
  check('the declared input list is not empty', B.INPUTS.length > 0);
  check('it names the two artifacts that actually went stale on 08-18',
    B.INPUTS.includes('draft/backtest/projection_error_calibration.json')
    && B.INPUTS.includes('draft/build.py'), JSON.stringify(B.INPUTS));
  const fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..', '..');
  const gone = B.INPUTS.filter(p => !fs.existsSync(path.join(ROOT, p)));
  check('every declared input still exists — a rename must not empty this list quietly',
    gone.length === 0, JSON.stringify(gone));
}

// --- KNOWN-POSITIVE against REAL history: both 08-18 incidents -------------------
function hasHistory(sha) {
  try { execSync('git cat-file -e ' + sha + '^{commit}', { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}
{
  // 073aadfc: A's keeper-vorp fix, 03:20:28Z, against a board built 02:03:30Z.
  // 62dd497b: the 03:49:25Z rebuild that resolved it.
  if (!hasHistory('073aadfc') || !hasHistory('62dd497b')) {
    console.log('SKIP  real-history controls (shallow clone — commits not present)');
  } else {
    const at = sha => {
      const inputs = B.INPUTS.map(p => ({ path: p, time: B.lastCommit(p, sha) }));
      return B.classify(B.lastCommit(B.BOARD, sha), inputs);
    };
    const before = at('073aadfc');
    check('KNOWN-POSITIVE — the keeper-vorp incident IS detected in real history',
      before.stale.some(s => s.path === 'draft/build.py'),
      JSON.stringify(before.stale.map(s => s.path)));
    check('  and it names how far behind the board was (77 minutes)',
      Math.round(before.stale.find(s => s.path === 'draft/build.py').behindSeconds / 60) === 77,
      JSON.stringify(before.stale[0]));

    const after = at('62dd497b');
    check('CONTROL — immediately after the rebuild the same check is CLEAN, so it '
      + 'discriminates rather than always firing',
      after.stale.length === 0, JSON.stringify(after.stale.map(s => s.path)));
  }
}

console.log('\n' + pass + '/' + (pass + fail) + ' board-staleness checks passed');
assert.strictEqual(fail, 0);

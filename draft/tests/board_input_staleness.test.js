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
  /* GLOB ENTRIES RESOLVE THE SAME INTENT BY A DIFFERENT MEANS, AND THE INTENT
   * IS THE WHOLE POINT: a declared input that matches NOTHING is the silent
   * emptying this check exists to prevent, and a glob can empty itself in one
   * more way than a literal path can — a directory rename leaves the pattern
   * syntactically valid and matching zero files, with nothing to see in a diff.
   * So a pattern must prove at least one real match, exactly as a literal must
   * prove the file is there. The data-store families were added 2026-08-19
   * (register 5r) after this list watched the CODE while the DATA moved. */
  const glob = (pat) => {
    const dir = path.join(ROOT, path.dirname(pat));
    if (!fs.existsSync(dir)) return [];
    const rx = new RegExp('^' + path.basename(pat)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return fs.readdirSync(dir).filter(f => rx.test(f));
  };
  const gone = B.INPUTS.filter(p => (p.includes('*')
    ? glob(p).length === 0
    : !fs.existsSync(path.join(ROOT, p))));
  check('every declared input still exists — a rename must not empty this list '
    + 'quietly, and a GLOB matching zero files counts as gone',
    gone.length === 0, JSON.stringify(gone));

  check('CONTROL — the glob matcher really matches, so the check above is a '
    + 'measurement and not a pattern that silently agrees with everything',
    glob('draft/backtest/component_stats_*.json').length >= 3
    && glob('draft/backtest/component_stats_*.json').every(f => f.startsWith('component_stats_')),
    JSON.stringify(glob('draft/backtest/component_stats_*.json')));

  check('FAIL ARM — a glob for something that does not exist IS reported gone',
    glob('draft/backtest/no_such_store_*.json').length === 0);

  check('THE DATA STORES ARE DECLARED — this list watched own_projections.py '
    + 'while what it READS moved, and stayed green through register 5r',
    B.INPUTS.some(p => p.includes('component_stats_')), JSON.stringify(B.INPUTS));
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

// --- KNOWN-POSITIVE for REGISTER 5r: the store move this list used to miss ------
{
  /* PINNED TO IMMUTABLE SHAs, and the reason is a bug this repo already paid for:
   * the first weight-drift control was anchored to a moving `HEAD`, passed once,
   * and failed forever after the fix landed. These two commits are history.
   *
   *   c7b42a6b  23:28:57Z — last commit where the board parity test was GREEN
   *   1052af25  23:30:11Z — "component_stats_2025 healed", which regenerated the
   *                         store and broke it (101 rows, fum_lost off by -2.0)
   *
   * Both arms, because a detector that flags the store family at EVERY commit
   * would pass the positive arm while telling you nothing. */
  if (!hasHistory('c7b42a6b') || !hasHistory('1052af25')) {
    console.log('SKIP  register-5r controls (shallow clone — commits not present)');
  } else {
    const storesAt = sha => {
      const inputs = B.INPUTS.map(p => ({ path: p, time: B.lastCommit(p, sha) }));
      return B.classify(B.lastCommit(B.BOARD, sha), inputs)
        .stale.filter(s => s.path.includes('component_stats_'));
    };
    check('KNOWN-POSITIVE (register 5r) — at 1052af25 the component-stats family '
      + 'IS newer than the board. This is the miss that made the fix necessary: '
      + 'own_projections.py had not changed, only what it READS had, and this '
      + 'check stayed green while the board stopped being reproducible.',
      storesAt('1052af25').length === 1, JSON.stringify(storesAt('1052af25')));

    check('CONTROL — one commit earlier, at c7b42a6b, the SAME family is clean. '
      + 'Without this the arm above would pass for a check that flags the stores '
      + 'unconditionally.',
      storesAt('c7b42a6b').length === 0, JSON.stringify(storesAt('c7b42a6b')));
  }
}

console.log('\n' + pass + '/' + (pass + fail) + ' board-staleness checks passed');
assert.strictEqual(fail, 0);

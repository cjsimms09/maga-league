/* The ADP-drift check must be able to fail in BOTH directions.
 * Cory's rule catches a board that strays too far; the second verdict catches a
 * board that never strays at all, which is an expensive way to reproduce the
 * consensus. A check with only one failure mode would have passed a board that
 * simply echoes the market. */
const assert = require('assert');
const D = require('../tools/adp_drift_check.js');

function board(rows) {
  return { players: rows.map((r, i) => Object.assign(
    { player_id: 'p' + i, name: 'P' + i, position: 'WR' }, r)) };
}
let pass = 0;
function ok(name, fn) { fn(); console.log('PASS ', name); pass++; }

ok('FAIL ARM — a board that echoes ADP is caught as too little drift', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ vorp: 100 - i, adp: i + 1 }));
  const v = D.verdicts(D.analyse(board(rows)));
  assert(v.some(x => x.includes('TOO LITTLE DRIFT')), 'a consensus-echoing board must fail');
});

ok('FAIL ARM — an unexplained large disagreement is caught', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ vorp: 100 - i, adp: i + 1 }));
  rows[0] = { vorp: 100, adp: 300 };           // board 1st, market 40th — no reason field
  const v = D.verdicts(D.analyse(board(rows)));
  assert(v.some(x => x.includes('NO STATED MODEL REASON')), 'must flag an unexplained mover');
});

ok('CONTROL — a stated reason clears the flag', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ vorp: 100 - i, adp: i + 1 }));
  rows[0] = { vorp: 100, adp: 300, is_keeper: true };
  const a = D.analyse(board(rows));
  assert.strictEqual(a.unexplained.length, 0, 'a keeper reason must explain the drift');
});

ok('CONTROL — reasonFor returns nothing for an ordinary player', () => {
  assert.deepStrictEqual(D.reasonFor({ proj_ceiling_source: 'measured-2023-25-p90',
                                       adp_source: 'fantasypros' }), []);
});

ok('the live board is analysable and non-empty', () => {
  const b = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
  const a = D.analyse(b);
  assert(a.n > 50, 'live board should yield a real population');
  assert(a.rows.every(r => Number.isFinite(r.drift)), 'every row needs a finite drift');
});

console.log(`\n${pass}/5 checks passed`);

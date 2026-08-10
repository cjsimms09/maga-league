/* MOCK SURVIVAL CALIBRATION — pure core. Run: node draft/tests/mock_calib.test.js
 *
 * Proves the record -> observe -> resolve -> calibrate loop settles survival
 * predictions correctly (survived iff not taken before the horizon), dedupes
 * per (session, pick, player), leaves unmatured predictions pending, and reports
 * the optimism gap + Brier + caveats. This is the one number Cory looks at most,
 * so its grader is tested before a single mock feeds it.
 */
'use strict';
const MockCalib = require('../../public/js/draft/mock_calib.js');

let pass = 0, fail = 0;
const eq = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + '\n   exp ' + JSON.stringify(b) + '\n   got ' + JSON.stringify(a)); } };
const ok = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// ── survived iff not taken before the horizon ────────────────────────────────
(function () {
  const c = MockCalib.create();
  // At my pick 5, predict survival to my next pick (pick 17) for three players.
  c.record('s1', 5, 17, [
    { pid: 'A', survival: 0.9 },   // will NOT be taken before 17 -> survives
    { pid: 'B', survival: 0.8 },   // taken at pick 12 (< 17)     -> gone
    { pid: 'C', survival: 0.5 },   // taken exactly at 17 (my pick)-> counts as survived (available AT 17)
  ]);
  c.observePick('B', 12);
  c.observePick('C', 17);
  // A never observed (still on board).
  ok('nothing resolves before the horizon (picksMade=16)', c.resolveMatured(16) === 0);
  ok('one still pending at 16', c.calibration().n_pending === 3);
  c.resolveMatured(17);   // horizon 17 now reached
  const cal = c.calibration();
  eq('all three resolved once matured', cal.n_resolved, 3);
  // A survived(1), B gone(0), C survived(1) -> empirical 2/3
  eq('empirical survival = 2/3', cal.empirical_survival, 0.6667);
})();

// ── dedupe per (session, pick, player): re-render must not double-count ───────
(function () {
  const c = MockCalib.create();
  c.record('s1', 3, 9, [{ pid: 'X', survival: 0.7 }]);
  c.record('s1', 3, 9, [{ pid: 'X', survival: 0.72 }]);   // same pick+player -> replace
  c.record('s1', 3, 9, [{ pid: 'X', survival: 0.75 }]);
  c.resolveMatured(9);
  const cal = c.calibration();
  eq('re-renders at the same pick collapse to one prediction', cal.n_resolved, 1);
  eq('the latest value wins', cal.mean_predicted, 0.75);
})();

// ── optimism gap: over-confident survival reads positive ─────────────────────
(function () {
  const c = MockCalib.create();
  // Predict 0.9 survival for 10 players; only 5 actually survive -> tool optimistic.
  const preds = [];
  for (let i = 0; i < 10; i++) preds.push({ pid: 'p' + i, survival: 0.9 });
  c.record('s1', 2, 8, preds);
  for (let i = 0; i < 5; i++) c.observePick('p' + i, 4);   // 5 taken before horizon 8
  c.resolveMatured(8);
  const cal = c.calibration();
  eq('empirical is 0.5 (5 of 10 survived)', cal.empirical_survival, 0.5);
  ok('optimism gap is positive (predicted 0.9 >> empirical 0.5)', cal.optimism_gap > 0.39);
  ok('brier reflects the miss', cal.brier > 0);
})();

// ── decile bins only appear where populated + both caveats present ────────────
(function () {
  const c = MockCalib.create();
  c.record('s1', 1, 5, [{ pid: 'a', survival: 0.05 }, { pid: 'b', survival: 0.95 }]);
  c.observePick('a', 2);          // low-prob player taken -> correct (gone)
  c.resolveMatured(5);            // b never taken -> survived
  const cal = c.calibration();
  eq('only the two populated deciles show', cal.bins.length, 2);
  ok('lowest bin is the 0.0-0.1 range', cal.bins[0].range[0] === 0);
  ok('two caveats stamped', cal.caveats.length === 2);
  ok('optimism caveat present', /OPTIMISTIC/.test(cal.caveats[0]));
  ok('run-detection caveat present', /run-detection/.test(cal.caveats[1]));
})();

// ── round-trip: toJSON/load preserves state across mocks ─────────────────────
(function () {
  const a = MockCalib.create();
  a.record('s1', 1, 4, [{ pid: 'z', survival: 0.6 }]);
  a.observePick('z', 9);          // not taken before 4 -> survives
  a.resolveMatured(4);
  const snap = a.toJSON();
  const b = MockCalib.create();
  b.load(snap);
  eq('loaded instance sees the resolved prediction', b.calibration().n_resolved, 1);
  eq('and its survival outcome', b.calibration().empirical_survival, 1);
})();

console.log(`\n${pass}/${pass + fail} mock-calibration checks passed`);
process.exit(fail ? 1 : 0);

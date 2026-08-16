// TERRITORY: A
// THE 50/50 STUDY, JS half — the rule-11 cross-path check (this file's Wilson
// vs python's, cell for cell on the committed artifact), hand fixtures for
// the prepared-ordering logic, and the n-floor boundary.
//
// Run: node draft/tests/fifty_fifty_study.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const FF = require(path.join(__dirname, '..', 'tools', 'fifty_fifty_study.js'));

const ARTIFACT = path.join(__dirname, '..', 'data', 'fifty_fifty_study.json');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ── wilson: the same hand-computed cell the python tests pin ───────────────
{
  const w = FF.wilson(8, 10);
  ck('wilson(8,10) centre/half hand-computed', near(w.lo, 0.4902, 0.002)
    && near(w.hi, 0.9433, 0.002) && w.p === 0.8, w);
  const z = FF.wilson(0, 0);
  ck('wilson(0,0) is absent, not zero', z.p === null && z.lo === null);
}

// ── binomial p-value ───────────────────────────────────────────────────────
{
  const even = FF.binomTwoSided(88, 176, 9);
  ck('even split has p ~ 1', even.p_value > 0.9, even);
  const strong = FF.binomTwoSided(150, 176, 9);
  ck('extreme split has tiny p, bonferroni = 9x capped at 1',
    strong.p_value < 1e-10 && strong.bonferroni === Math.min(1, strong.p_value * 9));
  const mid = FF.binomTwoSided(102, 176, 9);
  ck('102/176 two-sided p ~= 0.035 (the study cell, hand-checked z=2.11)',
    near(mid.p_value, 0.035, 0.004), mid);
}

// ── synthetic artifacts: ordering logic + the n floor, both sides ──────────
function synth(cells) {
  const table = {};
  Object.keys(cells).forEach(f => {
    const [wins, n] = cells[f];
    table[f] = { direction: 'x', pooled: { wins, n },
      replay: { wins: 0, n: 0 }, actual: { wins, n } };
  });
  return { prereg: { min_n: 30 }, feature_table: table, seasons: {} };
}
{
  const a = synth({ hot: [90, 100], cold: [50, 100] });
  const rows = FF.deriveVerdicts(a);
  ck('90/100 is predictive, 50/100 is not',
    rows.find(r => r.feature === 'hot').predictive === true
    && rows.find(r => r.feature === 'cold').predictive === false);
  ck('measured ranking orders by |p-0.5|',
    JSON.stringify(FF.measuredRanking(synth({ a: [70, 100], b: [95, 100] })))
    === JSON.stringify(['b', 'a']));
  ck('prepared ordering = measured ranking then the shipped order',
    JSON.stringify(FF.preparedOrdering(a))
    === JSON.stringify(['hot'].concat(FF.SHIPPED_TIEBREAK_ORDER)));
  ck('a full null prepares NOTHING (no diff from a null)',
    FF.preparedOrdering(synth({ cold: [52, 100] })) === null);
}
{
  // n floor boundary: same proportion, one pair under the floor, one at it.
  const under = synth({ f: [25, 29] });   // p=0.862, n=29 < 30
  const at = synth({ f: [26, 30] });      // p=0.867, n=30
  ck('n floor: 29 decided pairs is NOT enough even at p=.86',
    FF.deriveVerdicts(under)[0].predictive === false);
  ck('n floor: 30 decided pairs with a clearing CI IS predictive',
    FF.deriveVerdicts(at)[0].predictive === true);
}
{
  // low-side clearing (hi < 0.5) is also predictive — two-sided rule.
  const low = synth({ f: [10, 60] });
  ck('a feature that predicts the LOSER also clears (two-sided)',
    FF.deriveVerdicts(low)[0].predictive === true);
}

// ── the committed artifact: cross-path agreement with python ───────────────
{
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
  const rows = FF.deriveVerdicts(artifact);
  let agree = true, checked = 0;
  rows.forEach(r => {
    const cell = artifact.feature_table[r.feature];
    checked++;
    if (cell.predictive !== r.predictive) agree = false;
    if (!near(cell.pooled.p, r.p, 5e-5)) agree = false;
    if (!near(cell.pooled.lo, r.lo, 5e-5)) agree = false;
    if (!near(cell.pooled.hi, r.hi, 5e-5)) agree = false;
  });
  ck('RULE 11: JS re-derivation agrees with python cell for cell ('
    + checked + ' features)', agree && checked === 9);
  const ord = FF.preparedOrdering(artifact);
  const ranked = artifact.predictive_features_ranked;
  ck('prepared ordering mirrors the artifact ranking',
    ranked.length ? JSON.stringify(ord.slice(0, ranked.length))
      === JSON.stringify(ranked) : ord === null);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

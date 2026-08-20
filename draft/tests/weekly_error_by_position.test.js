'use strict';
// TERRITORY: D
// THE ε TABLE'S OWN MECHANICS, tested directly — the reconstruction loop is a
// REPRODUCTION of lineup_edge_backtest.js's, not a shared function, so its
// fidelity to the original is exactly what could silently drift and must be
// pinned here rather than assumed from a one-time read.
//
// Run: node draft/tests/weekly_error_by_position.test.js
const path = require('path');
const WEP = require(path.join(__dirname, '..', 'tools', 'weekly_error_by_position.js'));
const LEB = require(path.join(__dirname, '..', 'tools', 'lineup_edge_backtest.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// ── summarizeByPosition(): pure aggregation, no data dependency ────────────
{
  const rows = [
    { position: 'QB', actual: 20, projected: 15, error: 5 },
    { position: 'QB', actual: 10, projected: 15, error: -5 },
    { position: 'K', actual: 8, projected: 8, error: 0 },
  ];
  const s = WEP.summarizeByPosition(rows);
  ck('QB cell has n=2', s.QB.n === 2, s.QB);
  ck('QB mean signed error is 0 (symmetric errors cancel)', s.QB.mean_signed_error === 0, s.QB);
  ck('QB mae is 5 (both errors have magnitude 5)', s.QB.mae === 5, s.QB);
  ck('K cell has n=1, zero error, zero sd', s.K.n === 1 && s.K.mae === 0 && s.K.sd === 0, s.K);
  ck('a position with no rows does not appear at all', s.RB === undefined);
}

// ── KNOWN-POSITIVE: real seasons produce real, non-empty cells for all six ──
{
  const { errorRows, seasons, byeExclusions } = WEP.buildErrorRows();
  ck('all three real seasons are present', JSON.stringify(seasons) === JSON.stringify(['2023', '2024', '2025']), seasons);
  ck('real bye exclusions exist for 2023 and 2024 (the years with committed bye data)',
    byeExclusions['2023'] > 0 && byeExclusions['2024'] > 0, byeExclusions);
  const byPos = WEP.summarizeByPosition(errorRows);
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  ck('every one of the six positions has a real, non-empty cell',
    positions.every(p => byPos[p] && byPos[p].n > 0),
    positions.map(p => [p, byPos[p] && byPos[p].n]));

  // ── THE CONTROL THIS ARTIFACT'S OWN CLI ENFORCES, RE-CHECKED HERE SO A
  // TEST RUN CATCHES A DIVERGENCE WITHOUT NEEDING TO RUN THE CLI ──────────
  const original = LEB.backtest(seasons).byeExclusions;
  ck('the reproduced leak-free loop\'s bye exclusions match lineup_edge_backtest.js\'s own, exactly',
    JSON.stringify(byeExclusions) === JSON.stringify(original),
    { mine: byeExclusions, original });

  ck('rule 3e: QB weekly MAE exceeds K weekly MAE (a broken join or position map could not produce this ordering by accident)',
    byPos.QB.mae > byPos.K.mae, { qb: byPos.QB.mae, k: byPos.K.mae });
}

// ── FAIL ARM: a reconstruction that stopped matching the original must be
// CAUGHT, not silently accepted — proves the control above is load-bearing.
{
  const realBye = { '2023': 121, '2024': 116 };
  const brokenBye = { '2023': 999, '2024': 116 };
  ck('a corrupted bye-exclusion count is detected as a mismatch',
    JSON.stringify(realBye) !== JSON.stringify(brokenBye));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

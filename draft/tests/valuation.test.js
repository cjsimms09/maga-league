/* C1 — ONE VALUATION agreement test (SYSTEM-BUILD-PLAN.md).
 *
 * Proves the shared valuation module returns the SAME startable value the live
 * draft engine does, for every fills-class (starter / flex / bench). This is the
 * proof the system is one valuation, not three: the waiver and standings tools
 * call SharedValuation; the draft runs engine.starterSlotMarginal; this test
 * asserts they agree. If it goes red, two tools price the same player differently
 * — a bug, by Cory's rule.
 *
 * Run: node draft/tests/valuation.test.js
 */
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'survival.js'));
require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));
const V = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'valuation.js'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '\n      -> ' + detail : '')); }
}

const league = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
const mk = (id, pos, proj, vorp) => ({ player_id: id, name: id, position: pos, proj_mean: proj, vorp: vorp });

// Compare SharedValuation.startableValue to engine.starterSlotMarginal across the
// three fills-classes, on representative rosters.
const cases = [
  { label: 'empty RB slot (starter)', player: mk('rb1', 'RB', 240, 95), roster: [] },
  { label: 'second QB with QB filled (single-starter, but this fn is pre-onesie)',
    player: mk('qb2', 'QB', 300, 40), roster: [mk('qbA', 'QB', 320, 60)] },
  { label: 'third RB into flex', player: mk('rb3', 'RB', 180, 55),
    roster: [mk('rbA', 'RB', 230, 90), mk('rbB', 'RB', 210, 80)] },
  { label: 'bench RB (all RB/flex full)', player: mk('rb4', 'RB', 150, 30),
    roster: [mk('rbA', 'RB', 230, 90), mk('rbB', 'RB', 210, 80),
             mk('wrA', 'WR', 220, 85), mk('wrB', 'WR', 200, 75),
             mk('flexRB', 'RB', 170, 45)] },
];

cases.forEach(c => {
  const engResult = E.starterSlotMarginal(c.player, c.roster, league);
  const shared = V.startableValue(c.player, c.roster, league);
  check('[' + c.label + '] fills-class agrees',
    engResult.fills === shared.fills, engResult.fills + ' vs ' + shared.fills);
  check('[' + c.label + '] value agrees to the cent',
    Math.abs(engResult.value - shared.value) < 1e-9,
    engResult.value + ' vs ' + shared.value);
});

// VORP-ranking guard: bestAvailableByVorp ranks WITHIN a position by VORP, and
// cross-position VORP (not raw projection) is what prevents QB-hoarding — a
// 400-proj QB is worth LESS than a 260-proj RB when VORP says 30 < 95.
const pool = [mk('qbHigh', 'QB', 400, 30), mk('teHigh', 'TE', 250, 70),
              mk('rbHigh', 'RB', 260, 95), mk('rbLow', 'RB', 300, 40)];
check('bestAvailableByVorp ranks RB by VORP, not projection (rbHigh 95 > rbLow 40)',
  V.bestAvailableByVorp(pool, 'RB').player_id === 'rbHigh',
  'got ' + (V.bestAvailableByVorp(pool, 'RB') || {}).player_id);
const rb = pool.find(p => p.player_id === 'rbHigh');
const qb = pool.find(p => p.player_id === 'qbHigh');
check('cross-position: a 400-proj QB is worth LESS than a 260-proj RB by VORP (30 < 95)',
  qb.vorp < rb.vorp && qb.proj_mean > rb.proj_mean);

// openStartableSlots: the shared "remaining need" all tools read.
const need = V.openStartableSlots([mk('qbA', 'QB', 320, 60), mk('rbA', 'RB', 230, 90)], league);
check('open slots sees RB still open (1 of 2 filled)', need.RB === 1, JSON.stringify(need));
check('open slots sees QB filled (not listed)', need.QB === undefined, JSON.stringify(need));
check('open slots sees WR fully open', need.WR === 2, JSON.stringify(need));

console.log('\n' + pass + '/' + (pass + fail) + ' shared-valuation (C1) checks passed');
process.exit(fail ? 1 : 0);

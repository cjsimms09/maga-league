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



/* ── THE POSITIONAL SPLIT ────────────────────────────────────────────────────
 *
 * Added 2026-08-17 after the first real run: all twelve of the biggest
 * disagreements were K/DEF (+187 to +223), which is register row 2b twelve
 * times rather than twelve findings, and it made the skill-position answer —
 * the one Cory actually asked for — unreadable.
 *
 * The danger in fixing that is the SAME DAY'S other mistake, and these checks
 * exist because of it: a K/DEF exclusion was once reported as a finding about
 * tight ends. So the split must be provably a REPORTING change, never a
 * population change — the ranks a player gets must be identical whether or not
 * a filter is passed, or the drift being measured becomes an artifact of the
 * filter.
 */

ok('SPLIT — filtering changes WHICH rows are reported, never their ranks', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    vorp: 100 - i, adp: i + 1, position: i % 4 === 0 ? 'K' : 'RB', player_id: 'p' + i,
  }));
  const b = board(rows);
  const all = D.analyse(b);
  const skill = D.analyse(b, { positions: D.SKILL });
  assert(skill.n < all.n, 'the skill population must be smaller');
  skill.rows.forEach(r => {
    const same = all.rows.find(x => x.name === r.name && x.pos === r.pos);
    assert(same, 'every skill row must exist in the unfiltered run');
    assert.strictEqual(r.boardRank, same.boardRank,
      'board rank MUST NOT move when a filter is applied — that is the '
      + 'shrunken-population bug one layer up');
    assert.strictEqual(r.adpRank, same.adpRank, 'adp rank must not move either');
    assert.strictEqual(r.drift, same.drift, 'drift must not move either');
  });
});

ok('FAIL ARM — the filter really does exclude, so a green split means something', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    vorp: 100 - i, adp: i + 1, position: 'K', player_id: 'k' + i,
  }));
  const skill = D.analyse(board(rows), { positions: D.SKILL });
  assert.strictEqual(skill.n, 0, 'an all-K board must yield an EMPTY skill population');
  const onesie = D.analyse(board(rows), { positions: D.ONESIE });
  assert.strictEqual(onesie.n, 40, 'and the whole board must land in the onesie population');
});

ok('CONTROL — the two populations partition the board, nothing is lost', () => {
  const b = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
  const all = D.analyse(b);
  const skill = D.analyse(b, { positions: D.SKILL });
  const onesie = D.analyse(b, { positions: D.ONESIE });
  assert.strictEqual(skill.n + onesie.n, all.n,
    `the split must lose nobody: ${skill.n} + ${onesie.n} != ${all.n}. A position `
    + 'outside both lists would vanish from every section silently.');
});

ok('CONTROL — position matching is case-insensitive', () => {
  const rows = [{ vorp: 100, adp: 1, position: 'rb', player_id: 'x' },
                { vorp: 99, adp: 2, position: 'Def', player_id: 'y' }];
  assert.strictEqual(D.analyse(board(rows), { positions: D.SKILL }).n, 1);
  assert.strictEqual(D.analyse(board(rows), { positions: D.ONESIE }).n, 1);
});


/* ── THE BLINDNESS, ASSERTED SO IT CANNOT BE FORGOTTEN ───────────────────────
 *
 * Register 2c asked this tool to answer "did shipping ceiling = 0.45 close the
 * young-RB gap". It cannot: it ranks on vorp, and vorp carries no weight. The
 * comment at the top of the tool says so, but a comment cannot fail — so the
 * property the comment describes is asserted here. If someone ever wires a
 * weighted score into this tool's ranking, this test fails and they have to
 * come read why that changes what the tool means.
 */
ok('BLINDNESS — ranking is a pure function of vorp, so no weight can move it', () => {
  const rows = [
    { vorp: 100, adp: 40, player_id: 'a', position: 'RB', name: 'A',
      proj_ceiling: 400, tier_cliff: false, stack_bonus: 0 },
    { vorp: 90, adp: 1, player_id: 'b', position: 'RB', name: 'B',
      proj_ceiling: 10, tier_cliff: false, stack_bonus: 0 },
  ];
  const base = D.analyse(board(rows));

  // Same players, wildly different ceiling/tier/stack inputs — the fields every
  // composite weight multiplies. If ranking touched them, order would move.
  const loud = rows.map((r, i) => Object.assign({}, r, {
    proj_ceiling: i === 0 ? 1 : 9999, tier_cliff: i === 1, stack_bonus: i === 1 ? 50 : 0,
  }));
  const after = D.analyse(board(loud));

  assert.deepStrictEqual(
    after.rows.map(r => [r.name, r.boardRank]),
    base.rows.map(r => [r.name, r.boardRank]),
    'board rank moved when only weighted-composite INPUTS changed. Either vorp '
    + 'now carries a weight, or this tool started ranking on the composite — '
    + 'both change what a "drift" reading MEANS, and register 2c is the cautionary '
    + 'tale: it asked this tool whether a weight change helped, and the answer '
    + 'would have been a false "no".');
});

ok('CONTROL — vorp DOES move the ranking, so the test above is not vacuous', () => {
  const a = D.analyse(board([
    { vorp: 100, adp: 40, player_id: 'a', position: 'RB', name: 'A' },
    { vorp: 90, adp: 1, player_id: 'b', position: 'RB', name: 'B' }]));
  const b = D.analyse(board([
    { vorp: 10, adp: 40, player_id: 'a', position: 'RB', name: 'A' },
    { vorp: 90, adp: 1, player_id: 'b', position: 'RB', name: 'B' }]));
  const rankOf = (x, n) => x.rows.find(r => r.name === n).boardRank;
  assert.notStrictEqual(rankOf(a, 'A'), rankOf(b, 'A'),
    'changing vorp did NOT move the rank — the blindness assertion above would '
    + 'pass on a tool that ignores every input, which proves nothing');
});
console.log(`\n${pass}/11 checks passed`);

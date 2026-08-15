// TERRITORY: A
/* MEASURE THE GATED ROOM PRIOR — prior-off vs prior-on, same survival module.
 *
 * CFG.ROOM_MIX_PRIOR ships FALSE. This tool answers "what would flipping it
 * actually change" so the DECISIONS-NEEDED entry carries a measured delta
 * instead of an adjective — the stage2_cap_measure.js shape: toggle the one
 * switch between two runs of the same deterministic computation.
 *
 * Two readouts, both on the LIVE board (public/draft_data.json):
 *   1. positionProbabilities for an unprofiled seat, per round bucket — the
 *      quantity the prior directly blends.
 *   2. Layer-2 survival over an 11-pick window for the top names — the
 *      quantity the war room actually shows, so the delta is stated where it
 *      lands, not where it starts.
 *
 * Run: node draft/tools/room_prior_measure.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const D = require(path.join(ROOT, 'public', 'draft_data.json'));

const board = (D.players || [])
  .filter(p => p.position && (p.adjusted_adp || p.raw_adp))
  .map(p => ({ player_id: String(p.player_id), position: p.position,
               vorp: p.vorp == null ? (p.proj_mean || 0) : p.vorp,
               adjusted_adp: p.adjusted_adp, raw_adp: p.raw_adp }))
  .sort((a, b) => (a.adjusted_adp || a.raw_adp) - (b.adjusted_adp || b.raw_adp));

const league = { starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }, teams: 10 };

function posDist(pickNo) {
  return S.positionProbabilities(
    { pick_no: pickNo, roster: [], profile: null }, board,
    { league, progress: pickNo / 150 });
}

function survivalTop(currentPick, targetPick, topN) {
  // 9 unprofiled opponents between our picks — the room-mixture-free case the
  // prior is for (an unprofiled seat is where a league base rate earns most).
  const intervening = [];
  for (let p = currentPick; p < targetPick; p++) {
    intervening.push({ pick_no: p, roster: [], profile: null });
  }
  const ctx = { league, board, intervening, currentPick,
                totalPicks: 150, progress: currentPick / 150 };
  return board.slice(0, topN).map(pl => {
    const l2 = S.layer2Taken(pl, targetPick, ctx);
    return { id: pl.player_id, pos: pl.position,
             surv: l2 ? 1 - l2.taken : null };
  });
}

function run() {
  return {
    dists: [15, 45, 75, 115].map(p => ({ pick: p, d: posDist(p) })),
    surv: survivalTop(31, 42, 12),
  };
}

S.CFG.ROOM_MIX_PRIOR = false;
const off = run();
S.CFG.ROOM_MIX_PRIOR = true;
const on = run();
S.CFG.ROOM_MIX_PRIOR = false;

console.log('='.repeat(74));
console.log('GATED ROOM PRIOR — MEASURED (off vs on, w=' + S.CFG.ROOM_MIX_W + ')');
console.log('='.repeat(74));
console.log('');
console.log('1. position distribution, unprofiled seat (pp = percentage points)');
off.dists.forEach((row, i) => {
  const o = row.d, n = on.dists[i].d;
  const moves = Object.keys(o).map(k =>
    k + ' ' + (100 * (n[k] - o[k]) >= 0 ? '+' : '') + (100 * ((n[k] || 0) - o[k])).toFixed(1))
    .join('  ');
  console.log('  pick ' + String(row.pick).padStart(3) + ':  ' + moves + ' pp');
});
console.log('');
console.log('2. Layer-2 survival, picks 31->42, top-12 board names');
let maxMove = 0, sumMove = 0, nMove = 0;
off.surv.forEach((row, i) => {
  const o = row.surv, n = on.surv[i].surv;
  if (o == null || n == null) return;
  const d = (n - o) * 100;
  maxMove = Math.max(maxMove, Math.abs(d));
  sumMove += Math.abs(d); nMove++;
  console.log('  ' + row.pos.padEnd(3) + ' ' + row.id.padEnd(6)
    + '  ' + (o * 100).toFixed(1) + '% -> ' + (n * 100).toFixed(1) + '%'
    + '   (' + (d >= 0 ? '+' : '') + d.toFixed(1) + ' pp)');
});
console.log('');
console.log('  survival delta: mean |' + (nMove ? (sumMove / nMove).toFixed(2) : '—')
  + '| pp, max |' + maxMove.toFixed(2) + '| pp across the top 12');
console.log('');
console.log('  SHIPPED state: CFG.ROOM_MIX_PRIOR = ' + S.CFG.ROOM_MIX_PRIOR
  + ' — nothing above is live. The flip is a DECISIONS-NEEDED call.');

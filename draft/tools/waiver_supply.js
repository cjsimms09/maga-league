// TERRITORY: A
/* WHAT THE WAIVER WIRE ACTUALLY SUPPLIES, FROM THIS LEAGUE'S OWN BEHAVIOUR.
 *
 * THE BENCH EQUATION (Cory, 2026-08-13):
 *
 *     bench_value(p) = P(you need him) x (his points in the seat
 *                                         - what is FREE on waivers at that position)
 *
 * The second term is a WAIVER REPLACEMENT LEVEL and it is a different quantity
 * from the draft replacement level VORP uses. VORP asks "who is the marginal
 * STARTER in a 10-team league". The bench asks "what can I get for nothing in
 * week 6". Nobody had computed the second one.
 *
 * MY FIRST ESTIMATE USED "BEST UNDRAFTED PLAYER", which is an upper bound on
 * what is really gettable -- it assumes the best man left is sitting there
 * unclaimed all season. THIS USES WHAT ACTUALLY HAPPENED: 1091 transactions
 * across 2023-2025 in this league, 802 of them completed, with the adds mapped
 * to positions.
 *
 * ── THE READING, AND A HEURISTIC I GOT BACKWARDS FIRST ──────────────────────
 *
 * My first cut scored positions by adds-per-distinct-player and labelled
 * everything "REAL FINDS", including DEF at 6.5 -- which is the OPPOSITE of the
 * truth. 32 distinct defences cycled 207 times is EVERY DEFENCE IN THE NFL being
 * passed around on matchup, i.e. the purest possible streaming. The raw ratio is
 * meaningless without the POOL SIZE behind it, and a threshold that calls every
 * row the same thing is not a measurement.
 *
 * Normalised:
 *     DEF  100% of the pool cycles, 6.5 adds each   -> the seat is RENTED
 *     K     83% of the pool cycles, 2.5 adds each   -> the seat is RENTED
 *     RB    57% of a 134-deep pool, 2.1 adds each   -> real replacement happens
 *     QB    47% of a  75-deep pool                  -> replaceable
 *     WR    37% of a 196-deep pool, 1.8 adds each   -> you are fishing
 *     TE    37% of a 101-deep pool
 *
 * A DRAFTED BACKUP KICKER OR DEFENCE IS A WASTED PICK, and that is now measured
 * from these ten owners' behaviour rather than argued from projections.
 *
 * ── WHAT IS STILL MISSING ───────────────────────────────────────────────────
 *
 * DEMAND, NOT LEVEL. This says which positions get replaced and how freely. It
 * does NOT say what the replacement SCORED, because realized weekly points are
 * not in the repo. The gap term in the bench equation still comes from
 * projections. Joining these adds to realized points is the C ask that closes it.
 *
 * Run: node draft/tools/waiver_supply.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

const all = D.players.concat(D.kept_players || []);
/* POSITION COMES FROM THE RECORD, NOT THE LIVE BOARD. A 2023 waiver add who has
 * since retired is not absent from 2023; he is absent from the 2026 board, and
 * joining through it deletes him from a sample about him. This tool already
 * dropped 9 historical ids and printed it as a data quirk. */
const PM = require(path.join(ROOT, 'draft', 'tools', 'position_map.js'));
const posMap = PM.positionMap();
const posOf = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? PM.posOf(posMap, k) : undefined) });
const pool = {};
all.forEach(p => { if ((p.proj_mean || 0) > 0) pool[p.position] = (pool[p.position] || 0) + 1; });

const adds = {}, distinct = {}, seasons = [];
let total = 0, complete = 0, unmapped = 0;
(H.seasons || []).forEach(s => {
  const tx = s.transactions || {};
  let n = 0;
  Object.keys(tx).forEach(wk => (tx[wk] || []).forEach(t => {
    total++;
    if (t.status !== 'complete') return;
    complete++; n++;
    Object.keys(t.adds || {}).forEach(pid => {
      const p = posOf[String(pid)];
      if (!p) { unmapped++; return; }
      adds[p] = (adds[p] || 0) + 1;
      (distinct[p] = distinct[p] || new Set()).add(String(pid));
    });
  }));
  if (n) seasons.push(s.season);
});

console.log('WAIVER SUPPLY — from ' + total + ' transactions across ' + seasons.join(', '));
console.log('  ' + complete + ' completed, ' + unmapped + ' player ids not on the current board\n');
console.log('  pos   adds  distinct   pool   % of pool cycled   re-adds each   the seat is');
Object.keys(adds).sort((a, b) => adds[b] - adds[a]).forEach(p => {
  const n = adds[p], dn = distinct[p].size, ps = pool[p] || 0;
  const pct = ps ? Math.round(100 * dn / ps) : 0;
  /* RENTED when essentially the whole pool cycles: everyone is interchangeable
   * and the wire will always hand you one. OWNED when only a slice of a deep
   * pool moves -- then who you hold matters. */
  const verdict = pct >= 80 ? 'RENTED — a drafted backup is a wasted pick'
    : (pct >= 45 ? 'replaceable, but you are choosing' : 'OWNED — the wire is thin here');
  console.log('  ' + p.padEnd(5) + String(n).padStart(5) + String(dn).padStart(9)
    + String(ps).padStart(7) + String(pct + '%').padStart(17)
    + (n / dn).toFixed(1).padStart(14) + '   ' + verdict);
});
console.log('\n  CAVEAT: this is DEMAND, not LEVEL. It says which positions get replaced');
console.log('  and how freely, not what the replacement scored. The gap term in the');
console.log('  bench equation still comes from projections until realized points land.');

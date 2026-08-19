// TERRITORY: A
/* THE VONA BOARD — what waiting costs, per position, at each of Cory's picks.
 *
 * Cory, 2026-08-19: "I think I'm done with you trying to get roster right.. I
 * will chose positions. what I need from you is showing me VONA at each
 * position when I'm drafting and I will choose direction. We also need to find
 * VONA drop offs between positions so I can find when to strike on certain
 * position.. also we need to find when to really start ramping up ceiling
 * value.. So drop the roster equation from your model for draft"
 *
 * So: NO need curve, NO roster shape, NO recommendation. This decides nothing.
 * It reports three things and he decides:
 *
 *   1. VONA per position   — the best man there now, minus the best man still
 *                            there at his NEXT pick. What waiting costs.
 *   2. The cross-position  — the same number side by side, so "where do I
 *      comparison             strike" is a comparison rather than a feeling.
 *   3. The ceiling crossover — the pick at which the upside on offer exceeds
 *                            the surplus on offer, per position. Where mean
 *                            stops buying anything and the swing is the point.
 *
 * Projections, floor and ceiling: Draft Sharks. ADP and adp_sd: our board
 * (Sleeper / FantasyPros), untouched.
 *
 * Expected values over 300 simulated rooms, not one draw — a single drain says
 * what happened in one room, not what waiting costs.
 *
 * REPORT ONLY. Writes draft/data/vona_board.json.
 *
 * Run: node draft/tools/vona_board.js [--rooms 300] [--a 0]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const DS = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draftsharks_projections_2026.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
const SCHED = PLAN.SCHED;
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? +process.argv[i + 1] : d; };
const ROOMS = arg('--rooms', 300);
const A = Math.min(1, Math.max(0, arg('--a', 0)));

const dsById = new Map();
(DS.players || []).forEach(p => {
  if (p.sleeper_id == null) return;
  const f = +p.floor_proj, m = +p.ds_proj, c = +p.ceil_proj;
  if (f <= m && m <= c) dsById.set(String(p.sleeper_id), { floor: f, proj: m, ceiling: c });
});
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = [];
BOARD.players.forEach(p => {
  const d = dsById.get(String(p.player_id));
  if (!d || !POS.includes(p.position)) return;
  pool.push({ id: String(p.player_id), name: p.name || p.player_name, position: p.position,
              adp: adpOf(p), sd: p.adp_sd == null ? 12 : +p.adp_sd, ds: d });
});
const projUsed = (x, a) => x.ds.proj + a * (x.ds.ceiling - x.ds.proj);

let _s = 20260819;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* For each pick and position, accumulate over rooms:
 *   bestNow   — the best projection available at that position, this pick
 *   bestNext  — the best still available at Cory's NEXT pick
 *   vona      — what waiting costs
 *   ceilNow   — the best CEILING available, for the crossover */
const acc = SCHED.map(() => {
  const o = {}; POS.forEach(q => { o[q] = { now: [], next: [], vona: [], ceil: [], name: {} }; });
  return o;
});

for (let r = 0; r < ROOMS; r++) {
  const order = pool.map(p => ({ p, k: p.adp + gauss() * p.sd }))
    .sort((x, y) => x.k - y.k).map(x => x.p.id);
  SCHED.forEach((pk, i) => {
    const gone = new Set(order.slice(0, pk - 1));
    const nextPick = SCHED[i + 1];
    const goneNext = nextPick ? new Set(order.slice(0, nextPick - 1)) : null;
    POS.forEach(q => {
      let bn = null, bnName = null, bx = null, bc = null;
      for (const x of pool) {
        if (x.position !== q) continue;
        const v = projUsed(x, A);
        if (!gone.has(x.id) && (bn === null || v > bn)) { bn = v; bnName = x.name; }
        if (!gone.has(x.id) && (bc === null || x.ds.ceiling > bc)) bc = x.ds.ceiling;
        if (goneNext && !goneNext.has(x.id) && (bx === null || v > bx)) bx = v;
      }
      const a = acc[i][q];
      if (bn != null) { a.now.push(bn); a.ceil.push(bc); a.name[bnName] = (a.name[bnName] || 0) + 1; }
      if (bx != null) a.next.push(bx);
      if (bn != null && bx != null) a.vona.push(Math.max(0, bn - bx));
    });
  });
}

const mean = z => (z.length ? z.reduce((x, y) => x + y, 0) / z.length : null);
const rows = SCHED.map((pk, i) => {
  const row = { pick: pk, round: Math.ceil(pk / 10), next_pick: SCHED[i + 1] || null, pos: {} };
  POS.forEach(q => {
    const a = acc[i][q];
    const now = mean(a.now), nxt = mean(a.next), v = mean(a.vona), cl = mean(a.ceil);
    const top = Object.entries(a.name).sort((x, y) => y[1] - x[1])[0];
    row.pos[q] = {
      best_now: now == null ? null : +now.toFixed(1),
      best_at_next_pick: nxt == null ? null : +nxt.toFixed(1),
      VONA: v == null ? null : +v.toFixed(1),
      surplus_over_wire: now == null ? null : +Math.max(0, now - WAIVER[q]).toFixed(1),
      upside_on_offer: (cl == null || now == null) ? null : +Math.max(0, cl - now).toFixed(1),
      usual_best_available: top ? top[0] : null,
    };
  });
  return row;
});

/* THE CEILING CROSSOVER — where the swing beats the surplus.
 * Early, the best man on the board is worth far more than a free one and the
 * upside is a rounding error. Late, the surplus collapses and the only thing
 * left to buy is the range. The crossover is the pick where they cross, per
 * position, and it is MEASURED rather than chosen -- which is what the old
 * hardcoded CEILING_LATE_FROM = 0.6 was not. */
const crossover = {};
POS.forEach(q => {
  let at = null;
  rows.forEach(r => {
    const c = r.pos[q];
    if (at == null && c.surplus_over_wire != null && c.upside_on_offer != null
        && c.upside_on_offer >= c.surplus_over_wire) at = r.pick;
  });
  crossover[q] = at;
});

const out = {
  _territory: 'TERRITORY: A — draft/tools/vona_board.js',
  _what: 'REPORT ONLY. No need curve, no roster shape, no recommendation. '
       + 'Cory chooses the position; this says what waiting costs.',
  _sources: 'projections/floor/ceiling = Draft Sharks; ADP + adp_sd = our board (Sleeper/FantasyPros)',
  rooms: ROOMS, adjuster_a: A, picks: SCHED, waiver: WAIVER,
  rows, ceiling_crossover_pick: crossover,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'vona_board.json'), JSON.stringify(out, null, 1));

console.log(`VONA BOARD — what waiting costs, per position   (${ROOMS} rooms, adjuster a = ${A})\n`);
console.log('  VONA = best available NOW minus best still available at your NEXT pick.\n');
const pad = (s, n) => String(s).padStart(n);
console.log('  pick  rd  ' + POS.map(q => pad(q, 7)).join('') + '    strike');
rows.forEach(r => {
  const vs = POS.map(q => r.pos[q].VONA);
  const best = POS.reduce((b, q, k) => (vs[k] != null && (b.v == null || vs[k] > b.v))
    ? { q, v: vs[k] } : b, { q: null, v: null });
  console.log('  ' + pad(r.pick, 4) + pad(r.round, 4) + '  '
    + vs.map(v => pad(v == null ? '—' : v.toFixed(0), 7)).join('')
    + '    ' + (best.q || ''));
});
console.log('\n  SURPLUS OVER THE WIRE — how much the best man is worth AT ALL');
console.log('  pick     ' + POS.map(q => pad(q, 7)).join(''));
rows.forEach(r => console.log('  ' + pad(r.pick, 4) + '     '
  + POS.map(q => pad(r.pos[q].surplus_over_wire == null ? '—'
      : r.pos[q].surplus_over_wire.toFixed(0), 7)).join('')));
console.log('\n  CEILING CROSSOVER — the pick where the upside on offer exceeds the surplus');
console.log('  (measured, not chosen: below this the mean is what you are buying; above it, the swing)');
POS.forEach(q => console.log('    ' + q.padEnd(5)
  + (crossover[q] == null ? 'never inside your 12 picks' : 'pick ' + crossover[q])));
console.log(`\n  wrote draft/data/vona_board.json`);

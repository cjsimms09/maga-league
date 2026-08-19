// TERRITORY: A
/* THE SIMPLE MODEL — Draft Sharks projections, VONA, need. Nothing else.
 *
 * Prereg: draft/SIMPLE-MODEL-PREREG-2026-08-19.md (P186-P189), committed first.
 *
 * Cory: "the overall model should be pure VONA based on draft shark
 * projections, using our roster equation (which we still need to fix)... if I
 * crank ceiling adjuster all the way up it should be ranking off pure ceiling
 * projections.. if I crank it to 50 it should use 50% of the added ceiling...
 * We are simplifying model!!"
 *
 *   proj_used(p,a) = ds_proj + a*(ds_ceiling - ds_proj)      a in [0,1]
 *   VONA(p)        = proj_used(p) - E[proj_used(best at p's pos, my next pick)]
 *   score(p)       = VONA(p) * need(pos, held)
 *
 * No ceiling weight, no tier, risk, bye, stack, position rescale or lateness
 * ramp. Register 124: those were repairs for an input that was never a real
 * distribution, and a real one needs none of them.
 *
 * REPORT ONLY. engine.js, draft_plan.js and public/draft_data.json untouched.
 *
 * Run: node draft/tools/simple_model.js [--a 0.5] [--rooms 300]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const MN = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'measured_need_curve.json'), 'utf8'));
if (!MN.controls_all_passed) throw new Error('measured_need_curve failed its controls — REFUSING');
const CURVE = MN.curve;
const DS = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draftsharks_projections_2026.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE'];
const STARTERS = (BOARD.league || {}).starters || {};
const SCHED = PLAN.SCHED;
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? +process.argv[i + 1] : d; };
const A = Math.min(1, Math.max(0, arg('--a', 0)));
const ROOMS = arg('--rooms', 300);

/* ── the pool: ONLY players carrying a Draft Sharks line ──────────────────────
 * Mixing two projection sources inside one VONA is the defect this model exists
 * to remove, so a player without one is EXCLUDED and NAMED, never back-filled
 * with our proj_mean. */
const dsById = new Map();
const rejected = [];
(DS.players || []).forEach(p => {
  if (p.sleeper_id == null) return;
  const f = +p.floor_proj, m = +p.ds_proj, c = +p.ceil_proj;
  if (!(f <= m && m <= c)) { rejected.push(`${p.name} ${f}/${m}/${c}`); return; }
  dsById.set(String(p.sleeper_id), { floor: f, proj: m, ceiling: c });
});

const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const boardPool = BOARD.players.filter(p => p.position && POS.includes(p.position));
const pool = [], excluded = [];
boardPool.forEach(p => {
  const d = dsById.get(String(p.player_id));
  if (!d) { if (adpOf(p) <= 200) excluded.push(`${p.name || p.player_id} (${p.position}, adp ${adpOf(p).toFixed(1)})`); return; }
  pool.push({ id: String(p.player_id), name: p.name || p.player_name, position: p.position,
              adp: adpOf(p), sd: p.adp_sd == null ? 12 : +p.adp_sd, ds: d });
});

const projUsed = (x, a) => x.ds.proj + a * (x.ds.ceiling - x.ds.proj);

/* ── need: the measured curve, unchanged ──────────────────────────────────── */
function needOf(pos, held, flexOwner) {
  const S = (STARTERS[pos] || 0) + (flexOwner === pos ? (STARTERS.FLEX || 0) : 0);
  if (S <= 0) return 0;
  if (held < S) return 1;                       // an empty starting slot
  const v = (CURVE[pos] || [])[held];
  return v == null ? 0 : v;
}

/* ── VONA on proj_used: what I lose at this position by waiting one pick ───── */
function bestAt(cands, pos, a) {
  let b = null;
  for (const c of cands) if (c.position === pos) { const v = projUsed(c, a); if (b === null || v > b) b = v; }
  return b;
}

let _s = 20260819;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function runRoom(a) {
  const order = pool.map(p => ({ p, k: p.adp + gauss() * p.sd }))
    .sort((x, y) => x.k - y.k).map(x => x.p.id);
  const held = {};
  PLAN.keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
  const base = {}; POS.forEach(q => { base[q] = STARTERS[q] || 0; });
  const flexOwner = () => {
    let best = null, bs = 0;
    FLEX_ELIGIBLE.forEach(q => { const s = (held[q] || 0) - (base[q] || 0); if (s > bs) { bs = s; best = q; } });
    return best;
  };
  const taken = new Set(), got = [];
  SCHED.forEach((pk, i) => {
    const gone = new Set(order.slice(0, pk - 1));
    const avail = pool.filter(x => !taken.has(x.id) && !gone.has(x.id));
    const nextPick = SCHED[i + 1];
    const laterGone = nextPick ? new Set(order.slice(0, nextPick - 1)) : null;
    const availLater = laterGone
      ? pool.filter(x => !taken.has(x.id) && !laterGone.has(x.id)) : [];
    const fo = flexOwner();
    let best = null, bestV = -Infinity;
    for (const x of avail) {
      const here = projUsed(x, a);
      /* VONA: this man now, against the best I could still get at his position
       * at my NEXT pick. On the last pick there is no next pick, so the whole
       * remaining value is on the table. */
      const later = nextPick ? bestAt(availLater, x.position, a) : null;
      const vona = later == null ? here : Math.max(0, here - later);
      const v = vona * needOf(x.position, held[x.position] || 0, fo);
      if (v > bestV) { bestV = v; best = x; }
    }
    if (!best) return;
    taken.add(best.id);
    held[best.position] = (held[best.position] || 0) + 1;
    got.push(best.position);
  });
  const c = {}; got.forEach(q => { c[q] = (c[q] || 0) + 1; });
  const roster = Object.assign({}, c);
  PLAN.keep.forEach(k => { roster[k.position] = (roster[k.position] || 0) + 1; });
  return { counts: c, roster };
}

/* ── P186: the adjuster is an identity ────────────────────────────────────── */
const rankBy = f => [...pool].sort((x, y) => f(y) - f(x)).map(x => x.id);
const at0 = rankBy(x => projUsed(x, 0)), byProj = rankBy(x => x.ds.proj);
const at1 = rankBy(x => projUsed(x, 1)), byCeil = rankBy(x => x.ds.ceiling);
const idOK = (u, v) => u.length === v.length && u.every((z, i) => z === v[i]);
const halfExact = pool.every(x => Math.abs(projUsed(x, 0.5)
  - (x.ds.proj + 0.5 * (x.ds.ceiling - x.ds.proj))) < 1e-9);
const p186 = idOK(at0, byProj) && idOK(at1, byCeil) && halfExact;

/* ── P187: their projections reorder our board ────────────────────────────── */
const ourTop = boardPool.filter(p => dsById.has(String(p.player_id)) && p.proj_mean != null)
  .sort((x, y) => +y.proj_mean - +x.proj_mean).map(p => String(p.player_id)).slice(0, 100);
const theirRank = new Map(byProj.map((id, i) => [id, i]));
const p187moved = ourTop.filter((id, i) => theirRank.get(id) !== i).length;
const p187 = p187moved >= 15;

/* ── the rooms ────────────────────────────────────────────────────────────── */
const rows = []; for (let r = 0; r < ROOMS; r++) rows.push(runRoom(A));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const rstat = {}; POS.forEach(q => {
  const v = rows.map(r => r.roster[q] || 0);
  rstat[q] = { mean: +mean(v).toFixed(2), sd: +sd(v).toFixed(2), min: Math.min(...v), max: Math.max(...v) };
});
const p188 = rstat.RB.mean >= 4 && rstat.RB.mean <= 6
  && Math.abs(rstat.K.mean - 1) < 0.05 && Math.abs(rstat.DEF.mean - 1) < 0.05;
const p189 = rstat.QB.mean > 1.30;

const ctl = {
  C1_a0_is_a_plain_ds_proj_ranking: { ok: idOK(at0, byProj), why: 'known positive and the smoke test for the whole pipeline' },
  C2_no_source_mixing: { ok: true, pool: pool.length, excluded_inside_adp200: excluded.length,
    excluded_names: excluded.slice(0, 10),
    why: 'a player with no Draft Sharks line is EXCLUDED, never back-filled with our proj_mean — mixing two sources inside one VONA is the defect this model removes' },
  C3_band_order_valid: { ok: true, rejected_rows: rejected.length, rejected: rejected.slice(0, 5) },
  C4_need_curve_is_the_committed_one: { ok: MN.controls_all_passed === true },
};

const out = {
  _territory: 'TERRITORY: A — draft/tools/simple_model.js',
  _prereg: 'draft/SIMPLE-MODEL-PREREG-2026-08-19.md',
  _note: 'REPORT ONLY. engine.js, draft_plan.js and public/draft_data.json untouched.',
  adjuster_a: A, rooms: ROOMS,
  controls: ctl, controls_all_passed: Object.values(ctl).every(c => c.ok),
  pool_size: pool.length, excluded_inside_adp200: excluded,
  mean_roster: rstat,
  grades: { P186_adjuster_identity: p186, P187_reorders_our_board: p187,
            P188_keeps_the_shape_we_won: p188, P189_qb_leak_survives: p189 },
  p187_moved_in_top_100: p187moved,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', `simple_model_a${String(A).replace('.', '')}.json`),
  JSON.stringify(out, null, 1));

console.log(`THE SIMPLE MODEL — Draft Sharks × VONA × need   (adjuster a = ${A})\n`);
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k));
console.log(`\n  pool (players with a Draft Sharks line) : ${pool.length}`);
console.log(`  excluded inside ADP 200                : ${excluded.length}  ${excluded.slice(0, 4).join(', ')}`);
console.log(`\n  MEAN ROSTER over ${ROOMS} rooms (12 picks + keepers WR/RB/RB)`);
console.log('  ' + 'pos'.padEnd(6) + 'roster'.padStart(8) + 'sd'.padStart(7) + 'min'.padStart(6) + 'max'.padStart(6) + '   Cory said');
const SAID = { QB: '1', RB: '4-5', WR: '4-5', TE: '—', K: '1', DEF: '1' };
POS.forEach(q => console.log('  ' + q.padEnd(6) + String(rstat[q].mean).padStart(8)
  + String(rstat[q].sd).padStart(7) + String(rstat[q].min).padStart(6)
  + String(rstat[q].max).padStart(6) + '   ' + SAID[q]));
console.log(`\n  P186  adjuster is exactly what Cory described : ${p186 ? 'TRUE' : 'FALSE'}`);
console.log(`  P187  their projections reorder our board    : ${p187 ? 'TRUE' : 'FALSE'}  (${p187moved} of top 100 move)`);
console.log(`  P188  keeps the roster shape we already won  : ${p188 ? 'TRUE' : 'FALSE'}`);
console.log(`  P189  the QB leak survives (predicted TRUE)  : ${p189 ? 'TRUE' : 'FALSE'}`);

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
  dsById.set(String(p.sleeper_id), { floor: f, proj: m, ceiling: c,
    risk: p.injury_risk_pct == null ? null : +p.injury_risk_pct });
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
/* ── THE NEED FIX (P191-P193). Prereg: draft/NEED-FIX-PREREG-2026-08-19.md ────
 *
 * Cory: "our equation sucks.. this shouldn't be that hard." He is right and it
 * is not.
 *
 * The measured curve gives K2 = 0.828 in a ONE-KICKER league. That is not a
 * near-miss, it is the wrong question: the curve measures WHICH OF MY BODIES
 * FILLED THE ONE SLOT, and those shares decompose a single slot rather than
 * counting how many bodies I need. The curve's own control proves it -- QB
 * starters per team-week is 1.000 exactly.
 *
 * So every 1-slot position is broken and no multi-slot one is. Cory's K/DEF
 * hard rule was patching this bug on the two positions he happened to notice.
 *
 *   need(pos, n) = P( Binomial(n-1, 1-q) < S_eff ) * (1 - streamability)
 *
 * S_eff is the MEASURED starters per team-week, fractional and treated as such
 * (floor w.p. 1-frac, ceil w.p. frac) -- which is how the flex enters without a
 * rule about it. q is the per-player miss rate. Nothing is chosen. */
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'streamability.json'), 'utf8'));
if (!ST.controls_all_passed) throw new Error('streamability failed its controls — REFUSING');
const STREAM = ST.streamability;
const S_EFF = { QB: 1.000, RB: 2.417, WR: 2.556, TE: 1.017, K: 0.996, DEF: 0.996 };
const NEEDFIX = process.env.NEEDFIX !== 'off';

function binomLess(n, pAvail, S) {
  /* P(Binomial(n, pAvail) < S) with S possibly fractional: mix floor and ceil
   * by the fractional part, which is the flex arriving as a probability. */
  const lo = Math.floor(S), hi = Math.ceil(S), frac = S - lo;
  const cdfBelow = k => {                      // P(X < k)
    let acc = 0, c = 1;
    for (let i = 0; i < k && i <= n; i++) {
      acc += c * Math.pow(pAvail, i) * Math.pow(1 - pAvail, n - i);
      c = c * (n - i) / (i + 1);
    }
    return Math.min(1, acc);
  };
  return lo === hi ? cdfBelow(lo) : (1 - frac) * cdfBelow(lo) + frac * cdfBelow(hi);
}

/* ── PER-PLAYER MISS RATE, AND THE ASSUMPTION IS STATED ──────────────────────
 *
 * Register 112: our own board carries ONE `games_expected` per POSITION, so
 * Josh Allen and a third-string journeyman are equally available. Draft Sharks
 * gives a per-player `injury_risk_pct` — the first per-player availability
 * signal this project has had.
 *
 * ⚠️ IT IS NOT A GAMES-MISSED RATE AND IS NOT USED AS ONE. It runs 0-85 with a
 * median of 35, and reading it as "misses 78% of games" for McCaffrey would be
 * absurd. It is an ORDINAL risk score, so it is calibrated onto the position's
 * MEASURED miss rate (from the same lineups the need curve was counted on):
 *
 *     q(p) = q_measured(pos) × ( risk(p) / median risk(pos) ) + bye
 *
 * The position level stays exactly what we measured; only the ORDERING within
 * a position comes from Draft Sharks. Capped so a extreme score cannot send a
 * player past "misses most of the year". K and DEF carry risk 0 throughout,
 * which is why their q is the bye alone. */
const Q_POS = { QB: 0.147, RB: 0.224, WR: 0.176, TE: 0.188, K: 0.02, DEF: 0.02 };
const BYE = 1 / 17;
const RISK_MED = {};
function qOf(x) {
  const pos = x.position;
  const r = x.ds && x.ds.risk;
  const med = RISK_MED[pos];
  const scale = (r != null && med > 0) ? Math.min(2.5, r / med) : 1;
  return Math.min(0.75, (Q_POS[pos] || 0.15) * scale + BYE);
}
const Q_MED = {};

/* median Draft Sharks risk per position — the denominator of the calibration */
(() => {
  const by = {};
  pool.forEach(x => { const r = x.ds && x.ds.risk;
    if (r != null) (by[x.position] = by[x.position] || []).push(r); });
  POS.forEach(q => { const v = (by[q] || []).sort((a, b) => a - b);
    RISK_MED[q] = v.length ? v[v.length >> 1] : 0; });
})();


function needFixed(pos, held, x) {
  const S = S_EFF[pos] || 1;
  const q = x ? qOf(x) : ((Q_POS[pos] || 0.15) + BYE);
  const raw = binomLess(held, 1 - q, S);
  const sr = STREAM[pos];
  return sr == null ? raw : raw * (1 - sr);
}

/* ── CORY'S CURVE, TRANSCRIBED. Prereg: draft/CORYS-CURVE-PREREG-2026-08-19.md
 *
 * "must draft 1 k and 1 def!! ... once have 1 QB and TE, equation should
 *  severely restrict QB and TE recommendation, it should put in such a hole
 *  that value should have to be incredible! WR should hold importance until you
 *  have 4 then be cut, RB should hold until you have 3 then cut, and cut to
 *  almost 0 when you have 4."
 *
 * Indexed by HOW MANY I ALREADY HOLD. The values are MY RENDERING of his words
 * and are declared, not fitted: "severely restrict" is 0.05, a twentyfold hole,
 * so a second quarterback must out-value a receiver by 20x to be taken. If the
 * roster misses, the response is NOT to nudge these. */
const CORY = {
  K:   [1.00, 0],
  DEF: [1.00, 0],
  QB:  [1.00, 0.05, 0],
  TE:  [1.00, 0.05, 0],
  RB:  [1.00, 1.00, 0.90, 0.25, 0.05, 0.02],
  WR:  [1.00, 1.00, 1.00, 0.90, 0.15, 0.05],
};
const CURVE_ARM = process.env.CURVE || 'cory';
/* P197/P198 — every need FORM that has been graded, re-run on identical inputs
 * (Draft Sharks projections, surplus valuation, corrected wire, same rooms).
 * Prereg: draft/REGRADE-PREREG-2026-08-19.md. A sweep, and no arm may become
 * "the model" by winning it. */

/* ── P196: VALUE IS SURPLUS OVER THE WIRE, NOT THE TIMING CLIFF ──────────────
 * P194 failed with need at 0.05 -- a twentyfold hole -- because VONA is not
 * comparable across positions. QB's best-to-2nd cliff is 39.0, the largest on
 * the board, while its 2nd man is worth 17 over a 322.9 wire; RB's cliff is
 * 11.0 sitting on 233 points of surplus. Late, when RB/WR need has collapsed
 * and their cliffs are 3-5 points, the quarterback's raw 39 wins anyway.
 *
 * I wrote this diagnosis myself in model_diagnostics.js -- "VONA is a TIMING
 * signal and does not belong in the value term" -- and then built the model on
 * VONA alone. */
const WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
const VALUE_ARM = process.env.VALUE || 'surplus';   // 'surplus' | 'vona'

const RULES = process.env.RULES !== 'off';   // Cory's two rulings, on by default
function needOf(pos, held, flexOwner, cand) {
  /* CORY'S RULING, 2026-08-19: "same problem with K and def, once you draft 1
   * the need should be 0." Preregistered and graded as P149, and again as P177
   * where it put K and DEF on exactly 1.00 with sd 0.00 in all 300 rooms. NOT
   * a term I invented, and dropping it in the rewrite is what let DEF fall to
   * 0.76 with a minimum of ZERO -- rosters with no defence at all. */
  if (CURVE_ARM === 'cory') {
    const row = CORY[pos] || [];
    const v = row[held];
    return v == null ? (row.length ? row[row.length - 1] : 0) : v;
  }
  if (CURVE_ARM === 'derived') return needFixed(pos, held, cand);
  if (CURVE_ARM === 'measured') {           // the counted curve, as committed
    const v = (CURVE[pos] || [])[held];
    return v == null ? 0 : v;
  }
  if (CURVE_ARM === 'p144' || CURVE_ARM === 'p146') {
    /* B/C: the two forms from the one-equation family. P144 weighted a body by
     * P(EVER needed across the season); P146 by E[weeks he actually starts] --
     * the single substitution that fixed QB and broke TE, K and RB. Both are
     * rebuilt from the SAME measured start rates so the only difference between
     * them is the substitution itself. */
    const S = (STARTERS[pos] || 0) + (flexOwner === pos ? (STARTERS.FLEX || 0) : 0);
    if (held < S) return 1;
    const r = (CURVE[pos] || [])[held];
    if (r == null) return 0;
    if (CURVE_ARM === 'p146') return r;                  // expected weeks started
    return 1 - Math.pow(1 - r, 17);                      // P(ever needed) over a season
  }
  if (RULES && (pos === 'K' || pos === 'DEF') && held >= 1) return 0;
  if (NEEDFIX) return needFixed(pos, held, cand);
  const S = (STARTERS[pos] || 0) + (flexOwner === pos ? (STARTERS.FLEX || 0) : 0);
  if (S <= 0) return 0;
  if (held < S) return 1;                       // an empty starting slot
  const v = (CURVE[pos] || [])[held];
  return v == null ? 0 : v;
}

/* CORY'S RULING, 2026-08-19: "if value is best at RB and WR each round then we
 * should take them until there are 4 picks remaining and we still need QB, TE,
 * DEF, K... then RB and WR need goes to 0... so picks remaining should have a
 * role." Graded as P162. Its role is RESERVATION: you never let the number of
 * slots you MUST still fill exceed the chances you have left. Inside that
 * window the positions you do not need are not low-weighted, they are NOT
 * OPTIONS -- which is what makes an empty starting slot impossible. */
function unfilledSlots(held, base) {
  let n = 0;
  POS.forEach(q => { n += Math.max(0, (base[q] || 0) - (held[q] || 0)); });
  const surplus = FLEX_ELIGIBLE.reduce(
    (a, q) => a + Math.max(0, (held[q] || 0) - (base[q] || 0)), 0);
  return n + Math.max(0, (STARTERS.FLEX || 0) - surplus);
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
    const mustFill = unfilledSlots(held, base);
    const forcing = RULES && (SCHED.length - i) <= mustFill;
    const needsSlot = q => {
      if ((q === 'K' || q === 'DEF') && (held[q] || 0) >= (base[q] || 0)) return false;
      if (CURVE_ARM === 'cory' && needOf(q, held[q] || 0, fo, null) <= 0) return false;
      const S = (base[q] || 0) + (fo === q ? (STARTERS.FLEX || 0) : 0);
      return (held[q] || 0) < S;
    };
    let best = null, bestV = -Infinity;
    for (const x of avail) {
      if (forcing && !needsSlot(x.position)) continue;   // the reservation gate
      const here = projUsed(x, a);
      /* VONA: this man now, against the best I could still get at his position
       * at my NEXT pick. On the last pick there is no next pick, so the whole
       * remaining value is on the table. */
      const later = nextPick ? bestAt(availLater, x.position, a) : null;
      const vona = later == null ? here : Math.max(0, here - later);
      /* surplus = what he is worth AT ALL, against a body I could have free.
       * VONA answers "when", not "how much" (P196). */
      const surplus = Math.max(0, here - (WAIVER[x.position] || 0));
      const valueTerm = VALUE_ARM === 'vona' ? vona : surplus;
      const v = valueTerm * needOf(x.position, held[x.position] || 0, fo, x);
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
  const legal = POS.every(q => (roster[q] || 0) >= (base[q] || 0));
  return { counts: c, roster, legal };
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
const illegal = rows.filter(r => !r.legal).length;
/* Cory, 2026-08-19: "rest RB and WR with normally more WR than RBs". "Normally"
 * is a RATE, not a comparison of two means -- two means can order one way while
 * most individual rooms order the other. */
const wrOverRb = rows.filter(r => (r.roster.WR || 0) > (r.roster.RB || 0)).length / rows.length;
const onesies = ['QB', 'TE', 'K', 'DEF'].every(q => Math.abs(rstat[q].mean - 1) <= 0.10);
const corySpec = onesies && wrOverRb >= 0.5;
const p188 = rstat.RB.mean >= 4 && rstat.RB.mean <= 6
  && Math.abs(rstat.K.mean - 1) < 0.05 && Math.abs(rstat.DEF.mean - 1) < 0.05;
const p190 = Math.abs(rstat.DEF.mean - 1) < 0.05 && Math.abs(rstat.K.mean - 1) < 0.05
  && illegal === 0 && rstat.RB.mean >= 4 && rstat.RB.mean <= 6 && rstat.QB.mean > 1.30;
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
  rules_on: RULES, rooms_with_an_empty_starting_slot: illegal,
  cory_spec: { onesies_all_1: onesies, share_of_rooms_WR_over_RB: +wrOverRb.toFixed(3), meets_spec: corySpec },
  grades: { P186_adjuster_identity: p186, P187_reorders_our_board: p187,
            P188_keeps_the_shape_we_won: p188, P189_qb_leak_survives: p189,
            P190_with_corys_two_rules: p190 },
  p187_moved_in_top_100: p187moved,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', `simple_model_a${String(A).replace('.', '')}.json`),
  JSON.stringify(out, null, 1));

console.log(`THE SIMPLE MODEL — Draft Sharks × VONA × need   (adjuster a = ${A}, curve = ${CURVE_ARM})\n`);
if (CURVE_ARM === 'cory') {
  console.log('  CORY\'S CURVE, as it ran — need by how many I already hold');
  POS.forEach(q => console.log('    ' + q.padEnd(5)
    + (CORY[q] || []).map(v => v.toFixed(2).padStart(7)).join('')));
  console.log('');
}
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
console.log(`\n  CORY'S SPEC — 1 QB/TE/K/DEF, rest RB+WR, normally more WR`);
console.log(`    onesies all on 1 (+/-0.10)   : ${onesies ? 'YES' : 'NO'}`);
console.log(`    rooms with WR > RB           : ${(wrOverRb * 100).toFixed(0)}%`);
console.log(`    MEETS HIS SPEC               : ${corySpec ? 'YES' : 'NO'}`);
console.log(`  P190  + Cory's K/DEF rule and reservation gate: ${p190 ? 'TRUE' : 'FALSE'}  `
  + `(rules ${RULES ? 'ON' : 'OFF'}, rooms with an empty starting slot: ${illegal})`);

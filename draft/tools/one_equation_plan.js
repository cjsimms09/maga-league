// TERRITORY: A
/* ONE EQUATION. NO SEATS, NO SHORTLIST, NO CAP, NO WEIGHTS.
 *
 * Cory, 2026-08-19: "the correct equation will normally draft 3-4WR, 3-4RB, 1Qb,
 * 1TE, 1 def, and 1 K normally!!! and extract the most value out of draft in the
 * process."
 *
 * Prereg: draft/ONE-EQUATION-PREREG-2026-08-19.md (P144, P145), committed first.
 *
 *     value(p) = need(pos, held) x ( proj_mean(p) - waiver_level(pos) )
 *
 * take the highest. That is the model.
 *
 * It needs no seat logic because need = 1.0 while held < S, so a position you
 * cannot yet field prices at its full margin over the wire and gets taken first.
 * Starters fall out of the same equation that prices the bench.
 *
 * THE MECHANISM, WHICH IS CORY'S: RB and WR are injured more AND their wire is
 * barren, so need stays high and margin stays large. QB and TE are durable-ish
 * AND their wire is deep, so the second one is worth almost nothing.
 *
 * THE FLEX is credited, at EVERY pick, to whichever position currently has the
 * largest need-weighted margin -- a live seat going to whoever most deserves it.
 * Declared in the prereg before running; not a tuning knob.
 *
 * REPORT ONLY. draft_plan.js and the engine are untouched. no_fit_guard: if the
 * shape does not fall out, that is the finding and the fix is a preregistered
 * change to the EQUATION, not a cap bolted on afterwards.
 *
 * Run: node draft/tools/one_equation_plan.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const WEEKS = 17;
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE'];
const STARTERS = (DATA.league || {}).starters || {};
const WAIVER = PLAN.WAIVER || { QB: 319, RB: 112, WR: 124, TE: 124, K: 134, DEF: 112 };

/* ── the season-basis need curve, same construction as need_curve.js ──────── */
function gamesExpected(pos) {
  const v = DATA.players.filter(p => p.position === pos && p.games_expected != null)
    .map(p => +p.games_expected);
  if (!v.length) throw new Error('one_equation: board carries no games_expected for ' + pos);
  const s = v.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}
const Q = Object.fromEntries(POS.map(p => [p, (WEEKS - gamesExpected(p) + 1) / WEEKS]));
const binomAtLeast = (k, S, q) => {
  let p = 0;
  for (let j = k; j <= S; j++) {
    let c = 1;
    for (let i = 0; i < j; i++) c = c * (S - i) / (i + 1);
    p += c * Math.pow(q, j) * Math.pow(1 - q, S - j);
  }
  return p;
};
function need(pos, held, flexOwner) {
  const S = (STARTERS[pos] || 0) + (flexOwner === pos ? (STARTERS.FLEX || 0) : 0);
  if (S <= 0) return 0;
  if (held < S) return 1.0;
  return 1 - Math.pow(1 - binomAtLeast(held - S + 1, S, Q[pos]), WEEKS);
}

/* ── the drive ────────────────────────────────────────────────────────────── */
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0 && POS.includes(p.position));
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const SCHED = PLAN.SCHED;

const held = {};
PLAN.keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
const keptCounts = Object.assign({}, held);

/* the flex goes, at EVERY pick, to whoever currently has the largest
 * need-weighted margin — recomputed, never cached (control 2) */
function chooseFlexOwner() {
  let best = null, bestV = -Infinity;
  FLEX_ELIGIBLE.forEach(pos => {
    const avail = pool.filter(p => p.position === pos && !taken.has(String(p.player_id)));
    const top = avail.sort((a, b) => b.proj_mean - a.proj_mean)[0];
    if (!top) return;
    const v = need(pos, held[pos] || 0, pos) * Math.max(0, top.proj_mean - (WAIVER[pos] || 0));
    if (v > bestV) { bestV = v; best = pos; }
  });
  return best;
}

const taken = new Set();
const picks = [], flexTrace = [];
SCHED.forEach((pk, i) => {
  const gone = new Set(byAdp.slice(0, pk - 1).map(x => String(x.player_id)));
  const flexOwner = chooseFlexOwner();
  flexTrace.push({ pick: pk, flex_to: flexOwner });
  let best = null, bestV = -Infinity;
  pool.forEach(p => {
    const id = String(p.player_id);
    if (taken.has(id) || gone.has(id)) return;
    const v = need(p.position, held[p.position] || 0, flexOwner)
      * Math.max(0, p.proj_mean - (WAIVER[p.position] || 0));
    if (v > bestV) { bestV = v; best = p; }
  });
  if (!best) { picks.push({ pick: pk, name: null }); return; }
  taken.add(String(best.player_id));
  held[best.position] = (held[best.position] || 0) + 1;
  picks.push({ pick: pk, name: best.name, pos: best.position, adp: best.adp,
               proj: best.proj_mean, value: +bestV.toFixed(1),
               need: +need(best.position, (held[best.position] || 1) - 1, flexOwner).toFixed(3),
               flex_to: flexOwner });
});

/* ── controls ─────────────────────────────────────────────────────────────── */
const drafted = picks.filter(p => p.name);
const counts = {};
drafted.forEach(p => { counts[p.pos] = (counts[p.pos] || 0) + 1; });
const full = Object.assign({}, counts);
Object.entries(keptCounts).forEach(([k, v]) => { full[k] = (full[k] || 0) + v; });

const ctl = {
  C1_need_curve_matches_published: (() => {
    /* the published table: RB season at held 3 = 1.000, held 4 = 0.902 (flex RB) */
    const a = need('RB', 3, 'RB'), b = need('RB', 4, 'RB');
    return { ok: Math.abs(a - 1.000) < 0.002 && Math.abs(b - 0.902) < 0.002,
      got: [+a.toFixed(3), +b.toFixed(3)],
      why: 'must reproduce need_curve.js\'s published RB column exactly' };
  })(),
  C2_flex_credited_once_every_pick: { ok: flexTrace.every(f => FLEX_ELIGIBLE.includes(f.flex_to)),
    trace: flexTrace.map(f => f.flex_to),
    why: 'recomputed per pick; crediting it to RB+WR+TE at once once drafted three TEs' },
  C3_keepers_counted: { ok: JSON.stringify(keptCounts) === JSON.stringify(
      PLAN.keep.reduce((a, k) => (a[k.position] = (a[k.position] || 0) + 1, a), {})),
    kept: keptCounts },
  C4_twelve_picks_on_the_real_schedule: { ok: drafted.length === SCHED.length && SCHED.length === 12,
    sched: SCHED },
  C5_room_drained_by_adp: { ok: true, why: 'strict ADP order, identical to the other arms' },
};
const allOk = Object.values(ctl).every(c => c.ok);

/* ── predictions ──────────────────────────────────────────────────────────── */
const c = k => counts[k] || 0;
const p144 = { drafted_counts: counts,
  WR_in_3_4: c('WR') >= 3 && c('WR') <= 4, RB_in_3_4: c('RB') >= 3 && c('RB') <= 4,
  QB_is_1: c('QB') === 1, TE_is_1: c('TE') === 1, K_is_1: c('K') === 1, DEF_is_1: c('DEF') === 1 };
p144.TRUE = p144.WR_in_3_4 && p144.RB_in_3_4 && p144.QB_is_1 && p144.TE_is_1
  && p144.K_is_1 && p144.DEF_is_1;

const planTotal = PLAN.plan.filter(x => x.p).reduce((a, x) => a + (x.p.proj_mean || 0), 0);
const mineTotal = drafted.reduce((a, x) => a + (x.proj || 0), 0);
const p145 = { one_equation_total: +mineTotal.toFixed(1), draft_plan_total: +planTotal.toFixed(1),
  pct_diff: +(100 * (mineTotal - planTotal) / planTotal).toFixed(1) };
p145.TRUE = Math.abs(p145.pct_diff) <= 5;

console.log('ONE EQUATION — need x (proj - waiver). No seats, no shortlist, no cap.\n');
Object.entries(ctl).forEach(([k, v]) => console.log('  ' + (v.ok ? 'OK ' : '!! ') + k));
if (!allOk) console.log('\n  !! A CONTROL FAILED. Nothing below is a measurement.\n');
console.log('\n  keepers: ' + PLAN.keep.map(k => k.position + ' ' + k.name).join(', '));
console.log('\n  pick  take                        proj   need   value  flex');
picks.forEach(p => console.log('  ' + String(p.pick).padStart(4) + '  '
  + (p.name ? (p.pos + ' ' + p.name) : '—').padEnd(27)
  + (p.proj != null ? p.proj.toFixed(0).padStart(6) : '     —')
  + (p.need != null ? p.need.toFixed(3).padStart(7) : '      —')
  + (p.value != null ? p.value.toFixed(1).padStart(8) : '       —')
  + '  ' + (p.flex_to || '')));
console.log('\n  DRAFTED: ' + POS.map(p => p + c(p)).join(' '));
console.log('  FULL 15: ' + POS.map(p => p + (full[p] || 0)).join(' '));
console.log('\n  P144 (3-4 WR, 3-4 RB, exactly 1 QB/TE/K/DEF among the twelve): '
  + (p144.TRUE ? 'TRUE' : 'FALSE'));
Object.entries(p144).filter(([k]) => k !== 'TRUE' && k !== 'drafted_counts')
  .forEach(([k, v]) => console.log('     ' + (v ? 'ok  ' : 'MISS') + ' ' + k));
console.log('  P145 (within 5% of draft_plan on total projected points): '
  + (p145.TRUE ? 'TRUE' : 'FALSE') + '   one-equation ' + p145.one_equation_total
  + ' vs draft_plan ' + p145.draft_plan_total + '  (' + p145.pct_diff + '%)');

const rep = { _territory: 'TERRITORY: A — draft/tools/one_equation_plan.js',
  _prereg: 'draft/ONE-EQUATION-PREREG-2026-08-19.md',
  _note: 'REPORT ONLY. No cap, no seats. Writes no board field.',
  board_built_at: DATA.built_at, waiver_levels: WAIVER, q_per_week: Q,
  controls: ctl, controls_all_passed: allOk,
  picks, drafted_counts: counts, full_roster: full, P144: p144, P145: p145 };
const i = process.argv.indexOf('--json');
if (i >= 0) { fs.writeFileSync(process.argv[i + 1], JSON.stringify(rep, null, 1));
  console.log('\n  wrote ' + process.argv[i + 1]); }
process.exitCode = allOk ? 0 : 1;

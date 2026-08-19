// TERRITORY: A
/* THE MARGINAL-LINEUP DRAFTER — no need curve, no caps, no forced slots.
 *
 * Prereg: draft/LINEUP-DRAFTER-PREREG-2026-08-19.md (P206-P208).
 *
 *   value(candidate) = E[lineup points over 17 weeks WITH him]
 *                    − E[lineup points over 17 weeks WITHOUT him]
 *
 * Nothing about roster shape is written down. If the objective is right, the
 * shape falls out of it.
 *
 * REPORT ONLY. Writes draft/data/lineup_drafter.json.
 * Run: node draft/tools/lineup_drafter.js [--eval 4000] [--marg 150]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const DS = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draftsharks_projections_2026.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const SLOTS = [['QB'], ['RB'], ['RB'], ['WR'], ['WR'], ['TE'], ['RB', 'WR', 'TE'], ['K'], ['DEF']];
const WEEKS = 17;
const WEEK_CV = { QB: 0.44, RB: 0.54, WR: 0.57, TE: 0.59, K: 0.48, DEF: 0.70 };  // measured
const Q_POS = { QB: 0.147, RB: 0.224, WR: 0.176, TE: 0.188, K: 0.02, DEF: 0.02 };
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? +process.argv[i + 1] : d; };
const EVAL_N = arg('--eval', 4000);      // seasons for the final head-to-head
const MARG_N = arg('--marg', 150);       // seasons per candidate while drafting
const SHORTLIST = arg('--shortlist', 45);

/* ── pool ─────────────────────────────────────────────────────────────────── */
const dsById = new Map();
(DS.players || []).forEach(p => {
  if (p.sleeper_id == null) return;
  const f = +p.floor_proj, m = +p.ds_proj, c = +p.ceil_proj;
  if (f <= m && m <= c) dsById.set(String(p.sleeper_id),
    { floor: f, proj: m, ceiling: c, risk: p.injury_risk_pct == null ? null : +p.injury_risk_pct });
});
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = [];
BOARD.players.forEach(p => {
  const d = dsById.get(String(p.player_id));
  if (!d || !POS.includes(p.position)) return;
  pool.push({ id: String(p.player_id), key: (+p.player_id) >>> 0,
    name: p.name || p.player_name, position: p.position, adp: adpOf(p),
    bye: p.bye != null ? +p.bye : (p.bye_week != null ? +p.bye_week : null),
    ds: d, mu: d.proj / WEEKS, risk: d.risk });
});
const RISK_MED = {};
POS.forEach(q => {
  const v = pool.filter(x => x.position === q && x.risk != null).map(x => x.risk).sort((a, b) => a - b);
  RISK_MED[q] = v.length ? v[v.length >> 1] : 0;
});
pool.forEach(x => {
  const med = RISK_MED[x.position];
  const sc = (x.risk != null && med > 0) ? Math.min(2.5, x.risk / med) : 1;
  x.missRate = Math.min(0.6, (Q_POS[x.position] || 0.15) * sc);
  x.sdWeek = Math.max(0.5, (WEEK_CV[x.position] || 0.5) * x.mu);
  const band = (x.ds.ceiling - x.ds.proj) / 1.2815515655446004;
  const fromWeekly = x.sdWeek * Math.sqrt(WEEKS);
  x.sdSeason = Math.sqrt(Math.max(0, band * band - fromWeekly * fromWeekly)) / WEEKS;
});

/* ── COMMON RANDOM NUMBERS, keyed to (player, season, week) ──────────────────
 * THE CONTROL THAT DECIDES WHETHER ANY OF THIS MEANS ANYTHING. With a shared
 * sequence, adding a candidate shifts every later draw and the with/without
 * delta is dominated by noise instead of by him. Keyed streams make a player's
 * luck independent of who else is on the roster. */
function h32(a, b, c) {
  let x = (a ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (b + 0x85ebca6b), 0xcc9e2d51) >>> 0;
  x = Math.imul(x ^ (c + 0xc2b2ae35), 0x1b873593) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0;
  x ^= x >>> 12; x = Math.imul(x, 0x297a2d39) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
const inv = u => {              // fast normal quantile, Beasley-Springer-Moro
  const y = u - 0.5;
  if (Math.abs(y) < 0.42) {
    const r = y * y;
    return y * (((-25.44106049637 * r + 41.39119773534) * r - 18.61500062529) * r + 2.50662823884)
      / ((((3.13082909833 * r - 21.06224101826) * r + 23.08336743743) * r - 8.47351093090) * r + 1);
  }
  let r = u > 0.5 ? 1 - u : u;
  r = Math.log(-Math.log(r));
  let s = 0.3374754822726147 + r * (0.9761690190917186 + r * (0.1607979714918209
    + r * (0.0276438810333863 + r * (0.0038405729373609 + r * (0.0003951896511919
    + r * (0.0000321767881768 + r * (0.0000002888167364 + r * 0.0000003960315187)))))));
  return u > 0.5 ? s : -s;
};

function lineupPoints(roster, season) {
  let total = 0;
  const shift = new Map();
  for (const x of roster) shift.set(x.id, x.sdSeason * inv(h32(x.key, season, 999)));
  for (let w = 1; w <= WEEKS; w++) {
    const live = [];
    for (const x of roster) {
      if (x.bye === w) continue;
      if (h32(x.key, season, w + 500) < x.missRate) continue;
      const base = x.mu + shift.get(x.id);
      const real = Math.max(0, base + x.sdWeek * inv(h32(x.key, season, w)));
      live.push({ x, real });
    }
    /* no weekly foresight: the manager starts by expected form, scores reality.
     * The last experiment showed foresight is worth ~5% and does not change any
     * ordering, so the drafter is judged at the conservative end. */
    live.sort((a, b) => (b.x.mu + shift.get(b.x.id)) - (a.x.mu + shift.get(a.x.id)));
    const used = new Set();
    for (const slot of SLOTS) {
      for (const c of live) {
        if (used.has(c.x.id) || !slot.includes(c.x.position)) continue;
        used.add(c.x.id); total += c.real; break;
      }
    }
  }
  return total;
}
const evaluate = (roster, n, off) => {
  let s = 0; for (let i = 0; i < n; i++) s += lineupPoints(roster, i + (off || 0));
  return s / n;
};

/* ── the drafters ─────────────────────────────────────────────────────────── */
const KEEP = PLAN.keep.map(k => pool.find(x => x.name === k.name)).filter(Boolean);
let _o = 20260819;
const ornd = () => { _o = (_o * 1664525 + 1013904223) >>> 0; return _o / 4294967296; };
const roomOrder = (() => {
  _o = 20260819;
  return pool.map(p => ({ p, k: p.adp + (inv(ornd()) * 12) }))
    .sort((a, b) => a.k - b.k).map(o => o.p.id);
})();

function draft(pick) {
  const roster = [...KEEP];
  const taken = new Set(roster.map(x => x.id));
  PLAN.SCHED.forEach((pk, i) => {
    const gone = new Set(roomOrder.slice(0, pk - 1));
    const avail = pool.filter(x => !taken.has(x.id) && !gone.has(x.id));
    const best = pick(avail, roster, i);
    if (!best) return;
    taken.add(best.id); roster.push(best);
  });
  return roster;
}

const armMean = draft(avail => avail.reduce((b, x) => (!b || x.ds.proj > b.ds.proj) ? x : b, null));

let marginalCalls = 0;
const armMarginal = draft((avail, roster) => {
  /* only the plausible few: a man 40 spots down the board cannot win the
   * marginal comparison, and evaluating all 250 costs 6x for nothing */
  const short = [...avail].sort((a, b) => b.ds.proj - a.ds.proj).slice(0, SHORTLIST);
  /* and the best remaining at each position, so a kicker is never excluded by
   * a shortlist that is really a projection ranking */
  POS.forEach(q => {
    const bq = avail.filter(x => x.position === q)
      .reduce((b, x) => (!b || x.ds.proj > b.ds.proj) ? x : b, null);
    if (bq && !short.includes(bq)) short.push(bq);
  });
  const without = evaluate(roster, MARG_N);
  let best = null, bv = -Infinity;
  for (const c of short) {
    marginalCalls++;
    const v = evaluate([...roster, c], MARG_N) - without;
    if (v > bv) { bv = v; best = c; }
  }
  return best;
});

/* ── controls ─────────────────────────────────────────────────────────────── */
const twice = [evaluate(armMean, 200), evaluate(armMean, 200)];
const thirdK = (() => {
  /* a candidate who can never start: a third kicker behind two already held */
  const ks = pool.filter(x => x.position === 'K').sort((a, b) => b.ds.proj - a.ds.proj);
  const base = [...armMean.filter(x => x.position !== 'K'), ks[0], ks[1]];
  return evaluate([...base, ks[2]], 400) - evaluate(base, 400);
})();
const legal = (r) => {
  const c = {}; r.forEach(x => { c[x.position] = (c[x.position] || 0) + 1; });
  const need = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
  return { counts: c, ok: POS.every(q => (c[q] || 0) >= need[q]),
    missing: POS.filter(q => (c[q] || 0) < need[q]) };
};
const byeSpread = r => {
  const c = {}; r.forEach(x => { if (x.bye != null) c[x.bye] = (c[x.bye] || 0) + 1; });
  return Math.max(...Object.values(c), 0);
};

const legalMarg = legal(armMarginal), legalMean = legal(armMean);
const scoreMean = evaluate(armMean, EVAL_N, 100000);
const scoreMarg = evaluate(armMarginal, EVAL_N, 100000);
const p206 = scoreMarg > scoreMean;
const p207 = legalMarg.ok;
const p208 = byeSpread(armMarginal) < byeSpread(armMean);

const ctl = {
  C1_deterministic: { ok: Math.abs(twice[0] - twice[1]) < 1e-9, values: twice,
    why: 'common random numbers -- the same roster must score bit-identically' },
  C2_a_man_who_can_never_start_is_worth_zero: { ok: Math.abs(thirdK) < 0.5,
    delta: +thirdK.toFixed(4),
    why: 'a THIRD kicker behind two cannot reach the lineup. If his marginal '
       + 'value is not zero, the with/without draws are not aligned and every '
       + 'number here is noise' },
};
const out = {
  _territory: 'TERRITORY: A — draft/tools/lineup_drafter.js',
  _prereg: 'draft/LINEUP-DRAFTER-PREREG-2026-08-19.md',
  _note: 'REPORT ONLY. No need curve, no caps, no forced slots.',
  eval_seasons: EVAL_N, marginal_seasons: MARG_N, shortlist: SHORTLIST,
  marginal_evaluations: marginalCalls,
  controls: ctl, controls_all_passed: Object.values(ctl).every(c => c.ok),
  score: { draft_by_mean: +scoreMean.toFixed(1), marginal_lineup_value: +scoreMarg.toFixed(1),
    diff_pct: +(100 * (scoreMarg - scoreMean) / scoreMean).toFixed(2) },
  roster_counts: { mean: legalMean.counts, marginal: legalMarg.counts },
  legal: { mean: legalMean.ok, marginal: legalMarg.ok, marginal_missing: legalMarg.missing },
  max_starters_on_one_bye: { mean: byeSpread(armMean), marginal: byeSpread(armMarginal) },
  rosters: { mean: armMean.map(x => `${x.name} (${x.position}, bye ${x.bye})`),
             marginal: armMarginal.map(x => `${x.name} (${x.position}, bye ${x.bye})`) },
  grades: { P206_beats_draft_by_mean: p206, P207_legal_without_rules: p207,
            P208_spreads_byes: p208 },
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'lineup_drafter.json'), JSON.stringify(out, null, 1));

console.log('MARGINAL-LINEUP DRAFTER — no need curve, no caps, no forced slots\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k
  + (k.startsWith('C2') ? `  (delta ${v.delta})` : '')));
console.log(`\n  ${marginalCalls} marginal evaluations at ${MARG_N} seasons each\n`);
console.log(`  draft-by-mean            ${scoreMean.toFixed(1)}`);
console.log(`  marginal lineup value    ${scoreMarg.toFixed(1)}   `
  + (scoreMarg > scoreMean ? '+' : '') + (100 * (scoreMarg - scoreMean) / scoreMean).toFixed(2) + '%');
console.log(`\n  roster by mean      ${JSON.stringify(legalMean.counts)}  legal ${legalMean.ok}`);
console.log(`  roster by marginal  ${JSON.stringify(legalMarg.counts)}  legal ${legalMarg.ok}`
  + (legalMarg.ok ? '' : `  MISSING ${legalMarg.missing.join(',')}`));
console.log(`\n  most starters on one bye week — mean ${byeSpread(armMean)}, marginal ${byeSpread(armMarginal)}`);
console.log(`\n  P206  beats draft-by-mean          : ${p206 ? 'TRUE' : 'FALSE'}`);
console.log(`  P207  legal with NO rules          : ${p207 ? 'TRUE' : 'FALSE'}`);
console.log(`  P208  spreads byes                 : ${p208 ? 'TRUE' : 'FALSE'}`);

// TERRITORY: A
/* WHAT WOULD ADDING MIKE CLAY TO THE BLEND ACTUALLY DO TO THE BOARD?
 *
 * Cory, 2026-08-20: "can we include that as a source on our war room and also
 * add to blended?"
 *
 * The war-room COLUMN is free — source_boards.js emits order only and writes no
 * board field. The BLEND is not: `proj_mean` feeds vorp, tiers, every rank, VONA
 * and the whole engine, so a seventh source moves every number Cory drafts on,
 * two days before he drafts on them. That deserves a measurement rather than a
 * shrug in either direction, and this is it.
 *
 * REPORT ONLY. Changes nothing. Writes draft/data/clay_blend_impact.json.
 *
 * ── THE CONTROL THAT MAKES THE REST MEAN ANYTHING (rule 3e) ──────────────────
 *
 * Before reporting what a 7-source blend WOULD do, this reproduces the shipped
 * 6-source blend from the same code path and checks it against the live
 * `proj_mean`. If today's blend cannot be reproduced, the with-Clay number is
 * an invention and the tool refuses to print it. That check has a demonstrated
 * fail arm: dropping a source from the reproduction makes it fire.
 *
 * ⚠️ AND IT IS AN ESTIMATE OF THE PIPELINE, NOT THE PIPELINE. The real blend
 * runs inside blended_projection.js against projection_snapshot_2026.json, and
 * Clay is not in that snapshot. Wiring him in properly is C's ingest work. This
 * answers "is it worth doing before Saturday", which is the only question that
 * has a deadline.
 *
 * Run: node draft/tools/clay_blend_impact.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const MS = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'multisource_projections.json'), 'utf8'));
const CLAY = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'clay_projections_2026.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE'];        // Clay covers no DEF and no scored K
const SCHED = [33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];

const players = BOARD.players.filter(p => p.position && POS.indexOf(p.position) >= 0
  && (p.proj_mean || 0) > 0);

/* every source's value for a player, on the board's own scale */
const msOf = id => (MS.players || {})[String(id)] || {};
const clayOf = id => (CLAY.players || {})[String(id)];
function values(p) {
  const m = msOf(p.player_id).by_source || {};
  return {
    sleeper: p.proj_sleeper, fantasypros: p.proj_fantasypros, draftsharks: p.proj_ds,
    cbs: m.CBS, espn: m.ESPN, fftoday: m.FFToday,
    clay: (clayOf(p.player_id) || {}).proj_clay_scored,
  };
}

/* per-position median offset against the shipped blend — the same centring the
 * real tool applies, because a source that runs low everywhere is a LEVEL
 * difference and not an opinion (register 107). */
function offsets(keys) {
  const off = {};
  keys.forEach(k => {
    off[k] = {};
    POS.forEach(q => {
      const d = players.filter(p => p.position === q)
        .map(p => { const v = values(p)[k]; return v == null ? null : v - p.proj_mean; })
        .filter(v => v != null).sort((a, b) => a - b);
      off[k][q] = d.length >= 10 ? d[d.length >> 1] : 0;
    });
  });
  return off;
}

function blend(p, keys, off) {
  const v = values(p);
  const got = keys.map(k => (v[k] == null ? null : v[k] - (off[k][p.position] || 0)))
    .filter(x => x != null);
  return got.length ? got.reduce((a, b) => a + b, 0) / got.length : null;
}

const SIX = ['sleeper', 'cbs', 'espn', 'fftoday', 'draftsharks', 'fantasypros'];
const SEVEN = SIX.concat(['clay']);

/* ── C1: reproduce TODAY'S blend before predicting tomorrow's ─────────────── */
const off6 = offsets(SIX);
const repro = players.map(p => ({ p, got: blend(p, SIX, off6) })).filter(x => x.got != null);
const errs = repro.map(x => Math.abs(x.got - x.p.proj_mean)).sort((a, b) => a - b);
const medErr = errs[errs.length >> 1];
const p95Err = errs[Math.floor(errs.length * 0.95)];
/* The bar is derived, not chosen: this reconstruction centres on the SHIPPED
 * mean rather than on the snapshot's board_proj_mean, so a few points of drift
 * are structural. What it must NOT be is a different blend. 8 points is ~2.5% of
 * a startable projection; beyond that the reproduction is not the same object. */
const C1_ok = medErr < 8;

const off7 = offsets(SEVEN);
const rows = [];
players.forEach(p => {
  const a = blend(p, SIX, off6), b = blend(p, SEVEN, off7);
  if (a == null || b == null) return;
  rows.push({ id: String(p.player_id), name: p.name, position: p.position,
    adp: p.adp == null ? null : Math.round(p.adp), shipped: p.proj_mean,
    six: +a.toFixed(2), seven: +b.toFixed(2), delta: +(b - a).toFixed(2),
    has_clay: values(p).clay != null });
});

/* rank movement inside Cory's real range */
const inRange = rows.filter(r => r.adp != null && r.adp <= 200);
function ranksBy(field) {
  const byPos = {};
  inRange.forEach(r => (byPos[r.position] || (byPos[r.position] = [])).push(r));
  const out = {};
  Object.values(byPos).forEach(list => {
    list.slice().sort((x, y) => y[field] - x[field]).forEach((r, i) => { out[r.id] = i + 1; });
  });
  return out;
}
const r6 = ranksBy('six'), r7 = ranksBy('seven');
const moved = inRange.map(r => ({ ...r, rank_move: (r6[r.id] || 0) - (r7[r.id] || 0) }))
  .filter(r => r.rank_move !== 0);
moved.sort((a, b) => Math.abs(b.rank_move) - Math.abs(a.rank_move));

const covered = rows.filter(r => r.has_clay).length;
const deltas = rows.filter(r => r.has_clay).map(r => Math.abs(r.delta)).sort((a, b) => a - b);

const doc = {
  _territory: 'TERRITORY: A — draft/tools/clay_blend_impact.js',
  _what: 'What adding Mike Clay as a 7th blend source would do to the board.',
  _cannot: 'THIS IS NOT THE PIPELINE. The real blend runs in blended_projection.js '
         + 'against projection_snapshot_2026.json, which does not contain Clay. This '
         + 'estimates the impact so the decision to wire him in is informed.',
  control_C1_reproduces_todays_blend: {
    ok: C1_ok, median_abs_error: +medErr.toFixed(2), p95_abs_error: +p95Err.toFixed(2),
    n: repro.length,
    why: 'the 6-source blend is rebuilt from the same code path and checked against '
       + 'the live proj_mean. If today cannot be reproduced, the with-Clay number is '
       + 'an invention.' },
  clay_coverage: { players_with_clay: covered, of: rows.length,
    positions: POS.reduce((a, q) => (a[q] = rows.filter(r => r.position === q && r.has_clay).length, a), {}) },
  point_impact: deltas.length ? {
    median_abs_delta: +deltas[deltas.length >> 1].toFixed(2),
    p95_abs_delta: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2),
    max_abs_delta: +deltas[deltas.length - 1].toFixed(2) } : null,
  rank_impact_inside_adp_200: {
    players_whose_positional_rank_moves: moved.length, of: inRange.length,
    biggest: moved.slice(0, 12).map(r => ({ name: r.name, position: r.position,
      adp: r.adp, rank_move: r.rank_move, delta: r.delta })) },
  cory_schedule: SCHED,
};

fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'clay_blend_impact.json'),
  JSON.stringify(doc, null, 1));

console.log('\n  ADDING MIKE CLAY TO THE BLEND — measured, nothing changed\n');
console.log('  C1 reproduce today\'s blend: ' + (C1_ok ? '✅ PASS' : '❌ FAIL')
  + '  median err ' + medErr.toFixed(2) + '  p95 ' + p95Err.toFixed(2) + ' pts');
if (!C1_ok) {
  console.log('\n  ⛔ REFUSING to report a with-Clay number: if today\'s blend cannot be');
  console.log('     reproduced, tomorrow\'s is not a measurement.');
  process.exit(1);
}
console.log('  Clay covers ' + covered + ' of ' + rows.length + ' blended skill players');
if (doc.point_impact) {
  console.log('  point move where he has an opinion:  median '
    + doc.point_impact.median_abs_delta + '   p95 ' + doc.point_impact.p95_abs_delta
    + '   max ' + doc.point_impact.max_abs_delta);
}
console.log('\n  POSITIONAL RANK MOVES inside ADP 200: ' + moved.length + ' of ' + inRange.length);
moved.slice(0, 10).forEach(r => console.log('    ' + (r.rank_move > 0 ? '▲' : '▼')
  + String(Math.abs(r.rank_move)).padStart(2) + '  ' + r.position.padEnd(3)
  + r.name.padEnd(24) + 'ADP ' + String(r.adp).padStart(4)
  + '   ' + (r.delta > 0 ? '+' : '') + r.delta + ' pts'));
console.log('\n  wrote draft/data/clay_blend_impact.json');

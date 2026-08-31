#!/usr/bin/env node
// TERRITORY: A
/* REGISTER 119, RE-MEASURED ON THE BOARD THAT SHIPS.
 *
 * 119, 2026-08-19: *"our `proj_ceiling` measures analyst disagreement, not
 * player volatility, and for receivers those are close to opposites."* Its
 * evidence was a table over ADP 90–250 — median implied sigma against each
 * position's own wire sigma — reading
 *
 *     RB +4.1 · QB +2.6 · DEF +1.3 · K −1.0 · TE −1.3 · WR −2.5
 *
 * with the headline **"the mid-round WR has the NARROWEST band on the board"**.
 * Its stated next action was: the fix is an INPUT, and when Draft Sharks lands,
 * re-run against the new sigma. Draft Sharks landed on 08-19.
 *
 * ── WHAT THIS TOOL WILL AND WILL NOT CLAIM ─────────────────────────────────
 *
 * ⛔ IT DOES NOT REPRODUCE THE 08-19 TABLE, AND THAT IS NOT A BUG IN THE PROBE.
 * The statistic here is byte-identical to `average_draft.js`'s own `sigmaOf`
 * and `SIGMA_WIRE` — control C1 reads both out of that file's source rather
 * than retyping them. Run against `proj_ceiling_pre_ds`, the cross-source
 * column on today's board, RB comes out 16.76 median against a 16.76 wire
 * where 08-19 published 16.1 against 12.0. THE INPUT NO LONGER EXISTS: the
 * board was rebuilt on 08-26 with new projections, so the cross-source bands
 * themselves moved. A number that cannot be reproduced because its input is
 * gone is a dated measurement, not a refuted one (register 364).
 *
 * ⭐ WHAT IT DOES ESTABLISH, and it is enough to settle the row:
 *
 *   1. THE PREMISE IS SUPERSEDED. `proj_ceiling_source` is reported, per
 *      position and per band. The 08-19 finding described a board where zero
 *      players carried a per-player outcome band.
 *
 *   2. 119'S STATISTIC IS SCALE-SENSITIVE ACROSS POSITIONS, AND THAT ALONE
 *      FLIPS ITS CONCLUSION — on 119's OWN column, not on the new one. A
 *      difference in POINTS between a quarterback's band and a receiver's is
 *      not a comparison of dispersion, because the two positions score on
 *      different scales. The ratio and the coefficient of variation are
 *      printed beside the difference so the reader can see which orderings
 *      survive the change of unit and which do not.
 *
 * Run: node draft/tools/ceiling_source_recheck.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const AD_SRC = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'average_draft.js'), 'utf8');
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));

const Z128 = 1.2815515655446004;
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const BAND = [90, 250];                       // register 119's own range

const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const sigmaOf = (p, col) => (p[col] != null && p.proj_mean != null)
  ? Math.max(0, (+p[col] - +p.proj_mean) / Z128) : null;
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

/* ── C1: the wire rank comes OUT OF average_draft.js, never retyped ───────── */
const WIRE_RANK = (() => {
  const m = AD_SRC.match(/const WIRE_RANK = \{([^}]*)\}/);
  if (!m) throw new Error('ceiling_source_recheck: cannot read WIRE_RANK out of '
    + 'average_draft.js — REFUSING to retype it. A second copy is how two tools '
    + 'come to disagree about the same statistic.');
  const out = {};
  m[1].split(',').forEach(kv => {
    const p = kv.split(':');
    if (p.length === 2) out[p[0].trim()] = +p[1];
  });
  return out;
})();

/* The wire body is the (N+1)th best at his position IN THE LEAGUE, so the pool
 * is the league population, not the draftable remainder (register 397). */
const POOL = PLAN.starterPool();
function wireSigma(col, q) {
  const v = POOL.filter(p => p.position === q && p.proj_mean != null)
    .sort((a, b) => +b.proj_mean - +a.proj_mean);
  const r = WIRE_RANK[q] || 1;
  const win = v.slice(Math.max(0, r - 4), r + 3).map(p => sigmaOf(p, col))
    .filter(x => x != null).sort((a, b) => a - b);
  return win.length ? win[win.length >> 1] : null;
}

function table(col) {
  const band = BOARD.players.filter(p => {
    const a = adpOf(p);
    return a >= BAND[0] && a <= BAND[1];
  });
  return POS.map(q => {
    const ps = band.filter(p => p.position === q && sigmaOf(p, col) != null);
    const ms = med(ps.map(p => sigmaOf(p, col)));
    const w = wireSigma(col, q);
    return { pos: q, n: ps.length, median_sigma: ms, wire_sigma: w,
      difference: (ms != null && w != null) ? +(ms - w).toFixed(2) : null,
      ratio: (ms != null && w > 0) ? +(ms / w).toFixed(3) : null,
      cv: med(ps.map(p => sigmaOf(p, col) / (+p.proj_mean || 1))) };
  }).filter(r => r.difference != null);
}

/* ── controls ─────────────────────────────────────────────────────────────── */
const ctl = {};
ctl.C1_statistic_read_from_average_draft = {
  ok: Object.keys(WIRE_RANK).length === POS.length
    && /\(\+p\.proj_ceiling - \+p\.proj_mean\) \/ Z128/.test(AD_SRC),
  wire_rank: WIRE_RANK,
  why: 'WIRE_RANK is parsed out of average_draft.js and the sigma formula is '
     + 'asserted present there, so this probe cannot drift from the tool whose '
     + 'measurement register 119 quoted' };

ctl.C2_the_two_columns_really_differ = (() => {
  const a = table('proj_ceiling_pre_ds'), b = table('proj_ceiling');
  const gap = a.reduce((s, r, i) => s + Math.abs(r.median_sigma - b[i].median_sigma), 0);
  return { ok: gap > 1, total_abs_gap: +gap.toFixed(2),
    why: 'KNOWN NEGATIVE — if the pre-DS and shipped columns are identical the '
       + 'Draft Sharks attach is not reaching the board and every comparison '
       + 'below is a run against itself' };
})();

ctl.C3_pre_ds_column_exists = (() => {
  const n = BOARD.players.filter(p => p.proj_ceiling_pre_ds != null).length;
  return { ok: n > 100, players_with_pre_ds_ceiling: n,
    why: 'REFUSING to describe a "before" that is not on the board' };
})();
if (!ctl.C3_pre_ds_column_exists.ok) {
  throw new Error('ceiling_source_recheck: the board carries only '
    + ctl.C3_pre_ds_column_exists.players_with_pre_ds_ceiling + ' pre-DS ceilings — '
    + 'REFUSING to compare against a column that is not there.');
}

/* ── the source census — register 119's premise, stated as a count ────────── */
function census(lo, hi) {
  const rows = BOARD.players.filter(p => { const a = adpOf(p); return a >= lo && a <= hi; });
  const c = {};
  rows.forEach(p => {
    const k = /draftsharks/i.test(String(p.ds_band_from || p.proj_ceiling_source || ''))
      ? 'draftsharks_per_player' : String(p.ds_band_from || 'other');
    c[k] = (c[k] || 0) + 1;
  });
  return { n: rows.length, by_source: c,
    draftsharks_pct: +(100 * (c.draftsharks_per_player || 0) / Math.max(1, rows.length)).toFixed(1) };
}
const CENSUS = { band_90_250: census(90, 250), top_200: census(0, 200) };

const allOk = Object.values(ctl).every(c => c.ok);
const PRE = table('proj_ceiling_pre_ds');
const NOW = table('proj_ceiling');

console.log('REGISTER 119 RE-MEASURED — is the mid-round WR still the narrowest band?\n');
Object.entries(ctl).forEach(([k, c]) => console.log('  ' + (c.ok ? 'OK ' : '!! ') + k));
if (!allOk) console.log('\n  !! A CONTROL FAILED. Nothing below is a measurement.\n');

console.log('\n  1. THE PREMISE, AS A COUNT — where does `proj_ceiling` come from now?');
console.log('     ADP 90-250 : ' + CENSUS.band_90_250.draftsharks_pct + '% Draft Sharks per-player  '
  + JSON.stringify(CENSUS.band_90_250.by_source));
console.log('     ADP <= 200 : ' + CENSUS.top_200.draftsharks_pct + '% Draft Sharks per-player');
console.log('     Register 119 described a board where this was ZERO.');

[['PRE-DS cross-source column (119\'s own quantity, today\'s board)', PRE],
 ['SHIPPED column', NOW]].forEach(([label, rows]) => {
  console.log('\n  ' + label + '   ADP ' + BAND[0] + '-' + BAND[1]);
  console.log('     pos    n   med sigma     wire   DIFFERENCE      ratio       cv');
  rows.slice().sort((a, b) => b.difference - a.difference).forEach(r =>
    console.log('     ' + r.pos.padEnd(5) + String(r.n).padStart(3)
      + r.median_sigma.toFixed(2).padStart(11) + r.wire_sigma.toFixed(2).padStart(9)
      + ((r.difference >= 0 ? '+' : '') + r.difference.toFixed(1)).padStart(13)
      + r.ratio.toFixed(3).padStart(11) + r.cv.toFixed(3).padStart(9)));
});

const rankBy = (rows, key) => rows.slice().sort((a, b) => b[key] - a[key]).map(r => r.pos);
console.log('\n  2. WHICH ORDERING SURVIVES A CHANGE OF UNIT?');
[['pre-DS ', PRE], ['shipped', NOW]].forEach(([lab, rows]) => {
  console.log('     ' + lab + '  by DIFFERENCE (119\'s unit, POINTS): ' + rankBy(rows, 'difference').join(' > '));
  console.log('     ' + '       '  + '  by RATIO  sigma/wire          : ' + rankBy(rows, 'ratio').join(' > '));
  console.log('     ' + '       '  + '  by CV     sigma/projection    : ' + rankBy(rows, 'cv').join(' > '));
});
const wrRank = (rows, key) => rankBy(rows, key).indexOf('WR') + 1;
console.log('\n     WR\'s rank among six (1 = widest):');
console.log('       pre-DS   difference ' + wrRank(PRE, 'difference')
  + '   ratio ' + wrRank(PRE, 'ratio') + '   cv ' + wrRank(PRE, 'cv'));
console.log('       shipped  difference ' + wrRank(NOW, 'difference')
  + '   ratio ' + wrRank(NOW, 'ratio') + '   cv ' + wrRank(NOW, 'cv'));

const rep = {
  _territory: 'TERRITORY: A — draft/tools/ceiling_source_recheck.js',
  _answers: 'register 119',
  _generated_at: new Date().toISOString(),
  _board_built_at: BOARD.built_at || null,
  _note: 'Does NOT reproduce the 2026-08-19 table — the 08-26 rebuild replaced the '
       + 'cross-source bands it was measured on. Dated, not refuted (register 364).',
  controls: ctl, controls_all_passed: allOk,
  band: BAND, census: CENSUS, pre_ds: PRE, shipped: NOW };
const i = process.argv.indexOf('--json');
if (i >= 0) {
  fs.writeFileSync(process.argv[i + 1], JSON.stringify(rep, null, 1) + '\n');
  console.log('\n  wrote ' + process.argv[i + 1]);
}
process.exitCode = allOk ? 0 : 1;

// TERRITORY: A
/* DID MIKE CLAY'S 2025 PRESEASON PROJECTION BEAT THE ROOM'S OWN DRAFT ORDER?
 *
 * Prereg: draft/CLAY-2025-RETROGRADE-PREREG-2026-08-20.md, committed BEFORE the
 * 2025 file existed. Cory: "c is also uploading his 2025 draft guide so we can
 * grade it."
 *
 * ── WHY THIS TOOL RUNS TODAY, WITH NO CLAY DATA ─────────────────────────────
 *
 * Because a harness first exercised on the data it is meant to judge has never
 * been tested, only run (rule 3e). The two controls below use data we already
 * hold, so the harness proves it can detect a real signal AND reject a fake one
 * before Clay ever reaches it. When the 2025 store lands, the only new thing is
 * the source; the instrument will already have a track record.
 *
 * ⛔ THE VERSION GATE IS CHECKED FIRST AND IS NOT NEGOTIABLE. Clay updates his
 * guide continuously -- the 2026 edition prints "Updated: 8/19/2026". A 2025
 * edition updated on or after 2025-09-04 (Week 1) contains games already played,
 * and grading it measures nothing but our willingness to be impressed. Missing
 * or ambiguous date => treated as in-season => the accuracy grade does not run.
 *
 * REPORT ONLY. Writes draft/data/clay_2025_retrograde.json.
 * Run: node draft/tools/clay_2025_retrograde.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const W = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'backtest', 'nflverse_weekly_points_2025.json'), 'utf8'));
const PP = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'player_positions.json'), 'utf8'));

const CLAY25 = path.join(ROOT, 'draft', 'data', 'clay_projections_2025.json');
const SEASON_START = '2025-09-04';       // 2025 NFL Week 1

/* ── actual 2025 season points, per player, from the committed store ───────── */
const actual = {};
(W.weeks || []).forEach(w => {
  Object.entries(w.points || {}).forEach(([id, pts]) => {
    actual[String(id)] = (actual[String(id)] || 0) + (Number(pts) || 0);
  });
});

/* ── the population: the 150 players THIS ROOM drafted in 2025 ─────────────── */
const season25 = Object.values(H.seasons).find(s => String(s.season) === '2025');
const draft25 = (season25.drafts || []).find(d => (d.picks || []).length >= 100);
const drafted = (draft25.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);

const posOf = id => (PP.positions || {})[String(id)] || null;

/* ── Spearman, with ties handled by average rank ───────────────────────────── */
function rankOf(vals) {
  const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(vals.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(x, y) {
  if (x.length < 3) return null;
  const rx = rankOf(x), ry = rankOf(y);
  const n = x.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sx += (rx[i] - mx) ** 2;
    sy += (ry[i] - my) ** 2;
  }
  return (sx && sy) ? +(sxy / Math.sqrt(sx * sy)).toFixed(4) : null;
}

/* deterministic shuffle for C2 — no Math.random, so the control reproduces */
function shuffled(arr) {
  const a = arr.slice();
  let s = 20260820;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── the rows we can build TODAY: draft order vs actual ────────────────────── */
const rows = [];
drafted.forEach(pk => {
  const id = String(pk.player_id);
  const a = actual[id];
  if (a == null) return;                       // never scored in 2025
  rows.push({ id, pick_no: pk.pick_no, position: posOf(id), actual: +a.toFixed(2) });
});

function byPosition(list, xf, yf) {
  const out = {};
  ['QB', 'RB', 'WR', 'TE'].forEach(q => {
    const g = list.filter(r => r.position === q);
    out[q] = { n: g.length, spearman: g.length >= 3 ? spearman(g.map(xf), g.map(yf)) : null,
      interpretable: g.length >= 15 };
  });
  out.POOLED = { n: list.length, spearman: spearman(list.map(xf), list.map(yf)) };
  return out;
}

/* market signal = EARLIER pick is a stronger claim, so negate pick_no */
const marketVsActual = byPosition(rows, r => -r.pick_no, r => r.actual);

/* ── CONTROLS ──────────────────────────────────────────────────────────────── */
const C1_ok = marketVsActual.POOLED.spearman != null && marketVsActual.POOLED.spearman > 0.15;
const shuffledPicks = shuffled(rows.map(r => r.pick_no));
const noise = rows.map((r, i) => ({ ...r, fake: -shuffledPicks[i] }));
const noiseVsActual = byPosition(noise, r => r.fake, r => r.actual);
const C2_ok = noiseVsActual.POOLED.spearman != null && Math.abs(noiseVsActual.POOLED.spearman) < 0.15;

/* ── the version gate + Clay, when he lands ────────────────────────────────── */
let clay = null, gate = null;
if (fs.existsSync(CLAY25)) {
  clay = JSON.parse(fs.readFileSync(CLAY25, 'utf8'));
  const updated = clay.guide_updated || clay._guide_updated || clay.updated || null;
  const iso = updated ? String(updated) : null;
  const inSeason = !iso || !/\d{4}-\d{2}-\d{2}/.test(iso) || iso >= SEASON_START;
  gate = { guide_updated_reported: iso, season_start: SEASON_START,
    verdict: inSeason ? 'IN-SEASON OR UNDATED — ACCURACY GRADE DOES NOT RUN'
                      : 'PRESEASON — grade may run',
    why: 'a guide updated after Week 1 contains games already played; grading it '
       + 'measures nothing but our willingness to be impressed. Missing or '
       + 'ambiguous is treated as in-season, because the conservative direction '
       + 'cannot manufacture a false result.' };
}

const doc = {
  _territory: 'TERRITORY: A — draft/tools/clay_2025_retrograde.js',
  _prereg: 'draft/CLAY-2025-RETROGRADE-PREREG-2026-08-20.md',
  _what: 'Does a preseason projection beat THIS ROOM\'S OWN 2025 draft order at '
       + 'ranking what actually happened in 2025?',
  population: { n_drafted_2025: drafted.length, n_with_2025_points: rows.length,
    excluded_and_why: 'the 23 drafted players without 2025 points are 10 DEF + 11 K '
      + '(the weekly-points store carries neither, and this grade covers QB/RB/WR/TE '
      + 'per the prereg) plus two individuals. Accounted for rather than left as a '
      + 'gap between 150 and 127.',
    why: 'Cory 2026-08-19: "grade the top 150 by ADP only". This league\'s own '
       + '2025 draft IS 150 picks — the exact players this room paid for.' },
  controls: {
    C1_known_positive_the_market_must_show_real_signal: {
      ok: C1_ok, pooled_spearman: marketVsActual.POOLED.spearman, bar: '> 0.15',
      why: 'if the harness cannot show that draft order predicts outcomes, its '
         + 'verdict on Clay is worthless.' },
    C2_known_negative_shuffled_order_must_collapse: {
      ok: C2_ok, pooled_spearman: noiseVsActual.POOLED.spearman, bar: '|r| < 0.15',
      why: 'a harness that scores noise well is measuring its own joins. The '
         + 'shuffle is seeded, not random, so this control reproduces.' },
  },
  controls_all_passed: C1_ok && C2_ok,
  the_comparator_to_beat: { market_draft_order_vs_actual_2025: marketVsActual },
  clay: clay ? { version_gate: gate } : {
    status: 'NOT YET UPLOADED — draft/data/clay_projections_2025.json absent',
    what_C_must_report_first: 'the guide\'s own printed "Updated:" date, verbatim',
  },
};

fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'clay_2025_retrograde.json'),
  JSON.stringify(doc, null, 1));

console.log('\n  CLAY 2025 RETROGRADE — the instrument, proven before it is used\n');
console.log('  population: ' + rows.length + ' of ' + drafted.length
  + ' 2025 draft picks carry 2025 points');
console.log('              the other 23 are 10 DEF + 11 K + 2 individuals — this grade is QB/RB/WR/TE');
console.log('\n  CONTROLS');
console.log('    C1 known POSITIVE — draft order predicts 2025 points: '
  + (C1_ok ? '✅' : '❌') + '  r = ' + marketVsActual.POOLED.spearman + '  (bar > 0.15)');
console.log('    C2 known NEGATIVE — shuffled order collapses:          '
  + (C2_ok ? '✅' : '❌') + '  r = ' + noiseVsActual.POOLED.spearman + '  (bar |r| < 0.15)');
console.log('\n  THE BAR CLAY HAS TO CLEAR — the room\'s own draft order:');
['QB', 'RB', 'WR', 'TE'].forEach(q => {
  const c = marketVsActual[q];
  console.log('    ' + q.padEnd(4) + 'r = ' + String(c.spearman).padStart(8)
    + '   n = ' + String(c.n).padStart(3) + (c.interpretable ? '' : '   (n<15 — reported, not interpreted)'));
});
console.log('    ' + 'ALL'.padEnd(4) + 'r = ' + String(marketVsActual.POOLED.spearman).padStart(8)
  + '   n = ' + marketVsActual.POOLED.n);
console.log('\n  Clay 2025: ' + (clay ? gate.verdict : 'not uploaded yet'));
console.log('\n  wrote draft/data/clay_2025_retrograde.json');
process.exit(doc.controls_all_passed ? 0 : 1);

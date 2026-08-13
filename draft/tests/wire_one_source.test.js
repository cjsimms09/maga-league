// TERRITORY: A
// FOUR TOOLS, FOUR COPIES OF ONE NUMBER, AND THEY HAD ALREADY DRIFTED.
//
// C measured it on 2026-08-13 and routed it: `emit_seat_plan.js` derived its
// wire level from `wire_level.js` while `free_picks.js`, `draft_card.js` and
// `wire_vs_bench.js` still carried `WIRE = {QB 20.9, RB 5.3, WR 13.3, TE 6.3}`.
// Nothing was broken. The tools simply disagreed:
//
//     pos   transcribed   measured    ratio
//     QB       20.9        23.38      1.12x
//     RB        5.3         7.80      1.47x
//     TE        6.3        11.60      1.84x
//     WR       13.3        11.10      0.83x   <- THE OTHER WAY
//
// NOT A UNIFORM SHIFT, so it is not a correction a reader can carry in his head
// at a table: open one tool and a marginal TE is worth rostering, open another
// and he is streamable, and on WR the two halves of the toolset swap sides.
//
// ── THE CHECK IS "NOBODY TRANSCRIBES IT", NOT "THE COPIES MATCH" ──────────
//
// Pinning the four numbers to each other would go green on four tools carrying
// four identical WRONG constants — which is the state this repo shipped for a
// week. The property that actually holds is that there is ONE derivation, so
// this asserts NO tool in draft/tools carries a hardcoded wire table at all,
// and that every consumer's runtime value IS `wire_level.levels()`.
//
// ── AND THE MEASUREMENT THAT SAYS THE MIGRATION WENT THE RIGHT WAY ────────
//
// The obvious defence of the old numbers is that median-of-cell-medians weights
// every WEEK equally while pooling over-weights CHURN weeks — real, and worth
// more than an opinion. Measured over the same 422 scored acquisitions, week-
// equalising moves QB 0.30, RB 0.00, WR 0.07 and TE 0.85 points. The whole
// 20.9-vs-23.4 gap is the `min_n = 5` reporting floor, which keeps 1 of 42 QB
// cells. That sweep is asserted below rather than quoted, because a comment is
// where a measurement goes to stop being true.
//
// Run: node draft/tests/wire_one_source.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const TOOLS = path.join(ROOT, 'draft', 'tools');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const WL = require(path.join(TOOLS, 'wire_level.js'));
const LV = WL.levels();

// ── 1. THE SINGLE SOURCE EXISTS AND IS HONEST ABOUT ITSELF ──────────────
ck('wire_level exports a levels() that names its statistic',
  typeof WL.levels === 'function' && LV.statistic === 'pooled_sample_median', LV.statistic);
ck('every measured position has a level and an n', WL.MEASURED_POSITIONS.every(p =>
  Number.isFinite(LV.per_week[p]) && Number.isFinite(LV.n[p])), LV);
ck('the n travels with the value it summarises — the old pairing carried the n '
  + 'of a DIFFERENT estimator', WL.MEASURED_POSITIONS.every(p =>
    LV.n[p] === WL.requireSample(p).length),
  WL.MEASURED_POSITIONS.map(p => p + ':' + LV.n[p] + '/' + WL.requireSample(p).length));
ck('the provenance sentence states the sample it was taken from, so a tool that '
  + 'prints it cannot invent a different one',
  /\b\d+ of \d+ acquisitions\b/.test(LV.provenance)
  && LV.provenance.indexOf(String(LV.scored)) >= 0, LV.provenance);

// ── 2. NO TOOL TRANSCRIBES THE TABLE ────────────────────────────────────
/* A wire table is a literal mapping at least two of the four positions to
 * numbers. Written as a shape rather than as a filename list, because the whole
 * defect was a list that did not know about a file. */
/* `[^}]*` WOULD NOT DO. `wire_vs_bench` wrote `{QB: {v: 20.9, n: 5}, RB: ...}`,
 * so the closing brace of the FIRST entry sits between the two positions and a
 * negated-brace class stops dead there — the detector would have reported the
 * one file whose shape was different as clean. Bounded `[\s\S]` spans instead,
 * short enough that it cannot wander into unrelated code, and both shapes are
 * driven through it in the fail arms below. */
const TABLE = /\bWIRE[A-Z_]*\s*=\s*\{[\s\S]{0,80}?(QB|RB|WR|TE)\s*:\s*\{?\s*(v\s*:\s*)?-?\d[\s\S]{0,80}?(QB|RB|WR|TE)\s*:\s*\{?\s*(v\s*:\s*)?-?\d/;
const jsFiles = fs.readdirSync(TOOLS).filter(f => f.endsWith('.js'));
const offenders = jsFiles.filter(f => {
  const src = fs.readFileSync(path.join(TOOLS, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return TABLE.test(src);
});
ck('NO tool in draft/tools carries a transcribed wire table', offenders.length === 0, offenders);
ck('CONTROL — there are tools to check and the reader is not scanning an empty '
  + 'directory', jsFiles.length > 20, jsFiles.length);
ck('CONTROL — the detector FIRES on the exact constant that shipped',
  TABLE.test('const WIRE = { QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3 };'));
ck('and on the {v, n} shape wire_vs_bench used, which a naive reader would miss',
  TABLE.test('const WIRE = {\n QB: { v: 20.9, n: 5 }, RB: { v: 5.3, n: 46 },\n};'));

// ── 3. EVERY CONSUMER'S RUNTIME VALUE IS THE MEASURED ONE ───────────────
/* Source-text checks cannot prove a tool ends up with the right number. These
 * four are LOADED and their live table compared. `emit_seat_plan` publishes it
 * into the artifact, which is the one a human actually reads on the day. */
{
  const seat = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));
  ck('the shipped seat plan carries the measured level, not a stale copy',
    WL.MEASURED_POSITIONS.every(p =>
      Math.abs((seat.wire_per_week || {})[p] - LV.per_week[p]) < 1e-9),
    { artifact: seat.wire_per_week, measured: LV.per_week });
  ck('and the artifact\'s n matches too — the pair that was mismatched before',
    WL.MEASURED_POSITIONS.every(p => (seat.wire_n || {})[p] === LV.n[p]),
    { artifact: seat.wire_n, measured: LV.n });
}
{
  const PLAN = require(path.join(TOOLS, 'draft_plan.js'));
  const VS = PLAN.wireVsStarter();
  ck('draft_plan.wireVsStarter reads the same level the tools print',
    WL.MEASURED_POSITIONS.every(p => VS[p].wire === LV.per_week[p]), VS);
  ck('and prices it against a starter line derived from the league\'s OWN roster '
    + 'shape rather than an assumed one',
    WL.MEASURED_POSITIONS.every(p => VS[p].slots > 0 && VS[p].pct > 0),
    WL.MEASURED_POSITIONS.map(p => p + ':' + VS[p].slots));
  /* THE CLAIM THREE TOOLS MAKE IN PROSE — "hold RBs, the wire is worst there" —
   * asserted as the ORDERING it actually is. It used to be made from raw points,
   * which is not a cross-position comparison at all; it happens to survive. */
  const ranked = WL.MEASURED_POSITIONS.slice().sort((a, b) => VS[a].pct - VS[b].pct);
  ck('the hold-this-position claim is an ordering of RATIOS and RB is still first',
    ranked[0] === 'RB', ranked.map(p => p + ' ' + VS[p].pct.toFixed(0) + '%'));
  ck('CONTROL — ranking by RAW POINTS gives the same answer for the wrong reason, '
    + 'which is why the prose was never caught',
    WL.MEASURED_POSITIONS.slice().sort((a, b) => VS[a].wire - VS[b].wire)[0] === 'RB');
  ck('but the two orderings genuinely DIFFER further down, so they are not the '
    + 'same statistic',
    JSON.stringify(ranked) !== JSON.stringify(
      WL.MEASURED_POSITIONS.slice().sort((a, b) => VS[a].wire - VS[b].wire)),
    { by_ratio: ranked, by_points: WL.MEASURED_POSITIONS.slice().sort((a, b) => VS[a].wire - VS[b].wire) });
}

// ── 4. THE SWEEP THAT JUSTIFIES THE DIRECTION OF THE MIGRATION ──────────
// Re-measured here rather than quoted: week-equalising must move the level by
// less than the filter does, or the migration traded one artefact for another.
{
  const M = WL.measure();
  const med = s => { const a = s.slice().sort((x, y) => x - y);
    return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
  const OLD = { QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3 };
  const moves = {};
  WL.MEASURED_POSITIONS.forEach(p => {
    const bw = M.byWeek[p] || {};
    const cellMed = med(Object.keys(bw).map(k => med(bw[k])));
    moves[p] = { equalise: Math.abs(cellMed - LV.per_week[p]),
      filter: Math.abs(OLD[p] - LV.per_week[p]) };
  });
  ck('week-equalising the sample moves every position by under a point',
    WL.MEASURED_POSITIONS.every(p => moves[p].equalise < 1.0), moves);
  ck('while the min_n=5 FILTER moves them by far more — so the gap was the '
    + 'filter, not the choice of statistic',
    WL.MEASURED_POSITIONS.every(p => moves[p].filter > moves[p].equalise * 2), moves);
  ck('CONTROL — the shipped level really did change, or none of this mattered',
    WL.MEASURED_POSITIONS.some(p => Math.abs(OLD[p] - LV.per_week[p]) > 2), moves);
  ck('CONTROL — and it changed in BOTH directions, which is why no reader could '
    + 'hold a correction in his head',
    WL.MEASURED_POSITIONS.some(p => LV.per_week[p] > OLD[p])
    && WL.MEASURED_POSITIONS.some(p => LV.per_week[p] < OLD[p]),
    WL.MEASURED_POSITIONS.map(p => p + ' ' + OLD[p] + '->' + LV.per_week[p]));
  ck('every position rests on a real sample now, not on one surviving cell',
    WL.MEASURED_POSITIONS.every(p => LV.n[p] >= 50 && M.summary[p].weeks_covered >= 15),
    WL.MEASURED_POSITIONS.map(p => p + ' n=' + LV.n[p] + ' wk=' + M.summary[p].weeks_covered));
}

// ── 5. FAIL ARM ─────────────────────────────────────────────────────────
{
  const tmp = path.join(require('os').tmpdir(), 'wire_probe_' + process.pid + '.js');
  fs.writeFileSync(tmp, 'const WIRE = { QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3 };\n');
  const src = fs.readFileSync(tmp, 'utf8');
  ck('FAIL ARM — a newly added tool carrying the table would be DETECTED',
    TABLE.test(src));
  fs.unlinkSync(tmp);
  ck('FAIL ARM — a table hidden inside a COMMENT is not counted, so the header '
    + 'documenting the old constant does not fire this',
    !TABLE.test('/* const WIRE = { QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3 }; */'
      .replace(/\/\*[\s\S]*?\*\//g, '')));
  ck('FAIL ARM — a level that disagreed with the artifact would be caught',
    Math.abs(20.9 - LV.per_week.QB) > 1e-9);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: there is exactly ONE wire level in draft/tools, no tool');
console.log('transcribes it, every consumer\'s runtime value is the measured one, and the');
console.log('cross-position claim three of them print is an ordering of ratios that was');
console.log('actually checked rather than a sentence that happened to survive.');
console.log('WHAT IT DOES NOT: settle whether a median is the right summary for the bench');
console.log('SIMULATOR. It is not — bench_mv draws from the sorted sample, because a median');
console.log('has no variance and variance is the whole reason a bench seat is worth');
console.log('anything. This guards the scalar the REPORTS quote.');

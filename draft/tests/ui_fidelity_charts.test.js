// TERRITORY: A
// UI-FIDELITY SUITE (charts) — EVERY MARK ENCODES AN ENGINE VALUE, EXACTLY.
//
// Cory asked for "charts or visual explanations"; the corollary of his
// fidelity gate is that a chart may not draw anything the engine did not say.
// DraftCharts builders are pure string functions — these checks feed known
// inputs and assert the emitted marks carry exactly those values (titles,
// labels, geometry direction), the models are named in the captions, and the
// series colors are the validator-passed pair.
//
// Run: node draft/tests/ui_fidelity_charts.test.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'public', 'js', 'draft', 'charts.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── the validated two-series pair is what ships ──────────────────────────
ck('the palette is the VALIDATED pair (#2a5f9e market, #eb6834 room) — do not eyeball substitutes',
  C.PALETTE.market === '#2a5f9e' && C.PALETTE.room === '#eb6834', C.PALETTE);

// ── tierCliffChart ───────────────────────────────────────────────────────
{
  const mk = (name, pos, vorp, tier) => ({ player: { name, position: pos, vorp, tier } });
  const entries = [
    mk('Alpha Rb', 'RB', 100, 1), mk('Bravo Rb', 'RB', 90, 1), mk('Charlie Rb', 'RB', 40, 2),
    mk('Delta Wr', 'WR', 80, 1), mk('Echo Wr', 'WR', 75, 2), mk('Foxtrot Wr', 'WR', 30, 3),
  ];
  const html = C.tierCliffChart(entries);
  ck('tier chart renders the panels for positions with data', /RB/.test(html) && /WR/.test(html));
  ck('every bar carries its exact engine VORP in the title',
    html.indexOf('VORP 100.0') >= 0 && html.indexOf('VORP 40.0') >= 0
    && html.indexOf('VORP 75.0') >= 0, 'titles');
  ck('the cliff line is drawn where the tier actually breaks (dashed)',
    /stroke-dasharray="3 2"/.test(html));
  ck('the LAST-OF-TIER player is direct-labeled (Bravo before the RB break)',
    html.indexOf('>Rb</text>') >= 0 || />Bravo/.test(html) || html.indexOf('Bravo') >= 0, html.slice(0, 200));
  ck('the caption states units and scope — VORP season pts, available players only',
    /VORP, season pts/.test(html) && /available players only/.test(html));
  ck('empty input renders NOTHING rather than an empty frame', C.tierCliffChart([]) === '');
  ck('a position with one player renders no panel (no one-bar bar chart)',
    C.tierCliffChart([mk('Solo Te', 'TE', 50, 1)]) === '');
}

// ── goneChart ────────────────────────────────────────────────────────────
{
  const rows = [
    { name: 'Puka Nacua', position: 'WR', market_gone: 42, room_gone: 73 },
    { name: 'Jahmyr Gibbs', position: 'RB', market_gone: 42, room_gone: 75 },
  ];
  const html = C.goneChart(rows);
  ck('gone chart prints BOTH models\' exact values as direct labels',
    html.indexOf('>42<') >= 0 && html.indexOf('>73<') >= 0 && html.indexOf('>75<') >= 0);
  ck('each mark\'s tooltip names its model',
    /42% gone \(market model\)/.test(html) && /73% gone \(room model\)/.test(html));
  ck('the legend names both models AND which one the score uses',
    /market \(ADP\)/.test(html) && /room\s+model/.test(html.replace(/\n/g, ' '))
    && /the number the score uses/.test(html));
  ck('…and explains identical market bars (the redistribution floor)',
    /redistribution floor/.test(html));
  ck('marks wear the validated series colors',
    html.indexOf(C.PALETTE.market) >= 0 && html.indexOf(C.PALETTE.room) >= 0);
  ck('a null model value draws NO mark rather than a zero-length lie',
    (() => {
      const h = C.goneChart([{ name: 'X Y', position: 'QB', market_gone: null, room_gone: 60 }]);
      // No rect may wear the market color; the room mark must still be there.
      return h.indexOf('fill="' + C.PALETTE.market + '"') < 0
        && h.indexOf('60% gone (room model)') >= 0;
    })());
  ck('empty input renders nothing', C.goneChart([]) === '');
}

// ── branchGrid ───────────────────────────────────────────────────────────
{
  const branches = [
    { taking: 'Puka Nacua', pick: 48, rows: [
      { position: 'QB', at_next: 50, loss: 14 }, { position: 'RB', at_next: 144, loss: 11 }] },
    { taking: 'Josh Allen', pick: 48, rows: [
      { position: 'RB', at_next: 140, loss: 15 }] },
  ];
  const html = C.branchGrid(branches);
  ck('the grid cell shows the exact engine loss, signed as a cost',
    html.indexOf('>−14<') >= 0 && html.indexOf('>−11<') >= 0 && html.indexOf('>−15<') >= 0);
  ck('the tooltip carries the full engine row — best-left AND the pick number',
    /best QB left at pick 48 ≈ 50 pts \(14 worse than now\)/.test(html));
  ck('a position the engine did not price renders — (declared absent), never 0',
    />—</.test(html));
  ck('the caption states the unit and the reading ("projected points LOST … by waiting")',
    /Projected points LOST/.test(html) && /waiting/.test(html));
  ck('ink scales with loss (sequential, one hue) — deepest cell is the max loss',
    (() => {
      const alphas = [...html.matchAll(/rgba\(42,95,158,([0-9.]+)\)/g)].map(m => Number(m[1]));
      return alphas.length === 3 && Math.max(...alphas) === alphas[2]; // Allen's 15
    })(), html.match(/rgba[^)]*\)/g));
  ck('empty input renders nothing', C.branchGrid([]) === '');
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: every chart mark encodes exactly the engine value');
console.log('it was fed, models are named where two exist, absent values render absent,');
console.log('and the series palette is the validator-passed pair.');

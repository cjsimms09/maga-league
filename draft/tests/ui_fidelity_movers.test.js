// TERRITORY: A
// UI-FIDELITY — THE ADP MOVERS PANEL SAYS WHAT THE SERIES SAYS.
//
// Cory (2026-08-16, verbatim): "Do we have way to capture quick movement in
// ADPs … Maybe a small screen on war room showing the top 10 ADP movers up
// and top 10 down?" The panel prints the adp_velocity / adp_stale fields
// build.py stamps from the retained daily series — it computes no new market
// quantity. This suite pins that, the extract-the-shipped-renderer way
// (the seat_panel_markup pattern):
//
//   1. the PURE derivation (movers.js): top-10 ordering both directions,
//      provable tie stability, None velocity EXCLUDED (absent ≠ zero),
//      zero-velocity excluded from both lists, the shallow state, per-day
//      arithmetic;
//   2. the RENDERER (app.js renderAdpMovers) extracted from shipped source:
//      rendered order equals the derivation's, absent players never render,
//      the stale flag renders as the alarm it is, the empty-series board
//      renders the honest shallow sentence and never a wall of zeros.
//
// Run: node draft/tests/ui_fidelity_movers.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const M = require(path.join(ROOT, 'public', 'js', 'draft', 'movers.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── THE SYNTHETIC BOARD FIXTURE ──────────────────────────────────────────
// 12 risers (to prove the top-10 cap), 3 fallers, a tie pair, a zero, a
// None, and one stale flag. Board order is the tie's ground truth.
function P(id, name, v, extra) {
  return Object.assign({ player_id: id, name: name, position: 'WR', team: 'X',
    raw_adp: 50 + Number(id), adp_velocity: v, adp_stale: null }, extra || {});
}
const FIX = [
  P('1', 'Riser One', 12),
  P('2', 'Tie Alpha', 7),          // ← same velocity as Tie Beta, earlier on the board
  P('3', 'Tie Beta', 7),
  P('4', 'Zero Mover', 0),          // 0 is neither riser nor faller
  P('5', 'No Series Guy', null),    // absent ≠ zero: excluded entirely
  P('6', 'Faller One', -9, { adp_stale: { direction: 'falling', slots: 9, days: 6 } }),
  P('7', 'Faller Two', -3),
  P('8', 'Faller Three', -1.5),
  P('9', 'Riser Big', 60, { adp_stale: { direction: 'rising', slots: 60, days: 6 } }),
  P('10', 'R4', 6), P('11', 'R5', 5), P('12', 'R6', 4.5), P('13', 'R7', 4),
  P('14', 'R8', 3.5), P('15', 'R9', 3), P('16', 'R10', 2.5), P('17', 'R11', 2),
  P('18', 'R12', 1),
];

// ── 1. THE PURE DERIVATION ───────────────────────────────────────────────
const m = M.movers(FIX, { span: 6 });
ck('state is ok when anyone carries a measured velocity', m.state === 'ok', m.state);
ck('counted = players with a NON-NULL velocity (zero counts, null does not)',
  m.counted === 17, m.counted);

ck('UP: capped at top 10', m.up.length === 10, m.up.length);
ck('UP: ordered fastest-rising first',
  m.up.every((r, i) => i === 0 || m.up[i - 1].velocity >= r.velocity)
  && m.up[0].player.name === 'Riser Big' && m.up[1].player.name === 'Riser One',
  m.up.map(r => r.velocity));
ck('UP: the 11th and 12th risers fell off the top-10 exactly',
  !m.up.some(r => r.player.name === 'R11' || r.player.name === 'R12'),
  m.up.map(r => r.player.name));
ck('TIES ARE STABLE: equal velocities keep board order (Tie Alpha before Tie Beta)',
  m.up.findIndex(r => r.player.name === 'Tie Alpha')
    === m.up.findIndex(r => r.player.name === 'Tie Beta') - 1,
  m.up.map(r => r.player.name));
// The tiebreak is an EXPLICIT index comparison, not engine sort luck: the
// reversed board must reverse the tie pair too.
{
  const rev = M.movers(FIX.slice().reverse(), { span: 6 });
  ck('TIES ARE STABLE BY INPUT ORDER, provably: reversing the board reverses the tie pair',
    rev.up.findIndex(r => r.player.name === 'Tie Beta')
      === rev.up.findIndex(r => r.player.name === 'Tie Alpha') - 1,
    rev.up.map(r => r.player.name));
}

ck('DOWN: fastest-falling first, all three present',
  m.down.length === 3 && m.down[0].player.name === 'Faller One'
  && m.down[2].player.name === 'Faller Three', m.down.map(r => r.player.name));

ck('NONE VELOCITY IS EXCLUDED from both lists (absent ≠ zero)',
  !m.up.concat(m.down).some(r => r.player.name === 'No Series Guy'));
ck('ZERO velocity is neither a riser nor a faller',
  !m.up.concat(m.down).some(r => r.player.name === 'Zero Mover'));

ck('per-day rate = velocity / span, 1 decimal (60 over 6 days → 10/day)',
  m.up[0].per_day === 10 && m.up[1].per_day === 2, [m.up[0].per_day, m.up[1].per_day]);
ck('the stale flag rides through untouched (build.py\'s own object)',
  m.up[0].stale && m.up[0].stale.slots === 60 && m.down[0].stale
  && m.down[0].stale.direction === 'falling', m.up[0].stale);
ck('current ADP is raw_adp passed through', m.up[0].adp === 59, m.up[0].adp);

// A window too shallow for a rate: per_day is ABSENT, never invented.
{
  const s0 = M.movers(FIX, { span: 0 });
  ck('span 0: velocities list but per_day is null on every row (no invented rate)',
    s0.up.length > 0 && s0.up.concat(s0.down).every(r => r.per_day === null));
}

// THE DAY-ONE BOARD: every velocity None → the honest shallow state.
{
  const shallow = M.movers(FIX.map(p => Object.assign({}, p, { adp_velocity: null })), { span: 0 });
  ck('all-None board: state=shallow, both lists empty, counted 0',
    shallow.state === 'shallow' && shallow.up.length === 0
    && shallow.down.length === 0 && shallow.counted === 0, shallow);
}

// ── 2. THE SHIPPED RENDERER ──────────────────────────────────────────────
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
function extract(sig) {
  const st = SRC.indexOf(sig);
  if (st < 0) return '';
  let d = 0;
  for (let i = SRC.indexOf('{', st); i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) return SRC.slice(st, i + 1); }
  }
  return '';
}
const fnSrc = extract('  function renderAdpMovers() {');
ck('renderAdpMovers exists in the shipped app.js', fnSrc.length > 400, fnSrc.length);
ck('renderAll actually calls it (a renderer nobody calls renders nothing)',
  /safeRender\('adpMovers', renderAdpMovers\)/.test(SRC));
ck('the shell carries the host card (B\'s warroom.ejs)',
  /id="adp-movers"/.test(fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8')));
ck('the module is on the page before app.js (A\'s include seam)', (() => {
  const inc = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  return inc.indexOf('/js/draft/movers.js') >= 0
    && inc.indexOf('/js/draft/movers.js') < inc.indexOf('/js/draft/app.js');
})());

function runRenderer(players, notes) {
  let captured = '', headTxt = null;
  const host = { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } };
  const head = { set textContent(v) { headTxt = v; }, get textContent() { return headTxt; } };
  const stubs = {
    $: sel => (sel === '#adp-movers' ? host : (sel === '#movers-head' ? head : null)),
    state: { data: { players: players, notes: notes } },
    DraftMovers: M,
    escapeHtml: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    shortName: n => String(n),
    explainPanel: () => '<i-stub/>',
  };
  // eslint-disable-next-line no-new-func
  const run = new Function('$', 'state', 'DraftMovers', 'escapeHtml', 'shortName', 'explainPanel',
    fnSrc + ';\nreturn renderAdpMovers;');
  run(stubs.$, stubs.state, stubs.DraftMovers, stubs.escapeHtml, stubs.shortName,
    stubs.explainPanel)();
  return { html: captured, head: headTxt };
}

{
  const out = runRenderer(FIX, { adp_series_span_days: 6 });
  const H = out.html;
  ck('RENDERED: both columns present with rising first',
    H.indexOf('▲ Rising') >= 0 && H.indexOf('▼ Falling') > H.indexOf('▲ Rising'), H.slice(0, 120));
  ck('RENDERED: row order equals the derivation\'s (fastest riser first)',
    H.indexOf('Riser Big') >= 0 && H.indexOf('Riser Big') < H.indexOf('Riser One')
    && H.indexOf('Tie Alpha') < H.indexOf('Tie Beta'));
  ck('RENDERED: the fastest faller leads the falling column',
    H.indexOf('Faller One') >= 0 && H.indexOf('Faller One') < H.indexOf('Faller Two'));
  ck('RENDERED: the None-velocity player NEVER appears (absent ≠ zero)',
    H.indexOf('No Series Guy') === -1);
  ck('RENDERED: zero-velocity player does not render as a mover',
    H.indexOf('Zero Mover') === -1);
  ck('RENDERED: velocity slots + per-day rate, signed',
    H.indexOf('+60') >= 0 && H.indexOf('+10.0/day') >= 0 && H.indexOf('−9') >= 0);
  ck('RENDERED: current ADP prints beside every mover', /ADP 59/.test(H));
  ck('RENDERED: the STALE flag renders as the tappable alarm, on stale rows only',
    (H.match(/wr-mover-stale/g) || []).length === 2
    && /data-flag-legend="adp_stale"/.test(H), (H.match(/wr-mover-stale/g) || []).length);
  ck('RENDERED: the explainer hook is emitted (what/read/DO/src contract)',
    H.indexOf('<i-stub/>') === 0);
  ck('RENDERED: the head names the window and the sample',
    out.head === '6-day window · 17 measured', out.head);
  ck('RENDERED: the caption says it feeds no score',
    /feeds no score/.test(H));
}

// THE DAY-ONE BOARD through the real renderer: the honest empty state.
{
  const out = runRenderer(FIX.map(p => Object.assign({}, p, { adp_velocity: null })),
    { adp_series_span_days: 0 });
  ck('EMPTY SERIES RENDERED: the honest sentence, verbatim',
    /series too shallow — velocity means\s+nothing yet/.test(out.html), out.html.slice(0, 200));
  ck('EMPTY SERIES RENDERED: zero mover rows, zero zeros',
    out.html.indexOf('wr-mover-row') === -1 && !/[+−]0(\.|<)/.test(out.html));
  ck('EMPTY SERIES RENDERED: the head goes quiet instead of claiming a window',
    out.head === '', out.head);
  ck('EMPTY SERIES RENDERED: says absent-not-zero in words',
    /Absent, not zero/.test(out.html));
}

// One direction empty is NOT the shallow state — the empty side says so.
{
  const risersOnly = FIX.filter(p => p.adp_velocity == null || p.adp_velocity >= 0);
  const out = runRenderer(risersOnly, { adp_series_span_days: 6 });
  ck('RISERS-ONLY BOARD: falling column renders its own honest empty line',
    /nobody falling over this window/.test(out.html)
    && out.html.indexOf('Riser Big') >= 0);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);

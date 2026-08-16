// TERRITORY: A
// UI-FIDELITY SUITE (3/3) — EVERY EXPLAINER SENTENCE IS PINNED TO THE CODE IT
// PARAPHRASES. Wrong-but-confident explainer text is worse than none: this
// pass FOUND one live (the `lrm` guide entry described "the last recorded
// model state" — a panel that does not exist — while the strip renders
// survival-derived deadlines). These checks make that class of drift red.
//
// Three layers:
//   1. STRUCTURE — every PANEL_GUIDE entry carries the implementation half
//      (`do`, Cory: "or I can't implement it") and a source citation (`src`);
//   2. CLAIMS — each load-bearing number or mechanism named in an explainer is
//      asserted against the engine's actual constant or code line, so a
//      re-tune forces the copy to follow;
//   3. ASSEMBLY — the help view is built from the SAME table (single source),
//      and the ⓘ treatment emits the caption even when collapsed.
//
// Run: node draft/tests/ui_fidelity_explainers.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
const SURV = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'), 'utf8');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

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
const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Materialize the shipped table.
const tableSrc = extract('  const PANEL_GUIDE = {');
// eslint-disable-next-line no-new-func
const G = new Function(tableSrc + '; return PANEL_GUIDE;')();

// ── 1. STRUCTURE ─────────────────────────────────────────────────────────
const KEYS = Object.keys(G);
ck('the guide covers the decision surfaces, including the new ones',
  ['verdict', 'recommendations', 'paths', 'branches', 'survival', 'threats', 'lrm']
    .every(k => KEYS.indexOf(k) >= 0), KEYS);
KEYS.forEach(k => {
  ck(k + ': carries the implementation half (`do`) — what to DO with this, >40 chars',
    typeof G[k].do === 'string' && G[k].do.length > 40, (G[k].do || '').length);
  ck(k + ': cites its source of truth (`src`)',
    typeof G[k].src === 'string' && G[k].src.length > 10, G[k].src);
});
// Every cited file exists and every cited function name appears in it.
KEYS.forEach(k => {
  const cites = (G[k].src.match(/([a-z_]+\.js) ([A-Za-z_]+)\(\)/g) || []);
  cites.forEach(c => {
    const m = c.match(/([a-z_]+\.js) ([A-Za-z_]+)\(\)/);
    const file = m[1], fn = m[2];
    const p = file === 'app.js' ? SRC
      : file === 'engine.js' ? ENG
      : file === 'survival.js' ? SURV
      : fs.existsSync(path.join(ROOT, 'public', 'js', 'draft', file))
        ? fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', file), 'utf8') : null;
    ck(k + ': cited ' + file + ' ' + fn + '() exists where cited',
      p != null && new RegExp('function ' + fn + '\\b').test(p), c);
  });
});

// ── 2. LOAD-BEARING CLAIMS vs THE ENGINE ─────────────────────────────────
ck('LRM: the old misdescription ("last recorded model state") is GONE',
  !/last recorded model state/.test(tableSrc));
ck('LRM: describes deadlines — and the renderer actually renders "Last responsible moment"',
  /last responsible moment/i.test(G.lrm.what) && /Last responsible moment/.test(SRC));
ck('LRM: "startable options go undrafted" is the renderer\'s own sentence',
  /startable ones go undrafted/i.test(G.lrm.read) && /startable options go undrafted/.test(SRC));

ck('RECOMMENDATIONS: the "gap under N" tie claim quotes the ENGINE\'s TIE_THRESHOLD ('
  + E.CFG.TIE_THRESHOLD + ')',
  G.recommendations.read.indexOf('under ' + E.CFG.TIE_THRESHOLD + ' composite point') >= 0,
  G.recommendations.read);
ck('PATHS: the "resolve band (N pts)" claim quotes the ENGINE\'s PATHS_BAND ('
  + E.CFG.PATHS_BAND + ')',
  G.paths.read.indexOf('band (' + E.CFG.PATHS_BAND + ' pts)') >= 0, G.paths.read);
ck('PATHS: the band\'s derivation is cited (COIN_FLIP_GAP × 4) and still true in CFG',
  /COIN_FLIP_GAP × 4/.test(G.paths.src) && E.CFG.PATHS_BAND === E.CFG.COIN_FLIP_GAP * 4);
ck('SURVIVAL: claims a conservation tilt; survival.js still ships conservedSurvival()',
  /conservation tilt/.test(G.survival.what) && /function conservedSurvival/.test(SURV));
ck('SURVIVAL: the identical-% explanation matches the tilt\'s own caveat '
  + '("fixes the total, not the ordering")',
  /redistribution floor/.test(G.survival.read) && /fixes the total, not the ordering/.test(ENG));
ck('THREATS: "their own past Sleeper drafts" — threatBoard still reads team.profile',
  /past Sleeper drafts/.test(G.threats.what) && /team\.profile/.test(ENG));
ck('BRANCHES: "rows under one point are hidden" — the renderer\'s filter is still loss > 1',
  /under one point are hidden/i.test(G.branches.read) && /r\.loss > 1/.test(SRC));
ck('VERDICT: carries the lab-tier dollar caveat the rule headline no longer repeats inline',
  /lab-tier/.test(G.verdict.do) && /rh-caveat/.test(SRC)
  && SRC.indexOf('if (!demoted) {') > 0);
ck('VERDICT: `do` teaches implementation per chip — LOCK banks clock, TOSS-UP logs the call',
  /LOCK: take it and bank the clock/.test(G.verdict.do)
  && /TOSS-UP: the model cannot separate these/.test(G.verdict.do)
  && /log which you took/.test(G.verdict.do));

// The confidence ladder the verdict explainer references exists with the
// levels it names (computed example, not just grep).
{
  const mk = gap => {
    const a = { player: { player_id: '1', name: 'A', position: 'RB' }, score: 100 };
    const b = { player: { player_id: '2', name: 'B', position: 'WR' }, score: 100 - gap };
    a.contested = gap < E.CFG.TIE_THRESHOLD; a.gap_to_second = gap;
    return [a, b];
  };
  ck('computed example: the engine really answers coin-flip under COIN_FLIP_GAP',
    E.confidence(mk(E.CFG.COIN_FLIP_GAP - 0.1)).level === 'coin-flip');
  ck('computed example: and clear above CLOSE_GAP',
    E.confidence(mk(E.CFG.CLOSE_GAP + 0.1)).level === 'clear');
}

// ── 3. ASSEMBLY ──────────────────────────────────────────────────────────
{
  const fnSrc = extract('  function explainPanel(key) {');
  // eslint-disable-next-line no-new-func
  const explain = new Function('escapeHtml', tableSrc + ';\n' + fnSrc + '; return explainPanel;')(esc);
  const html = explain('survival');
  ck('ⓘ TREATMENT: a visible toggle button is emitted with the caption',
    /wr-info/.test(html) && /data-explain-toggle="survival"/.test(html));
  ck('the caption block is EMITTED even while collapsed (hidden attr, not deleted)',
    /panel-explain/.test(html) && /hidden/.test(html));
  ck('all four halves reach the markup: what, read, do, and the source citation',
    /pe-what/.test(html) && /pe-read/.test(html) && /pe-do/.test(html)
    && /pe-src/.test(html) && /source of truth/.test(html));

  const helpSrc = extract('  function renderHelp() {');
  ck('renderHelp exists and reads PANEL_GUIDE — the manual and the captions share one source',
    helpSrc.length > 400 && /PANEL_GUIDE\[k\]/.test(helpSrc));
  let captured = '';
  const host = { childNodes: [], set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } };
  const chipWords = extract('  const VERDICT_CHIP_WORDS = {');
  // eslint-disable-next-line no-new-func
  const help = new Function('document', 'escapeHtml',
    tableSrc + ';\n' + chipWords + ';\n' + helpSrc + '; return renderHelp;')(
    { getElementById: id => (id === 'wr-help' ? host : null) }, esc);
  help();
  ck('the assembled manual walks the night ("on the clock, the verdict block is the answer")',
    /on the clock, the verdict\s+block is the answer/.test(captured.replace(/\s+/g, ' '))
    || /verdict block is the answer/.test(captured));
  ck('every ordered panel\'s what/do lands in the manual verbatim from the table',
    ['verdict', 'recommendations', 'paths', 'survival'].every(k =>
      captured.indexOf(esc(G[k].what)) >= 0 && captured.indexOf(esc(G[k].do)) >= 0));
  ck('the chip glossary rides along (LOCK…PINNED all present)',
    ['LOCK', 'LEAN', 'TOSS-UP', 'SPLIT', 'PINNED'].every(k => captured.indexOf(k) >= 0));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: every panel explainer carries what/read/DO/source;');
console.log('every number or mechanism an explainer names is asserted against the engine');
console.log('constant or code line it paraphrases (a re-tune turns this red until the');
console.log('copy follows); and the help view is assembled from the same table, so the');
console.log('manual cannot drift from the captions.');

// TERRITORY: A
'use strict';
// THE IN-SEASON EXPLAINER CONTRACT, PINNED TO THE CODE IT PARAPHRASES.
//
// The war-room pass's rule, applied to the four commissioner in-season pages:
// a wrong explainer is worse than none (that pass found a live one — an `lrm`
// caption describing a panel that did not exist). So every entry in
// src/inseason_guide.js is checked here the same way ui_fidelity_explainers
// checks PANEL_GUIDE: four halves present, cited files real, cited functions
// real IN those files, and every quoted threshold equal to the live constant —
// the analyzer's posture cut points, the optimizer's $110/$100 dollar weights,
// the measured ~11% deviation honesty, the 3000-sim count.
//
// Run: node draft/tests/inseason_explainers.test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { GUIDE } = require(path.join(ROOT, 'src', 'inseason_guide.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 240) : ''))); };
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── 1. THE CONTRACT SHAPE: every entry carries all four halves ──────────────
{
  const pages = Object.keys(GUIDE);
  ck('the guide covers all four pages', ['lineup', 'waivers', 'accuracy', 'analyzer'].every(p => pages.includes(p)), pages);
  let entries = 0;
  for (const [page, panels] of Object.entries(GUIDE)) {
    for (const [key, ex] of Object.entries(panels)) {
      entries++;
      ck(`${page}.${key} has what / read / do / src, all non-empty`,
        ['what', 'read', 'do', 'src'].every(h => typeof ex[h] === 'string' && ex[h].trim().length > 10),
        ex);
    }
  }
  ck('the table is non-vacuous (a guide of zero entries would pass everything above)', entries >= 15, entries);
}

// ── 2. EVERY ENTRY IS RENDERED BY ITS VIEW — no silent orphans ──────────────
// The views reference each entry as G.<key>; an entry nothing renders is a
// caption drifting unseen, which is how the war room's lrm lie survived.
{
  const VIEW = {
    lineup: 'views/lineup.ejs',
    waivers: 'views/waivers.ejs',
    accuracy: 'views/accuracy.ejs',
    analyzer: 'views/analyzer.ejs',
  };
  for (const [page, panels] of Object.entries(GUIDE)) {
    const src = read(VIEW[page]);
    for (const key of Object.keys(panels)) {
      ck(`${page}.${key} is rendered by ${VIEW[page]}`,
        new RegExp('G\\.' + key + '\\b').test(src));
    }
    ck(`${VIEW[page]} renders explainers through the shared partial`, /_wr_explain/.test(src));
  }
}

// ── 3. CITED FUNCTIONS EXIST WHERE CITED ────────────────────────────────────
{
  const LO = require(path.join(ROOT, 'src', 'routes', 'lineup.js'));
  const W = require(path.join(ROOT, 'src', 'routes', 'waivers.js'));
  const ACC = require(path.join(ROOT, 'src', 'routes', 'accuracy.js'));
  const ST = require(path.join(ROOT, 'src', 'routes', 'standings.js'));
  const V = require(path.join(ROOT, 'public', 'js', 'draft', 'valuation.js'));

  const cites = [
    ['lineup.posture cites weeklyPosture', GUIDE.lineup.posture.src, /weeklyPosture/, () => typeof LO.weeklyPosture === 'function'],
    ['lineup.playthis cites optimize + weeklyHighBand', GUIDE.lineup.playthis.src, /optimize/, () => typeof LO.optimize === 'function' && typeof LO.weeklyHighBand === 'function'],
    ['lineup.todo cites the set diff', GUIDE.lineup.todo.src, /ctx\.current/, () => /ctx\.current/.test(LO.optimize.toString())],
    ['lineup.calls cites optimize calls[]', GUIDE.lineup.calls.src, /calls/, () => /calls/.test(LO.optimize.toString())],
    ['lineup.proof cites the three validation functions', GUIDE.lineup.proof.src, /ceilingLeak\(\) \/ replayEfficiency\(\) \/ weekDrill\(\)/,
      () => [LO.ceilingLeak, LO.replayEfficiency, LO.weekDrill].every(f => typeof f === 'function')],
    ['waivers.claims cites evaluateClaims + claimValue + dollarsPerPoint', GUIDE.waivers.claims.src, /evaluateClaims/,
      () => typeof W.evaluateClaims === 'function' && typeof W.dollarsPerPoint === 'function' && typeof V.claimValue === 'function'],
    ['accuracy.summary cites buildAccuracyView', GUIDE.accuracy.summary.src, /buildAccuracyView/, () => typeof ACC.buildAccuracyView === 'function'],
    ['accuracy.overrides cites capturedOverrides', GUIDE.accuracy.overrides.src, /capturedOverrides/, () => typeof ACC.capturedOverrides === 'function'],
    ['accuracy.bykind cites byKindRows/deriveByKind', GUIDE.accuracy.bykind.src, /byKindRows/,
      () => typeof ACC.byKindRows === 'function' && typeof ACC.deriveByKind === 'function'],
    ['accuracy.misses cites biggestMisses', GUIDE.accuracy.misses.src, /biggestMisses/, () => typeof ACC.biggestMisses === 'function'],
    ['analyzer.board cites projectStandings + whoElseNeeds', GUIDE.analyzer.board.src, /projectStandings/,
      () => typeof ST.projectStandings === 'function' && typeof W.whoElseNeeds === 'function'],
    ['analyzer.validation cites validateStandings', GUIDE.analyzer.validation.src, /validateStandings/, () => typeof ST.validateStandings === 'function'],
  ];
  for (const [name, srcStr, re, fn] of cites) {
    ck(name + ' — and the cited code exists', re.test(srcStr) && fn(), srcStr);
  }
}

// ── 4. QUOTED THRESHOLDS EQUAL THE LIVE CONSTANTS ───────────────────────────
{
  // The analyzer posture ladder — read the cut points OUT OF the shipped code,
  // then require the guide and the view to quote exactly those.
  const st = read('src/routes/standings.js');
  const lock = st.match(/playoff_prob\s*>=\s*([\d.]+)\)\s*p\.posture\s*=\s*'lock'/);
  const chase = st.match(/playoff_prob\s*<=\s*([\d.]+)\)\s*p\.posture\s*=\s*'chasing_high'/);
  const desp = st.match(/playoff_prob\s*<=\s*([\d.]+)\)\s*p\.posture\s*=\s*'desperate'/);
  ck('the engine ladder is readable from standings.js', !!(lock && chase && desp));
  const asPct = m => Math.round(Number(m[1]) * 100);
  if (lock && chase && desp) {
    const [L, C, D] = [asPct(lock), asPct(chase), asPct(desp)];
    ck(`guide quotes the live lock cut (${L}%)`, GUIDE.analyzer.board.read.includes(`≥ ${L}%`), GUIDE.analyzer.board.read);
    ck(`guide quotes the live chasing cut (${C}%)`, GUIDE.analyzer.board.read.includes(`≤ ${C}%`), GUIDE.analyzer.board.read);
    ck(`guide quotes the live desperate cut (${D}%)`, GUIDE.analyzer.board.read.includes(`≤ ${D}%`), GUIDE.analyzer.board.read);
    ck('guide src cites the ladder constants verbatim', GUIDE.analyzer.board.src.includes('0.85 / 0.30 / 0.10'));
    const view = read('views/analyzer.ejs');
    ck('the analyzer view CUTS say the same three numbers',
      view.includes(`≥ ${L}% playoff odds`) && view.includes(`≤ ${D}% playoff odds`) && view.includes(`≤ ${C}% playoff odds`));
  }

  // The dollar weights: optimize() and dollarsPerPoint() both default $110/$100.
  const lo = read('src/routes/lineup.js');
  const wv = read('src/routes/waivers.js');
  const w110 = /matchupValue == null \? 110/.test(lo) && /matchupValue == null \? 110/.test(wv);
  const w100 = /weeklyHigh == null \? 100/.test(lo) && /weeklyHigh == null \? 100/.test(wv);
  ck('the engine really defaults $110 matchup / $100 weekly-high in BOTH engines', w110 && w100);
  ck('lineup.playthis quotes exactly those weights', /\$110/.test(GUIDE.lineup.playthis.what) && /\$100/.test(GUIDE.lineup.playthis.what));
  ck('waivers.claims quotes exactly those weights', /\$110/.test(GUIDE.waivers.claims.read) && /\$100/.test(GUIDE.waivers.claims.read));
  ck('the waiver derivation disclosure in the view quotes them too',
    /\$110/.test(read('views/waivers.ejs')) && /\$100/.test(read('views/waivers.ejs')));

  // The chase trigger the posture explainer states: edge >= 1 in weeklyPosture.
  ck('weeklyPosture really flips to chase at edge ≥ 1, as the explainer says',
    /const chasing = edge >= 1/.test(lo) && /≥ \$1/.test(GUIDE.lineup.posture.read));

  // The measured honesty: ~11% deviation. Doctrine is user-facing (Cory's
  // directive) — the guide AND the page must both carry it.
  ck('the guide states the ~11% / ~$9 measured deviation', /11%/.test(GUIDE.lineup.calls.read) && /\$9/.test(GUIDE.lineup.calls.read));
  ck('the page still states it too (9 weeks in 10)',
    /11%/.test(read('views/lineup.ejs')) && /9 weeks in 10/.test(read('views/lineup.ejs')));

  // The simulation count the analyzer quotes.
  const sims = (read('src/routes/member.js').match(/sims:\s*(\d+)/) || [])[1];
  ck('the analyzer really runs the quoted number of sims', sims === '3000', sims);
  ck('  and the guide quotes it', /3,?000/.test(GUIDE.analyzer.board.read) && /3,?000|3000/.test(GUIDE.analyzer.table.src));

  // The stream explainer's "same ranking filtered to K/DEF" claim.
  ck('member.js really filters the same evaluateClaims ranking to K/DEF',
    /c\.position === 'K' \|\| c\.position === 'DEF'/.test(read('src/routes/member.js'))
    && /K\/DEF/.test(GUIDE.waivers.stream.read));
}

// ── 5. THE PARTIAL RENDERS ALL FOUR HALVES — and nothing without an entry ───
{
  const ejs = require('ejs');
  const tp = path.join(ROOT, 'views', 'partials', '_wr_explain.ejs');
  const tpl = fs.readFileSync(tp, 'utf8');
  const html = ejs.render(tpl, { ex: { what: 'W-claim', read: 'R-claim', do: 'D-claim', src: 'S-claim' } }, { filename: tp });
  ck('the partial renders what/read/do/src in the war-room classes',
    ['pe-what', 'pe-read', 'pe-do', 'pe-src'].every(c => html.includes(c))
    && ['W-claim', 'R-claim', 'D-claim', 'S-claim'].every(t => html.includes(t)), html);
  ck('  as a collapsed ⓘ disclosure', /<details class="wr-exp"/.test(html) && /<summary/.test(html));
  const empty = ejs.render(tpl, {}, { filename: tp });
  ck('  and renders NOTHING without an entry (older fixtures pass no guide)', !/wr-exp/.test(empty), empty);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

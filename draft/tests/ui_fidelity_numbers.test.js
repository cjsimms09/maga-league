// TERRITORY: A
// UI-FIDELITY SUITE (2/3) — EVERY DISPLAYED NUMBER IS THE ENGINE'S NUMBER,
// WEARING THE ENGINE'S MEANING.
//
// Cory's gate: "be certain the design is actually implementing and explaining
// what the model says." His capture had live counter-examples, each pinned
// here so it cannot return:
//   · eight Best-Available chips all reading 42% while MOST LIKELY TO BE GONE
//     said 73% for the same player — two models, one caption;
//   · sliders at 1.2/0.9/1.0 under copy reading "OFF by default";
//   · sentinel ADPs (328/344/358) rendering as market numbers;
//   · K/DEF flooding the All view at ranks 52-200;
//   · fourteen identical "seat mapping unavailable" blocks.
//
// Method: the seat_panel_markup pattern — extract the SHIPPED renderer from
// app.js, run it against stubs with KNOWN engine outputs, assert the emitted
// markup displays those exact values with their model named.
//
// Run: node draft/tests/ui_fidelity_numbers.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

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

// ── 1. BEST-AVAILABLE CHIPS: the % IS survival_to_next, model named ───────
{
  const fnSrc = extract('  function renderBestAvailStrip(scored, nextPick) {');
  ck('renderBestAvailStrip extracted', fnSrc.length > 300);
  let captured = '';
  const host = { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } };
  // eslint-disable-next-line no-new-func
  const render = new Function('$', 'escapeHtml', fnSrc + '; return renderBestAvailStrip;')(
    sel => (sel === '#best-avail-strip' ? host : null), esc);
  const scored = [
    { player: { player_id: 'a', name: 'Puka Nacua', position: 'WR' }, survival_to_next: 0.58 },
    { player: { player_id: 'b', name: 'Jahmyr Gibbs', position: 'RB' }, survival_to_next: 0.58 },
    { player: { player_id: 'c', name: 'Josh Allen', position: 'QB' }, survival_to_next: 0.97 },
  ];
  render(scored, 48);
  ck('chip % equals round((1−survival_to_next)×100) — the engine field, exactly',
    captured.indexOf('>42%<') >= 0 && captured.indexOf('>3%<') >= 0, captured.slice(0, 200));
  ck('the caption NAMES THE MODEL — "market (ADP) model … the number the score uses"',
    /market \(ADP\) model/.test(captured) && /the number the score uses/.test(captured));
  ck('and explains the identical-% artifact instead of leaving it to read as a bug',
    /Identical %s/.test(captured) && /room model/.test(captured), captured.slice(0, 400));
}

// ── 2. THREATS: room model named; unassigned seats collapse to one line ───
{
  const fnSrc = extract('  function renderThreats() {');
  ck('renderThreats extracted', fnSrc.length > 500);
  let captured = '';
  const host = { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } };
  const heads = {};
  const mkRow = n => ({ pick_no: 30 + n, team_slot: n, manager: null, sample_size: 0,
    roster_size: 0, positions: [{ position: 'RB', p: 0.45 }, { position: 'WR', p: 0.36 }],
    likely: [{ player_id: 'x' + n, name: 'Player ' + n, position: 'RB', team: '', p: 10 }],
    tells: [] });
  const T = { rows: [1, 2, 3, 4, 5].map(mkRow),
    atRisk: [{ player_id: 'a', name: 'Puka Nacua', position: 'WR', vorp: 124.6, gone: 73, by: null, by_pick: null }],
    picksUntilNext: 5 };
  const stubs = {
    $: sel => (sel === '#threats' ? host : (sel === '#threats-head' ? (heads.h = heads.h || { textContent: '' }) : null)),
    E: { threatBoard: () => T },
    context: () => ({}),
    state: { profilesMappedFromDraft: false, data: { manager_profiles: { managers: { m1: {} } } } },
    escapeHtml: esc,
    explainPanel: () => '',
    caveatOnce: (id, marker) => '<span class="cav">' + marker + '</span>',
  };
  // eslint-disable-next-line no-new-func
  const render = new Function('$', 'E', 'context', 'state', 'escapeHtml', 'explainPanel', 'caveatOnce',
    fnSrc + '; return renderThreats;')(stubs.$, stubs.E, stubs.context, stubs.state,
    stubs.escapeHtml, stubs.explainPanel, stubs.caveatOnce);
  render();
  ck('the at-risk % displayed IS threatBoard\'s gone field (73)', captured.indexOf('73%') >= 0);
  ck('and the section names its model — "room model"', /room model/.test(captured));
  ck('UNASSIGNED SEATS COLLAPSE: one honest line carries the fact…',
    /modeled\s+league-average until Sleeper assigns the draft order/.test(captured), captured.slice(0, 300));
  ck('…the per-seat rows live one tap deeper (a <details>), not as a wall',
    /<details>/.test(captured) && captured.indexOf('per-seat rows') >= 0);
  ck('…and NOTHING is removed — every seat row is still emitted inside it',
    [1, 2, 3, 4, 5].every(n => captured.indexOf('Player ' + n) >= 0));
  // Control: with seats ASSIGNED, no collapse.
  stubs.state.profilesMappedFromDraft = true;
  render();
  ck('CONTROL — with seats assigned the rows render flat (no collapse)',
    !/<details>/.test(captured));
}

// ── 3. THE BOARD: sentinels, onesie demotion, tier banding ────────────────
{
  const fnSrc = extract('  function renderBoard() {');
  ck('renderBoard extracted', fnSrc.length > 1000);
  let captured = '';
  const bodyHost = { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } };
  const countHost = { textContent: '' };
  const mkP = (id, name, pos, tier, adpSrc, adj, raw) => ({
    player_id: id, name, position: pos, team: 'T', bye: 6, tier, tier_rank: 1,
    tier_size: 3, overall_rank: Number(id), proj_mean: 200, vorp: 50 - Number(id),
    adjusted_adp: adj, raw_adp: raw, adp_source: adpSrc, age: 25, injury_status: null,
  });
  const board = [
    mkP('1', 'Real Adp Guy', 'RB', 1, 'fantasypros', 3, 3),
    mkP('2', 'Kicker Early', 'K', 1, 'fantasypros', 120, 120),
    mkP('3', 'Def Early', 'DEF', 1, 'fantasypros', 122, 122),
    mkP('4', 'Second Rb', 'RB', 1, 'fantasypros', 8, 8),
    mkP('5', 'Tier Two Rb', 'RB', 2, 'fantasypros', 20, 20),
    mkP('6', 'Deep Fallback', 'WR', 9, 'search_rank', 328, 321),
  ];
  const stubs = {
    $: sel => (sel === '#board-body' ? bodyHost : (sel === '#board-count' ? countHost : null)),
    state: { filterPos: 'ALL', search: '', board, data: { players: board },
      drafted: new Set(), lists: { queue: [], targets: [], avoid: [] } },
    escapeHtml: esc,
    nameScore: () => 1,
    resetCaveats: () => {},
    caveatOnce: (id, marker) => '<span class="cav">' + marker + '</span>',
    projSourceMark: () => '',
    riskFlags: () => '',
    renderSearchTail: () => {},
  };
  // eslint-disable-next-line no-new-func
  const render = new Function('$', 'state', 'escapeHtml', 'nameScore', 'resetCaveats',
    'caveatOnce', 'projSourceMark', 'riskFlags', 'renderSearchTail',
    fnSrc + '; return renderBoard;')(stubs.$, stubs.state, stubs.escapeHtml,
    stubs.nameScore, stubs.resetCaveats, stubs.caveatOnce, stubs.projSourceMark,
    stubs.riskFlags, stubs.renderSearchTail);
  render();
  ck('SENTINEL (B2): a search_rank player\'s ADP cells never render the number',
    captured.indexOf('>328<') < 0 && captured.indexOf('>321<') < 0, 'searched for >328< / >321<');
  ck('  they render "—" with the reason attached',
    /beyond real ADP coverage/.test(captured));
  ck('  CONTROL — a real-ADP player\'s number still renders',
    captured.indexOf('>3<') >= 0 || />\s*3\s*</.test(captured));
  const kIdx = captured.indexOf('Kicker Early');
  const lastSkillIdx = captured.indexOf('Deep Fallback');
  ck('ONESIE DEMOTION (B1): in the All view K/DEF render BELOW every skill player',
    kIdx > lastSkillIdx && captured.indexOf('Def Early') > lastSkillIdx,
    { kIdx, lastSkillIdx });
  ck('  with the one-line explanation of why',
    /streamable all season/.test(captured));
  ck('  and their rows visually dimmed (.onesie-demoted)',
    /class="onesie-demoted"/.test(captured));
  ck('TIER MARKER (B3): the All view marks the LAST of an early positional tier',
    /last of T1 RB/.test(captured), captured.match(/tier-note[^<]*/) || 'no marker');
  // Position-filtered view: banding on the tier break, no demotion.
  stubs.state.filterPos = 'RB';
  render();
  ck('  position view draws the tier-cliff hairline where the tier breaks',
    /class="tier-cliff"/.test(captured));
}

// ── 4. THE SLIDERS SAY WHO MOVED THEM ─────────────────────────────────────
{
  const fnSrc = extract('  function syncSliders() {');
  ck('syncSliders extracted', fnSrc.length > 200);
  const labels = {};
  const slider = (key, measured) => ({ dataset: { weight: key }, value: null,
    getAttribute: a => (a === 'value' ? String(measured) : null) });
  const sliders = [slider('tier', 0.0), slider('value', 1.0)];
  const stubs = {
    $$: () => sliders,
    $: sel => (labels[sel] = labels[sel] || { innerHTML: '', textContent: '' }),
    state: { weights: { tier: 1.2, value: 1.0 }, autoWeights: true },
  };
  // eslint-disable-next-line no-new-func
  const run = new Function('$$', '$', 'state', fnSrc + '; return syncSliders;')(
    stubs.$$, stubs.$, stubs.state);
  run();
  ck('a slider whose live value differs from the measured default SAYS SO — '
    + '"auto for this round — measured default 0.0"',
    /auto for this round/.test(labels['#w-tier'].innerHTML)
    && /measured default 0\.0/.test(labels['#w-tier'].innerHTML), labels['#w-tier'].innerHTML);
  ck('a slider AT its measured default carries no marker (no wallpaper)',
    labels['#w-value'].innerHTML === '1.0', labels['#w-value'].innerHTML);
  stubs.state.autoWeights = false;
  run();
  ck('with auto OFF the marker attributes the move to the human ("yours")',
    /yours/.test(labels['#w-tier'].innerHTML), labels['#w-tier'].innerHTML);
}

// ── 5. THE DOSSIER DISPLAYS THE ENGINE'S OWN FIELDS ───────────────────────
{
  const fnSrc = extract('  function dossierHtml(s) {');
  ck('dossierHtml extracted', fnSrc.length > 300);
  // eslint-disable-next-line no-new-func
  const dossier = new Function('escapeHtml', 'state',
    fnSrc + '; return dossierHtml;')(esc,
    { lastClock: { confidence: { message: 'Close: A is ahead of B by only 2.5.' } } });
  const s = {
    player: { player_id: 'p1', name: 'X', position: 'RB' }, score: 62.6,
    survival_to_next: 0.58,
    components: { weighted: { value: 40.2, tier: 0, need: 0, risk: -3.1, ceiling: 0,
      keeper: 5.0, bye: 0, stack: 6.0, onesie: 0, doctrine: 0 } },
    rails: ['VONA negative'], reasons: ['the reason'], context: ['a board fact'],
  };
  const html = dossier(s);
  ck('the score decomposition rows ARE components.weighted, signed, to 0.1',
    html.indexOf('+40.2') >= 0 && html.indexOf('-3.1') >= 0 && html.indexOf('+6.0') >= 0, html.slice(0, 300));
  ck('zero terms are omitted — one dominant story, not ten rows of 0.0',
    html.indexOf('tier cliff') < 0 && html.indexOf('bye collision') < 0);
  ck('survival is displayed as the engine value with its model named',
    html.indexOf('58%') >= 0 && /ADP model/.test(html));
  ck('rails, reasons and context all surface — nothing hidden',
    html.indexOf('VONA negative') >= 0 && html.indexOf('the reason') >= 0
    && html.indexOf('a board fact') >= 0);
  ck('board facts are labeled as NOT the reason (the rule-16 split, kept visible)',
    /not the reason/.test(html));
  ck('the engine\'s confidence sentence rides along verbatim',
    html.indexOf('Close: A is ahead of B by only 2.5.') >= 0);
}

// ── 6. THE FLAG LEGENDS CANNOT OUTLIVE THE CODE THEY DESCRIBE ────────────
{
  const legend = extract('  const FLAG_LEGEND = {');
  ck('FLAG_LEGEND exists', legend.length > 300);
  const ENG = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('legend claims −12 for injury; the engine still charges exactly that',
    /−12/.test(legend) && /risk -= 12/.test(ENG));
  ck('legend claims the RB age cliff is 27; the engine\'s AGE_CLIFF still says so',
    /cliff is 27/.test(legend) && /AGE_CLIFF = \{ RB: 27/.test(ENG));
  ck('legend claims ±6 for opportunity; the engine still does both arms',
    /\+6/.test(legend) && /risk \+= 6/.test(ENG) && /risk -= 6/.test(ENG));
  ck('legend says risk ships OFF; MEASURED defaults in the shipped EJS agree (risk 0.0)',
    /ships OFF/.test(legend)
    && /\['risk', 'Risk penalty', 0\.0/.test(fs.readFileSync(
      path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8')));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the chips, threats, board, sliders and dossier');
console.log('display the engine\'s own numbers with their model named; sentinels never');
console.log('render as market data; collapsed noise still contains every row; and each');
console.log('badge legend is pinned to the engine line it paraphrases.');

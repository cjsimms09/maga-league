// UI-FIDELITY SUITE (1/3) — THE VERDICT CHIP SAYS WHAT THE ENGINE SAYS.
//
// Cory, mid-pass, verbatim: "we need to also be certain the design is actually
// implementing and explaining what the model says or the model is useless if I
// cant implement it." This is that certainty for the verdict surface:
//
//   1. the LOCK / LEAN / TOSS-UP derivation is a PURE EXPORTED FUNCTION
//      (public/js/draft/verdict.js), and its thresholds are asserted against
//      the ENGINE'S OWN CFG (TIE_THRESHOLD / COIN_FLIP_GAP / CLOSE_GAP /
//      PATHS_BAND) — swept across the gap axis so the chip can NEVER say LOCK
//      while the engine says contested;
//   2. fed REAL engine output (E.onTheClock on the shipped board), the
//      derivation's displayed quantities equal the engine's fields exactly;
//   3. the RENDERER (app.js renderVerdict) is extracted from shipped source
//      (the seat_panel_markup pattern) and its emitted markup is asserted to
//      display the derivation's verdict, name, and gap — the screen cannot say
//      what the model does not.
//
// Run: node draft/tests/ui_fidelity_verdict.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const V = require(path.join(ROOT, 'public', 'js', 'draft', 'verdict.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const CFG = E.CFG;
ck('the engine exposes the thresholds the chip derives from',
  typeof CFG.TIE_THRESHOLD === 'number' && typeof CFG.COIN_FLIP_GAP === 'number'
  && typeof CFG.CLOSE_GAP === 'number' && typeof CFG.PATHS_BAND === 'number',
  { tie: CFG.TIE_THRESHOLD, cf: CFG.COIN_FLIP_GAP, close: CFG.CLOSE_GAP, band: CFG.PATHS_BAND });

// ── 1. THE DERIVATION, SWEPT AGAINST THE ENGINE'S OWN SEMANTICS ──────────
// Build a two-entry scored list at every gap in a fine sweep; contested and
// confidence come from the ENGINE'S definitions (contested = gap <
// TIE_THRESHOLD, recommend()'s own line; confidence = E.confidence, the real
// function). The chip must agree with both at every point.
function mk(gap) {
  const a = { player: { player_id: '1', name: 'Alpha', position: 'RB' }, score: 100,
    reasons: ['r'], context: [] };
  const b = { player: { player_id: '2', name: 'Beta', position: 'WR' }, score: 100 - gap,
    reasons: ['r'], context: [] };
  a.contested = gap < CFG.TIE_THRESHOLD;       // the engine's recommend() line, verbatim
  a.gap_to_second = gap;
  b.gap_to_second = null;
  return [a, b];
}
let sweepOk = true, lockWhileContested = 0, chipVsLevel = [];
for (let g = 0; g <= 8; g += 0.1) {
  const gap = Number(g.toFixed(1));
  const scored = mk(gap);
  const conf = E.confidence(scored);            // the REAL engine function
  const v = V.derive({ cfg: CFG, scored, confidence: conf, rule: null, plan: null, poll: null });
  if (v.verdict === 'LOCK' && scored[0].contested) { lockWhileContested++; sweepOk = false; }
  // The ladder the chip must implement, stated from the engine's constants:
  const expected = scored[0].contested ? 'TOSS-UP'
    : conf.level === 'coin-flip' ? 'TOSS-UP'
    : conf.level === 'close' ? 'LEAN'
    : conf.level === 'clear' ? 'LOCK' : null;
  if (expected && v.verdict !== expected) { sweepOk = false; chipVsLevel.push({ gap, got: v.verdict, expected }); }
}
ck('SWEPT 0..8 in 0.1 steps: chip NEVER says LOCK while the engine says contested',
  lockWhileContested === 0, lockWhileContested);
ck('and at every gap the chip equals the engine-derived ladder (contested→TOSS-UP, '
  + 'coin-flip→TOSS-UP, close→LEAN, clear→LOCK)', sweepOk, chipVsLevel.slice(0, 4));

// Boundary cases, by name, so a threshold re-tune shows up here in words:
{
  const atTie = V.derive({ cfg: CFG, scored: mk(CFG.TIE_THRESHOLD), confidence: E.confidence(mk(CFG.TIE_THRESHOLD)) });
  ck('gap == TIE_THRESHOLD (' + CFG.TIE_THRESHOLD + '): not contested by the engine, so not TOSS-UP',
    atTie.verdict !== 'TOSS-UP', atTie.verdict);
  const under = V.derive({ cfg: CFG, scored: mk(CFG.TIE_THRESHOLD - 0.1), confidence: E.confidence(mk(CFG.TIE_THRESHOLD - 0.1)) });
  ck('gap just under TIE_THRESHOLD: TOSS-UP — the engine calls it a tie, the chip may not out-confidence it',
    under.verdict === 'TOSS-UP', under.verdict);
  const clear = V.derive({ cfg: CFG, scored: mk(CFG.CLOSE_GAP + 0.1), confidence: E.confidence(mk(CFG.CLOSE_GAP + 0.1)) });
  ck('gap just over CLOSE_GAP (' + CFG.CLOSE_GAP + '): LOCK', clear.verdict === 'LOCK', clear.verdict);
  ck('  and LOCK\'s why is the ENGINE\'s own sentence (confidence.message verbatim)',
    clear.why === E.confidence(mk(CFG.CLOSE_GAP + 0.1)).message, clear.why);
}

// ── the SPLIT band is the engine's PATHS_BAND, not an invented number ─────
{
  const scored = mk(CFG.PATHS_BAND + 1);   // rule pick trails by more than the band
  const rule = { pick: { player_id: '2', name: 'Beta', position: 'WR' }, reason: 'rule reason' };
  const v = V.derive({ cfg: CFG, scored, confidence: E.confidence(scored), rule });
  ck('rule ≠ value with gap > PATHS_BAND (' + CFG.PATHS_BAND + '): SPLIT', v.verdict === 'SPLIT', v.verdict);
  ck('  SPLIT backs the RULE\'s pick — the page\'s own measured doctrine',
    v.pick && v.pick.player_id === '2', v.pick);
  ck('  and the why names the gap in labeled units',
    /composite pts/.test(v.why) && v.why.indexOf((CFG.PATHS_BAND + 1).toFixed(1)) >= 0, v.why);
  ck('  the RULE lens agrees with its own headline (never "disagrees" under its own pick)',
    v.lenses.find(l => l.key === 'rule').stance === 'agrees',
    v.lenses.find(l => l.key === 'rule'));
  ck('  the VALUE lens is marked as the differing voice',
    v.lenses.find(l => l.key === 'value').stance === 'differs');
  ck('  the value top appears among alternatives PRICED AHEAD (+) of the backed pick',
    v.alternatives.some(a => a.player.player_id === '1' && a.delta_pts > 0),
    v.alternatives);
  const inband = mk(CFG.PATHS_BAND - 1);
  const v2 = V.derive({ cfg: CFG, scored: inband, confidence: E.confidence(inband), rule });
  ck('rule ≠ value INSIDE the band: TOSS-UP — "inside the model\'s noise — your call", in those words',
    v2.verdict === 'TOSS-UP' && /noise/.test(v2.why) && /call/i.test(v2.why), { v: v2.verdict, why: v2.why });
}

// ── pinned personal-list pick ─────────────────────────────────────────────
{
  const scored = mk(-1.9);   // pinned pick scores BELOW the board top
  scored[0].contested = false;
  const conf = E.confidence(scored);
  const v = V.derive({ cfg: CFG, scored, confidence: conf });
  ck('negative gap (pinned): chip PINNED, never a "coin flip within −1.9"',
    v.verdict === 'PINNED' && conf.level === 'pinned', { v: v.verdict, level: conf.level });
  ck('  and the why is the engine\'s own pinned sentence', v.why === conf.message);
}

// ── 2. REAL ENGINE OUTPUT ON THE SHIPPED BOARD ───────────────────────────
const ART = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const ALL = ART.players.filter(p => p.proj_mean > 0)
  .sort((a, b) => (a.overall_rank || 1e9) - (b.overall_rank || 1e9));
{
  const ctx = { board: ALL.slice(28), currentPick: 33, nextPick: 48, totalPicks: 120,
    myPicksLeft: 12, roster: [], league: ART.league, weights: E.DEFAULT_WEIGHTS,
    runMultipliers: {}, intervening: [], roundsLeft: 12 };
  const out = E.onTheClock(ctx, { targets: [], avoid: [] });
  const v = V.derive({ cfg: CFG, scored: out.scored, confidence: out.confidence });
  ck('REAL BOARD: a verdict derives at pick 33', v.verdict !== 'NONE' && !!v.pick, v.verdict);
  ck('  the backed pick IS the engine\'s top (no rule lens passed)',
    v.pick.player_id === out.scored[0].player.player_id,
    { backed: v.pick.name, top: out.scored[0].player.name });
  ck('  gap_pts equals the engine\'s gap_to_second to 0.1',
    v.gap_pts === Number(out.scored[0].gap_to_second.toFixed(1)),
    { chip: v.gap_pts, engine: out.scored[0].gap_to_second });
  ck('  alternatives are priced as SIGNED distance to the BACKED pick, and never list it',
    v.alternatives.every((a, i) =>
      a.delta_pts === Number((out.scored[i + 1].score - out.scored[0].score).toFixed(1))
      && a.player.player_id !== v.pick.player_id),
    v.alternatives.map(a => a.delta_pts));
  ck('  the confidence note is the engine\'s message verbatim',
    v.confidence_note === out.confidence.message);
  ck('  units are LABELED — "composite pts", never a bare number',
    v.gap_units === 'composite pts');
}

// ── 3. THE SHIPPED RENDERER DISPLAYS WHAT THE DERIVATION RETURNS ─────────
// Extract renderVerdict + its chip-word table from app.js (the
// seat_panel_markup pattern) and run it against a stubbed DOM.
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
const fnSrc = extract('  function renderVerdict(out) {');
const chipWords = extract('  const VERDICT_CHIP_WORDS = {');
ck('renderVerdict exists in the shipped app.js', fnSrc.length > 400);
ck('the chip-word table exists and names every verdict',
  ['LOCK', 'LEAN', 'TOSS-UP', 'SPLIT', 'PINNED'].every(k => chipWords.indexOf("'" + k + "'") >= 0));

{
  let captured = '', display = 'none';
  const host = {
    set innerHTML(v) { captured = v; }, get innerHTML() { return captured; },
    style: { set display(v) { display = v; }, get display() { return display; } },
  };
  const stubs = {
    $: sel => (sel === '#verdict-block' ? host : null),
    state: { board: [], myRoster: [], verdictShown: false, lastVerdict: null, data: null, _shadowProj: null },
    escapeHtml: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    shortName: n => String(n),
    currentPick: () => 33,
    seatForCurrentPick: () => null,
    context: () => ({}),
    E: E,
    DraftVerdict: V,
    console: console,
  };
  const scored = mk(CFG.CLOSE_GAP + 2);          // a clean LOCK
  const out = { scored, confidence: E.confidence(scored) };
  // eslint-disable-next-line no-new-func
  const run = new Function('$', 'state', 'escapeHtml', 'shortName', 'currentPick',
    'seatForCurrentPick', 'context', 'E', 'DraftVerdict', 'console', 'explainPanel',
    chipWords + ';\n' + fnSrc + ';\nreturn renderVerdict;');
  const render = run(stubs.$, stubs.state, stubs.escapeHtml, stubs.shortName,
    stubs.currentPick, stubs.seatForCurrentPick, stubs.context, stubs.E,
    stubs.DraftVerdict, stubs.console, () => '');
  render(out);
  const v = V.derive({ cfg: CFG, scored, confidence: out.confidence });
  ck('RENDERED: the chip in the markup is the derivation\'s verdict',
    captured.indexOf('data-verdict="' + v.verdict + '"') >= 0, captured.slice(0, 160));
  ck('RENDERED: the hero name is the derivation\'s backed pick',
    captured.indexOf('wrv-name') >= 0 && captured.indexOf('Alpha') >= 0);
  ck('RENDERED: the why sentence is displayed verbatim',
    captured.indexOf(stubs.escapeHtml(v.why)) >= 0);
  ck('RENDERED: the take button carries the backed pick\'s id (one take mechanism)',
    captured.indexOf('data-draft-me="' + v.pick.player_id + '"') >= 0);
  ck('RENDERED: alternatives print the labeled unit and the sign convention',
    captured.indexOf('composite pts') >= 0 && captured.indexOf('+ = scores higher') >= 0);
  ck('RENDERED: the block is visible and flagged shown', display === '' && stubs.state.verdictShown === true);

  // FAIL ARM — a contested board must not render a LOCK chip.
  const tossScored = mk(0.5);
  render({ scored: tossScored, confidence: E.confidence(tossScored) });
  ck('FAIL ARM RENDERED: contested board renders TOSS-UP, and the chip says "your call"',
    captured.indexOf('data-verdict="TOSS-UP"') >= 0 && /your call/i.test(captured), captured.slice(0, 200));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the verdict chip is a pure derivation from the');
console.log('engine\'s own confidence/contested fields and CFG bands, swept so LOCK can');
console.log('never coexist with contested; the shipped renderer displays exactly what the');
console.log('derivation returns, with units labeled. What it cannot see: CSS hiding the');
console.log('block — that is the screenshot gate\'s half.');

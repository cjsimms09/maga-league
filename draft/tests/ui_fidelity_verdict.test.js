// TERRITORY: A
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

/* THE "REAL BOARD" ARM WAS SCORED WITH THE WRONG WEIGHTS (session E,
 * 2026-08-17; register E19).
 *
 * This section carried `weights: E.DEFAULT_WEIGHTS` while the app initialises
 * from `MEASURED_WEIGHTS` (app.js:52, pinned by surface_contract.test.js) —
 * five of the eight terms are ZERO in production. The assertions below are
 * self-referential (chip vs engine, both from the same `out`), so they held
 * either way and this suite was never WRONG. What it was, is aimed at a verdict
 * distribution Cory never sees.
 *
 * MEASURED across his twelve picks, DEFAULT against MEASURED:
 *
 *     the VERDICT WORD differs at 4 of 12
 *     the BACKED PICK differs at 8 of 12
 *     pick 33, his FIRST:  LOCK Zay Flowers         g=14.3  (this suite)
 *                          TOSS-UP Colston Loveland g= 0.5  (the app)
 *
 * That is the SAME PAIR rec_rows.test.js records for the same defect — the fix
 * landed there and not in its siblings. It matters here specifically because
 * the verdict word is a function of the GAP, and the production weight vector
 * compresses gaps: this arm produced LOCK at 10 of 12 picks and never once
 * produced a LEAN, so the threshold interactions that decide LEAN vs LOCK on
 * the board Cory reads were exercised only synthetically in section 1.
 *
 * REFUSES RATHER THAN FALLS BACK, following rec_rows.test.js. */
const PROD_WEIGHTS = (function () {
  const w = E.MEASURED_WEIGHTS;
  if (!w || typeof w.value !== 'number') {
    throw new Error('REFUSING to score: engine.js no longer exports MEASURED_WEIGHTS, '
      + 'which is what app.js initialises state.weights from. Scoring the "real board" '
      + 'arm with anything else validates a verdict no surface shows.');
  }
  return w;
})();

// ── 2. REAL ENGINE OUTPUT ON THE SHIPPED BOARD ───────────────────────────
const ART = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const ALL = ART.players.filter(p => p.proj_mean > 0)
  .sort((a, b) => (a.overall_rank || 1e9) - (b.overall_rank || 1e9));
{
  const ctx = { board: ALL.slice(28), currentPick: 33, nextPick: 48, totalPicks: 120,
    myPicksLeft: 12, roster: [], league: ART.league, weights: PROD_WEIGHTS,
    /* THE PICK BOARD IS A SECOND FIXTURE DIMENSION AND I MISSED IT ON THE FIRST
     * PASS (session E, same day, correcting my own published number).
     * `app.js:2066` threads `pick_order.picks` into every context it builds, and
     * `survival.js` converts board-slot to live-selection through it — its SCALE
     * counter exists precisely so "did the conversion run" is a readable fact
     * rather than an assumption, and its own comment says unconverted numbers
     * are "on the wrong scale". Omitting it does not blow up: it silently scores
     * survival on the unconverted scale, and survival feeds VONA, which is 63%
     * of the composite. Measured at pick 33 under production weights: without
     * the pick board the verdict reads LEAN g=2.9, with it TOSS-UP g=0.5. */
    pickBoard: (ART.pick_order || {}).picks || null,
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
    // expert_spread.js's badge (2026-08-18) — absent here on purpose, same as
    // a missing artifact in the real page: '' for every player, never a guess.
    expertSpreadBadge: () => '',
    E: E,
    DraftVerdict: V,
    console: console,
  };
  const scored = mk(CFG.CLOSE_GAP + 2);          // a clean LOCK
  const out = { scored, confidence: E.confidence(scored) };
  // eslint-disable-next-line no-new-func
  const run = new Function('$', 'state', 'escapeHtml', 'shortName', 'currentPick',
    'seatForCurrentPick', 'context', 'expertSpreadBadge', 'E', 'DraftVerdict', 'console', 'explainPanel',
    chipWords + ';\n' + fnSrc + ';\nreturn renderVerdict;');
  const render = run(stubs.$, stubs.state, stubs.escapeHtml, stubs.shortName,
    stubs.currentPick, stubs.seatForCurrentPick, stubs.context, stubs.expertSpreadBadge, stubs.E,
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

// ── THE SEAT PLAN OWNS THE HEADLINE — Cory's ruling, 2026-08-16 (queue #4) ─
// "Pick-33 headline ownership": when the DP season plan speaks for this seat
// and disagrees with the value top, the PLAN's answer is the backed pick and
// the value pick prints as the explicit priced alternative. Pinned here so
// the hierarchy cannot silently revert to rule-first.
{
  const scored = mk(CFG.PATHS_BAND + 1);           // Alpha RB tops, Beta WR trails
  const plan = { slot: 'WR', name: 'Beta' };       // the plan wants the WR seat
  const v = V.derive({ cfg: CFG, scored, confidence: E.confidence(scored), plan });
  ck('plan ≠ value beyond the band: SPLIT, and the PLAN\'s player is backed',
    v.verdict === 'SPLIT' && v.pick && v.pick.player_id === '2', { v: v.verdict, pick: v.pick });
  ck('  the why says the season plan owns the seat, in those words',
    /season plan owns this seat/.test(v.why), v.why);
  ck('  and prints the value pick as the priced second line',
    /value board prefers Alpha/.test(v.why) && /composite pts/.test(v.why), v.why);
  ck('  the value top appears among alternatives priced ahead of the backed pick',
    v.alternatives.some(a => a.player.player_id === '1' && a.delta_pts > 0), v.alternatives);
  ck('  the PLAN lens agrees with its own headline',
    v.lenses.find(l => l.key === 'plan').stance === 'agrees', v.lenses);

  // With a RULE present too, the plan still owns the headline; the rule reads
  // as the differing lens rather than silently reclaiming the pick.
  const rule = { pick: { player_id: '1', name: 'Alpha', position: 'RB' }, reason: 'r' };
  const v2 = V.derive({ cfg: CFG, scored, confidence: E.confidence(scored), plan, rule });
  ck('plan + rule both present: the plan still owns the headline',
    v2.pick && v2.pick.player_id === '2', v2.pick);
  ck('  and the rule lens honestly reads "differs" under the plan\'s pick',
    v2.lenses.find(l => l.key === 'rule').stance === 'differs', v2.lenses);

  // Inside the band the honest chip is TOSS-UP, in the noise words.
  const close = mk(CFG.PATHS_BAND - 1);
  const v3 = V.derive({ cfg: CFG, scored: close, confidence: E.confidence(close), plan });
  ck('plan ≠ value INSIDE the band: TOSS-UP, "inside the model\'s noise"',
    v3.verdict === 'TOSS-UP' && /noise/.test(v3.why), { v: v3.verdict, why: v3.why });

  // A plan whose wanted slot has nobody scoreable stays silent — old flow.
  const v4 = V.derive({ cfg: CFG, scored, confidence: E.confidence(scored),
    plan: { slot: 'TE', name: 'Nobody Here' } });
  ck('a plan wanting a slot with nobody scoreable is silent — value top backed',
    v4.pick && v4.pick.player_id === '1', v4.pick);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the verdict chip is a pure derivation from the');
console.log('engine\'s own confidence/contested fields and CFG bands, swept so LOCK can');
console.log('never coexist with contested; the shipped renderer displays exactly what the');
console.log('derivation returns, with units labeled. What it cannot see: CSS hiding the');
console.log('block — that is the screenshot gate\'s half.');

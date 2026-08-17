// TERRITORY: A
// UI-FIDELITY — TIE-BREAK FACTS PRINT ON A TOSS-UP AND MOVE NOTHING.
//
// Cory (2026-08-16, verbatim): "Anything we should add to it that could help
// me, especially in tie break scenarios?" The answer is verdict.js
// tiebreakFacts(): when the chip is TOSS-UP — the engine's own admission that
// the top options sit inside its noise — a compact line prints FACTS the
// board already carries (ADP velocity divergence, bye overlap with the
// drafted roster, a >2-year age gap, starter-vs-committee). NO new scoring
// weight exists anywhere in the path; this suite's core claim is the
// contract's hard half:
//
//   1. a synthetic toss-up derives AND renders the discriminators;
//   2. a non-toss-up (LOCK / SPLIT) derives and renders NONE;
//   3. the backed pick and verdict are PROVABLY IDENTICAL with the feature's
//      roster input present and absent, swept across the gap axis;
//   4. absent fields skip their fact (absent ≠ zero) — an even pair renders
//      the honest "genuinely even" line, not silence and not invention.
//
// Run: node draft/tests/ui_fidelity_tiebreak.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const V = require(path.join(ROOT, 'public', 'js', 'draft', 'verdict.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const CFG = E.CFG;

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// Two-entry scored board at a chosen gap; player fields carry the tie-break
// inputs so every fact category can fire.
function mk(gap, aFields, bFields) {
  const a = { player: Object.assign({ player_id: '1', name: 'Alpha', position: 'RB' }, aFields || {}),
    score: 100, reasons: ['r'], context: [] };
  const b = { player: Object.assign({ player_id: '2', name: 'Beta', position: 'WR' }, bFields || {}),
    score: 100 - gap, reasons: ['r'], context: [] };
  a.contested = gap < CFG.TIE_THRESHOLD;
  a.gap_to_second = gap; b.gap_to_second = null;
  return [a, b];
}
const RICH_A = { adp_velocity: 14, bye: 9, age: 24, depth_chart_order: 1 };
const RICH_B = { adp_velocity: -6, bye: 5, age: 29, depth_chart_order: 2 };
const ROSTER = [
  { player_id: 'r1', name: 'Kept One', bye: 9, position: 'WR' },
  { player_id: 'r2', name: 'Kept Two', bye: 9, position: 'TE' },
  { player_id: 'r3', name: 'Kept Three', bye: 7, position: 'QB' },
];

// ── 1. A SYNTHETIC TOSS-UP DERIVES ALL FOUR DISCRIMINATORS ──────────────
{
  const scored = mk(0.5, RICH_A, RICH_B);
  const v = V.derive({ cfg: CFG, scored, confidence: E.confidence(scored), roster: ROSTER });
  ck('the board is a TOSS-UP (inside the engine\'s own tie threshold)',
    v.verdict === 'TOSS-UP', v.verdict);
  ck('tiebreak attaches, naming both halves of the tie',
    v.tiebreak && v.tiebreak.a === 'Alpha' && v.tiebreak.b === 'Beta', v.tiebreak);
  const f = (v.tiebreak || {}).facts || [];
  ck('all four fact categories fire on the rich pair', f.length === 4, f);
  ck('(a) MARKET DIVERGENCE — says WHO is rising and who is falling, in slots',
    f.some(x => /market: Alpha is rising \(\+14 ADP slots\) while Beta is falling \(−6\)/.test(x)), f);
  ck('(b) BYE OVERLAP — counts the roster picks it stacks with, names the clear one',
    f.some(x => /byes: Alpha \(wk 9\) stacks with 2 of your picks; Beta \(wk 5\) is clear/.test(x)), f);
  ck('(c) AGE GAP — printed only because it exceeds 2 years',
    f.some(x => /age: Alpha is 24, Beta is 29 — 5 years apart/.test(x)), f);
  ck('(d) DEPTH CHART — the listed starter vs the committee seat',
    f.some(x => /depth chart: Alpha is the listed starter; Beta sits №2/.test(x)), f);
}

// ── 2. THE FACTS ARE FACTS, NOT A SCORE: each gate refuses to fire ───────
{
  // Same-direction velocity is NOT divergence.
  const s1 = mk(0.5, Object.assign({}, RICH_A, { adp_velocity: 4 }),
    Object.assign({}, RICH_B, { adp_velocity: 2 }));
  const v1 = V.derive({ cfg: CFG, scored: s1, confidence: E.confidence(s1), roster: ROSTER });
  ck('both rising: no market fact (divergence only)',
    !v1.tiebreak.facts.some(x => /^market:/.test(x)), v1.tiebreak.facts);

  // A 2-year age gap is NOT "meaningful" — the threshold is strict.
  const s2 = mk(0.5, Object.assign({}, RICH_A, { age: 26 }), Object.assign({}, RICH_B, { age: 28 }));
  const v2 = V.derive({ cfg: CFG, scored: s2, confidence: E.confidence(s2), roster: ROSTER });
  ck('age gap of exactly 2: no age fact (> 2 required)',
    !v2.tiebreak.facts.some(x => /^age:/.test(x)), v2.tiebreak.facts);

  // Both committee (neither is №1): depth chart separates nothing.
  const s3 = mk(0.5, Object.assign({}, RICH_A, { depth_chart_order: 2 }), RICH_B);
  const v3 = V.derive({ cfg: CFG, scored: s3, confidence: E.confidence(s3), roster: ROSTER });
  ck('neither listed №1: no depth-chart fact',
    !v3.tiebreak.facts.some(x => /^depth chart:/.test(x)), v3.tiebreak.facts);

  // Equal bye overlap separates nothing.
  const s4 = mk(0.5, Object.assign({}, RICH_A, { bye: 7 }), Object.assign({}, RICH_B, { bye: 7 }));
  const v4 = V.derive({ cfg: CFG, scored: s4, confidence: E.confidence(s4), roster: ROSTER });
  ck('same overlap count: no bye fact', !v4.tiebreak.facts.some(x => /^byes:/.test(x)), v4.tiebreak.facts);

  // ABSENT ≠ ZERO: a bare pair (no velocity, no bye, no age, no depth chart)
  // yields ZERO facts — nothing is invented from missing fields.
  const s5 = mk(0.5);
  const v5 = V.derive({ cfg: CFG, scored: s5, confidence: E.confidence(s5), roster: ROSTER });
  ck('bare players: tiebreak attaches with ZERO facts (absent fields skip, never zero-fill)',
    v5.tiebreak && v5.tiebreak.facts.length === 0, v5.tiebreak);

  // One-sided velocity (only Alpha measured) is not divergence either.
  const s6 = mk(0.5, Object.assign({}, RICH_A), Object.assign({}, RICH_B, { adp_velocity: null }));
  const v6 = V.derive({ cfg: CFG, scored: s6, confidence: E.confidence(s6), roster: ROSTER });
  ck('velocity on one side only: no market fact (both ends or nothing)',
    !v6.tiebreak.facts.some(x => /^market:/.test(x)), v6.tiebreak.facts);
}

// ── 3. NON-TOSS-UPS CARRY NOTHING ────────────────────────────────────────
{
  const lock = mk(CFG.CLOSE_GAP + 2, RICH_A, RICH_B);
  const vL = V.derive({ cfg: CFG, scored: lock, confidence: E.confidence(lock), roster: ROSTER });
  ck('a LOCK derives tiebreak: null — even with every fact input present',
    vL.verdict === 'LOCK' && vL.tiebreak === null, { v: vL.verdict, tb: vL.tiebreak });

  const split = mk(CFG.PATHS_BAND + 1, RICH_A, RICH_B);
  const vS = V.derive({ cfg: CFG, scored: split, confidence: E.confidence(split),
    plan: { slot: 'WR', name: 'Beta' }, roster: ROSTER });
  ck('a SPLIT derives tiebreak: null — the discriminators are for ties only',
    vS.verdict === 'SPLIT' && vS.tiebreak === null, { v: vS.verdict, tb: vS.tiebreak });
}

// A PLAN-vs-VALUE toss-up discriminates the actual pair: the plan's pick
// (backed) against the value top.
{
  const scored = mk(CFG.PATHS_BAND - 1, RICH_A, RICH_B);
  const v = V.derive({ cfg: CFG, scored, confidence: E.confidence(scored),
    plan: { slot: 'WR', name: 'Beta' }, roster: ROSTER });
  ck('plan toss-up: the pair is (backed plan pick, value top)',
    v.verdict === 'TOSS-UP' && v.tiebreak && v.tiebreak.a === 'Beta' && v.tiebreak.b === 'Alpha',
    v.tiebreak);
}

// ── 4. THE BACKED PICK CANNOT MOVE — swept, with and without the input ───
{
  let same = true; const diffs = [];
  for (let g = 0; g <= 8; g += 0.1) {
    const gap = Number(g.toFixed(1));
    const A = V.derive({ cfg: CFG, scored: mk(gap, RICH_A, RICH_B),
      confidence: E.confidence(mk(gap, RICH_A, RICH_B)) });
    const B = V.derive({ cfg: CFG, scored: mk(gap, RICH_A, RICH_B),
      confidence: E.confidence(mk(gap, RICH_A, RICH_B)), roster: ROSTER });
    if (A.verdict !== B.verdict || String(A.pick.player_id) !== String(B.pick.player_id)
        || A.headline !== B.headline || A.why !== B.why) {
      same = false; diffs.push({ gap, A: A.verdict, B: B.verdict });
    }
  }
  ck('SWEPT 0..8: verdict, backed pick, headline and why are byte-identical '
    + 'with and without the roster input', same, diffs.slice(0, 3));

  // And with plan + rule voices in play (the branchy derivations).
  let same2 = true;
  [0.5, CFG.PATHS_BAND - 1, CFG.PATHS_BAND + 1, CFG.CLOSE_GAP + 2].forEach(gap => {
    const plan = { slot: 'WR', name: 'Beta' };
    const rule = { pick: { player_id: '1', name: 'Alpha', position: 'RB' }, reason: 'r' };
    const A = V.derive({ cfg: CFG, scored: mk(gap, RICH_A, RICH_B),
      confidence: E.confidence(mk(gap, RICH_A, RICH_B)), plan, rule });
    const B = V.derive({ cfg: CFG, scored: mk(gap, RICH_A, RICH_B),
      confidence: E.confidence(mk(gap, RICH_A, RICH_B)), plan, rule, roster: ROSTER });
    if (A.verdict !== B.verdict || String(A.pick.player_id) !== String(B.pick.player_id)) same2 = false;
  });
  ck('plan+rule variants: backed pick identical with the feature on', same2);
}

// ── 5. THE SHIPPED RENDERER — facts reach the screen on a toss-up only ───
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
ck('renderVerdict passes the roster to the derivation (the bye fact\'s input)',
  /roster: state\.myRoster \|\| \[\]/.test(fnSrc));

function render(scored, roster) {
  let captured = '', display = 'none';
  const host = {
    set innerHTML(v) { captured = v; }, get innerHTML() { return captured; },
    style: { set display(v) { display = v; }, get display() { return display; } },
  };
  const stubs = {
    $: sel => (sel === '#verdict-block' ? host : null),
    state: { board: [], myRoster: roster || [], verdictShown: false, lastVerdict: null,
      data: null, _shadowProj: null },
    escapeHtml: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    shortName: n => String(n),
    currentPick: () => 33,
    seatForCurrentPick: () => null,
    context: () => ({}),
  };
  // eslint-disable-next-line no-new-func
  const run = new Function('$', 'state', 'escapeHtml', 'shortName', 'currentPick',
    'seatForCurrentPick', 'context', 'E', 'DraftVerdict', 'console', 'explainPanel',
    chipWords + ';\n' + fnSrc + ';\nreturn renderVerdict;');
  run(stubs.$, stubs.state, stubs.escapeHtml, stubs.shortName, stubs.currentPick,
    stubs.seatForCurrentPick, stubs.context, E, V, console, () => '')(
    { scored: scored, confidence: E.confidence(scored) });
  return captured;
}

{
  const html = render(mk(0.5, RICH_A, RICH_B), ROSTER);
  ck('TOSS-UP RENDERED: the tie-break block is on screen, labeled printed-not-scored',
    /wrv-tiebreak/.test(html) && /printed, not scored/.test(html), html.slice(0, 160));
  ck('TOSS-UP RENDERED: the four facts render as list items',
    (html.match(/<li>/g) || []).length === 4 && /market: Alpha is rising/.test(html)
    && /byes: Alpha \(wk 9\)/.test(html) && /age: Alpha is 24/.test(html)
    && /depth chart: Alpha is the listed starter/.test(html));

  const even = render(mk(0.5), ROSTER);
  ck('TOSS-UP with nothing separating: the honest "genuinely even" line renders',
    /wrv-tiebreak/.test(even) && /genuinely even; your read decides/.test(even)
    && !/<li>/.test(even));

  const lock = render(mk(CFG.CLOSE_GAP + 2, RICH_A, RICH_B), ROSTER);
  ck('LOCK RENDERED: no tie-break block at all',
    !/wrv-tiebreak/.test(lock) && /data-verdict="LOCK"/.test(lock));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);

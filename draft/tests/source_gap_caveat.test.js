/* THE ONE-SOURCE SENTENCE REACHES THE SCREEN — Cory's 08-18 order made a
 * finding into an instruction: when the board and the market disagree
 * violently on a player, and the E32 mechanism explains it (FP over Sleeper,
 * board reads only Sleeper), the why panel must SAY "lean market" at the
 * point of decision instead of leaving Cory to remember a register row.
 *
 * Lifted-function pattern (same as floor_is_a_cohort): app.js has no module
 * exports, so the function is extracted by its braces and evaluated.
 *
 * Run: node draft/tests/source_gap_caveat.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

function lift(name) {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found');
  let depth = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    if (SRC[k] === '}') { depth--; if (!depth) { j = k + 1; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval('(' + SRC.slice(i, j) + ')');
}
/* sourceGapCaveat now calls positionGapMedians (register 83/84's position-
 * relative fix), which reads/writes `state._gapMedFor`/`_gapMedians` for
 * memoization — same pattern as cohortRatios in floor_is_a_cohort_*.test.js.
 * Both are lifted together with a real (mutable) `state` object so the cache
 * actually exercises, and sourceGapCaveat is built via `new Function` so it
 * closes over the SAME positionGapMedians/state rather than re-evaluating a
 * second copy that can't see them. */
function liftSrc(name) {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found');
  let depth = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    if (SRC[k] === '}') { depth--; if (!depth) { j = k + 1; break; } }
  }
  return SRC.slice(i, j);
}
const state = {};
const sourceGapCaveat = new Function('state',
  liftSrc('positionGapMedians') + '\n' + liftSrc('sourceGapCaveat')
  + '\nreturn sourceGapCaveat;')(state);
const positionGapMedians = new Function('state',
  liftSrc('positionGapMedians') + '\nreturn positionGapMedians;')(state);

// Synthetic board: 60 players, vorp descending; ADP mostly tracks board order.
function mkBoard() {
  const b = [];
  for (let i = 0; i < 60; i++) {
    b.push({ position: 'RB', proj_mean: 200 - i, vorp: 100 - i,
             adjusted_adp: i + 1, proj_sleeper: 200 - i, proj_fantasypros: 200 - i });
  }
  return b;
}

{
  // ONE-SOURCE CASE: board rank 55, market ADP 20, FP +20% over Sleeper.
  const b = mkBoard();
  const p = b[54];
  p.adjusted_adp = 20; p.proj_sleeper = 146; p.proj_fantasypros = 176; p.proj_mean = 146;
  const out = sourceGapCaveat(p, b);
  ck('a big board-under-market gap with FP>Sleeper prints the lean-market sentence',
    /SOURCE GAP/.test(out) && /Lean market/.test(out), out);
  ck('  and quotes the FP-over-Sleeper size', /\+21%|\+20%/.test(out), out);
}
{
  // THE COLEMAN CASE: same gap, FP at or below Sleeper — must NOT say lean market.
  const b = mkBoard();
  const p = b[54];
  p.adjusted_adp = 20; p.proj_sleeper = 146; p.proj_fantasypros = 130; p.proj_mean = 146;
  const out = sourceGapCaveat(p, b);
  ck('the unexplained gap says UNEXPLAINED and extra doubt, never lean market',
    /UNEXPLAINED/.test(out) && !/Lean market/.test(out), out);
}
{
  // CONTROL: a small gap says nothing.
  const b = mkBoard();
  const out = sourceGapCaveat(b[10], b);
  ck('CONTROL — a player the board and market agree on gets NO caveat', out === '', out);
}
{
  // ABSENCE IS NOT EVIDENCE: big gap, no FP number — silence, not a claim.
  const b = mkBoard();
  const p = b[54];
  p.adjusted_adp = 20; delete p.proj_fantasypros;
  const out = sourceGapCaveat(p, b);
  ck('no FP number -> no claim in either direction', out === '', out);
}
{
  // WIRING: the why panel actually calls it (a number nothing renders...).
  ck('the why panel renders the caveat (sourceGapCaveat is CALLED, not just defined)',
    /sourceGapCaveat\(p, state\.board\)/.test(SRC));
}
{
  // LIVE KNOWN-POSITIVE (rule 3e): the caveat must fire for at least one real
  // player on the committed board, or this suite has only ever seen fixtures.
  const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const board = DATA.players.filter(p => p.proj_mean != null);
  const hits = board.filter(p => /SOURCE GAP/.test(sourceGapCaveat(p, board)));
  ck('KNOWN-POSITIVE — the caveat fires on the live board (E32 counted 33 such gaps)',
    hits.length >= 5, { fired_on: hits.length });
}

// ── REGISTER 83/84: the caveat compares a cross-position VORP rank to ADP, ─
// and that comparison carries a STRUCTURAL per-position offset with nothing
// to do with any player's own data (measured on the live board: QB median
// +178, K/DEF near −120 — see positionGapMedians below). Before this fix the
// same fixed 20-rank threshold applied to the RAW gap, so it flagged ~60% of
// QBs on the live board as "one-source" regardless of their actual
// projections, and was nearly blind to real TE anomalies (TE's own −93
// median swallowed them). These fixtures build that exact shape and require
// the caveat to survive it — the QB "everyone identically off" case must NOT
// fire, and the one QB who differs from his own peers must. ────────────────
// helper only for the assertion messages below — computes the PRE-FIX raw
// gap so a failure message shows what the old code would have done.
function sourceGapCaveatRaw(p, board) {
  const list = board.filter(x => x && x.proj_mean != null);
  const byBoard = list.slice().sort((a, b2) => (b2.vorp || 0) - (a.vorp || 0));
  const adpOf = x => (x.adjusted_adp != null ? x.adjusted_adp : x.raw_adp);
  const boardRank = byBoard.indexOf(p) + 1;
  return boardRank - adpOf(p);
}
function mkMixedPositionBoard() {
  const b = [];
  // 40 QBs get the highest raw vorp, so they occupy board ranks 1-40 by the
  // cross-position VORP sort. Their ADP is set to `boardRank - 150` — the
  // market drafts them 150 ranks EARLIER than the board's own VORP-only
  // ranking would, a uniform per-position offset with nothing player-
  // specific about it (the real live-board QB median is +178, same shape).
  for (let i = 0; i < 40; i++) {
    b.push({ position: 'QB', vorp: 500 - i, adjusted_adp: (i + 1) - 150,
             proj_mean: 300 - i, proj_sleeper: 300 - i, proj_fantasypros: 300 - i });
  }
  // 40 RBs occupy board ranks 41-80 (lower vorp than every QB). ADP tracks
  // board rank directly -> ~0 structural offset, the neutral case.
  for (let i = 0; i < 40; i++) {
    b.push({ position: 'RB', vorp: 200 - i, adjusted_adp: (i + 41),
             proj_mean: 200 - i, proj_sleeper: 200 - i, proj_fantasypros: 200 - i });
  }
  return b;
}
{
  const b = mkMixedPositionBoard();
  // A typical QB: board rank 20, ADP 20-150=-130, raw gap = 20-(-130) = 150
  // — that IS his position's own median, so nothing anomalous about him.
  const typical = b[19];
  const rawGap = sourceGapCaveatRaw(typical, b);
  ck('a QB whose gap is entirely his POSITION\'s structural offset gets no caveat '
    + '(the pre-fix version would have fired here on a ' + rawGap + '-rank raw gap — '
    + 'this is the QB overflagging register 83/84 found)',
    rawGap > 20 && sourceGapCaveat(typical, b) === '', { raw_gap: rawGap });
  // A real outlier RELATIVE TO HIS OWN POSITION: 60 further ranks on top of
  // the shared +150 offset (ADP moved 60 EARLIER still), plus FP > Sleeper
  // so the lean-market branch is reachable.
  const outlier = b[19];
  outlier.adjusted_adp = (20 - 150) - 60;             // raw gap now ~210, position-relative ~60
  outlier.proj_sleeper = 250; outlier.proj_fantasypros = 300; outlier.proj_mean = 250;
  const out = sourceGapCaveat(outlier, b);
  ck('...but a QB who is unusual relative to his OWN peers (60 further ranks on top '
    + 'of the shared offset) still fires — the fix removes the position-wide false '
    + 'positive without going blind to a real one',
    /SOURCE GAP/.test(out) && /Lean market/.test(out), out);
}
{
  const b = mkMixedPositionBoard();
  const medians = positionGapMedians(b);
  ck('positionGapMedians isolates QB\'s ~150-rank structural offset from RB\'s ~0',
    Math.abs(medians.QB - 150) < 5 && Math.abs(medians.RB - 0) < 5, medians);
}

// ── CAUGHT LIVE (register 83/84): a fixture where the RAW gap is NEGATIVE
// (board ranks him ABOVE market) but the caveat still fires because his
// position's own median is even MORE negative (TE's real live-board median
// is -93, same shape as this fixture) — the pre-fix wording said "board sits
// ~-5 slots below market", which is self-contradictory (negative means above
// market). The sentence must describe the position-relative distance that
// actually fired, not the raw number. ───────────────────────────────────────
function mkNegativeMedianBoard() {
  const b = [];
  // 40 RBs dominate vorp -> board ranks 1-40, ADP tracks board rank -> ~0 offset.
  for (let i = 0; i < 40; i++) {
    b.push({ position: 'RB', vorp: 200 - i, adjusted_adp: i + 1,
             proj_mean: 200 - i, proj_sleeper: 200 - i, proj_fantasypros: 200 - i });
  }
  // 40 TEs occupy board ranks 41-80. Typical TE: ADP is 93 ranks LATER than
  // his board rank (board likes TEs far more than market does — the real
  // live-board shape). One TE (index 5) breaks that pattern: his ADP is only
  // 5 ranks later than his board rank, a raw gap of -5 — negative, but a real
  // outlier relative to his own position's -93 median.
  for (let i = 0; i < 40; i++) {
    const boardRank = 40 + i + 1;
    const offset = (i === 5) ? 5 : 93;
    b.push({ position: 'TE', vorp: 100 - i, adjusted_adp: boardRank + offset,
             proj_mean: 100 - i, proj_sleeper: 100 - i, proj_fantasypros: 100 - i });
  }
  return b;
}
{
  const b = mkNegativeMedianBoard();
  const p = b.find(x => x.position === 'TE' && x.adjusted_adp === 46 + 5);
  p.proj_sleeper = 120; p.proj_fantasypros = 150; p.proj_mean = 120;
  const rawGap = sourceGapCaveatRaw(p, b);
  const out = sourceGapCaveat(p, b);
  ck('a negative raw gap that still clears the position-relative threshold does NOT '
    + 'print a self-contradictory "sits below market" sentence',
    rawGap < 0 && /SOURCE GAP/.test(out) && !/sits ~-?\d+ slots below market/.test(out),
    { raw_gap: rawGap, text: out });
  ck('...it names the position-relative distance instead ("ranks him ~N slots worse than a typical TE")',
    /ranks him ~\d+ slots worse than a typical TE/.test(out), out);
}

// ── THE BADGE — Cory, 08-18: "dont gatekeep things for after draft if
// nothing critical." The caveat above only ever reached the Why? dossier,
// one tap away; A ordered a compact row badge so it's visible at pick speed
// without a tap, same lesson as register 4e/4b. ─────────────────────────────
// escapeHtml is a free variable inside sourceGapBadge's body (app.js defines
// it once at module scope) — direct eval() inside lift() resolves it from
// THIS file's scope, so it has to exist here too, same shape as the real one.
const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sourceGapBadge = lift('sourceGapBadge');
{
  const b = mkBoard();
  const p = b[54];
  p.adjusted_adp = 20; p.proj_sleeper = 146; p.proj_fantasypros = 176; p.proj_mean = 146;
  const html = sourceGapBadge(p, b);
  ck('lean-market case renders a badge (not just the dossier sentence)',
    /wr-source-gap/.test(html), html);
  ck('  and it is the gold/plain variant, not the unexplained one',
    !/unexplained/.test(html), html);
  ck('  and the full sentence is readable without a tap — it rides the title attribute',
    /title="SOURCE GAP:/.test(html), html);
}
{
  const b = mkBoard();
  const p = b[54];
  p.adjusted_adp = 20; p.proj_sleeper = 146; p.proj_fantasypros = 130; p.proj_mean = 146;
  const html = sourceGapBadge(p, b);
  ck('UNEXPLAINED case renders the higher-doubt variant, visibly distinct',
    /wr-source-gap unexplained/.test(html), html);
  ck('  and the short label says so (not the same icon as the confident case)',
    /❓/.test(html) && !/📉/.test(html), html);
}
{
  const b = mkBoard();
  ck('CONTROL — a player with no gap renders no badge at all',
    sourceGapBadge(b[10], b) === '');
}
{
  ck('the rec-card render actually calls the badge (built and dropped is not shipped)',
    /sourceGapBadge\(p, state\.board\)/.test(SRC));
}
{
  // LIVE KNOWN-POSITIVE on the badge path specifically, mirroring the caveat's own.
  const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const board = DATA.players.filter(p => p.proj_mean != null);
  const hits = board.filter(p => sourceGapBadge(p, board) !== '');
  ck('KNOWN-POSITIVE — the badge itself fires on the live board, not just the string it wraps',
    hits.length >= 5, { fired_on: hits.length });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

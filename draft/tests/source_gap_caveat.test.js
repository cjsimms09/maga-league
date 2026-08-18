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
const sourceGapCaveat = lift('sourceGapCaveat');

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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// TERRITORY: A
/* CORY, 2026-08-21: "Survival percentages don't seem to make sense."
 *
 * He was right, and it was on the surface he opens: the PRE-DRAFT board showed
 * EVERY player the same survival percentage. Reproduced on the shipped board
 * before any fix — Jahmyr Gibbs (adp 1) and Chase Brown (adp 14.67) BOTH read
 * 67.4%, 14 of 14 identical.
 *
 * THE CAUSE was a fix applied in one of the two places that needed it. Before a
 * pick lands, `currentPick` is the pre-draft ANCHOR (his first selection) while
 * the board still holds everyone, because nobody has picked. The anchored
 * question — P(taken by 48 | still alive at 33) — is a far-tail query for an
 * ADP-1 player: F(33) and F(48) are both ~1, the conditional collapses, raw
 * survival is 0 for every elite, the conservation tilt gets identical weights,
 * and exp(−λ) hands them all ONE number. That is the 41% wall (Cory, 08-17) in
 * a different state.
 *
 * `preDraftPool` already knew this and used an UNCONDITIONAL context for the
 * candidate filter, saying so in its own comment. The filter had the fix; the
 * number on his screen did not.
 *
 * This pins the display side. A count is not enough — a board could show two
 * values and still be useless — so it also requires the numbers to ORDER with
 * ADP, which is the property that makes them readable at 8 seconds a pick.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public/js/draft/survival.js'));
require(path.join(ROOT, 'public/js/draft/composite.js'));
const E = require(path.join(ROOT, 'public/js/draft/engine.js'));
const board = require(path.join(ROOT, 'public/draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 240) : '')); }
};

const my = ((board.pick_order || {}).my_picks) || [];
const mkCtx = pre => ({
  board: board.players, currentPick: my[0], nextPick: my[1],
  totalPicks: ((board.pick_order || {}).picks || []).length || null,
  roster: [], currentKeepers: [], league: board.league,
  pickBoard: (board.pick_order || {}).picks || null, intervening: [],
  myPickIndex: 0, totalMyPicks: my.length, myPicksLeft: my.length,
  runMultipliers: {}, drift: null, preDraftPrep: pre,
});

ck('CONTROL: the board carries his real picks, so there is a horizon to measure',
  my.length >= 2, my.slice(0, 3));

/* The slice that matters: players around his first pick, where the question
 * "will he last to my next turn" is genuinely open. Elites reading 0% and deep
 * players reading 100% are CORRECT, so a spread measured over the whole board
 * would pass on those alone and miss the collapse this file exists to catch. */
const slice = board.players
  .filter(p => p.adjusted_adp != null && p.adjusted_adp >= my[0] - 5 && p.adjusted_adp <= my[1] + 15)
  .sort((a, b) => a.adjusted_adp - b.adjusted_adp);

ck('CONTROL: that slice is populated — an empty one would make every check below vacuous',
  slice.length >= 15, slice.length);

const vals = slice.map(p => (E.scorePlayer(p, mkCtx(true)) || {}).survival_to_next);
const distinct = new Set(vals.map(v => (v == null ? 'n' : v.toFixed(4))));
ck('the pre-draft board does NOT show one survival number for everyone — this is '
  + 'the exact defect Cory reported and it read 67.4% across the board',
distinct.size > 3, { distinct: distinct.size, of: vals.length });

/* Two values would satisfy a bare count while still being useless. The number
 * has to MEAN something: later ADP must survive at least as often. Compared on
 * the ends rather than pairwise, because adjacent players legitimately invert
 * on position-specific dispersion (a QB outlasts a WR at the same ADP). */
const firstQ = vals.slice(0, Math.floor(vals.length / 4)).filter(v => v != null);
const lastQ = vals.slice(-Math.floor(vals.length / 4)).filter(v => v != null);
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
ck('and it ORDERS with ADP — the last quarter of the slice survives more often '
  + 'than the first, which is what makes the column readable',
mean(lastQ) > mean(firstQ) + 0.05,
{ early: +mean(firstQ).toFixed(3), late: +mean(lastQ).toFixed(3) });

/* THE FAIL ARM, and it is NOT a distinct-count. On the elites the fixed column
 * is legitimately one number — 0.0000, fourteen times — because "he will not
 * last fifteen more picks" is the CORRECT answer for the consensus #1 overall.
 * A count arm would read those two columns as identical and pass on the bug;
 * mine did, which is how this arm came to be rewritten before it shipped.
 *
 * What separates them is the WALL VALUE. The anchored question parks the whole
 * top of the board at 0.674: it claims Jahmyr Gibbs is more likely than not to
 * still be there at pick 48. That absurdity is what Cory saw, so that is what
 * this arm names. If the wall ever stops appearing, the survival maths changed
 * underneath this file and its premise needs re-reading.
 */
const elite = board.players
  .filter(p => p.adjusted_adp != null && p.adjusted_adp <= my[0] - 5)
  .sort((a, b) => a.adjusted_adp - b.adjusted_adp);

ck('CONTROL: there are players far enough ahead of his first pick to be certain '
  + 'departures — without them the arm below is vacuous',
elite.length >= 10, elite.length);

const eAnchored = elite.map(p => (E.scorePlayer(p, mkCtx(false)) || {}).survival_to_next);
const eFixed = elite.map(p => (E.scorePlayer(p, mkCtx(true)) || {}).survival_to_next);
const worstAnchored = Math.min.apply(null, eAnchored.filter(v => v != null));
const worstFixed = Math.max.apply(null, eFixed.filter(v => v != null));

ck('FAIL ARM — the anchored (pre-fix) question still parks every certain '
  + 'departure above 50%, which is the nonsense Cory reported',
worstAnchored > 0.5,
{ lowestAnchoredElite: +worstAnchored.toFixed(4), n: elite.length });

ck('and the fix answers it: the same players read near zero, because they will '
  + 'not be there',
worstFixed < 0.05,
{ highestFixedElite: +worstFixed.toFixed(4), n: elite.length });

/* The fix is GATED on preDraftPrep, so it must not leak into a live draft. Once
 * a pick is recorded app.js sets preDraftPrep false and the conditional question
 * is the right one — proven here by the two columns disagreeing, not asserted. */
const leaked = elite.filter((p, i) => eAnchored[i] === eFixed[i]).length;
ck('a LIVE draft is untouched: with preDraftPrep false the display still returns '
  + 'the conditional number, so the branch is real rather than dead code',
leaked === 0, { identicalRows: leaked, of: elite.length });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

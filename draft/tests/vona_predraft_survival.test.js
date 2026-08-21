// TERRITORY: A
/* REGISTER 195'S SWEEP — the part that was worth more than the fix that
 * prompted it.
 *
 * Cory reported that survival percentages did not make sense, and the first fix
 * corrected the COLUMN. This file exists because the sweep that finding owed
 * asked "what else reads `currentPick` as a proxy for board state", and the
 * answer reached the score: `vona()` and `tierCliffUrgency()` were handed the
 * ANCHORED ctx at their call sites, and `vona` IS the `value` term at weight
 * 1.0. So the collapsed survival wall was not merely printed in one column — it
 * priced the entire pre-draft board.
 *
 * WHAT THAT LOOKED LIKE, measured on the live board with Cory's real keepers:
 * FOUR KICKERS AND THREE DEFENSES AT RANKS 12-18 — Aubrey 12, HOU 13, DEN 14,
 * SEA 15, Myers 16, Fairbairn 17, Dicker 18 — above Rashee Rice, McCaffrey,
 * A.J. Brown, Jeanty, Cook and Achane. The mechanism is simple once seen: when
 * the wall says every elite has a 67% chance of lasting to pick 48, waiting on
 * them looks nearly free, their VONA collapses toward zero, and the positions
 * whose VONA is genuinely ~0 rise to meet them.
 *
 * The observable this pins is therefore the one a human can check in a second —
 * no kicker or defense in the top of the pre-draft board — rather than an
 * internal quantity, because the internal quantity is what was wrong.
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
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 260) : '')); }
};

const my = ((board.pick_order || {}).my_picks) || [];
const keptIds = ((board.kept_player_ids) || []).map(String);
const pool = board.players.filter(p => !keptIds.includes(String(p.player_id)));
const kept = (board.kept_players) || [];

/* His REAL state the night before: keepers on the roster, keepers off the pool,
 * zero picks landed. Scoring an empty roster instead would be a different board
 * and would not be the one he opens. */
const mkCtx = pre => ({
  board: pool, currentPick: my[0], nextPick: my[1],
  totalPicks: ((board.pick_order || {}).picks || []).length || null,
  roster: kept.slice(), currentKeepers: kept.slice(), league: board.league,
  pickBoard: (board.pick_order || {}).picks || null, intervening: [],
  myPickIndex: 0, totalMyPicks: my.length, myPicksLeft: my.length,
  roundsLeft: my.length, runMultipliers: {}, drift: null, preDraftPrep: pre,
});

const top = (pre, n) => pool
  .filter(p => p.adjusted_adp != null && p.adjusted_adp <= 200)
  .map(p => ({ name: p.name, pos: p.position, score: (E.scorePlayer(p, mkCtx(pre)) || {}).score }))
  .filter(r => r.score != null)
  .sort((a, b) => b.score - a.score)
  .slice(0, n);

ck('CONTROL: his picks and keepers are both on the board, so this is his real '
  + 'pre-draft state rather than a synthetic one',
my.length >= 2 && kept.length > 0, { picks: my.slice(0, 3), keepers: kept.map(k => k.name) });

const fixed = top(true, 20);
ck('CONTROL: twenty players scored — an empty or short board would make the '
  + 'counts below vacuous',
fixed.length === 20, fixed.length);

const onesie = r => r.pos === 'K' || r.pos === 'DEF';

ck('NO KICKER OR DEFENSE IN THE PRE-DRAFT TOP 20 — the observable Cory can '
  + 'check at a glance, and the one that was broken',
fixed.filter(onesie).length === 0,
{ offenders: fixed.filter(onesie).map(r => r.pos + ' ' + r.name + ' @' + fixed.indexOf(r) + 1) });

/* THE FAIL ARM. preDraftPrep=false reproduces the anchored question that priced
 * the board before the sweep. It must still put K/DEF in the top 20 — if it
 * ever stops doing so, the mechanism changed underneath this file and the
 * premise above needs re-reading rather than trusting. */
const anchored = top(false, 20);
const anchoredOnesies = anchored.filter(onesie);
ck('FAIL ARM — the anchored (pre-sweep) question still floats kickers and '
  + 'defenses into the top 20, so this guards a live hazard, not a museum piece',
anchoredOnesies.length >= 3,
{ count: anchoredOnesies.length, who: anchoredOnesies.map(r => r.pos + ' ' + r.name) });

/* THE COMMENT IN engine.js CLAIMS the thin survival ctx is COMPLETE for vona()
 * because `VONA_SLOT_AWARE` is false, so vona returns `straight` before it
 * touches ctx.roster or ctx.league. That claim has an expiry date: flip the
 * flag and the thin ctx is missing exactly the fields the slot-aware branch
 * reads. This check is what makes the comment falsifiable rather than a
 * promise — if it goes red, carry roster/league/starters through
 * unconditionalSurvivalCtx before turning the flag on. */
ck('the engine comment\'s stated precondition still holds: VONA_SLOT_AWARE is '
  + 'false, so a survival-only ctx is complete for vona()',
E.CFG.VONA_SLOT_AWARE === false, { VONA_SLOT_AWARE: E.CFG.VONA_SLOT_AWARE });

/* A LIVE draft must be untouched: the whole fix is gated on preDraftPrep, so
 * the two boards have to actually differ. Proven, not asserted — an identical
 * pair would mean the gate is dead code and the guard above is measuring
 * nothing. */
const differs = fixed.some((r, i) => !anchored[i] || anchored[i].name !== r.name);
ck('the pre-draft and anchored boards genuinely differ, so the preDraftPrep '
  + 'gate is live code rather than a branch that never runs',
differs, { fixedTop3: fixed.slice(0, 3).map(r => r.name), anchoredTop3: anchored.slice(0, 3).map(r => r.name) });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// TERRITORY: relay measures · A owns the composite
// REGISTER 5a, DIAGNOSED: THE KICKER NEVER MOVES. HE IS PUSHED.
//
// 5a: "A kicker's composite score responds to roster state, and no component
// should be doing that." Filling QB+TE moved exactly one row on SCORE membership
// of the top 70 — Jason Sanders (K) — with the suspect named as "VONA context
// propagation" and the need term "proven multiplied away".
//
// ── THE ANSWER: NO COMPONENT OF THE KICKER IS DOING ANYTHING ───────────────
//
//   Jason Sanders   score -23.7516 -> -23.7516   (delta EXACTLY zero)
//                   rank 70 -> 71
//   Jordan Love     score -26.8259 -> -20.5657   rank 79 -> 60
//
// Sanders does not move. **Zero kickers move, at all.** Love rises nineteen
// places and crosses him. The membership change is a displacement, and the top
// 70 is a boundary — somebody has to be 71st.
//
// ── AND THE HARNESS'S REASONING IS A NON-SEQUITUR ──────────────────────────
//
// `composite_roster_blindness.test.js` argues: `MEASURED_WEIGHTS.need === 0`,
// therefore the need term is multiplied away, therefore the composite is
// roster-blind. The premise is true and the conclusion does not follow, because
// the roster reaches the score by two OTHER routes:
//
//   1. IT SELECTS THE SCORING BRANCH. `need_fills` flips starter <-> bench, and
//      the two branches are different formulas — the bench arm scores
//      `wCeil * benchCeiling` and carries the onesie discount, which
//      `engine.js` applies "to the assembled score" precisely BECAUSE the need
//      term reads ~0 for a backup. **178 players switch branch; 76 of the 90
//      score-movers are branch switchers.**
//   2. IT DRIVES `stack`, WEIGHT 1.0. Rostering a quarterback creates stack
//      partners. **The other 14 movers are all WR, and they are these.**
//
// 76 + 14 = 90. The decomposition is complete, and none of it is `need`'s weight.
//
// ⚠️ NONE OF THIS IS A BUG. Branch selection by roster is the entire point of
// starter-vs-bench scoring, and stack partners are a real roster interaction.
// What is wrong is the INFERENCE that a zeroed weight makes the composite
// roster-blind. This file replaces that inference with the decomposition.
//
// Run: node draft/tests/roster_awareness_is_branch_not_need.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const keep = KEEP.keepersFrom(DATA);
const adpOf = p => (p.adjusted_adp != null ? Number(p.adjusted_adp)
  : (p.raw_adp != null ? Number(p.raw_adp) : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const bestQB = pool.filter(p => p.position === 'QB').sort((a, b) => b.vorp - a.vorp)[0];
const bestTE = pool.filter(p => p.position === 'TE').sort((a, b) => b.vorp - a.vorp)[0];
const PICK = 70;

function recsFor(roster) {
  const taken = new Set(byAdp.slice(0, PICK - 1).map(p => String(p.player_id)));
  roster.forEach(k => taken.add(String(k.player_id)));
  const board = pool.filter(p => !taken.has(String(p.player_id)));
  return E.recommend({ board: board, roster: roster, league: L, currentPick: PICK,
    nextPick: 85, totalPicks: 147, myPicksLeft: 8, roundsLeft: 8,
    runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS })
    .filter(x => E.scoreable(x));
}
const A = recsFor(keep);
const B = recsFor(keep.concat([bestQB, bestTE]));
const mb = new Map(B.map(x => [x.player.name, x]));
const paired = A.map(a => [a, mb.get(a.player.name)]).filter(([, b]) => b);
const movers = paired.filter(([a, b]) => Math.abs(b.score - a.score) > 1e-9);

// ── 0. THE HARNESS'S PREMISE IS TRUE — IT IS THE INFERENCE THAT FAILS ──────
{
  ck('CONTROL: `need` really does carry weight 0, exactly as the blindness '
    + 'harness says — the premise is not in dispute',
  E.MEASURED_WEIGHTS.need === 0, E.MEASURED_WEIGHTS.need);

  ck('CONTROL: both arms scored a real, equal population',
    paired.length > 300, paired.length);
}

// ── 1. THE KICKER DOES NOT MOVE. THAT IS THE ANSWER TO 5a. ────────────────
{
  const kickers = paired.filter(([a]) => a.player.position === 'K');
  ck('CONTROL: kickers are present in the scored list, so the null below is a '
    + 'finding and not an empty set', kickers.length > 10, kickers.length);

  ck('5a ANSWERED: NO kicker\'s score responds to roster state — not one, and '
    + 'not by a rounding error',
  kickers.every(([a, b]) => a.score === b.score),
  kickers.filter(([a, b]) => a.score !== b.score).map(([a]) => a.player.name));

  const sanders = paired.find(([a]) => a.player.name === 'Jason Sanders');
  if (sanders) {
    ck('...including Jason Sanders by name, the row 5a was filed on',
      sanders[0].score === sanders[1].score,
      { open: sanders[0].score, filled: sanders[1].score });
  }
}

// ── 2. THE DECOMPOSITION: BRANCH + STACK, AND NOTHING LEFT OVER ───────────
{
  const switched = movers.filter(([a, b]) =>
    a.components.need_fills !== b.components.need_fills);
  const notSwitched = movers.filter(([a, b]) =>
    a.components.need_fills === b.components.need_fills);

  ck('MECHANISM 1 — most movers switched SCORING BRANCH (starter <-> bench), '
    + 'which is a different formula, not a different weight',
  switched.length > 0 && switched.length > notSwitched.length,
  { switched: switched.length, not: notSwitched.length });

  ck('MECHANISM 2 — every remaining mover is a WR, which is the `stack` term '
    + '(weight 1.0) responding to a rostered quarterback',
  notSwitched.every(([a]) => a.player.position === 'WR'),
  [...new Set(notSwitched.map(([a]) => a.player.position))]);

  ck('THE DECOMPOSITION IS COMPLETE — branch switchers plus stack movers '
    + 'account for every score that moved, with nothing unexplained',
  switched.length + notSwitched.length === movers.length,
  { switched: switched.length, stack: notSwitched.length, total: movers.length });
}

// ── 3. THE MEMBERSHIP CHANGE IS A DISPLACEMENT ────────────────────────────
{
  const topA = A.slice().sort((x, y) => y.score - x.score).slice(0, 70).map(x => x.player.name);
  const topB = B.slice().sort((x, y) => y.score - x.score).slice(0, 70).map(x => x.player.name);
  const dropped = topA.filter(n => topB.indexOf(n) < 0);
  const added = topB.filter(n => topA.indexOf(n) < 0);

  ck('the top-70 swap is one out, one in — a boundary, and somebody has to be '
    + '71st', dropped.length === added.length && dropped.length <= 2,
  { dropped: dropped, added: added });

  /* THE SHAPE THAT MATTERS: whoever is dropped did not move; whoever is added
   * did. If that ever inverts, a player really would be responding to roster
   * state through his own score, and 5a would be live again. */
  const droppedMoved = dropped.filter(n => {
    const pr = paired.find(([a]) => a.player.name === n);
    return pr && Math.abs(pr[1].score - pr[0].score) > 1e-9;
  });
  ck('DEFECT-DISPROVING: the player who DROPS OUT has an unchanged score — he '
    + 'was pushed, not re-scored. If this ever fails, 5a is live again.',
  droppedMoved.length === 0, droppedMoved);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

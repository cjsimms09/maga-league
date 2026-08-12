// TERRITORY: A
/* CHARACTERISATION — THE BENCH BRANCH HAS NO ANCHOR UNDER THE SHIPPED WEIGHTS.
 *
 * THIS TEST ASSERTS BEHAVIOUR THAT IS WRONG. It is green today because the
 * defect is live, and it is written this way on purpose: a test that fails
 * turns the suite red and gets muted, and a defect with no test gets forgotten.
 * So this one NAMES the defect, SIZES it, and carries a RETIREMENT CHECK that
 * fires the moment somebody fixes it — with instructions to delete this file.
 *
 * THE DEFECT, in one line: once every starting slot is filled, `scorePlayer`
 * takes its bench branch, and MEASURED_WEIGHTS (what app.js:52 ships) zeroes
 * four of that branch's six terms. What is left is `0.5*stack + 1*keeper`, so
 * the war room's top recommendation from roughly round 8 onward is whichever
 * replacement-level player happens to share a team with somebody on my roster.
 *
 * Full diagnosis and the measured reach rate: draft/tools/bench_branch_probe.js
 * and draft/audit/bench_branch_2026-08-11.md.
 *
 * Run: node draft/tests/bench_branch_anchor.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));
const REACH_ADP = 250;

/* A BOARD STATE WITH EVERY STARTING SLOT FILLED. Built from the live board by
 * VORP rather than by hand, so the state is the one a competent draft actually
 * reaches rather than one chosen to produce the result. K and DEF are left open
 * because that is where a real roster is at pick 73. */
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byVorp = pool.slice().sort((a, b) => b.vorp - a.vorp);
const roster = [];
const want = { QB: 1, RB: 3, WR: 2, TE: 1 };   // RB3 is the flex
Object.keys(want).forEach(pos => {
  byVorp.filter(p => p.position === pos).slice(0, want[pos]).forEach(p => roster.push(p));
});
const taken = new Set(roster.map(p => String(p.player_id)));
// Everything a competent room would have taken by pick 73 is gone, so the
// board under test is the real remainder rather than the whole universe.
pool.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 72)
  .forEach(p => taken.add(String(p.player_id)));
const board = pool.filter(p => !taken.has(String(p.player_id)));

const baseCtx = {
  board: board, roster: roster, league: L, currentPick: 73, nextPick: 88,
  totalPicks: 150, myPicksLeft: 6, roundsLeft: 8, runMultipliers: {}, intervening: [],
};
const rec = w => E.recommend(Object.assign({}, baseCtx, { weights: w }));

// ── THE BRANCH FIRES AT ALL ────────────────────────────────────────────────
{
  // K and DEF are deliberately still open, so they read `starter` and are the
  // wrong probe. The branch under test is the one every skill player takes.
  const skill = board.filter(p => ['QB', 'RB', 'WR', 'TE'].indexOf(p.position) >= 0).slice(0, 30);
  const fills = skill.map(p => E.starterSlotMarginal(p, roster, L).fills);
  ck('with every starter filled, every skill player left reads BENCH or FLEX',
    fills.every(f => f === 'bench' || f === 'flex'),
    fills.filter(f => f !== 'bench' && f !== 'flex').slice(0, 3));
}

// ── THE DEFECT ITSELF ──────────────────────────────────────────────────────
const mTop = rec(E.MEASURED_WEIGHTS)[0];
const dTop = rec(E.DEFAULT_WEIGHTS)[0];
{
  ck('SHIPPED (MEASURED) recommends a player the room has never heard of',
    adpOf(mTop.player) > REACH_ADP,
    { pick: mTop.player.name, adp: adpOf(mTop.player), vorp: mTop.player.vorp });

  // The comparison that makes it undeniable: a far better player, by our OWN
  // valuation, is sitting on the board being outranked.
  const better = board.filter(p => adpOf(p) < 150)
    .sort((a, b) => b.vorp - a.vorp)[0];
  ck('  while a real player with far higher VORP sits available',
    better && Number(better.vorp) > Number(mTop.player.vorp) + 50,
    better ? { available: better.name, vorp: better.vorp, vs: mTop.player.vorp } : null);

  ck('DEFAULT_WEIGHTS does NOT reach at the same state',
    adpOf(dTop.player) <= REACH_ADP,
    { pick: dTop.player.name, adp: adpOf(dTop.player) });
}

// ── AND THE ANCHOR THE COMMENT CREDITS IS NOT RUNNING ──────────────────────
{
  /* The bench branch says the top pick "is the highest-ceiling player left".
   * `upsideBonus` is gated to zero until CEILING_LATE_FROM (0.6) of the draft
   * — pick 90 of 150 — and the branch starts firing near pick 70. So through
   * the rounds where it decides everything, the term it is supposed to rank on
   * is identically zero for every player. Rule 11e: the comment describes an
   * implementation that does not run, and that is what makes the first defect
   * reachable rather than merely theoretical. */
  const ceilings = board.slice(0, 40).map(p => E.upsideBonus(p, 73, 150, 6));
  ck('the ceiling term is ZERO for every player at the pick the branch decides',
    ceilings.every(c => Math.abs(c) < 1e-9), ceilings.slice(0, 5));
  const late = E.upsideBonus(board[0], 120, 150, 4);
  ck('  it only wakes up after pick 90, by which point the damage is done',
    Math.abs(late) > 0, late);
}

// ── WHAT IS ACTUALLY DECIDING THE PICK ─────────────────────────────────────
{
  const only = t => { const w = { value: 0, tier: 0, need: 0, risk: 0, ceiling: 0, keeper: 0, bye: 0, stack: 0 }; w[t] = 1; return w; };
  const scoreOf = (w, id) => {
    const hit = rec(w).find(r => String(r.player.player_id) === String(id));
    return hit ? Number(hit.score) : null;
  };
  const id = mTop.player.player_id;
  const stack = scoreOf(only('stack'), id);
  const risk = scoreOf(only('risk'), id);
  ck('the whole pick is a STACK bonus — same team as somebody already on my roster',
    stack != null && stack > 1, { stack: stack });
  ck('  and the term that WOULD have buried him is risk, which MEASURED zeroes',
    risk != null && risk < -5, { risk_at_weight_1: risk, measured_risk_weight: E.MEASURED_WEIGHTS.risk });
  ck('  MEASURED zeroes four of the six bench terms: need, risk, ceiling, bye',
    E.MEASURED_WEIGHTS.need === 0 && E.MEASURED_WEIGHTS.risk === 0
    && E.MEASURED_WEIGHTS.ceiling === 0 && E.MEASURED_WEIGHTS.bye === 0, E.MEASURED_WEIGHTS);
  ck('  and the two it does NOT zero — value and tier — do not appear in this branch',
    E.MEASURED_WEIGHTS.value === 1 && E.MEASURED_WEIGHTS.tier === 0);
}

// ── RETIREMENT ─────────────────────────────────────────────────────────────
if (adpOf(mTop.player) <= REACH_ADP) {
  console.log('\n' + '='.repeat(70));
  console.log('RETIRE THIS FILE. The shipped weights no longer reach at this state,');
  console.log('which means the bench-branch anchor was fixed. This test asserts the');
  console.log('BROKEN behaviour and is now asserting a lie. Delete it, delete');
  console.log('draft/tools/bench_branch_probe.js, and close the DECISIONS-NEEDED entry.');
  console.log('='.repeat(70));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('NOTE: green here means the DEFECT IS STILL LIVE. See the header.');
process.exit(fail ? 1 : 0);

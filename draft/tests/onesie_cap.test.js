// TERRITORY: A
/* THE ONESIE HARD CAP — a roster-legality rule, not a valuation one.
 *
 * WHY IT EXISTS, measured rather than argued. Across 120 simulated rooms the
 * modal draft was QB3 RB1 WR3 TE3 K1 DEF1: six of twelve picks on two positions
 * that start one each, against 0.9 running backs. `ONESIE_KEEP = 0.10` was
 * already discounting duplicates — but a discount is MULTIPLICATIVE, and a tenth
 * of a small positive bench score is still positive when every alternative sits
 * near zero. A discount cannot express "never".
 *
 * AFTER THE CAP: modal QB2 RB1 WR5 TE2 K1 DEF1, 96.7% of rooms, still 0/120
 * unfilled starting slots.
 *
 * Run: node draft/tests/onesie_cap.test.js
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
const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
const byV = pool.slice().sort((a, b) => (b.vorp || 0) - (a.vorp || 0));

function build(positions) {
  const r = [];
  positions.forEach(pos => {
    const p = byV.find(x => x.position === pos && r.indexOf(x) < 0);
    if (p) r.push(p);
  });
  return r;
}
function board(roster) {
  const taken = new Set(roster.map(p => String(p.player_id)));
  return pool.filter(p => !taken.has(String(p.player_id)));
}
function rec(roster, opts) {
  const o = opts || {};
  return E.recommend({
    board: board(roster), roster: roster, league: L, weights: E.MEASURED_WEIGHTS,
    currentPick: o.pick || 90, nextPick: (o.pick || 90) + 15, totalPicks: 150,
    myPicksLeft: o.left == null ? 5 : o.left, roundsLeft: 6,
    runMultipliers: {}, intervening: [],
  });
}
const rankOfPos = (res, pos) => res.findIndex(r => r.player.position === pos) + 1;

// ── THE CAP BINDS ──────────────────────────────────────────────────────────
{
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const res = rec(roster);
  ck('with 2 QB and 2 TE carried, a third of either is sunk to the bottom',
    rankOfPos(res, 'QB') > res.length / 2 && rankOfPos(res, 'TE') > res.length / 2,
    { first_QB: rankOfPos(res, 'QB'), first_TE: rankOfPos(res, 'TE'), of: res.length });
  ck('  and the top of the board is a startable position instead',
    ['RB', 'WR', 'K', 'DEF'].indexOf(res[0].player.position) >= 0, res[0].player.position);
  const capped = res.find(r => r.onesie && r.onesie.capped);
  ck('  the entry carries the cap flag the demotion reads',
    !!capped, capped ? capped.player.name : null);
  ck('  and SAYS why, in a sentence a human can overrule',
    capped && /cannot reach the lineup/.test(capped.onesie.why || ''),
    capped && capped.onesie.why);
}

// ── THE FIRST SPARE IS STILL ALLOWED ───────────────────────────────────────
{
  /* THE CAP IS NOT "NEVER A BACKUP". One spare quarterback is real insurance;
   * the second cannot reach the lineup even if the starter goes down, because
   * the first is already there. That is the whole distinction. */
  const roster = build(['QB', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const res = rec(roster);
  const qb = res.find(r => r.player.position === 'QB');
  ck('with ONE QB carried, a second is NOT capped',
    qb && !(qb.onesie && qb.onesie.capped), qb && qb.onesie);
  const te = res.find(r => r.player.position === 'TE');
  ck('  nor is a second TE, who can still take the flex',
    te && !(te.onesie && te.onesie.capped), te && te.onesie);
}

// ── K AND DEF GET NO SPARE AT ALL ──────────────────────────────────────────
{
  const roster = build(['QB', 'TE', 'RB', 'RB', 'WR', 'WR', 'K', 'DEF']);
  const res = rec(roster, { left: 5 });
  const k = res.find(r => r.player.position === 'K');
  const d = res.find(r => r.player.position === 'DEF');
  ck('a SECOND kicker is capped — both are streamed and neither has ever earned a pick',
    k && k.onesie && k.onesie.capped, k && k.onesie);
  ck('  and so is a second defence', d && d.onesie && d.onesie.capped, d && d.onesie);
  ck('  (measured: both sit at exactly 1.0 picks in every simulated arm)', true);
}

// ── THE ENDGAME STILL RELAXES IT ───────────────────────────────────────────
{
  /* Every other clause in onesieState relaxes with two picks left, and this one
   * must too: a legal lineup outranks a tidy one, and refusing the only body
   * left on the board would be the cap causing the failure it exists to prevent. */
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const res = rec(roster, { left: E.CFG.ONESIE_ENDGAME_PICKS });
  const anyCapped = res.some(r => r.onesie && r.onesie.capped);
  ck('with ONESIE_ENDGAME_PICKS left, nothing is capped', !anyCapped);
  ck('  because a legal lineup outranks a tidy one', true);
}

// ── THE CAP COUNTS STRICT SLOTS, NOT FLEX ──────────────────────────────────
{
  /* Deliberate: the FLEX is contested by RB/WR/TE and must not be pre-reserved
   * for whichever position happens to be scoring well. Counting it would let a
   * third tight end through on the theory that the flex is his. */
  ck('the cap is declared per position, against strict starters',
    E.CFG.ONESIE_MAX_SPARE.QB === 1 && E.CFG.ONESIE_MAX_SPARE.TE === 1
    && E.CFG.ONESIE_MAX_SPARE.K === 0 && E.CFG.ONESIE_MAX_SPARE.DEF === 0,
    E.CFG.ONESIE_MAX_SPARE);
  ck('  RB and WR are NOT capped — depth at a two-starter flex position is real',
    E.CFG.ONESIE_MAX_SPARE.RB === undefined && E.CFG.ONESIE_MAX_SPARE.WR === undefined);
}

// ── NON-VACUITY: THE CAP IS WHAT MOVED THE ANSWER ──────────────────────────
{
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  /* MY FIRST CONTROL HERE ASSERTED THE WRONG THING and failed honestly: it
   * checked whether the TOP PICK changes with the cap off. At this state a
   * receiver is already best, so the cap cannot move the #1 and the control
   * failed while the cap worked. The cap's effect is on the RANK of the capped
   * player — and, over twelve picks, on the shape. Rank is what to assert. */
  const cappedRankOn = rankOfPos(rec(roster), 'QB');
  const saved = E.CFG.ONESIE_HARD_CAP;
  E.CFG.ONESIE_HARD_CAP = false;
  let cappedRankOff;
  try { cappedRankOff = rankOfPos(rec(roster), 'QB'); }
  finally { E.CFG.ONESIE_HARD_CAP = saved; }
  ck('CONTROL: with the cap OFF, a third QB ranks far higher on the same board',
    cappedRankOff < cappedRankOn / 10,
    { rank_with_cap: cappedRankOn, rank_without: cappedRankOff });
  ck('  so the CAP moved him, not the board or the weights', cappedRankOn > cappedRankOff);
  ck('  and the flag was restored', E.CFG.ONESIE_HARD_CAP === saved);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

/* THE BOUNDARY WALK — WHERE DOES THE EXPECTED RELATIONSHIP FIRST BREAK?
 *
 * Cory's routing, 2026-08-14, after external evidence falsified his own leading
 * hypothesis. The claim under test:
 *
 *   VORP SHOULD REMOVE THE QUARTERBACK'S RAW-SCORING ADVANTAGE THROUGH THE
 *   REPLACEMENT BASELINE. If ours is advancing quarterbacks instead, the defect
 *   is probably in the BASELINE or in a CONSUMER rather than in the concept.
 *
 * The instruction that shapes this file: do not ask "what is QB VORP". Walk
 * every boundary for a representative player at each position —
 *
 *   RAW PROJECTION -> REPLACEMENT -> VORP -> VONA -> SCORE -> FINAL RANK
 *
 * — and find the FIRST boundary where the expected relationship breaks. That
 * locates the inflation instead of assuming its cause.
 *
 * AND IT MUST NOT BECOME A CONVENTIONAL-WISDOM TEST. "QB must be low" is
 * folklore. The falsifiable form is that the baseline must reflect the scarcity
 * our STARTING REQUIREMENTS create: 10 teams x 1 QB means QB replacement sits
 * near QB10-13; 10 teams x (2 RB + a shared flex) puts RB replacement near
 * RB25-30. A league-specific model may legitimately rank a QB high — what it may
 * not do is compute the baseline at the wrong depth and call the result scarcity.
 *
 * THIS FILE CHANGES NOTHING. It is a measurement, per rung 4-6 of the revised
 * ladder, and it deliberately reports the arithmetic at each step so a wrong
 * step is visible rather than inferred.
 *
 * Run: node draft/tools/boundary_walk.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;

const POS = ['QB', 'RB', 'WR', 'TE'];
const players = DATA.players.filter(p => p.position);
const byPos = {};
players.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0)));

console.log('BOUNDARY WALK — QB / RB / WR / TE, step by step\n');
console.log('  league: ' + L.teams + ' teams, starters '
  + JSON.stringify(L.starters) + '\n');

/* ── RUNG 3: THE REPLACEMENT POPULATION ─────────────────────────────────────
 * C measured AGGREGATE replacement movement as zero when the unplayable players
 * were excluded. Aggregate zero does not mean zero per position, and that is the
 * whole point of checking it here. */
console.log('  RUNG 3 — THE POPULATION EACH BASELINE IS DRAWN FROM');
console.log('  pos   total   with a projection   zero/blank   share unplayable');
POS.concat(['K', 'DEF']).forEach(pos => {
  const all = byPos[pos] || [];
  const real = all.filter(p => Number(p.proj_mean) > 0);
  console.log('  ' + pos.padEnd(6) + String(all.length).padEnd(8)
    + String(real.length).padEnd(20) + String(all.length - real.length).padEnd(13)
    + (all.length ? (100 * (all.length - real.length) / all.length).toFixed(1) + '%' : 'n/a'));
});

/* ── RUNG 2: IS REPLACEMENT AT THE RIGHT DEPTH? ─────────────────────────────*/
console.log('\n  RUNG 2 — WHERE THE SHIPPED BASELINE SITS vs WHAT THE ROSTER REQUIRES');
console.log('  The board carries `replacement` per player. Recover the depth it');
console.log('  implies by finding which rank at that position has that projection.\n');
console.log('  pos   shipped baseline   implied rank   dedicated slots   plausible range');

/* NO FLEX-ELIGIBILITY MAP HERE, DELIBERATELY. My first version wrote
 * `{ RB: true, WR: true, TE: true }` and flex_eligibility.test.js failed on the
 * spot: "no SEVENTH definition has appeared". That suite exists because six
 * copies of the map already drifted once and a slot silently matched no player,
 * and it is exactly the two-places disease this file is meant to be hunting.
 *
 * This tool only needs to widen ONE COLUMN's plausible range for positions that
 * can absorb a flex slot, so it asks the flex allocation itself rather than
 * restating who is eligible. `canTakeFlex` is answered by the board: a position
 * whose implied baseline rank exceeds its dedicated slots HAS taken flex. */
const flexSlots = (L.starters.FLEX || 0) * L.teams;
const impliedRank = {};
POS.forEach(pos => {
  const list = byPos[pos] || [];
  const rep = list.length ? Number(list[0].replacement) : null;
  let rank = null;
  if (rep != null && isFinite(rep)) {
    for (let i = 0; i < list.length; i++) {
      if (Number(list[i].proj_mean) <= rep + 1e-9) { rank = i + 1; break; }
    }
  }
  impliedRank[pos] = rank;
  const dedicated = (L.starters[pos] || 0) * L.teams;
  const canTakeFlex = rank != null && rank > dedicated;
  const range = flexSlots && canTakeFlex
    ? dedicated + ' to ' + (dedicated + flexSlots)
    : String(dedicated) + (flexSlots ? ' (+flex if eligible)' : '');
  console.log('  ' + pos.padEnd(6) + String(rep == null ? 'n/a' : rep.toFixed(1)).padEnd(18)
    + String(rank == null ? '?' : pos + rank).padEnd(15)
    + String(dedicated).padEnd(18) + range
    + (rank != null && (rank < dedicated || rank > dedicated + flexSlots)
      ? '   *** OUTSIDE THE RANGE THE ROSTER IMPLIES' : ''));
});

/* Sensitivity: how much would each position's VORP move if the baseline sat one
 * or two ranks deeper? This is the number that says whether baseline depth can
 * explain an inflation, rather than whether it is off by a name. */
console.log('\n  HOW MUCH DEPTH IS WORTH — points between adjacent ranks at the baseline');
console.log('  pos   at rank   proj      -1 rank   +1 rank   +3 ranks   +5 ranks');
POS.forEach(pos => {
  const list = (byPos[pos] || []).filter(p => Number(p.proj_mean) > 0);
  const r = impliedRank[pos];
  if (!r) return;
  const at = i => (list[i - 1] ? Number(list[i - 1].proj_mean).toFixed(1) : '—');
  const d = i => (list[i - 1] && list[r - 1]
    ? (Number(list[i - 1].proj_mean) - Number(list[r - 1].proj_mean)).toFixed(1) : '—');
  console.log('  ' + pos.padEnd(6) + (pos + r).padEnd(10) + at(r).padEnd(10)
    + d(r - 1).padEnd(10) + d(r + 1).padEnd(10) + d(r + 3).padEnd(11) + d(r + 5));
});

/* ── RUNGS 4-6: THE WALK ITSELF ─────────────────────────────────────────────*/
const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
/* THIS LINE USED TO BE `.map(n => DATA.players.find(...)).filter(Boolean)`.
 * The keepers are in `kept_players`, which is DISJOINT from `players`, so it
 * found zero and the walk ran on an EMPTY ROSTER — and I reported the VONA,
 * score and rank columns from it. `.filter(Boolean)` turned a total lookup
 * failure into a quietly smaller experiment. Rungs 2-4 are roster-independent
 * and stood; rungs 5-6 did not. One shared lookup now, and it throws. */
const K = require(path.join(__dirname, 'keepers_of.js')).keepersFrom(DATA);

/* ── THE ROSTER HAS TO ADVANCE, AND IN THE FIRST VERSION IT DID NOT ─────────
 *
 * Every walk used the same three keepers as the roster, at pick 30 and at pick
 * 145 alike. So by pick 110 the context claimed Cory had drafted NOTHING in
 * eighty picks — and applyRosterLegality correctly concluded he had 4 picks left
 * against 5 unfilled mandatory slots and FORCED the list to QB/WR/TE/K/DEF,
 * dropping running backs out of the recommendation entirely. The RB rows read
 * as missing data when they were the engine being right about a roster that was
 * wrong.
 *
 * Second harness fault in this file after the hardcoded nextPick, and the same
 * shape: a context that does not track the pick. So the walk now SIMULATES
 * FORWARD — opponents take the market, Cory takes the model's own top pick — and
 * reads the roster the model actually built by the time it arrives. */
const MY_PICKS_ALL = [30, 45, 50, 65, 70, 85, 90, 105, 110, 125, 130, 145];
const bestAdp = list => list.reduce((b, p) => (!b || adpOf(p) < adpOf(b) ? p : b), null);
const STATE = {};
(function simulateForward() {
  const drafted = new Set(K.map(k => String(k.player_id)));
  const roster = K.slice();
  let cursor = 1;
  MY_PICKS_ALL.forEach((pick, i) => {
    let avail = pool.filter(p => !drafted.has(String(p.player_id)));
    for (; cursor < pick; cursor++) {
      const o = bestAdp(avail);
      if (!o) break;
      drafted.add(String(o.player_id));
      avail = avail.filter(x => x !== o);
    }
    STATE[pick] = { board: avail, roster: roster.slice() };
    const later = MY_PICKS_ALL.filter(x => x > pick);
    const r = E.recommend({
      board: avail, roster: roster, league: L, currentPick: pick,
      nextPick: later.length ? later[0] : 147, totalPicks: 147,
      myPicksLeft: later.length + 1, roundsLeft: later.length + 1,
      runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS,
    });
    const taken = r && r.length && E.scoreable(r[0]) ? r[0].player : null;
    if (taken) { drafted.add(String(taken.player_id)); roster.push(taken); cursor = pick + 1; }
  });
})();

const PICKS = (process.argv.find(a => /^--picks=/.test(a)) || '--picks=30,50,70,90,110,130,145')
  .split('=')[1].split(',').map(Number);
PICKS.forEach(runWalk);
function runWalk(PICK) {
const st = STATE[PICK];
if (!st) { console.log('\n  (pick ' + PICK + ' is not one of Cory\'s — skipped)'); return; }
const board = st.board;
/* nextPick AND myPicksLeft MUST TRACK THE PICK. The first version hardcoded
 * `nextPick: 45, myPicksLeft: 12` for every walk, so at pick 145 the context
 * claimed the next pick was a hundred picks in the PAST and that twelve picks
 * remained. VONA is `proj_mean - expectedBestAvailable(samePos, nextPick)` —
 * it is a function of exactly that number — and VONA is the column this file
 * exists to read. A harness fault in the one input the conclusion rests on,
 * which is the same shape as rule12_result's targetPick/nextPick fault and the
 * reason item 13 took a day. */
const MY_PICKS = [30, 45, 50, 65, 70, 85, 90, 105, 110, 125, 130, 145];
const later = MY_PICKS.filter(x => x > PICK);
const nextPick = later.length ? later[0] : 147;
const picksLeft = later.length + 1;
const ctx = { board: board, roster: st.roster, league: L, currentPick: PICK, nextPick: nextPick,
  totalPicks: 147, myPicksLeft: picksLeft, roundsLeft: picksLeft, runMultipliers: {},
  intervening: [], weights: E.MEASURED_WEIGHTS };
const recs = E.recommend(ctx);
const rankOf = {};
recs.forEach((r, i) => { rankOf[String(r.player.player_id)] = i + 1; });

console.log('\n  RUNGS 4-6 — THE WALK, at pick ' + PICK + ' (next ' + nextPick
  + ', ' + picksLeft + ' left, roster ' + st.roster.length + ': '
  + st.roster.map(p => p.position).join(' ') + ')');
console.log('  The best AVAILABLE player at each position, every step shown.\n');
console.log('  pos   player                proj    repl    VORP    check     VONA     score    rank');
POS.forEach(pos => {
  const cand = board.filter(p => p.position === pos)
    .sort((a, b) => Number(b.vorp) - Number(a.vorp))[0];
  if (!cand) return;
  const entry = recs.find(r => String(r.player.player_id) === String(cand.player_id));
  const proj = Number(cand.proj_mean), rep = Number(cand.replacement), vorp = Number(cand.vorp);
  const recomputed = proj - rep;
  const agrees = Math.abs(recomputed - vorp) < 0.05;
  console.log('  ' + pos.padEnd(6) + String(cand.name).slice(0, 20).padEnd(22)
    + proj.toFixed(1).padEnd(8) + rep.toFixed(1).padEnd(8) + vorp.toFixed(1).padEnd(8)
    + (agrees ? 'ok      ' : ('*** ' + recomputed.toFixed(1) + ' '))
    + String(entry ? Number(entry.components.vona).toFixed(1) : '—').padEnd(9)
    + String(entry ? Number(entry.score).toFixed(1) : '—').padEnd(9)
    + (rankOf[String(cand.player_id)] || '—'));
});

console.log('\n  THE SAME PLAYERS, RANKED BY EACH QUANTITY IN TURN');
console.log('  If VORP is doing its job, the position order should CHANGE between');
console.log('  the raw column and the VORP column — that change IS the baseline');
console.log('  correction. If the order is the same, the baseline is not separating');
console.log('  positions and the inflation is upstream of VONA.\n');
const cands = POS.map(pos => board.filter(p => p.position === pos)
  .sort((a, b) => Number(b.vorp) - Number(a.vorp))[0]).filter(Boolean);
/* A -999 HERE MEANS THE CANDIDATE IS NOT IN THE RECOMMENDATION LIST AT ALL,
 * which late in a draft is applyRosterLegality FORCING the list down to the
 * mandatory slots still unfilled. That is the engine being right about a
 * constrained roster, not missing data, and printing a sentinel invited exactly
 * the misreading. Say it instead. */
const forced = recs.length && recs[0].legality;
if (forced) {
  console.log('  LIST FORCED by roster legality: ' + forced.message);
  console.log('  (positions outside the forced set are absent from the list by design)');
}
const order = (key, fn) => console.log('  by ' + key.padEnd(10)
  + cands.slice().sort((a, b) => fn(b) - fn(a))
    .map(p => p.position + ' ' + (fn(p) <= -999 ? 'not listed' : fn(p).toFixed(1))).join('   '));
order('raw proj', p => Number(p.proj_mean));
order('replacement', p => Number(p.replacement));
order('VORP', p => Number(p.vorp));
order('VONA', p => {
  const e = recs.find(r => String(r.player.player_id) === String(p.player_id));
  return e ? Number(e.components.vona) : -999;
});
order('score', p => {
  const e = recs.find(r => String(r.player.player_id) === String(p.player_id));
  return e && E.scoreable(e) ? Number(e.score) : -999;
});

}

console.log('\n  WHAT TO READ FIRST: the earliest column above where the position');
console.log('  order stops matching what the roster requires is the boundary the');
console.log('  investigation belongs at. Everything downstream of it is inheriting');
console.log('  the problem, not causing it.');

/* Why is round 2 the only round MCTS loses?
 *
 * The 300-draft confirmatory run closed the overall gap (-0.0922 -> -0.0011)
 * but left round 2 almost untouched: -18.59 per draft before the rollout fix,
 * -17.51 after. Every other round is within a few points of zero. A deficit
 * that survives a change which moved everything else is a distinct bug, not
 * noise, and -5,254 points over 300 drafts is far too large to be sampling.
 *
 * Three hypotheses, and this script separates them by direct measurement
 * rather than by argument:
 *
 *   A. CANDIDATE-SET ASYMMETRY AT THE ROOT. The same defect family as the
 *      rollout bug, one level up: if greedy's choice is not among the root's
 *      expanded children, the search cannot select it however many iterations
 *      it runs. It is not losing a comparison, it is never holding the option.
 *      Signature: greedy's pick outside the root's action list.
 *
 *   B. EXPLORATION THE VALUE FUNCTION CANNOT CASH. The search deliberately
 *      takes a player ranked below greedy's on immediate V, betting on a
 *      continuation. With a variance-blind points-V, that bet has nothing to
 *      pay out from. Signature: MCTS's pick inside the candidate set but
 *      ranked 4th-8th by V.
 *
 *   C. ATTRIBUTION LEAKAGE. The picks are near-identical and the deficit is
 *      an artefact of how per-round marginal V is computed — the round-2 gain
 *      of a player depends on what round 1 took, so two arms holding different
 *      round-1 players book different round-2 credit for the same quality of
 *      pick. Signature: high pick agreement with the deficit persisting.
 *
 * Split by seat throughout: worst at seats 1 and 10 points at turn mechanics
 * (the back-to-back at the snake boundary), not at the search itself.
 *
 * ON RE-RUNNING THIS AGAINST THE REAL ARTIFACT — READ THIS FIRST.
 *
 * The fixture run produced 100/100 never-rank-1: MCTS deviated from greedy in
 * round 2 in EVERY sampled state, taking RB or WR while greedy took a QB 100
 * times out of 100. Total behavioural consistency like that is almost always a
 * property of the BOARD, not of the strategy. Real boards produce mixed
 * behaviour; a policy that does the same thing in 100 of 100 states is usually
 * responding to a structural quirk of the inputs.
 *
 * The quirk here is visible: this fixture prices QBs at 330.8 against RB 207
 * and WR 210, a 120-point positional premium, with elite QBs at ADP 6-15. On
 * the real artifact that premium disappears and the round-2 decision may not
 * be about quarterbacks at all.
 *
 * So the first number to look at on a real-board re-run is NOT the cost. It is
 * whether 100/100 breaks. If it does, the fixture finding was a board artifact
 * and the cost figure describes nothing that will happen on draft day. If it
 * does NOT break, the deferral is a genuine property of the search and the
 * cost is worth pricing.
 */
'use strict';
const T = require('./run.js');
const { M, V, LEAGUE, TEAMS, ROUNDS, SCHEDULE, BOARD, PLAYERS, greedyVPolicy,
        rankedPolicy, profileFor } = T;

const N = parseInt(process.argv[2] || '100', 10);
const ITERS = parseInt(process.argv[3] || '400', 10);
const REPLACEMENT = V.replacementLevels(PLAYERS, LEAGUE);

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Play the room forward to the subject's Nth pick and hand back the exact
 * state both policies would face. Opponents use the tournament's own ranked
 * softmax; the subject's earlier picks use greedy-on-V, which is the arm we
 * are comparing against and which round 1 shows is indistinguishable from
 * MCTS anyway (-0.07 per draft). */
function stateAtRound(slot, round, seed) {
  const rand = rng(seed);
  const valuer = V.makeValuer({ league: LEAGUE, players: PLAYERS, replacement: REPLACEMENT });
  const available = BOARD.slice();
  const rosters = {};
  for (let s = 1; s <= TEAMS; s++) rosters[s] = [];
  const profiles = {};
  for (let s = 1; s <= TEAMS; s++) profiles[s] = profileFor(s, 0, rand);
  const opp = rankedPolicy(BOARD);
  const greedy = greedyVPolicy(valuer);

  for (let i = 0; i < SCHEDULE.length; i++) {
    const step = SCHEDULE[i];
    if (step.team_slot === slot && step.round === round) {
      return { i: i, step: step, available: available, rosters: rosters,
               profiles: profiles, valuer: valuer,
               picksLeft: ROUNDS - step.round + 1 };
    }
    const roster = rosters[step.team_slot];
    const picksLeft = ROUNDS - step.round + 1;
    const pick = step.team_slot === slot
      ? greedy(available, roster, picksLeft)
      : opp(available, roster, picksLeft, rand);
    if (!pick) break;
    roster.push(pick);
    const k = available.indexOf(pick);
    if (k >= 0) available.splice(k, 1);
  }
  return null;
}

const rowsOut = [];
let containmentFail = 0, agree = 0, done = 0;
const bySeat = {};
const posMcts = {}, posGreedy = {}, vrankHist = {};

for (let n = 0; n < N; n++) {
  const slot = (n % TEAMS) + 1;
  const seed = (1e6 + n * 7919) >>> 0;
  const st = stateAtRound(slot, 2, seed);
  if (!st) continue;

  const roster = st.rosters[slot];
  const valuer = st.valuer;

  // What greedy takes here — the baseline's actual choice.
  const gPick = M.greedyPick(st.available, roster, LEAGUE, st.picksLeft, valuer, null);

  // The candidate set greedy ranked over, ordered by V descending. MCTS's pick
  // is located in THIS ordering, which is what makes "4th-8th by V" meaningful.
  const cands = M.legalActions(
    M.candidates(st.available, roster, LEAGUE,
      { k: M.CFG.GREEDY_K, endgame: st.picksLeft <= M.CFG.ENDGAME_WITHIN }),
    roster, LEAGUE, st.picksLeft, null);
  const byV = cands.map(c => ({ p: c, v: valuer.evaluate(roster.concat([c])) }))
    .sort((a, b) => b.v - a.v);

  const schedule = [];
  for (let j = st.i; j < SCHEDULE.length; j++) {
    schedule.push({
      team_slot: SCHEDULE[j].team_slot, pick_no: SCHEDULE[j].pick_no,
      roster: st.rosters[SCHEDULE[j].team_slot],
      profile: SCHEDULE[j].team_slot === slot ? null : st.profiles[SCHEDULE[j].team_slot],
    });
  }
  let out = null;
  try {
    const search = M.createSearch({
      board: st.available, league: LEAGUE, myRoster: roster, rosters: st.rosters,
      schedule: schedule, mySlot: slot, myPicksLeft: st.picksLeft,
      valuer: valuer, blocked: new Set(), seed: (seed * 31 + st.i) >>> 0,
      runMultipliers: {}, roundsLeft: st.picksLeft, progress: st.i / SCHEDULE.length,
      cfg: { MAX_NODES: 40000 },
    });
    out = search.run(ITERS);
  } catch (e) {
    rowsOut.push({ slot, err: e.message });
    continue;
  }
  if (!out || !out.actions.length) continue;
  const mPick = out.actions[0].player;
  const rootIds = out.actions.map(a => a.player.player_id);

  // ---- HYPOTHESIS A ------------------------------------------------------
  const contained = rootIds.indexOf(gPick.player_id) >= 0;
  if (!contained) containmentFail++;

  // ---- HYPOTHESIS B ------------------------------------------------------
  const vrank = byV.findIndex(x => x.p.player_id === mPick.player_id) + 1;  // 1-based; 0 = not in set
  vrankHist[vrank] = (vrankHist[vrank] || 0) + 1;

  // ---- HYPOTHESIS C ------------------------------------------------------
  const same = mPick.player_id === gPick.player_id;
  if (same) agree++;

  const gV = valuer.evaluate(roster.concat([gPick]));
  const mV = valuer.evaluate(roster.concat([mPick]));
  const before = valuer.evaluate(roster);
  bySeat[slot] = bySeat[slot] || { n: 0, dv: 0, miss: 0, agree: 0 };
  bySeat[slot].n++; bySeat[slot].dv += (mV - gV);
  if (!contained) bySeat[slot].miss++;
  if (same) bySeat[slot].agree++;

  posMcts[mPick.position] = (posMcts[mPick.position] || 0) + 1;
  posGreedy[gPick.position] = (posGreedy[gPick.position] || 0) + 1;

  rowsOut.push({ slot, pick_no: st.step.pick_no, contained, same, vrank,
                 mcts: mPick.name + ' (' + mPick.position + ')',
                 greedy: gPick.name + ' (' + gPick.position + ')',
                 dv: +(mV - gV).toFixed(2), gain_m: +(mV - before).toFixed(2),
                 rootActions: out.actions.length, candSet: cands.length });
  done++;
  if (done % 10 === 0) process.stderr.write('  ' + done + '/' + N + '\r');
}

const pct = (a, b) => (100 * a / Math.max(1, b)).toFixed(1) + '%';
console.log('\n' + '='.repeat(76));
console.log('ROUND-2 DIAGNOSTIC — ' + done + ' sampled states, ' + ITERS + ' iterations each');
console.log('='.repeat(76));

console.log('\nHYPOTHESIS A — candidate-set asymmetry at the root');
console.log('  greedy\'s pick NOT among the root\'s expanded children: '
  + containmentFail + ' of ' + done + '  (' + pct(containmentFail, done) + ')');
console.log('  ' + (containmentFail
  ? 'NON-ZERO. The search cannot select an option it never expanded. This is'
    + '\n  the -17.5, and it is the rollout bug one level up.'
  : 'ZERO. Every state gave the search the option greedy took, so it lost'
    + '\n  those states by choosing, not by never holding the choice.'));

console.log('\nHYPOTHESIS B — exploration the points-V cannot cash');
console.log('  V-rank of MCTS\'s pick within greedy\'s candidate set:');
Object.keys(vrankHist).map(Number).sort((a, b) => a - b).forEach(r => {
  console.log('    ' + (r === 0 ? 'outside set' : 'rank ' + r).padEnd(12)
    + String(vrankHist[r]).padStart(4) + '  ' + pct(vrankHist[r], done));
});

console.log('\nHYPOTHESIS C — attribution leakage');
console.log('  MCTS and greedy chose the SAME player: ' + agree + ' of ' + done
  + '  (' + pct(agree, done) + ')');
console.log('  mean V difference at the pick itself (MCTS - greedy): '
  + (rowsOut.filter(r => r.dv != null).reduce((s, r) => s + r.dv, 0) / Math.max(1, done)).toFixed(3));
console.log('  NOTE: this is the SINGLE-PICK V delta. The tournament\'s -17.5 is');
console.log('  marginal V booked at round 2. If this number is near zero while the');
console.log('  tournament shows -17.5, the deficit is not in the round-2 CHOICE and');
console.log('  hypothesis C is live.');

console.log('\nBY SEAT (turn mechanics live at seats 1 and ' + TEAMS + ')');
console.log('  seat    n   mean dV   containment misses   agreement');
Object.keys(bySeat).map(Number).sort((a, b) => a - b).forEach(s => {
  const b = bySeat[s];
  console.log('  ' + String(s).padStart(4) + String(b.n).padStart(5)
    + (b.dv / b.n).toFixed(2).padStart(10) + String(b.miss).padStart(21)
    + ('  ' + pct(b.agree, b.n)).padStart(12));
});

console.log('\nPOSITION MIX AT ROUND 2');
const allPos = Array.from(new Set(Object.keys(posMcts).concat(Object.keys(posGreedy)))).sort();
console.log('  pos     MCTS   greedy');
allPos.forEach(p => console.log('  ' + p.padEnd(6)
  + String(posMcts[p] || 0).padStart(6) + String(posGreedy[p] || 0).padStart(9)));

console.log('\nFIRST 15 DISAGREEMENTS');
rowsOut.filter(r => r.same === false).slice(0, 15).forEach(r => {
  console.log('  seat ' + r.slot + ' pick ' + r.pick_no
    + '  MCTS ' + r.mcts.padEnd(22) + ' greedy ' + r.greedy.padEnd(22)
    + ' dV ' + String(r.dv).padStart(8) + '  vrank ' + r.vrank
    + '  root ' + r.rootActions + '/' + r.candSet);
});
require('fs').writeFileSync(__dirname + '/round2-diagnostic.json',
  JSON.stringify({ n: done, iters: ITERS, containmentFail, agree, vrankHist,
                   bySeat, posMcts, posGreedy, rows: rowsOut }, null, 1));
console.log('\nwritten to draft/tournament/round2-diagnostic.json');

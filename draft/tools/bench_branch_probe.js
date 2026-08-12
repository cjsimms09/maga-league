// TERRITORY: A
/* THE BENCH BRANCH HAS NO ANCHOR UNDER THE WEIGHTS WE SHIP.
 *
 * FOUND BY ACCIDENT, WHICH IS WORTH SAYING. This was not an audit of the
 * engine. It surfaced while measuring disagreement rates for high-contrast
 * strategy candidates: the market-anchored arm's sample line showed the SHIPPING
 * arm taking Denzel Mims (ADP 696) over Sam LaPorta (ADP 73) in round 8, and
 * Josh Johnson, Joe Flacco, Tom Brady and Marcedes Lewis in the rounds after.
 * The rate I was measuring was fine. The picks inside it were not.
 *
 * ── WHAT IS ACTUALLY WRONG ──────────────────────────────────────────────────
 *
 * `scorePlayer` has two branches. Once every starting slot is filled, every
 * remaining player reads `need.fills === 'bench'` and takes the bench branch:
 *
 *   score = w.ceiling*ceiling + w.stack*stack + w.keeper*kov
 *         + max(0, w.need*need) - max(0, w.bye*bye) + w.risk*min(0, risk)
 *
 * VONA and tier-cliff are deliberately absent — correct, they price scarcity
 * for a man you cannot start. The branch is meant to rank on UPSIDE instead.
 *
 * MEASURED_WEIGHTS — what app.js:52 ships — is
 *   {value 1, tier 0, need 0, risk 0, ceiling 0, keeper 1, bye 0, stack 0.5}
 *
 * Four of the six bench terms are zeroed. `value` and `tier`, the two weights
 * that are NOT zeroed, do not appear in this branch at all. So the shipped
 * bench score is
 *
 *   score = 0.5 * stack + 1 * keeper
 *
 * and `stack` is a flat bonus for sharing a team with somebody already on my
 * roster, regardless of whether the player is any good. Measured at pick 73:
 * Denzel Mims scores 0.5 x 6.00 - 0.58 = 2.42 on a stack bonus alone, against
 * Travis Kelce at -0.02 and Sam LaPorta at +0.01.
 *
 * ── AND THE INTENDED ANCHOR WAS NEVER RUNNING ───────────────────────────────
 *
 * The branch's comment says the top bench pick "is the highest-ceiling player
 * left". It is not, under EITHER weight vector: `upsideBonus` is gated to zero
 * until CEILING_LATE_FROM = 0.6 of the draft, i.e. pick 90 of 150, and the
 * bench branch starts firing around pick 70. Measured at pick 73 the ceiling
 * term is 0.00 for every player on the board — Mims, Kelce, LaPorta and Purdy
 * alike. A comment describing an implementation that does not run (rule 11e),
 * and the second defect is what makes the first one reachable.
 *
 * DEFAULT_WEIGHTS does not reach, and that is diagnostic rather than
 * reassuring: what saves it is the RISK term (-42.00 on Mims at weight 1) and
 * the need/insurance term, not the ceiling the comment credits. MEASURED zeroed
 * risk because the Lab measured it as drag IN THE STARTER BRANCH, where `value`
 * anchors everything. In the bench branch it was the only thing holding the
 * floor. A weight measured on one composition, applied to another.
 *
 * Run: node draft/tools/bench_branch_probe.js [drafts]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../../public/js/draft/engine.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league, TEAMS = L.teams, ROUNDS = L.rounds, MY = L.my_draft_slot;
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY);
const KR = (L.keeper_rules || {}).count || 0;
const REACH_ADP = 250;   // stated before the run: an ADP this deep is not a reach, it is a different sport

const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));
function rng(s) {
  let a = s >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slotOf = o => { const r = Math.ceil(o / TEAMS), i = o - (r - 1) * TEAMS; return (r % 2 === 1) ? i : (TEAMS - i + 1); };
function myPicks() {
  const out = [];
  for (let r = 1; r <= ROUNDS; r++) out.push((r - 1) * TEAMS + ((r % 2 === 1) ? MY : (TEAMS - MY + 1)));
  return out.slice(KR);
}

function runDraft(seed, weights) {
  const rand = rng(seed);
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set(KEEPERS.map(k => String(k.player_id)));
  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const mine = new Set(myPicks());
  const opp = {}; for (let s = 1; s <= TEAMS; s++) opp[s] = [];
  const picks = [];
  for (let o = 1; o <= TEAMS * ROUNDS; o++) {
    const board = pool.filter(p => !gone.has(String(p.player_id)));
    if (!board.length) break;
    if (!mine.has(o)) {
      const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 8);
      const pick = top[Math.min(top.length - 1, Math.floor(rand() * rand() * top.length))];
      if (!pick) break;
      gone.add(String(pick.player_id)); opp[slotOf(o)].push(pick); continue;
    }
    const nx = [...mine].filter(x => x > o).sort((a, b) => a - b)[0] || null;
    const win = [];
    if (nx) for (let q = o; q < nx; q++) { const s = slotOf(q); if (s !== MY) win.push({ team_slot: s, pick_no: q, roster: opp[s], profile: null, room: null }); }
    let res;
    try {
      res = E.recommend({ board, roster, league: L, weights, currentPick: o, nextPick: nx,
        totalPicks: TEAMS * ROUNDS, myPicksLeft: [...mine].filter(x => x >= o).length,
        roundsLeft: ROUNDS - Math.ceil(o / TEAMS) + 1, runMultipliers: {}, intervening: win });
    } catch (e) { break; }
    if (!res || !res.length) break;
    const p = res[0].player;
    picks.push({ round: Math.ceil(o / TEAMS), overall: o, player: p, adp: adpOf(p),
      fills: E.starterSlotMarginal(p, roster, L).fills, vorp: Number(p.vorp) });
    gone.add(String(p.player_id)); roster.push(p); opp[MY].push(p);
  }
  return picks;
}

const nDrafts = Number(process.argv[2] || 20);
const ARMS = { MEASURED: E.MEASURED_WEIGHTS, DEFAULT: E.DEFAULT_WEIGHTS };

console.log('='.repeat(74));
console.log('BENCH-BRANCH ANCHOR — how often the shipped board recommends a non-player');
console.log('='.repeat(74));
console.log(`${nDrafts} simulated drafts, seat ${MY}, opponents drafting to ADP.`);
console.log(`A pick is a REACH at ADP > ${REACH_ADP}. Stated before the run.`);
console.log('');

const worst = [];
Object.keys(ARMS).forEach(arm => {
  let n = 0, reaches = 0, bench = 0, benchReach = 0;
  for (let d = 0; d < nDrafts; d++) {
    runDraft(3000 + d * 104729, ARMS[arm]).forEach(p => {
      n++;
      if (p.fills === 'bench') bench++;
      if (p.adp > REACH_ADP) { reaches++; if (p.fills === 'bench') benchReach++; }
      if (arm === 'MEASURED' && p.adp > REACH_ADP) worst.push(p);
    });
  }
  const pc = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a';
  console.log(`${arm.padEnd(9)} ${reaches}/${n} picks are reaches  ${pc(reaches, n)}`
    + `   (${benchReach} of them on the bench branch, which fired on ${bench}/${n} picks)`);
});
console.log('');
if (worst.length) {
  const byRound = {};
  worst.forEach(p => { byRound[p.round] = (byRound[p.round] || 0) + 1; });
  console.log('WHERE THE SHIPPED ARM REACHES, by round:');
  Object.keys(byRound).map(Number).sort((a, b) => a - b)
    .forEach(r => console.log(`   round ${String(r).padStart(2)} : ${byRound[r]}`));
  console.log('');
  console.log('A SAMPLE, with the ADP the room would have been looking at:');
  worst.slice(0, 10).forEach(p => console.log(`   r${String(p.round).padStart(2)}  `
    + `${p.player.name} (${p.player.position})  adp ${p.adp.toFixed(0)}  vorp ${p.vorp.toFixed(1)}`));
} else {
  console.log('NO REACHES. Reported as a null — the defect this tool exists for is gone,');
  console.log('and this tool should be retired rather than left to pass forever.');
}

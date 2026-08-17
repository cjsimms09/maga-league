/* TERRITORY: relay — the measurement register 4m / queue D11 needs to be ruled on.
 *
 * Cory, 2026-08-17: "adjusters seem muted... should be searching for more upside
 * in later rounds."
 *
 * WHY THIS EXISTS RATHER THAN A REQUEST FOR SOMEONE ELSE TO MEASURE IT.
 * engine.js justifies shipping `ceiling = 0.45` as safe with "0 of the top-60
 * move at picks 33, 48 and 68". `CEILING_LATE_FROM = 0.6` makes the ceiling
 * ramp exactly 0.00 at all three of those picks, so that measurement did not
 * show the weight is harmless — IT MEASURED A TERM THAT WAS SWITCHED OFF. A
 * decision cannot rest on it in either direction.
 *
 * So this measures the thing the decision actually turns on: at Cory's REAL
 * picks, how much does the recommendation move when the gate opens earlier?
 *
 * The engine's own comment already says the constant is a proxy for the wrong
 * thing: "CEILING_LATE_FROM = 0.6 is a PROXY for 'the throwaway rounds' -- pick
 * 90 of 150. ... Measured, that happens near pick 70." The bench branch fires
 * on the real condition via gateOpen; the composite waits for 90. This prices
 * closing that gap.
 *
 * READ THE LIMIT BEFORE THE NUMBERS. This is a STATIC board with a synthetic
 * roster and an ADP-ordered pool of taken players — the same construction
 * bench_branch_anchor.test.js uses, chosen so it is a state a competent draft
 * actually reaches, not one hand-picked to move. It is NOT a replay against
 * real drafts, so it prices the CHANGE IN RECOMMENDATION, never the change in
 * outcome. "N players move" is not "N players were better".
 *
 * Run: node draft/tools/ceiling_gate_blast_radius.js [lateFrom=0.47]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

const DATA = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
const FREEZE = path.join(__dirname, '..', 'data', 'pre_draft_freeze_2026.json');
const L = DATA.league;
const TOTAL = ((L && L.teams) || 10) * ((L && L.rounds) || 15);

const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : 9999));

/* The board state at a given pick.
 *
 * ⚠️ THE ROSTER MUST GROW WITH THE PICK, AND THE FIRST VERSION OF THIS TOOL GOT
 * IT WRONG. It filled all seven starting slots at EVERY pick, which makes the
 * BENCH branch fire at pick 33 — a state that cannot occur, since nobody has
 * seven players in round 4. The measurement then reported 20 of the top 60
 * moving at pick 33 while the composite's ceiling ramp there is arithmetically
 * 0.00. Two numbers from the same tool contradicting each other is how the flaw
 * surfaced; the contradiction was the finding, not the 20.
 *
 * Cory has 3 keepers and 12 picks, so the roster at pick N is those keepers
 * plus roughly one player per completed round of his own. Built from the board
 * by VORP so it is a state a competent draft reaches. */
function stateAt(pick) {
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
  const byVorp = pool.slice().sort((a, b) => b.vorp - a.vorp);
  const teams = (L && L.teams) || 10;
  const owned = 3 + Math.max(0, Math.floor((pick - 1) / teams));  // keepers + own picks so far
  const order = ['RB', 'WR', 'RB', 'WR', 'TE', 'QB', 'RB', 'WR', 'WR', 'TE', 'QB', 'RB'];
  const roster = [];
  const usedIds = new Set();
  for (let i = 0; i < owned && i < order.length; i++) {
    const pick_ = byVorp.find(p => p.position === order[i] && !usedIds.has(p.player_id));
    if (pick_) { roster.push(pick_); usedIds.add(pick_.player_id); }
  }
  const taken = new Set(roster.map(p => String(p.player_id)));
  pool.slice().sort((a, b) => adpOf(a) - adpOf(b))
    .slice(0, Math.max(0, pick - 1)).forEach(p => taken.add(String(p.player_id)));
  return { board: pool.filter(p => !taken.has(String(p.player_id))), roster: roster };
}

function topAt(pick, lateFrom, n) {
  const saved = E.CFG.CEILING_LATE_FROM;
  E.CFG.CEILING_LATE_FROM = lateFrom;
  try {
    const s = stateAt(pick);
    const out = E.recommend({
      board: s.board, roster: s.roster, league: L,
      currentPick: pick, nextPick: pick + 15, totalPicks: TOTAL,
      myPicksLeft: Math.max(1, Math.round((TOTAL - pick) / 15)),
      roundsLeft: Math.max(1, Math.round((TOTAL - pick) / 10)),
      runMultipliers: {}, intervening: [],
    }) || [];
    return out.slice(0, n).map(r => String((r.player || r).player_id || r.player_id));
  } finally { E.CFG.CEILING_LATE_FROM = saved; }
}

function myPicks() {
  try {
    const f = JSON.parse(fs.readFileSync(FREEZE, 'utf8'));
    const ps = (f.my_picks || []).map(p =>
      typeof p === 'number' ? p : (p.overall || p.pick || p.pick_no)).filter(Boolean);
    if (ps.length) return ps;
  } catch (e) { /* fall through */ }
  return [33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
}

function main() {
  const lateFrom = parseFloat(process.argv[2] || '0.47');
  const base = E.CFG.CEILING_LATE_FROM != null ? E.CFG.CEILING_LATE_FROM : 0.6;
  const N = 60;

  console.log('CEILING GATE — BLAST RADIUS AT CORY\'S REAL PICKS\n');
  console.log(`  CEILING_LATE_FROM  ${base}  ->  ${lateFrom}`);
  console.log(`  gate opens at pick ${Math.ceil(base * TOTAL)}  ->  ${Math.ceil(lateFrom * TOTAL)}`
    + `   (of ${TOTAL})`);
  console.log(`  measured over the top ${N} recommendations at each pick\n`);
  console.log('  pick   ramp now   ramp after   top-1 changes   moved in top-60');

  let anyMove = false;
  for (const pick of myPicks()) {
    const lateness = Math.min(1, pick / TOTAL);
    const r0 = lateness <= base ? 0 : (lateness - base) / (1 - base);
    const r1 = lateness <= lateFrom ? 0 : (lateness - lateFrom) / (1 - lateFrom);
    const a = topAt(pick, base, N);
    const b = topAt(pick, lateFrom, N);
    const setA = new Set(a);
    const moved = b.filter(id => !setA.has(id)).length;
    const topChanged = a[0] !== b[0];
    if (moved || topChanged) anyMove = true;
    console.log(`  ${String(pick).padStart(4)}   ${r0.toFixed(2).padStart(8)}   `
      + `${r1.toFixed(2).padStart(10)}   ${(topChanged ? 'YES' : 'no').padStart(13)}   `
      + `${String(moved).padStart(15)}`);
  }

  console.log('\n  ⚠️  READ THE LIMIT: this is a STATIC board with a synthetic roster and an');
  console.log('     ADP-ordered taken-pool. It prices the change in RECOMMENDATION, never');
  console.log('     the change in OUTCOME. "N moved" is not "N were better".');
  if (!anyMove) {
    console.log('\n  ✅ NOTHING MOVES AT ANY OF CORY\'S PICKS. Then the gate is not what is');
    console.log('     muting upside, and register 4m\'s remaining causes (4j: ceiling is a');
    console.log('     monotone function of proj_mean) are the whole story.');
  }
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { topAt, stateAt, myPicks };

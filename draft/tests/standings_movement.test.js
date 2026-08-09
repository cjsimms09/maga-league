'use strict';
// STANDINGS RANK-MOVEMENT — arrows are computed by subtracting the latest week
// from the cumulative standings. Dormant until a real prior week exists; then
// correct. Pure, no HTTP.
const path = require('path');
const { rankMovement } = require(path.join(__dirname, '..', '..', 'src', 'routes', 'standings-movement.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// --- Dormancy: no week data, or only one week played, => no arrows ---
ck('no week matchups => dormant', Object.keys(rankMovement([{roster_id:1,owner_id:10,wins:1,losses:0,ties:0,pf:100,rank:1}], [])).length === 0);
ck('fewer than 2 teams => dormant', Object.keys(rankMovement([{roster_id:1,owner_id:10,wins:1,losses:0,ties:0,pf:100,rank:1}], [{roster_id:1,matchup_id:1,points:100}])).length === 0);

// After ONLY week 1, subtracting week 1 leaves an all-zero prior => noise => dormant.
const afterWk1 = [
  { roster_id: 1, owner_id: 10, wins: 1, losses: 0, ties: 0, pf: 120, rank: 1 },
  { roster_id: 2, owner_id: 20, wins: 0, losses: 1, ties: 0, pf: 90,  rank: 2 },
];
const wk1 = [ { roster_id: 1, matchup_id: 1, points: 120 }, { roster_id: 2, matchup_id: 1, points: 90 } ];
ck('after week 1 only => still dormant (flat prior)', Object.keys(rankMovement(afterWk1, wk1)).length === 0);

// --- Real movement after week 2 ---
// Standings AFTER week 2 (cumulative). Team A(1) 2-0, Team B(2) 1-1, Team C(3) 1-1, Team D(4) 0-2.
const cum = [
  { roster_id: 1, owner_id: 10, wins: 2, losses: 0, ties: 0, pf: 250, rank: 1 },
  { roster_id: 3, owner_id: 30, wins: 1, losses: 1, ties: 0, pf: 230, rank: 2 },
  { roster_id: 2, owner_id: 20, wins: 1, losses: 1, ties: 0, pf: 210, rank: 3 },
  { roster_id: 4, owner_id: 40, wins: 0, losses: 2, ties: 0, pf: 180, rank: 4 },
];
// Week 2 results: A beat D (A +130, D +80), C beat B (C +125, B +95).
// Removing week 2 => prior (after wk1): A 1-0/120, B 1-0/115, C 0-1/105, D 0-1/100.
// Prior rank: A(1, 1-0 120) , B(2, 1-0 115), C(3, 0-1 105), D(4, 0-1 100).
const wk2 = [
  { roster_id: 1, matchup_id: 1, points: 130 },
  { roster_id: 4, matchup_id: 1, points: 80 },
  { roster_id: 3, matchup_id: 2, points: 125 },
  { roster_id: 2, matchup_id: 2, points: 95 },
];
const mv = rankMovement(cum, wk2);
ck('movement computed after week 2', Object.keys(mv).length === 4, JSON.stringify(mv));
// A: prior rank 1, cur rank 1 => held.
ck('leader held (delta 0)', mv[10] && mv[10].delta === 0, JSON.stringify(mv[10]));
// C(owner 30): prior rank 3, cur rank 2 => climbed 1.
ck('C climbed one (delta +1)', mv[30] && mv[30].delta === 1, JSON.stringify(mv[30]));
// B(owner 20): prior rank 2, cur rank 3 => fell 1.
ck('B fell one (delta -1)', mv[20] && mv[20].delta === -1, JSON.stringify(mv[20]));
// D(owner 40): prior 4, cur 4 => held.
ck('D held at bottom (delta 0)', mv[40] && mv[40].delta === 0, JSON.stringify(mv[40]));
// prevRank carried for the tooltip.
ck('prevRank carried', mv[30] && mv[30].prevRank === 3 && mv[30].curRank === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

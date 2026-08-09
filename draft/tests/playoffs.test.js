'use strict';
// THE FOLDED COLUMNS — the playoff-picture engine: games-remaining, exact
// clinch/elimination bounds, the seeded (deterministic) Monte-Carlo odds, the
// week-over-week movement, and the matchup-leverage line. All pure — no network.
const path = require('path');
const P = require(path.join(__dirname, '..', '..', 'src', 'routes', 'playoffs'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
const near = (a, b, e = 0.06) => Math.abs(a - b) <= e;

(function () {
  // games remaining
  ck('gamesRemaining subtracts played from the regular season', P.gamesRemaining(5, 14) === 10);
  ck('gamesRemaining never negative', P.gamesRemaining(20, 14) === 0);

  // ── clinch / elimination, exact bounds ───────────────────────────────────────
  // 6 teams, top 2 make it, ONE game left → the picture is fully decided.
  const decided = [
    { owner_id: 1, wins: 10, losses: 2, pf: 500 },
    { owner_id: 2, wins: 8, losses: 4, pf: 480 },
    { owner_id: 3, wins: 5, losses: 7, pf: 450 },
    { owner_id: 4, wins: 4, losses: 8, pf: 440 },
    { owner_id: 5, wins: 2, losses: 10, pf: 420 },
    { owner_id: 6, wins: 1, losses: 11, pf: 400 },
  ];
  const ce = P.clinchElim(decided, 1, 2);
  ck('runaway leader is CLINCHED', ce[1].status === 'clinched', ce[1].status);
  ck('second seed with an uncatchable gap is CLINCHED', ce[2].status === 'clinched', ce[2].status);
  ck('a team that cannot reach the cut is ELIMINATED', ce[3].status === 'eliminated', ce[3].status);
  ck('the cellar is ELIMINATED', ce[6].status === 'eliminated', ce[6].status);

  // a genuinely undecided race → alive
  const race = [
    { owner_id: 1, wins: 8, losses: 3, pf: 500 },
    { owner_id: 2, wins: 7, losses: 4, pf: 480 },
    { owner_id: 3, wins: 7, losses: 4, pf: 470 },
    { owner_id: 4, wins: 6, losses: 5, pf: 460 },
  ];
  const ce2 = P.clinchElim(race, 3, 2);
  ck('a tight race leaves the leader ALIVE, not clinched', ce2[1].status === 'alive', ce2[1].status);

  // ── odds: deterministic + sane ordering ──────────────────────────────────────
  const rows = [
    { owner_id: 1, wins: 6, losses: 1, pf: 900 },
    { owner_id: 2, wins: 5, losses: 2, pf: 850 },
    { owner_id: 3, wins: 4, losses: 3, pf: 800 },
    { owner_id: 4, wins: 3, losses: 4, pf: 780 },
    { owner_id: 5, wins: 2, losses: 5, pf: 700 },
    { owner_id: 6, wins: 1, losses: 6, pf: 640 },
  ];
  const o1 = P.simOdds(rows, 7, 4);
  const o2 = P.simOdds(rows, 7, 4);
  ck('simOdds is deterministic (seeded)', JSON.stringify(o1) === JSON.stringify(o2));
  ck('every prob is a probability', Object.values(o1).every(p => p >= 0 && p <= 1));
  ck('the leader has better odds than the cellar', o1[1] > o1[6], `${o1[1].toFixed(2)} vs ${o1[6].toFixed(2)}`);
  ck('roughly `cut` expected teams in', near(Object.values(o1).reduce((s, p) => s + p, 0), 4, 0.001));

  // season over → exact
  const done = P.simOdds(rows, 0, 4);
  ck('gamesLeft 0 → current top `cut` are in (prob 1)', done[1] === 1 && done[2] === 1 && done[3] === 1 && done[4] === 1 && done[5] === 0);

  // ── movement (picture) ───────────────────────────────────────────────────────
  const prev = P.simOdds(rows, 8, 4);          // a week earlier (one more game left)
  const pic = P.picture(rows, 7, 4, prev);
  ck('picture carries odds + a signed delta', typeof pic[1].odds === 'number' && typeof pic[1].delta === 'number');
  ck('picture reports clinch/elim status too', ['alive', 'clinched', 'eliminated'].includes(pic[6].status));
  const picNoPrev = P.picture(rows, 7, 4, null);
  ck('no prior week → delta is null (no fake arrow)', picNoPrev[1].delta === null);

  // ── matchup leverage: winning never hurts your own odds ───────────────────────
  const lev = P.matchupLeverage(rows, 5, 4, 3);   // a bubble team, mid-table
  ck('leverage returns win/lose/swing', lev && typeof lev.swing === 'number', JSON.stringify(lev));
  ck('winning this week does not lower your own odds', lev.win >= lev.lose - 0.001, `${lev.win} vs ${lev.lose}`);
  ck('a bubble game actually has stakes (positive swing)', lev.swing > 0, lev.swing);
  ck('no games left → no leverage', P.matchupLeverage(rows, 0, 4, 3) === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

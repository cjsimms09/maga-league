'use strict';
// HEAD-TO-HEAD — the enriched rivalry summary the matchup card, the /rivalry page,
// and the franchise grid all read. Pure over a fixture harvest (headToHead accepts
// an injected data object), so this asserts the real logic with no network:
//   • championship-bracket meetings are counted; TOILET-BOWL (losers bracket) games
//     are tagged consolation and NOT counted as playoffs (the honest distinction —
//     "knocked out of the playoffs" must never mean a toilet-bowl game);
//   • the FINAL (placement 1) is flagged;
//   • decided-by-<5, longest streak either way, total points, weekly-high and
//     benched-more-than-scored flags all compute from the box score.
const path = require('path');
const H2H = require(path.join(__dirname, '..', '..', 'src', 'routes', 'h2h'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// Two owners: user_id 100 (A) and 200 (B); 300 is a bystander for week-high math.
const owners = { '1': { user_id: '100' }, '2': { user_id: '200' }, '3': { user_id: '300' } };
// Helper to build a week row with a bench (players_points total − starters sum).
const row = (roster_id, matchup_id, points, benchExtra) => ({
  roster_id, matchup_id, points,
  starters_points: [points],
  players_points: { s: points, b: benchExtra || 0 },
});

const fixture = {
  seasons: [
    { season: '2023', owners, brackets: { winners: [], losers: [{ w: 1, l: 2, r: 1 }] },
      weeks: { '16': [ row(1, 1, 80), row(2, 1, 70) ] } },            // consolation (toilet bowl)
    { season: '2024', owners, brackets: { winners: [{ w: 1, l: 2, r: 1 }], losers: [] },
      weeks: {
        '4':  [ row(1, 1, 110, 5), row(2, 1, 107), row(3, 2, 130) ], // regular, roster3 is week high
        '16': [ row(1, 1, 140), row(2, 1, 95, 105), row(3, 2, 100) ], // championship R1: A high, B bench-bust
      } },
    { season: '2025', owners, brackets: { winners: [{ w: 2, l: 1, r: 2, p: 1 }], losers: [] },
      weeks: {
        '10': [ row(1, 1, 100), row(2, 1, 99) ],                     // regular, 1-pt nail-biter
        '17': [ row(1, 1, 120), row(2, 1, 130) ],                    // championship FINAL, B wins
      } },
  ],
};

const r = H2H.headToHead('100', '200', fixture);

ck('played counts every meeting', r.played === 5, r.played);
ck('record from A side is 4-1', r.record === '4-1', r.record);
ck('total points = sum of both sides', r.totalPoints === 1051, r.totalPoints);
ck('decided by <5 counts the two close ones', r.close === 2, r.close);
ck('longest A streak is 4', r.longest.a === 4, JSON.stringify(r.longest));
ck('longest B streak is 1', r.longest.b === 1, JSON.stringify(r.longest));
ck('current streak is B x1 (won the final)', r.streak && r.streak.who === 'b' && r.streak.n === 1, JSON.stringify(r.streak));
ck('era spans 2023–2025', r.firstSeason === '2023' && r.lastSeason === '2025', r.firstSeason + '-' + r.lastSeason);

// Playoffs = championship bracket only. The 2023 toilet-bowl game must NOT count.
ck('exactly 2 championship meetings (toilet bowl excluded)', r.playoffs === 2, r.playoffs);
const consol = r.games.find(g => g.season === '2023');
ck('the 2023 game is tagged consolation, not championship', consol && consol.consolation && !consol.championship, JSON.stringify(consol && { c: consol.consolation, ch: consol.championship }));
const finalGame = r.games.find(g => g.final);
ck('the 2025 final is flagged', finalGame && finalGame.season === '2025' && finalGame.week === 17, JSON.stringify(finalGame && { s: finalGame.season, w: finalGame.week }));
const r1 = r.games.find(g => g.season === '2024' && g.week === 16);
ck('the 2024 R1 is championship, not final', r1 && r1.championship && !r1.final && r1.round === 1, JSON.stringify(r1 && { ch: r1.championship, f: r1.final, r: r1.round }));

// Per-game notable flags.
ck('A is the week high in the 2024 R1 (140 tops the week)', r1 && r1.aWeekHigh && !r1.bWeekHigh, JSON.stringify(r1 && { a: r1.aWeekHigh, b: r1.bWeekHigh }));
ck('B benched more than played in the 2024 R1', r1 && r1.bBenchBust && !r1.aBenchBust, JSON.stringify(r1 && { a: r1.aBenchBust, b: r1.bBenchBust }));
const reg4 = r.games.find(g => g.season === '2024' && g.week === 4);
ck('a regular-season game is neither championship nor consolation', reg4 && !reg4.championship && !reg4.consolation && !reg4.playoff, JSON.stringify(reg4 && { ch: reg4.championship, co: reg4.consolation, p: reg4.playoff }));

// Same-owner and empty guards.
ck('same owner yields no games', H2H.headToHead('100', '100', fixture).played === 0);
ck('unknown owner yields no games', H2H.headToHead('100', '999', fixture).played === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

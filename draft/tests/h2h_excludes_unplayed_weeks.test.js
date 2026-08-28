'use strict';
// A FUTURE, UNPLAYED WEEK IS NOT A TIE — Cory, live, 2026-08-27, looking at his
// own dashboard: "Says I lead 3-2-2?? We have tied twice?? wtf" His real
// record against Richard was 3-2 (no ties ever); the tool said 3-2-2 because
// Sleeper's export pre-populates the WHOLE season's schedule up front, every
// future week already carrying a roster/matchup_id pairing at points: 0,
// shaped exactly like a real game. headToHead() counted two of those —
// including the CURRENT week, which his own screen said "not kicked off" —
// as decided ties.
//
// The fix (src/routes/h2h.js): a matchup where BOTH sides show exactly 0 is
// treated as not-yet-played and excluded. A genuine 0-x result (one side
// actually scored zero, the other did not) is NOT excluded — that is a real,
// if extreme, decided game and this file proves the distinction holds.
//
// Pure over a fixture harvest (headToHead accepts an injected data object),
// same pattern as h2h.test.js.
//
// Run: node draft/tests/h2h_excludes_unplayed_weeks.test.js
const path = require('path');
const H2H = require(path.join(__dirname, '..', '..', 'src', 'routes', 'h2h'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const owners = { '1': { user_id: '100' }, '2': { user_id: '200' } };
const row = (roster_id, matchup_id, points) => ({
  roster_id, matchup_id, points, starters_points: [points], players_points: { s: points },
});

// Real history: Cory (100) beat Richard (200) in weeks 4 and 13; Richard won
// week 9. Then the CURRENT week (1) and a FUTURE scheduled week (10) are
// both pre-populated at 0-0, exactly like the real Sleeper export.
const fixture = {
  seasons: [
    { season: '2023', owners, weeks: {
      '4':  [ row(1, 1, 90.78), row(2, 1, 110.86) ],   // Richard wins
      '13': [ row(1, 1, 97.5), row(2, 1, 71.22) ],     // Cory wins
    } },
    { season: '2024', owners, weeks: {
      '9': [ row(1, 1, 128.36), row(2, 1, 118.84) ],   // Cory wins
    } },
    { season: '2026', owners, weeks: {
      '1':  [ row(1, 1, 0), row(2, 1, 0) ],            // THIS week, not kicked off
      '10': [ row(1, 3, 0), row(2, 3, 0) ],             // a future scheduled meeting
    } },
  ],
};

const r = H2H.headToHead('100', '200', fixture);

ck('played counts only the three REAL games, not the two phantom 0-0s',
  r.played === 3, r.played);
ck('the real record is 2-1, not 2-1-2', r.record === '2-1' && r.ties === 0,
  { record: r.record, ties: r.ties });
ck('neither phantom week appears in the games list',
  !r.games.some(g => g.season === '2026'), r.games.map(g => g.season + ' wk' + g.week));
ck('lastMeeting is the real most recent game (2024 wk9), not the phantom 2026 wk10',
  r.lastMeeting && r.lastMeeting.season === '2024' && r.lastMeeting.week === 9, r.lastMeeting);
ck('current streak reads off the REAL last game (Cory, 2 straight) — a phantom tie no longer erases it',
  r.streak && r.streak.who === 'a' && r.streak.n === 2, r.streak);
ck('average points per meeting is not diluted by two 0-point phantom games',
  r.a.avg === Math.round(((90.78 + 97.5 + 128.36) / 3) * 100) / 100, r.a.avg);

// CONTROL — a genuine 0-x result (one side actually scored zero, the other
// did not) is a real, decided game and must NOT be swept up by the same guard.
const disasterFixture = {
  seasons: [{ season: '2025', owners, weeks: {
    '6': [ row(1, 1, 0), row(2, 1, 45.2) ],   // Cory's whole lineup busted -- a real 0
  } }],
};
const d = H2H.headToHead('100', '200', disasterFixture);
ck('CONTROL — a real 0-x blowout still counts as a played, decided game',
  d.played === 1 && d.b.wins === 1, d);

console.log(`\n${pass}/${pass + fail} h2h-excludes-unplayed-weeks checks passed`);
process.exit(fail ? 1 : 0);

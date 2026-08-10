/* FORWARD-PREDICTION assembler — the committed claims are well-formed and gradeable.
 * Run: node draft/tests/forecast.test.js
 */
'use strict';
const F = require('../../public/js/draft/forecast.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const row = (id, name, pos, adp, surv) => ({
  player: { player_id: id, name: name, position: pos, adjusted_adp: adp, raw_adp: adp },
  survival_to_next: surv,
});

// A small board, ADP order A<B<C<D<E.
const board = [
  row('A', 'Alpha', 'RB', 1, 0.02),
  row('B', 'Bravo', 'WR', 2, 0.10),
  row('C', 'Charlie', 'RB', 3, 0.40),
  row('D', 'Delta', 'WR', 4, 0.72),
  row('E', 'Echo', 'TE', 5, 0.95),
];

// --- room_seat: simulates R1 by ADP, skips my seats, keys per seat --------------
{
  const fc = F.buildForecasts({ scored: board, myPicks: [3], currentPick: 1, teams: 4, nextPick: null });
  const seats = fc.filter(f => f.payload.key.indexOf('room_seat') === 0);
  check('room_seat predicts each upcoming non-mine R1 seat', seats.length === 3, JSON.stringify(seats.map(s => s.payload.key)));
  check('seat 1 predicted the best-ADP player (Alpha)', seats[0].payload.value === 'A' && seats[0].payload.key === 'room_seat:r1p1');
  check('my own seat (3) is NOT predicted', !seats.some(s => s.payload.key === 'room_seat:r1p3'));
  check('the simulation removes taken players (seat 2 is not Alpha again)',
    seats[1].payload.value !== 'A', JSON.stringify(seats[1].payload));
  check('room_seat is categorical with a resolution rule', seats[0].payload.ftype === 'categorical' && !!seats[0].payload.resolution_rule);
}

// --- room_seat skips seats already passed --------------------------------------
{
  const fc = F.buildForecasts({ scored: board, myPicks: [], currentPick: 3, teams: 4, nextPick: null });
  const seats = fc.filter(f => f.payload.key.indexOf('room_seat') === 0);
  check('seats before the current pick are not predicted', !seats.some(s => /r1p1|r1p2/.test(s.payload.key)));
  check('the current + later seats ARE predicted', seats.some(s => s.payload.key === 'room_seat:r1p3'));
}

// --- survival: probability keyed to my next pick, top-K -------------------------
{
  const fc = F.buildForecasts({ scored: board, myPicks: [1], currentPick: 1, teams: 4, nextPick: 14, survivalK: 3 });
  const surv = fc.filter(f => f.payload.key.indexOf('survival:') === 0);
  check('survival commits top-K targets', surv.length === 3, String(surv.length));
  check('survival is a probability in [0,1]', surv.every(s => s.payload.ftype === 'probability' && s.payload.value >= 0 && s.payload.value <= 1));
  check('survival is keyed to the specific next pick (grades once)', surv[0].payload.key === 'survival:A@pick14');
  check('survival carries its resolution rule', /undrafted when overall pick 14/.test(surv[0].payload.resolution_rule));
  check('survival value is the model survival_to_next (Alpha 0.02)', surv[0].payload.value === 0.02);
}

// --- no next pick -> no survival forecasts; empty board -> nothing --------------
{
  check('no next pick -> no survival claims', F.survivalForecasts(board.map(b => ({
    player_id: b.player.player_id, name: b.player.name, survival_to_next: b.survival_to_next })), null).length === 0);
  check('empty board -> no forecasts at all', F.buildForecasts({ scored: [], nextPick: 14 }).length === 0);
}

// --- room_seat stops once round 1 is over --------------------------------------
{
  const fc = F.buildForecasts({ scored: board, myPicks: [], currentPick: 25, teams: 10, nextPick: 30 });
  check('past round 1, no room_seat claims (only survival)',
    !fc.some(f => f.payload.key.indexOf('room_seat') === 0));
}

// --- buildResolutions: grade room_seat + survival from the completed draft -------
// Kept in step with the Python forecast_grade.build_resolutions (parallel test).
{
  const forecasts = [
    { payload: { key: 'room_seat:r1p3' } },
    { payload: { key: 'survival:jefferson@pick14' } },
    { payload: { key: 'survival:chase@pick14' } },
    { payload: { key: 'room_seat:r1p9' } },   // pick 9 not in draft -> pending
  ];
  const draft = { picks: [
    { overall: 3, player_id: 'mcbride' },
    { overall: 10, player_id: 'chase' },
    { overall: 14, player_id: 'someone' },
  ] };
  const res = F.buildResolutions(forecasts, draft);
  const byKey = {};
  res.forEach(r => { byKey[r.payload.forecast_key] = r.payload.outcome; });
  check('room_seat resolves to who ACTUALLY went at that seat', byKey['room_seat:r1p3'] === 'mcbride');
  check('survival=1 when the target was undrafted at the pick', byKey['survival:jefferson@pick14'] === 1);
  check('survival=0 when the target was taken before the pick', byKey['survival:chase@pick14'] === 0);
  check('an unreached pick stays PENDING (no fabricated outcome)', !('room_seat:r1p9' in byKey));
}

console.log(`\n${pass}/${pass + fail} forecast checks passed`);
process.exit(fail ? 1 : 0);

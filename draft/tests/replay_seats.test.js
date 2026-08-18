/* replay_seats — the seat-level engine counterfactual must construct a LEGAL
 * roster (its choices stand and deplete), follow history everywhere else,
 * mirror K/DEF, count shadows, and never touch outcome data.
 * Run: node draft/tests/replay_seats.test.js
 */
const RS = require('../backtest/replay_seats.js');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function player(id, pos, proj, adp) {
  return { player_id: id, name: pos + id, position: pos, team: 'XX', bye: 7,
           proj_mean: proj, proj_sd: proj * 0.2, proj_ceiling: proj * 1.3,
           vorp: proj / 10, raw_adp: adp, adjusted_adp: adp,
           adp_sd: 5, adp_source: 'ffc', tier: 1 + Math.floor(adp / 12), tier_drop: 4,
           overall_rank: adp, score: proj, age: 25 };
}
const PLAYERS = [];
['RB', 'WR', 'QB', 'TE'].forEach((pos, pi) => {
  for (let i = 0; i < 24; i++) PLAYERS.push(player(pos + i, pos, 300 - i * 8 - pi * 5, pi * 24 + i + 1));
});
for (let i = 0; i < 12; i++) PLAYERS.push(player('K' + i, 'K', 120 - i, 97 + i));
for (let i = 0; i < 12; i++) PLAYERS.push(player('D' + i, 'DEF', 110 - i, 109 + i));

// 8 rounds x 10 seats; seat 3 takes a K in round 7 and a DEF in round 8 so the
// mirror path is exercised at the replayed seat.
const PICKS = [];
let pn = 1;
const skill = PLAYERS.filter(p => p.position !== 'K' && p.position !== 'DEF');
let si = 0, ki = 0, di = 0;
for (let rd = 1; rd <= 8; rd++) {
  const order = []; for (let s = 1; s <= 10; s++) order.push(s);
  if (rd % 2 === 0) order.reverse();
  order.forEach(slot => {
    let pl;
    if (slot === 3 && rd === 7) pl = PLAYERS.filter(p => p.position === 'K')[ki++];
    else if (slot === 3 && rd === 8) pl = PLAYERS.filter(p => p.position === 'DEF')[di++];
    else pl = skill[si++];
    PICKS.push({ pick_no: pn, round: rd, roster_id: slot,
                 player_id: pl.player_id, is_keeper: pn <= 3 });
    pn++;
  });
}
const BUNDLE = { season: 2024, teams: 10, rounds: 8,
                 roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN','BN'],
                 players: PLAYERS, picks: PICKS, projection_method: 'walk_forward' };

const out = RS.replaySeat(BUNDLE, 3);

const seatPicks = PICKS.filter(p => p.roster_id === 3);
const seatLive = seatPicks.filter(p => !p.is_keeper);
check('one record per non-keeper pick of the replayed seat',
  out.records.length === seatLive.length,
  out.records.length + ' vs ' + seatLive.length);

check('roster = keepers + one player per live pick, no duplicates',
  out.roster.length === seatPicks.length
    && new Set(out.roster).size === out.roster.length,
  out.roster.length + ' vs ' + seatPicks.length);

check('the engine\'s own choices deplete — no player chosen twice',
  new Set(out.records.map(r => r.chosen)).size === out.records.length);

check('K/DEF are mirrored, not decided',
  out.records.filter(r => r.how.indexOf('mirror_') === 0).length === 2
    && out.records.filter(r => r.how.indexOf('mirror_') === 0)
        .every(r => r.chosen === r.actual));

check('engine choices never take a player history had already taken',
  out.records.every(r => {
    const takenBefore = PICKS.filter(p => p.pick_no < r.pick_no
      && p.roster_id !== 3).map(p => String(p.player_id));
    return takenBefore.indexOf(r.chosen) === -1;
  }));

check('no keeper is ever re-drafted',
  out.records.every(r =>
    !PICKS.filter(p => p.is_keeper).some(p => String(p.player_id) === r.chosen)));

check('first_QB_round is recorded and sane',
  out.first_QB_round === null
    || (out.first_QB_round >= 1 && out.first_QB_round <= 8));

check('choice file carries no outcome fields',
  JSON.stringify(out).indexOf('actual_points') === -1
    && JSON.stringify(out).indexOf('weekly') === -1);

// Determinism: same bundle, same seat, byte-identical result.
const again = RS.replaySeat(BUNDLE, 3);
check('deterministic', JSON.stringify(again) === JSON.stringify(out));

// The status-filtered arm: excluded players never become engine choices,
// while HISTORY is never filtered (the room's real picks still happen).
const banned = new Set(out.records.filter(r => r.how === 'engine').map(r => r.chosen));
const filtered = RS.replaySeat(BUNDLE, 3, banned);
check('excluded players are never chosen in the filtered arm',
  filtered.records.filter(r => r.how === 'engine')
    .every(r => !banned.has(r.chosen)));
check('the filtered arm still makes every decision',
  filtered.records.length === out.records.length);

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);

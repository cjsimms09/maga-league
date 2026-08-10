/* OPPONENT POSITIONAL NEEDS (feature C) — pure need computation.
 * Run: node draft/tests/needs.test.js
 */
'use strict';
const N = require('../../public/js/draft/needs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// Our league starters.
const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
const P = (pos, n) => Array.from({ length: n }, (_, i) => ({ player_id: pos + i, position: pos }));

// --- teamNeeds: unfilled dedicated slots + flex ------------------------------
{
  check('an empty roster needs everything', (() => {
    const n = N.teamNeeds([], STARTERS);
    return ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FLEX'].every(p => n.indexOf(p) >= 0);
  })());

  // 1 QB, 2 RB, 2 WR, 1 TE, 1 K, 1 DEF, +1 extra RB for flex -> needs nothing.
  const full = [].concat(P('QB', 1), P('RB', 3), P('WR', 2), P('TE', 1), P('K', 1), P('DEF', 1));
  check('a fully-started roster (with a flex body) needs nothing', N.teamNeeds(full, STARTERS).length === 0,
    JSON.stringify(N.teamNeeds(full, STARTERS)));

  // 1 QB, 2 RB, 2 WR, 1 TE, 1 K, 1 DEF but NO flex surplus -> needs FLEX only.
  const noflex = [].concat(P('QB', 1), P('RB', 2), P('WR', 2), P('TE', 1), P('K', 1), P('DEF', 1));
  check('exactly-starters roster still needs a FLEX body', N.teamNeeds(noflex, STARTERS).join() === 'FLEX',
    JSON.stringify(N.teamNeeds(noflex, STARTERS)));

  // A team with 0 QB needs QB; a team with 1 QB does not.
  check('0 QB -> needs QB', N.teamNeeds([], STARTERS).indexOf('QB') >= 0);
  check('1 QB -> does not need QB', N.teamNeeds(P('QB', 1), STARTERS).indexOf('QB') < 0);
}

// --- leagueNeeds: count of teams still needing each position ------------------
{
  const rosters = {
    1: P('QB', 1),                 // has QB
    2: [],                          // needs QB
    3: [].concat(P('QB', 1), P('RB', 3), P('WR', 2), P('TE', 1), P('K', 1), P('DEF', 1)), // full
  };
  const lg = N.leagueNeeds(rosters, STARTERS);
  check('leagueNeeds counts only teams that still need QB', lg.QB === 1, JSON.stringify(lg));
  check('a full team contributes no needs', (lg.RB || 0) === 2,  // teams 1 and 2 need RB, team 3 does not
    JSON.stringify(lg));
}

// --- needsBeforePick: of the seats before my turn, how many need each pos -----
{
  const rosters = {
    5: [].concat(P('RB', 2), P('WR', 1)),   // needs QB, WR(1 more), TE, K, DEF, maybe flex
    6: P('QB', 1),                           // needs RB, WR, TE, K, DEF, FLEX
    7: [].concat(P('QB', 1), P('RB', 3), P('WR', 2), P('TE', 1), P('K', 1), P('DEF', 1)), // full
  };
  const before = N.needsBeforePick(rosters, STARTERS, [5, 6, 7]);
  check('needsBeforePick counts the seats before my turn', before.n === 3);
  check('RB need among those seats is counted (seat 6 needs RB, seat 5/7 do not)',
    before.byPos.RB === 1, JSON.stringify(before.byPos));
  check('per-team need sets are exposed for the row cross-ref', Array.isArray(before.perTeam[6]));

  const lg = N.leagueNeeds(rosters, STARTERS);
  const pr = N.pressure(before, lg, 10);
  check('pressure ranks imminent (before-pick) demand first',
    pr.length > 0 && pr[0].before >= (pr[pr.length - 1].before), JSON.stringify(pr.slice(0, 3)));
}

console.log(`\n${pass}/${pass + fail} needs checks passed`);
process.exit(fail ? 1 : 0);

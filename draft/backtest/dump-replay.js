/* Dump the replay's per-pick policy choices for the replay->money bridge.
 *
 * Runs replaySeason over every bundle (the SAME function run.js uses — no
 * second replay implementation) and writes just what the bridge needs: for each
 * season, each non-keeper pick's seat, the historical player taken, and every
 * policy's counterfactual choice on that exact board. The bridge (bridge.py)
 * reconstructs per-policy seat rosters from this and money-grades them.
 *
 * Run: node draft/backtest/dump-replay.js [--in bundles.json] [--out replay-records.json]
 */
'use strict';
const fs = require('fs'), path = require('path');
const R = require('./replay.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const IN = arg('in', path.join(__dirname, 'bundles.json'));
const OUT = arg('out', path.join(__dirname, 'replay-records.json'));

const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
const bundles = input.bundles || [];
if (!bundles.length) { console.error('no bundles in ' + IN); process.exit(1); }

/* ROSTER-AWARE policy replay (the second CI run's lesson): the per-pick ghost
 * choices structurally under-fill rosters — an argmax policy re-picks the same
 * still-available favorite until history removes him (B3 landed 5 distinct
 * players in 15 picks). For ROSTER-level money-grading, each policy at each
 * seat must draft like a Phase-H shadow: from the board as history left it,
 * MINUS its own previous picks, with its own roster as context. */
function rosterAware(bundle, policyKey) {
  const E = require('../../public/js/draft/engine.js');
  const teams = bundle.teams || 10;
  const picks = (bundle.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
  const totalPicks = picks.length;
  const players = bundle.players || [];
  const starters = {};
  (bundle.roster_positions || []).forEach(s => {
    if (s === 'BN' || s === 'IR' || s === 'TAXI') return;
    starters[s] = (starters[s] || 0) + 1;
  });
  const league = { teams, starters, roster_slots: Object.assign({}, starters) };
  const byId = {};
  players.forEach(p => { byId[String(p.player_id)] = p; });

  const seats = [...new Set(picks.map(p => p.roster_id))];
  const out = {};
  for (const seat of seats) {
    const mine = new Set();
    const roster = [];
    // Keepers seed the seat's roster, same as history.
    picks.filter(p => p.is_keeper && p.roster_id === seat).forEach(p => {
      mine.add(String(p.player_id));
      const pl = byId[String(p.player_id)];
      if (pl) roster.push(pl);
    });
    const taken = new Set(picks.filter(p => p.is_keeper).map(p => String(p.player_id)));
    const chosen = [];
    for (const pick of picks) {
      if (pick.is_keeper) continue;
      if (pick.roster_id === seat) {
        const board = players.filter(p => !taken.has(String(p.player_id))
                                       && !mine.has(String(p.player_id)));
        if (board.length) {
          let nextPick = null;
          for (const q of picks) {
            if (q.pick_no > pick.pick_no && q.roster_id === seat && !q.is_keeper) {
              nextPick = q.pick_no; break;
            }
          }
          const ctx = { board, currentPick: pick.pick_no,
            nextPick: nextPick || pick.pick_no + teams, totalPicks,
            myPicksLeft: picks.filter(q => q.roster_id === seat && q.pick_no >= pick.pick_no && !q.is_keeper).length,
            roster, league, weights: E.DEFAULT_WEIGHTS,
            runMultipliers: {}, intervening: [],
            roundsLeft: Math.max(1, (bundle.rounds || 15) - (pick.round || 1) + 1) };
          const c = R.POLICIES[policyKey](board, ctx);
          if (c) {
            mine.add(String(c.player_id));
            roster.push(c);
            chosen.push(String(c.player_id));
          }
        }
      }
      // History advances regardless — the rest of the room drafted around us.
      taken.add(String(pick.player_id));
    }
    out[String(seat)] = chosen;
  }
  return out;
}

const AWARE_POLICIES = ['B0', 'B3'];
const seasons = {};
for (const b of bundles) {
  const rep = R.replaySeason(b);
  const aware = {};
  for (const pk of AWARE_POLICIES) aware[pk] = rosterAware(b, pk);
  seasons[String(b.season)] = {
    season: b.season,
    // Keepers per seat come from the bundle's pick stream — a policy's seat
    // roster starts from the same keepers history gave that seat.
    keepers: (b.picks || []).filter(p => p.is_keeper)
      .map(p => ({ roster_id: p.roster_id, player_id: String(p.player_id) })),
    records: rep.records.map(r => ({
      pick_no: r.pick_no, round: r.round, roster_id: r.roster_id,
      actual: r.actual, choices: r.choices,
    })),
    // {policy: {roster_id: [distinct player_ids drafted roster-aware]}}
    roster_aware: aware,
    projection_method: rep.projection_method,
  };
}

fs.writeFileSync(OUT, JSON.stringify({ seasons }, null, 0));
const n = Object.values(seasons).reduce((s, x) => s + x.records.length, 0);
console.log('wrote ' + OUT + ' — ' + Object.keys(seasons).length + ' seasons, ' + n + ' decision records');

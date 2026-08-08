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

const seasons = {};
for (const b of bundles) {
  const rep = R.replaySeason(b);
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
    projection_method: rep.projection_method,
  };
}

fs.writeFileSync(OUT, JSON.stringify({ seasons }, null, 0));
const n = Object.values(seasons).reduce((s, x) => s + x.records.length, 0);
console.log('wrote ' + OUT + ' — ' + Object.keys(seasons).length + ' seasons, ' + n + ' decision records');

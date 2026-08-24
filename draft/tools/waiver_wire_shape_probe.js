// TERRITORY: E
/* THE WAIVER PAGE SHOWS EIGHT CLAIMS. ON CORY'S ROSTER ALL EIGHT ARE KICKERS.
 *
 * `src/waiver_reco.js:58` — `res.claims.filter(c => c.net_value > 0).slice(0, 8)`
 * — is what `member.js` renders as *"What the wire would add"*. `evaluateClaims`
 * sorts on `net_value`, which is lineup points gained. Cory drafted no kicker
 * (register 275), so EVERY free kicker fills a slot that currently scores zero
 * and books his ENTIRE season projection as the gain. Thirty-three of them
 * outrank the best non-kicker on the wire.
 *
 * The arithmetic is right and the ranking is useless: he can start one kicker,
 * so the list presents ONE decision thirty-three times and pushes the second
 * decision off the page. Kickers already have their own section
 * (`out.streamClaims`, K/DEF only), so the top two appear twice on one page
 * while the tight-end upgrade — the largest positional hole on any roster in
 * this league — never renders at all.
 *
 * REPORT ONLY. Reads the committed board and pick log; writes nothing.
 *
 * Run: node draft/tools/waiver_wire_shape_probe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const W = require(path.join(ROOT, 'src', 'routes', 'waivers.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const LOG = fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

/* `src/waiver_reco.js:58`. Restated here because this file cannot import a
 * local inside that function; if that line changes, this number is stale and
 * the control below says so out loud rather than quietly comparing the wrong
 * window. */
const SHOWN = 8;

const fails = [];
const pad = (x, n) => { x = String(x); return x + ' '.repeat(Math.max(0, n - x.length)); };
const ok = (n, c, d) => { console.log('  ' + n + ' ' + pad(d, 66) + (c ? 'OK' : '*** FAILED ***')); if (!c) fails.push(n); };

const avail = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const byId = {};
avail.concat(DATA.kept_players || []).forEach(p => { byId[String(p.player_id)] = p; });
const taken = new Set(LOG.map(r => String(r.player_id)));

/* `is_mine` is FALSE on all 150 rows of the committed log — register 264, fixed
 * in code and deliberately never backfilled. That row names the working field:
 * `team_slot`. Seat read from config, never typed. */
const MY_SLOT = Number(CFG.my_draft_slot);
const enrich = p => ({ player_id: String(p.player_id), name: p.name, position: p.position,
                       proj_mean: p.proj_mean, bye: p.bye, vorp: p.vorp || 0 });
const roster = LOG.filter(r => Number(r.team_slot) === MY_SLOT)
  .map(r => byId[String(r.player_id)]).filter(Boolean).map(enrich);
const freeAgents = avail.filter(p => !taken.has(String(p.player_id))).map(enrich);

function shape(rows) {
  const m = {};
  rows.forEach(p => { m[p.position] = (m[p.position] || 0) + 1; });
  return m;
}

console.log('CONTROLS');
ok('C1', roster.length === 15, 'roster at seat ' + MY_SLOT + ' from the pick log = ' + roster.length + ' (want 15)');
ok('C2', !roster.some(p => p.position === 'K'),
   'precondition: the roster has NO kicker — ' + JSON.stringify(shape(roster)));

const live = W.evaluateClaims(freeAgents, roster, DATA.league, {});
const shown = live.claims.filter(c => c.net_value > 0).slice(0, SHOWN);

/* C3 IS THE ONE THAT MATTERS. If the flood is caused by the empty slot, then
 * handing the roster ONE kicker must clear it. If it does not, my explanation is
 * wrong and every number below is void — a probe that only ever demonstrates the
 * symptom has not identified a cause. */
const bestK = freeAgents.filter(p => p.position === 'K')
  .sort((a, b) => b.proj_mean - a.proj_mean)[0];
const withK = W.evaluateClaims(freeAgents.filter(p => p.player_id !== bestK.player_id),
  roster.concat([bestK]), DATA.league, {});
const shownWithK = withK.claims.filter(c => c.net_value > 0).slice(0, SHOWN);
const kNow = shown.filter(c => c.position === 'K').length;
const kThen = shownWithK.filter(c => c.position === 'K').length;
ok('C3', kNow === SHOWN && kThen < SHOWN,
   'give him one kicker and the flood clears: ' + kNow + '/' + SHOWN + ' -> ' + kThen + '/' + SHOWN);

if (fails.length) { console.log('\n*** ' + fails.length + ' control(s) failed — output void ***'); process.exit(1); }

console.log('\nWHAT THE PAGE RENDERS TODAY (src/waiver_reco.js:58, top ' + SHOWN + ' with net_value > 0)');
shown.forEach((c, i) => console.log('  ' + pad(i + 1, 4) + pad(c.position + ' ' + c.name, 26)
  + pad('net ' + c.net_value, 13) + pad('startable ' + c.startable_value, 20) + (c.fills || '')));

const firstNonK = live.claims.findIndex(c => c.position !== 'K');
const kBlock = live.claims.slice(0, firstNonK).filter(c => c.position === 'K').length;
console.log('\n  ' + kBlock + ' consecutive kickers before the first non-kicker.');
console.log('  first non-kicker: rank ' + (firstNonK + 1) + ' — '
  + live.claims[firstNonK].position + ' ' + live.claims[firstNonK].name
  + ', net ' + live.claims[firstNonK].net_value);

const worstShown = live.claims.slice(0, firstNonK)
  .reduce((m, c) => Math.min(m, c.startable_value), Infinity);
console.log('  the weakest of those kickers is ' + worstShown + ' BELOW replacement,');
console.log('  and still outranks a +' + live.claims[firstNonK].net_value + ' upgrade.');

console.log('\n  AND THE TOP TWO APPEAR TWICE: `out.streamClaims` is the same ranking');
console.log('  filtered to K/DEF, so ' + live.claims.slice(0, 2).map(c => c.name).join(' and ')
  + ' render in both blocks on one page.');

console.log('\nWHAT IT WOULD RENDER WITH K/DEF EXCLUDED FROM THE CLAIMS BLOCK');
live.claims.filter(c => c.position !== 'K' && c.position !== 'DEF' && c.net_value > 0)
  .slice(0, SHOWN)
  .forEach((c, i) => console.log('  ' + pad(i + 1, 4) + pad(c.position + ' ' + c.name, 26)
    + pad('net ' + c.net_value, 13) + (c.fills || '')));

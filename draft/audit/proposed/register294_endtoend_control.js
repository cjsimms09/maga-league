/* END-TO-END CONTROL for register 294's patch: drive the REAL
 * computeWaiverReco with Cory's real post-draft roster and check what the
 * page's two blocks contain, before and after.
 *
 * The bundle is synthesised from committed data (pick log + board), NOT from
 * Sleeper — egress is blocked. What matters is that it is the SAME function
 * the page and the Tuesday cron call, not a re-implementation of its filter.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', '..', '..');   // repo root from draft/audit/proposed/
const DATA = JSON.parse(fs.readFileSync(R + '/public/draft_data.json', 'utf8'));
const CFG = JSON.parse(fs.readFileSync(R + '/draft/config/league_config.json', 'utf8'));
const LOG = fs.readFileSync(R + '/draft/data/draft_pick_log_2026.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

const all = DATA.players.concat(DATA.kept_players || []);
const byId = {}; all.forEach(p => { byId[String(p.player_id)] = p; });
const taken = new Set(LOG.map(r => String(r.player_id)));

/* playersDb: every board player, in Sleeper's shape. */
const playersDb = { players: {} };
all.forEach(p => { playersDb.players[String(p.player_id)] = { name: p.name, pos: p.position, bye: p.bye }; });
DATA.players.forEach(p => { playersDb.players[String(p.player_id)] = { name: p.name, pos: p.position, bye: p.bye }; });

/* rosters: one per team slot, from the pick log. */
const bySlot = {};
LOG.forEach(r => { (bySlot[r.team_slot] = bySlot[r.team_slot] || []).push(String(r.player_id)); });
const rosters = Object.keys(bySlot).map(slot => ({ roster_id: Number(slot), players: bySlot[slot] }));
const MY = Number(CFG.my_draft_slot);
const sData = { rosters: rosters,
  league: { total_rosters: 10,
            roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN','BN','BN','BN','BN','BN'] } };

delete require.cache[require.resolve(R + '/src/waiver_reco.js')];
const out = require(R + '/src/waiver_reco.js').computeWaiverReco(sData, playersDb, DATA, MY, 10);
const fmt = l => (l || []).map(c => c.position + ' ' + c.name).join(' · ') || '(none)';
console.log('  live      : ' + out.live);
console.log('  claims (' + (out.claims || []).length + '): ' + fmt(out.claims));
console.log('  stream (' + (out.streamClaims || []).length + '): ' + fmt(out.streamClaims));
console.log('  drop      : ' + (out.drop ? out.drop.name : '—'));
const kInClaims = (out.claims || []).filter(c => c.position === 'K' || c.position === 'DEF').length;
console.log('  onesies in the claims block: ' + kInClaims);

// TERRITORY: relay/B (register 294, 2026-08-24)
/* THE CLAIMS BLOCK IS FOR REAL UPGRADES, NOT WHICHEVER POSITION HE HAS ZERO
 * OF. `evaluateClaims` sorts on `net_value` — lineup points gained — and an
 * EMPTY starting slot books a candidate's whole season projection as the
 * gain, so every free player at an unfilled position outranks every real
 * upgrade at a filled one. Cory drafted no kicker: on his real post-draft
 * roster this put eight kickers in the eight-slot claims block, in order,
 * with the tight-end upgrade (the largest positional hole on any roster in
 * this league) sitting at rank 34, invisible.
 *
 * Filed by E as register 294, with a proposed patch and its own end-to-end
 * control (`draft/audit/proposed/register294_endtoend_control.js`) driving
 * the REAL `computeWaiverReco` against Cory's real committed roster — not a
 * re-implementation of the filter, the same function the page and the
 * Tuesday cron both call. Independently re-verified before applying (Rule
 * 3f): 8/8 claims were kickers before, 0/8 after, streamClaims unchanged.
 *
 * This pins it as a permanent regression check, using the same real-roster
 * derivation so a future change to the ranking or the filter can't quietly
 * let onesies flood the block again.
 *
 * Run: node draft/tests/waiver_claims_exclude_onesies.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── Drive the REAL computeWaiverReco against Cory's real committed roster,
// the same inputs register 294's own control used, not a synthetic fixture
// that could accidentally dodge the defect. ─────────────────────────────
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const LOG = fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

const all = DATA.players.concat(DATA.kept_players || []);
const playersDb = { players: {} };
all.forEach(p => { playersDb.players[String(p.player_id)] = { name: p.name, pos: p.position, bye: p.bye }; });
DATA.players.forEach(p => { playersDb.players[String(p.player_id)] = { name: p.name, pos: p.position, bye: p.bye }; });

const bySlot = {};
LOG.forEach(r => { (bySlot[r.team_slot] = bySlot[r.team_slot] || []).push(String(r.player_id)); });
const rosters = Object.keys(bySlot).map(slot => ({ roster_id: Number(slot), players: bySlot[slot] }));
const MY = Number(CFG.my_draft_slot);
const sData = {
  rosters,
  league: {
    total_rosters: 10,
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
  },
};

const { computeWaiverReco } = require(path.join(ROOT, 'src', 'waiver_reco.js'));
const out = computeWaiverReco(sData, playersDb, DATA, MY, 10);

ck('CONTROL — the wire is live for this roster (the whole test is meaningless otherwise)', out.live === true);
ck('CONTROL — the claims block actually has entries (an empty block would pass the exclusion trivially)',
  Array.isArray(out.claims) && out.claims.length > 0, out.claims && out.claims.length);

const onesiesInClaims = (out.claims || []).filter(c => c.position === 'K' || c.position === 'DEF');
ck('no K or DEF in the claims block', onesiesInClaims.length === 0,
  onesiesInClaims.map(c => c.position + ' ' + c.name));

const nonOnesiePositions = new Set((out.claims || []).map(c => c.position));
ck('the claims block is now positions other than K/DEF (a real upgrade, on his roster: TE)',
  nonOnesiePositions.size > 0 && ![...nonOnesiePositions].every(p => p === 'K' || p === 'DEF'),
  [...nonOnesiePositions]);

ck('streamClaims still exists and still only holds K/DEF (the filter moved them, did not delete them)',
  Array.isArray(out.streamClaims) && out.streamClaims.length > 0
    && out.streamClaims.every(c => c.position === 'K' || c.position === 'DEF'),
  out.streamClaims);

// The exact drop candidate must be untouched — this is a filter on WHICH
// claims render, never a change to the valuation or the recommended drop.
ck('the recommended drop is unchanged by the claims-block filter', out.drop && out.drop.name === 'Emmett Johnson',
  out.drop);

console.log(`\n${pass}/${pass + fail} waiver-claims-exclude-onesies checks passed`);
if (fail) process.exit(1);

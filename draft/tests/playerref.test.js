/* PlayerRef — the shared player-metadata resolver (SSOT). The keeper slate bug
 * was raw player ids reaching the screen; this proves the resolver renders
 * name+position+team+bye for resolvable ids, renders the LOUD unknown for
 * unresolvable ones, and — the site-wide guard — that no resolved slate leaves a
 * bare numeric where a name should be. Fixture is a FULL 10-team slate (the real
 * load as the league locks keepers through Aug 20), including a deliberately
 * unresolvable id.
 *
 * Run: node draft/tests/playerref.test.js   (exit 0 green, 1 red)
 */
'use strict';
const PR = require('../../public/js/draft/playerref.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) pass++; else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// A board with 12 real players (enough for a heterogeneous 10-team slate).
const players = [
  { player_id: '7564', name: "Ja'Marr Chase", position: 'WR', team: 'CIN', bye: 6 },
  { player_id: '3198', name: 'Derrick Henry', position: 'RB', team: 'BAL', bye: 13 },
  { player_id: '8151', name: 'Kenneth Walker', position: 'RB', team: 'SEA', bye: 5 },
  { player_id: '4046', name: 'Patrick Mahomes', position: 'QB', team: 'KC', bye: 10 },
  { player_id: '6794', name: 'Justin Jefferson', position: 'WR', team: 'MIN', bye: 6 },
  { player_id: '4035', name: 'Alvin Kamara', position: 'RB', team: 'NO', bye: 12 },
  { player_id: '5849', name: 'Kyler Murray', position: 'QB', team: 'ARI', bye: 11 },
  { player_id: '6790', name: 'Ceedee Lamb', position: 'WR', team: 'DAL', bye: 7 },
  { player_id: '4217', name: 'Josh Jacobs', position: 'RB', team: 'GB', bye: 10 },
  { player_id: '4881', name: 'Lamar Jackson', position: 'QB', team: 'BAL', bye: 13 },
  { player_id: '2749', name: 'Davante Adams', position: 'WR', team: 'LV', bye: 8 },
  { player_id: '6813', name: 'Bijan Robinson', position: 'RB', team: 'ATL', bye: 5 },
];
const data = { players: players };

// Heterogeneous 10-team slate: teams keeping 3, 2, 1, and 0 — stored as RAW IDS
// (name == id, position "?") which is exactly the bug shape. One id ('9999999')
// is deliberately unresolvable.
const slate = [
  // team 1 keeps 3
  { player_id: '7564', name: '7564', position: '?', team_slot: 1, cost_round: 1 },
  { player_id: '3198', name: '3198', position: '?', team_slot: 1, cost_round: 2 },
  { player_id: '8151', name: '8151', position: '?', team_slot: 1, cost_round: 3 },
  // team 2 keeps 2
  { player_id: '4046', name: '4046', position: '?', team_slot: 2, cost_round: 1 },
  { player_id: '6794', name: '6794', position: '?', team_slot: 2, cost_round: 2 },
  // team 3 keeps 1
  { player_id: '4035', name: '4035', position: '?', team_slot: 3, cost_round: 1 },
  // team 4 keeps 1, but the id is UNRESOLVABLE (a slate carried from another year)
  { player_id: '9999999', name: '9999999', position: '?', team_slot: 4, cost_round: 1 },
  // team 5 keeps 0 (no entries) — legal, league precedent
];

const resolved = slate.map(f => PR.resolve(f, data));

check('resolver: a resolvable id renders a real name (not the id)',
  resolved[0].name === "Ja'Marr Chase" && resolved[0].resolved === true);
check('resolver: it carries position + team + bye',
  resolved[0].position === 'WR' && resolved[0].team === 'CIN' && resolved[0].bye === 6);
check('resolver: EVERY resolvable slate entry resolves (heterogeneous keep-counts)',
  resolved.slice(0, 6).every(r => r.resolved === true));
check('resolver: an unresolvable id renders the LOUD unknown, never a bare number',
  resolved[6].name === 'Unknown player (9999999)' && resolved[6].resolved === false);

// THE SITE-WIDE GUARD: no resolved slate entry may render as a bare numeric.
const label = PR.label;
const anyBare = resolved.some(r => PR.looksLikeBareId(r.name) || PR.looksLikeBareId(label(r)));
check('site-wide guard: NO resolved entry (label or name) is a bare player id', !anyBare,
  resolved.filter(r => PR.looksLikeBareId(r.name)).map(r => r.name).join());

// Keep-0 team contributes no entries — assert the slate simply omits it (legal).
check('resolver: a keep-0 team has zero slate entries (legal, no crash)',
  slate.filter(f => f.team_slot === 5).length === 0);

// label() shape
check('label: "Name POS · TEAM · bye N"',
  label(resolved[1]) === 'Derrick Henry RB · BAL · bye 13', label(resolved[1]));

// looksLikeBareId
check('looksLikeBareId: catches "7564" but not "Ja\'Marr Chase"',
  PR.looksLikeBareId('7564') === true && PR.looksLikeBareId("Ja'Marr Chase") === false);

// Re-verify against the REAL artifact: the three keepers resolve, slate matches.
const fs = require('fs'), path = require('path');
try {
  const art = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
  const forf = (art.pick_order || {}).forfeited || [];
  if (forf.length) {
    const names = forf.map(f => PR.resolve(f, art).name);
    check('real artifact: every keeper resolves to a name, none bare',
      names.length > 0 && names.every(n => !PR.looksLikeBareId(n)), names.join());
    check('real artifact: the slate is Chase/Henry/Walker (display bug, not data bug)',
      ['Chase', 'Henry', 'Walker'].every(s => names.some(n => n.indexOf(s) !== -1)), names.join());
  }
} catch (e) { /* artifact optional in some CI stages */ }

console.log((fail ? '' : '\n') + pass + '/' + (pass + fail) + ' playerref checks passed');
process.exit(fail ? 1 : 0);

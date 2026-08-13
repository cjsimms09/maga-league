// TERRITORY: A
/* WHO THE BOARD COULD NOT RANK, CAPTURED BEFORE THE SEASON.
 *
 * 1181 of 1759 players carry proj_mean 0 — absence written as a number. The
 * engine now refuses them (unprojected_refused.test.js). THAT DECISION IS
 * UNGRADEABLE UNLESS THE LIST EXISTS, and it is perishable: once week 1 lands
 * the projections update and nobody can reconstruct who was unprojected in
 * August. Cheap now, impossible later.
 *
 * TWO USES, and the second is the one that matters:
 *   · a watchlist — players with no August number who earn one by October;
 *   · THE CONTROL GROUP. If we later claim the board was right to ignore these
 *     1181, the honest test is how many of them finished top-24 at their
 *     position. Without this file that claim can never be checked, only
 *     asserted, which is the failure this whole program has been chasing.
 *
 * IT RECORDS, IT DOES NOT JUDGE. No scores, no ranking, no prediction — a list,
 * a date and a board digest, so a January reader knows exactly which board this
 * was true of.
 *
 * Run:  node draft/tools/unprojected_snapshot.js            (print)
 *       node draft/tools/unprojected_snapshot.js --write    (save)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'draft', 'data', 'unprojected_snapshot.json');

const raw = fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'));
const sha = crypto.createHash('sha256').update(raw).digest('hex');
const d = JSON.parse(raw);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : null));

const zero = d.players
  .filter(p => p.proj_mean != null && Number(p.proj_mean) === 0)
  .map(p => ({ player_id: String(p.player_id), name: p.name, position: p.position,
               team: p.team || null, adp: adpOf(p), vorp: p.vorp }));

/* THE POSITION CONSTANT IS RECORDED because it is the evidence that these are
 * absent rather than bad: every unprojected WR shares one vorp. A future reader
 * comparing this file to a fixed board should see this collapse disappear. */
const byPos = {};
zero.forEach(p => {
  const b = byPos[p.position] = byPos[p.position] || { n: 0, vorp_values: {} };
  b.n++; b.vorp_values[Math.round((p.vorp || 0) * 10) / 10] = true;
});
Object.keys(byPos).forEach(k => {
  byPos[k].distinct_vorp = Object.keys(byPos[k].vorp_values).length;
  byPos[k].vorp_values = Object.keys(byPos[k].vorp_values).map(Number);
});

const doc = {
  _what: 'Players the board could not rank, as of the stamp below. Absence, not badness.',
  _why: 'Captured before the season because it cannot be reconstructed after. The '
    + 'control group for "the board was right to ignore them".',
  _how_to_grade: 'In January, join on player_id against realized season points and '
    + 'count how many finished top-24 at their position. A non-trivial count means '
    + 'the refusal cost real players and ingest coverage is the fix, not the engine.',
  captured_at: (d.built_at || null),
  board_sha256: sha,
  board_built_at: d.built_at || null,
  board_players: d.players.length,
  unprojected: zero.length,
  projected: d.players.length - zero.length,
  inside_adp_250: zero.filter(p => p.adp != null && p.adp <= 250)
    .sort((a, b) => a.adp - b.adp),
  by_position: byPos,
  players: zero.sort((a, b) => (a.adp == null ? 1e9 : a.adp) - (b.adp == null ? 1e9 : b.adp)),
};

if (process.argv.includes('--write')) {
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
  console.log('wrote ' + OUT + '  (' + zero.length + ' players)');
} else {
  console.log('UNPROJECTED SNAPSHOT — not written (pass --write)\n');
  console.log('  board            ' + doc.board_sha256.slice(0, 12) + '  built ' + doc.board_built_at);
  console.log('  unprojected      ' + doc.unprojected + ' of ' + doc.board_players);
  console.log('  inside ADP 250   ' + doc.inside_adp_250.length);
  doc.inside_adp_250.forEach(p => console.log('     adp ' + p.adp + '  ' + p.position + '  ' + p.name));
  console.log('\n  by position (distinct vorp values — 1 means indistinguishable):');
  Object.keys(byPos).sort().forEach(k => console.log('     ' + k.padEnd(5)
    + String(byPos[k].n).padStart(4) + ' players, ' + byPos[k].distinct_vorp + ' distinct vorp'));
}

// TERRITORY: A
/* Pre-draft snapshot of the roster-builder model, so B can render the panel
 * without wiring live state first. Recompute live with public/js/draft/mlv.js.
 * REPORT ONLY. Writes public/mlv_recommend.json. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const M = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const keepers = PLAN.keep.map(k => ({ name: k.name, position: k.position, proj_mean: k.proj_mean }));
const board = BOARD.players.filter(p => p.proj_mean > 0 && p.adp != null);
const recs = M.recommend(board, keepers, { league: BOARD.league, topN: 10 });
const doc = {
  _territory: 'TERRITORY: A — draft/tools/mlv_snapshot.js',
  _what: 'ROSTER BUILDER MODEL says — marginal lineup value, a SECOND VOICE '
       + 'beside the war room board, never a replacement for it.',
  _ruling: 'Cory 2026-08-19: "Let\'s use mlv... it needs to be clear what player '
         + 'model is recommending and why and I still want to retain my current view."',
  evidence: M.EVIDENCE,
  roster_assumed: keepers.map(k => k.name + ' (' + k.position + ')'),
  recommendations: recs.map(r => ({ name: r.player.name, position: r.position,
    adp: r.player.adp, proj: r.player.proj_mean, marginal: r.marginal, why: r.why })),
};
fs.writeFileSync(path.join(ROOT, 'public', 'mlv_recommend.json'), JSON.stringify(doc, null, 1));
console.log('ROSTER BUILDER MODEL SAYS — pre-draft, holding ' + keepers.map(k => k.position).join('/') + '\n');
recs.forEach(r => console.log('  ' + r.player.name.slice(0, 22).padEnd(24) + r.position.padStart(4)
  + '  ADP ' + String(Math.round(r.player.adp)).padStart(3) + '   +' + String(r.marginal).padStart(6)
  + '   ' + r.why));
console.log('\n  wrote public/mlv_recommend.json');

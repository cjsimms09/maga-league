// TERRITORY: A
/* IS EVERYTHING WE COMPUTE ACTUALLY ON A SCREEN CORY CAN SEE?
 *
 * Cory, 2026-08-20: "All the things we figure out here have to be implemented
 * on the war room or it was all for nothing!!"
 *
 * ── THE FAILURE THIS EXISTS TO MAKE IMPOSSIBLE ──────────────────────────────
 *
 * `attach_draftsharks.py` wrote proj_ds / proj_ds_floor / proj_ds_ceiling onto
 * the board for WEEKS. A grep for proj_ds across every war-room script returned
 * ZERO hits. The data was captured, cleaned, band-corrected, guarded by tests,
 * committed nightly — and no human being could ever see it. I spent hours on
 * 08-19 fixing that file's ranking and band bugs without once asking whether a
 * screen read its output. Cory found it by opening the site.
 *
 * ⚠️ THIS IS NOT A B PROBLEM AND THE MEASUREMENT SAYS SO. B shipped 84 commits
 * in the seven days to 08-20 and closed 71 of 94 routed items, INCLUDING one
 * titled "Resolve duplicate roster-builder panel from A's independent build" —
 * A and B built the same panel twice in the same week. Neither lane was idle.
 * What nobody owned was the JOIN: a thing computed in one lane and displayed in
 * another has no owner at the seam, and the seam is where it dies.
 *
 * So this is a mechanism, not a promise. Every artifact we publish and every
 * field we attach to the board is either READ BY A SURFACE or DECLARED as not
 * for display, with a reason. Silence is no longer an option.
 *
 * ⚠️ WHAT IT CANNOT DO, STATED SO NOBODY READS IT AS MORE THAN IT IS: it proves
 * a field is REFERENCED by a served file. It cannot prove the reference renders,
 * that the panel mounts, or that Cory can find it on a phone. A reference is
 * necessary, not sufficient — panel_spec.js and the panel tests cover the rest.
 * Its own limitation is the thing it is worst at detecting.
 *
 * REPORT ONLY by default. Exit 1 with --strict. Writes draft/data/unshown.json.
 * Run: node draft/tools/nothing_computed_goes_unshown.js [--strict]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const STRICT = process.argv.includes('--strict');

/* Every file a human can actually be shown. */
function surfaces() {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    ents.forEach(e => {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/node_modules|\.git/.test(e.name)) return;
        walk(f, depth + 1);
      } else if (/\.(js|ejs|html)$/.test(e.name)) out.push(f);
    });
  };
  walk(path.join(ROOT, 'views'), 0);
  walk(path.join(PUB, 'js'), 0);
  walk(path.join(ROOT, 'netlify', 'functions'), 0);
  return out;
}

const SURFACES = surfaces();
const CORPUS = SURFACES.map(f => {
  try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; }
}).join('\n');

/* A mention inside a COMMENT is not a display. This is the exact trap this
 * project has hit repeatedly — three separate greps in one session fired on
 * documentation of the very thing being searched for. So comments are stripped
 * before the corpus is searched. */
const CODE = CORPUS
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/<%#[\s\S]*?%>/g, ' ');

function readBy(token) {
  const re = new RegExp('[\'"\\.\\[]' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  return re.test(CODE);
}

/* ── DECLARED NOT-FOR-DISPLAY ────────────────────────────────────────────────
 * A field or artifact may legitimately never reach a screen. It must say so
 * here, with a reason, so "nobody wired it" and "deliberately internal" stop
 * looking identical from the outside. */
const NOT_FOR_DISPLAY = {
  'player_id': 'a join key, not a fact about a player',
  'proj_mean_pre_ds': 'audit trail for the Draft Sharks swap (register 140), not a number Cory reads',
  'proj_floor_pre_ds': 'same audit trail',
  'proj_ceiling_pre_ds': 'same audit trail',
  'proj_mean_source_pre_ds': 'same audit trail',
  'market_upside_2026.json': 'research artifact, read by zero site files — measured, not assumed',
  'draft_day_consistency.json': 'a CI report about the board, not a board surface',
  'unshown.json': 'this tool\'s own output',
};

/* ── BOARD FIELDS ───────────────────────────────────────────────────────────
 * Only fields that carry INFORMATION about a player are in scope. Provenance
 * strings and counts are checked too, because "we recorded where this came
 * from and never showed it" is the same failure in a smaller coat. */
const BOARD = JSON.parse(fs.readFileSync(path.join(PUB, 'draft_data.json'), 'utf8'));
const fieldCounts = {};
BOARD.players.forEach(p => {
  Object.keys(p).forEach(k => { fieldCounts[k] = (fieldCounts[k] || 0) + 1; });
});

const fields = Object.keys(fieldCounts).sort().map(k => ({
  name: k,
  on_players: fieldCounts[k],
  coverage_pct: Math.round(1000 * fieldCounts[k] / BOARD.players.length) / 10,
  shown: readBy(k),
  declared: NOT_FOR_DISPLAY[k] || null,
}));

/* ── PUBLISHED ARTIFACTS ────────────────────────────────────────────────────*/
const artifacts = fs.readdirSync(PUB)
  .filter(f => f.endsWith('.json'))
  .sort()
  .map(f => ({
    name: f,
    kb: Math.round(fs.statSync(path.join(PUB, f)).size / 1024),
    shown: new RegExp('[\'"/]' + f.replace('.', '\\.')).test(CODE),
    declared: NOT_FOR_DISPLAY[f] || null,
  }));

const unshownFields = fields.filter(f => !f.shown && !f.declared);
const unshownArtifacts = artifacts.filter(a => !a.shown && !a.declared);

const doc = {
  _territory: 'TERRITORY: A — draft/tools/nothing_computed_goes_unshown.js',
  _what: 'Every board field and published artifact, and whether ANY served file '
       + 'references it. Cory: "All the things we figure out here have to be '
       + 'implemented on the war room or it was all for nothing."',
  _cannot: 'Proves a REFERENCE exists in a served file. Does NOT prove it renders, '
         + 'that the panel mounts, or that Cory can find it. Necessary, not sufficient.',
  _comments_stripped: true,
  surfaces_scanned: SURFACES.length,
  board_fields: fields.length,
  unshown_fields: unshownFields,
  unshown_artifacts: unshownArtifacts,
  declared_not_for_display: NOT_FOR_DISPLAY,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'unshown.json'), JSON.stringify(doc, null, 1));

console.log('\n  IS EVERYTHING WE COMPUTE ON A SCREEN?\n');
console.log('  ' + SURFACES.length + ' served files scanned (comments stripped), '
  + fields.length + ' board fields, ' + artifacts.length + ' published artifacts\n');

if (unshownArtifacts.length) {
  console.log('  ❌ ARTIFACTS NOTHING READS — we build and publish these every night:');
  unshownArtifacts.forEach(a => console.log('     ' + a.name.padEnd(38) + a.kb + ' KB'));
  console.log('');
}
if (unshownFields.length) {
  console.log('  ❌ BOARD FIELDS NO SCREEN SHOWS — computed, committed, invisible:');
  unshownFields.forEach(f => console.log('     ' + f.name.padEnd(30)
    + String(f.on_players).padStart(4) + ' players (' + f.coverage_pct + '%)'));
  console.log('');
}
if (!unshownFields.length && !unshownArtifacts.length) {
  console.log('  ✅ every board field and published artifact is referenced by a surface.\n');
}
console.log('  wrote draft/data/unshown.json');
if (STRICT && (unshownFields.length || unshownArtifacts.length)) {
  console.log('\n  --strict: failing. Wire it, or declare it in NOT_FOR_DISPLAY with a reason.');
  process.exit(1);
}

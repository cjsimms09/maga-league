/* ITEM 9, SUB-CLASS TWO / ITEM 14: A FIELD THE CODE READS THAT NOTHING WRITES.
 *
 * `games_missed_3yr` is read at engine.js:627 and written by NOTHING — not by
 * production, not by any harness, not by any fixture. `undefined >= 8` is false,
 * so the durability clause has never fired for any player in any run, silently.
 * Cory: "three risk clauses fire and the fourth silently does not the moment
 * risk gets a weight."
 *
 * That is the self-description class again: the code says it prices durability
 * and it does not. So this sweeps for the shape rather than fixing the one
 * instance — every `player.X` / `p.X` the draft modules read, checked against
 * the fields the LIVE BOARD actually supplies.
 *
 * IT REPORTS, IT DOES NOT GUESS. A field absent from the board is not
 * automatically a defect: it may be supplied by a caller, or be a legitimately
 * optional signal. The output separates "never supplied by anything" from
 * "supplied by the board" so the judgement is visible rather than assumed.
 *
 * Run: node draft/tools/orphan_field_sweep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'public', 'js', 'draft');

const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const supplied = new Set();
(board.players || []).forEach(p => Object.keys(p).forEach(k => supplied.add(k)));
(board.kept_players || []).forEach(p => Object.keys(p).forEach(k => supplied.add(k)));

/* Strip comments and strings first — every source scan written in this repo was
 * fooled by one or the other before it was right (rule 11e). */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => '\n'.repeat((m.match(/\n/g) || []).length))
    .replace(/^(.*?)\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

const MODULES = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js'));
const reads = {};                       // field -> [file:line]
MODULES.forEach(f => {
  const src = code(fs.readFileSync(path.join(JS_DIR, f), 'utf8'));
  src.split('\n').forEach((line, i) => {
    /* ONLY `player.X`. The first version also matched `p.X`, `entry.X` and
     * `row.X` and returned 29 "orphans" — almost all of them fields on PICKS,
     * ROSTER ROWS and OVERRIDE RECORDS, which are different objects with
     * different shapes. A sweep whose hits are mostly false is not a sweep, it
     * is a list somebody has to re-derive by hand, and the count it reports is
     * meaningless. `player` is the one identifier that unambiguously denotes a
     * board row in these modules. */
    const re = /\bplayer\.([a-z_][a-z0-9_]*)\b/g;
    let m;
    while ((m = re.exec(line))) {
      const k = m[1];
      (reads[k] = reads[k] || []).push(f + ':' + (i + 1));
    }
  });
});

/* Names that are plainly not board fields: local helpers, method calls and
 * generic object plumbing. Listed rather than pattern-matched so the exclusion
 * is auditable — a silent exclusion is how a sweep reports a clean board it
 * never actually checked. */
const NOT_BOARD_FIELDS = new Set([
  'length', 'name', 'push', 'map', 'filter', 'forEach', 'slice', 'sort', 'find',
  'indexOf', 'join', 'concat', 'reduce', 'some', 'every', 'toFixed', 'includes',
  'score', 'components', 'reasons', 'context', 'rails', 'player', 'value', 'why',
  'key', 'label', 'pos', 'week', 'count', 'blind', 'members', 'pick', 'cliff',
  'split', 'replace', 'test', 'trim', 'keys', 'values', 'entries', 'toString',
  'starters', 'roster', 'board', 'league', 'weights', 'id', 'slot', 'total',
]);

const orphans = [];
Object.keys(reads).sort().forEach(k => {
  if (NOT_BOARD_FIELDS.has(k) || supplied.has(k)) return;
  orphans.push({ field: k, sites: [...new Set(reads[k])] });
});

/* AND THE INVARIANT THAT MAKES THE COUNT MEAN SOMETHING: an orphan is
 * acceptable ONLY IF the read is guarded by an explicit `!= null`. A guarded
 * read says out loud that the field is optional; a bare one claims a signal the
 * system does not have. `playoff_sos` and `proj_ffc` were always guarded;
 * `games_missed_3yr` was not, and its clause had never fired for any player. */
function guarded(field, sites) {
  return sites.every(site => {
    const [file, lineNo] = site.split(':');
    const lines = fs.readFileSync(path.join(JS_DIR, file), 'utf8').split('\n');
    const window = lines.slice(Math.max(0, lineNo - 3), Number(lineNo)).join(' ');
    return new RegExp('player\\.' + field + '\\s*!=\\s*null').test(window);
  });
}

console.log('ORPHAN FIELD SWEEP — read by the draft modules, absent from the live board\n');
console.log('  board supplies ' + supplied.size + ' distinct fields across '
  + (board.players || []).length + ' players');
console.log('  draft modules read ' + Object.keys(reads).length + ' distinct member names\n');
if (!orphans.length) {
  console.log('  NO ORPHANS. Every field the modules read is supplied by the board.');
} else {
  console.log('  ORPHANS (' + orphans.length + '):');
  let bare = 0;
  orphans.forEach(o => {
    const ok = guarded(o.field, o.sites);
    if (!ok) bare++;
    console.log('    ' + o.field.padEnd(24) + (ok ? 'declared optional (guarded)'
      : '*** BARE READ — claims a signal it never has').padEnd(46) + o.sites.join('  '));
  });
  console.log('\n  COUNT: ' + orphans.length + ' orphan field(s), ' + (orphans.length - bare)
    + ' declared optional, ' + bare + ' BARE. Residual unresolved: ' + bare + '.');
  if (bare) process.exitCode = 1;
}
/* EXIT NON-ZERO ON A BARE READ. The first version set `process.exitCode = 1`
 * and then called `process.exit(0)` at the foot, which silently overrode it —
 * a guard that REPORTS a defect and does not FAIL on it is the same class it
 * exists to catch. Caught by breaking it (rule 10) and reading the exit code
 * rather than the output. */
process.exit(process.exitCode || 0);

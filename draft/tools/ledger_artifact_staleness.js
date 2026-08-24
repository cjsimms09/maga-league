/* TERRITORY: D — report-only instrument, writes nothing. Register 304.
 * Run: node draft/tools/ledger_artifact_staleness.js
 *
 * DOES ANY OPEN PREDICTION ALREADY HAVE ITS ANSWER SITTING IN AN ARTIFACT?
 *
 * P151 was dispatched to me as "YOUR NEAREST DEADLINE" while
 * p151_target_share_trend.json had carried `clears_1.5x_bar: false` for four
 * days and the ledger row read OPEN. Register 304 filed the general problem and
 * asked the relay for a sweep. This is that sweep, built rather than asked for
 * again, because the same failure hit three more items in one afternoon.
 *
 * It reads every OPEN row, extracts the artifact paths the row itself names in
 * backticks, and reports any whose file already carries a verdict-shaped field.
 * It does NOT decide the grade -- it says "this row's own artifact looks
 * answered, go read it", which is the check I kept skipping by hand.
 *
 * CONTROLS (Rule 3e/3f). A clean "nothing stale" is exactly what a broken path
 * extractor prints, so three things are proven before any verdict:
 *   C1 THE EXTRACTOR FINDS PATHS AT ALL. If the backtick regex breaks, every
 *      row has zero artifacts and the sweep reads clean. Requires >= 20 paths
 *      named across the ledger.
 *   C2 SYNTHETIC POSITIVE. A fabricated verdict-carrying blob must be detected
 *      as answered.
 *   C3 SYNTHETIC NEGATIVE. A blob with no verdict field must NOT be.
 * Each exits non-zero on failure.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const VERDICT_KEYS = ['verdict', 'clears', 'status', 'pooled', 'result',
  'clears_1.5x_bar', 'passed', 'separable'];

/** Does this parsed artifact look like it already carries an answer? */
function looksAnswered(doc) {
  if (!doc || typeof doc !== 'object') return null;
  for (const k of Object.keys(doc)) {
    if (!VERDICT_KEYS.includes(k)) continue;
    const v = doc[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'boolean') return `${k}=${v}`;
    if (typeof v === 'string' && v.trim()) return `${k}="${v.slice(0, 40)}"`;
    if (typeof v === 'object') {
      for (const kk of Object.keys(v)) {
        if (VERDICT_KEYS.includes(kk) && v[kk] !== null && v[kk] !== undefined) {
          return `${k}.${kk}=${JSON.stringify(v[kk]).slice(0, 40)}`;
        }
      }
    }
  }
  return null;
}

// ── C2 / C3 ─────────────────────────────────────────────────────────────────
if (!looksAnswered({ pooled: { status: 'graded' }, other: 1 })) {
  console.error('CONTROL C2 FAILED — a verdict-carrying blob was not detected'); process.exit(2);
}
if (looksAnswered({ generated_at: 'x', rows: [1, 2, 3] })) {
  console.error('CONTROL C3 FAILED — a blob with no verdict field was flagged'); process.exit(2);
}
console.log('C2/C3 ok — detector flags a verdict blob and not a plain one.');

/* ⚠️ THE BUG THIS FUNCTION EXISTS FOR, AND IT WAS IN v1 OF THIS FILE.
 * Ledger rows name artifacts BOTH ways -- some repo-relative
 * (`draft/backtest/x.json`) and some as a BARE FILENAME (`x.json`). v1 did
 * path.join(ROOT, p) only, so every bare-filename row resolved to a
 * non-existent top-level path, failed existsSync, and was silently skipped.
 * It reported 0 stale rows across 102 open predictions -- a clean pass that
 * meant nothing. P151's own row, the case this whole instrument was built
 * from, names `p151_target_share_trend.json` bare and would have been missed.
 * Caught only by testing the detector against the REAL historical case
 * instead of the synthetic blobs in C2/C3, which both passed. */
const SEARCH_DIRS = ['', 'draft/backtest', 'draft/data', 'draft/tools',
  'draft/audit', 'public'];
function resolveArtifact(rel) {
  for (const d of SEARCH_DIRS) {
    const abs = path.join(ROOT, d, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

const ledger = fs.readFileSync(path.join(ROOT, 'PREDICTION-LEDGER.md'), 'utf8');
const rows = ledger.split('\n').filter(l => /^\| P\d+ \|/.test(l));
const PATH_RE = /`([A-Za-z0-9_./-]+\.(?:json|py|js))`/g;

let namedPaths = 0;
const unresolved = new Set();
const open = [], flagged = [];
for (const line of rows) {
  const cells = line.split(/(?<!\\)\|/);
  const id = cells[1].trim();
  const status = (cells[6] || '').toUpperCase();
  const paths = [...line.matchAll(PATH_RE)].map(m => m[1]);
  namedPaths += paths.length;
  if (!status.includes('OPEN')) continue;
  open.push(id);
  for (const p of new Set(paths)) {
    if (!p.endsWith('.json')) continue;
    const abs = resolveArtifact(p);
    if (!abs) { unresolved.add(p); continue; }
    let doc; try { doc = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { continue; }
    const why = looksAnswered(doc);
    if (why) flagged.push({ id, artifact: p, why });
  }
}

// ── C1 ──────────────────────────────────────────────────────────────────────
// ── C4: THE REAL HISTORICAL CASE, not a synthetic blob ─────────────────────
// P151 was dispatched as work while its artifact already said `pooled.status:
// graded`. Reconstruct that state -- its real row, forced OPEN -- and require
// the sweep to flag it. C2/C3 both passed while the sweep was blind to exactly
// this, so this is the control that decides whether a clean run means anything.
{
  const p151 = rows.find(l => l.startsWith('| P151 |'));
  if (!p151) { console.error('CONTROL C4 FAILED — P151 row not found'); process.exit(2); }
  const paths = [...p151.matchAll(PATH_RE)].map(m => m[1]).filter(x => x.endsWith('.json'));
  let hit = null;
  for (const p of paths) {
    const abs = resolveArtifact(p);
    if (!abs) continue;
    let doc; try { doc = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { continue; }
    const why = looksAnswered(doc);
    if (why) { hit = `${p} -> ${why}`; break; }
  }
  if (!hit) {
    console.error('CONTROL C4 FAILED — the sweep cannot detect P151, the real case '
      + 'it was built from. Paths named: ' + JSON.stringify(paths)
      + '. A clean run means nothing while this fails.');
    process.exit(2);
  }
  console.log('C4 ok — the real historical case is detected: ' + hit);
}

console.log(`C1 — artifact paths named across the ledger: ${namedPaths}`);
if (namedPaths < 20) {
  console.error(`CONTROL C1 FAILED — only ${namedPaths} paths extracted; the backtick `
    + 'regex is broken and a clean sweep would mean nothing'); process.exit(2);
}
console.log(`\nOPEN rows: ${open.length}`);
console.log(`OPEN rows whose OWN named artifact already looks answered: ${flagged.length}`);
for (const f of flagged) console.log(`  ${f.id.padEnd(7)} ${f.artifact.padEnd(52)} ${f.why}`);
if (!flagged.length) console.log('  (none — every open row\'s artifacts look unanswered)');
if (unresolved.size) {
  console.log(`\nartifact paths NAMED but not found on disk: ${unresolved.size}`);
  [...unresolved].slice(0, 8).forEach(u => console.log('  ' + u));
}
console.log('\nThis does NOT grade anything. It says: read these artifacts before '
  + 'dispatching these rows as work.');
process.exitCode = flagged.length ? 1 : 0;

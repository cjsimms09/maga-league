'use strict';
/* TERRITORY: A.  A SHELL-OUT THAT READS A >1MB FILE MUST RAISE maxBuffer
 * (register 391).
 *
 * `execSync`/`execFileSync` default to a 1MB buffer and THROW on overflow. Two
 * of this repo's mailboxes have crossed that line — DEFECT-REGISTER.md at
 * ~1.56MB and ROUTES.md at ~2.34MB — and the throw is caught, in every case
 * found, by a `catch` that returns null meaning "absent, nothing to do".
 *
 * That produced two real fail-opens in one evening:
 *   · register_commit_guard exited 0 on a deliberately broken row (register 390);
 *   · routes_integrity's merge-union guard would have reported "no merge in
 *     progress" during a real merge of the 2.34MB file it exists to protect.
 *
 * Both self-tested green throughout, because fixtures are small. So this is a
 * SOURCE-level ratchet: the defect is invisible to behaviour tests until the
 * day it matters, and by then it is silent.
 *
 * SCOPE IS DELIBERATELY NARROW — only call sites whose command names a file
 * this repo knows is over 1MB. A blanket "every exec needs maxBuffer" rule
 * would flag 55 sites, almost all of them running a test or `git rev-parse`,
 * and a guard that fires on 53 non-problems is a guard people delete.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

// Which files are actually over the default? MEASURED, not assumed — if a
// mailbox shrinks below 1MB it drops out of scope on its own.
const CANDIDATES = ['DEFECT-REGISTER.md', 'ROUTES.md', 'PREDICTION-LEDGER.md',
  'CORY-ASKS.md', 'OPEN-QUESTIONS.md', 'public/draft_data.json'];
const BIG = CANDIDATES.filter(f => {
  try { return fs.statSync(path.join(ROOT, f)).size > 1024 * 1024; } catch (e) { return false; }
});
ck('CONTROL — at least one tracked file really is over the 1MB default, so '
  + 'this guard has a subject (' + BIG.join(', ') + ')', BIG.length > 0, BIG);

const files = execFileSync('git',
  ['ls-files', 'draft/tools', 'draft/tests', 'src'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 })
  .split('\n').filter(f => /\.js$/.test(f));
ck('CONTROL — source files were found to scan', files.length > 50, { n: files.length });

/* REPO-SCALE COMMANDS — output that grows with the REPO rather than with any
 * one file, so no filename appears in the call and the big-file rule above
 * cannot see them. `git ls-tree -r` is already at 461KB and `ls-files` at
 * 47KB; both climb with every commit, and the 1MB default THROWS rather than
 * truncating, so the failure arrives all at once and (in every instance found)
 * is caught as "absent".
 *
 * MEASURED BEFORE WIDENING (Rule 3i): adding this class flagged exactly ONE
 * unprotected site, and it was mine — the citation ratchet from register 389.
 * Fixed, so this locks a clean state rather than opening a backlog. */
const REPO_SCALE = /ls-tree[^)]*-r|'ls-files'|log -p|rev-list[^)]*--all/;

/** Pure and testable: unprotected exec sites whose command names a big file,
 *  OR whose command is repo-scale. */
function offenders(lines, bigNames) {
  const out = [];
  lines.forEach((l, i) => {
    // Skip COMMENT lines. The first run of this flagged routes_integrity.js
    // because the comment EXPLAINING the fix names both execFileSync and
    // ROUTES.md — a guard that fires on prose about itself is noise.
    const t = l.trim();
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
    if (!/exec(File)?Sync|spawnSync/.test(l) || /require\(/.test(l)) return;
    const win = lines.slice(i, i + 5).join(' ');
    if (/maxBuffer/.test(win)) return;
    if (bigNames.some(b => win.includes(b)) || REPO_SCALE.test(win)) {
      out.push({ line: i + 1, src: l.trim().slice(0, 70) });
    }
  });
  return out;
}

const bad = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  for (const o of offenders(lines, BIG)) bad.push(f + ':' + o.line + '  ' + o.src);
}
ck('no shell-out reads a >1MB file on the DEFAULT buffer — the throw is caught '
  + 'as "absent" everywhere it was found, so this fails OPEN and silently',
bad.length === 0, bad);

// FAIL ARM — the scanner must be able to fire, or it is decoration.
{
  const synthetic = [
    // Concatenated so the scanner does not flag this file's own fixtures —
    // it reads every source file including this one, and a literal here is
    // indistinguishable from a real call site. The citation ratchet needed the
    // same treatment for the same reason (register 391).
    "const t = execFile" + "Sync('git', ['show', 'HEAD:ROU" + "TES.md'], { cwd: ROOT });",
  ];
  ck('FAIL ARM — an unprotected read of a big file IS detected',
    offenders(synthetic, ['ROUTES.md']).length === 1);
  const guarded = [
    "const t = execFile" + "Sync('git', ['show', 'HEAD:ROU" + "TES.md'],",
    "  { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });",
  ];
  ck('  and the same read WITH maxBuffer is not flagged, so the guard cannot '
    + 'fire on correct code', offenders(guarded, ['ROUTES.md']).length === 0);
}

// FAIL ARM for the repo-scale class, and its inverse.
{
  const bare = ["const x = execFile" + "Sync('git', ['ls-" + "files', 'src'], { cwd: ROOT });"];
  ck('FAIL ARM — an unprotected REPO-SCALE command is detected even though it '
    + 'names no file', offenders(bare, []).length === 1);
  const guarded = ["const x = execFile" + "Sync('git', ['ls-" + "files', 'src'],",
    '  { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });'];
  ck('  and the same command WITH maxBuffer is not flagged',
    offenders(guarded, []).length === 0);
}

console.log('\nscanned ' + files.length + ' files against ' + BIG.length + ' oversized target(s)');
console.log(pass + '/' + (pass + fail) + ' big-read arms passed');
process.exit(fail ? 1 : 0);

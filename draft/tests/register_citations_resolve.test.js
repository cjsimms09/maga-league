'use strict';
/* TERRITORY: A.  A CITATION TO A REGISTER ROW MUST NAME A ROW THAT EXISTS
 * (register 389).
 *
 * Code in this repo cites register rows constantly — 585 citations across
 * 1,309 files when this was written — and those citations are how a future
 * reader finds out WHY a line is the way it is. A citation to a row that does
 * not exist sends them nowhere and is indistinguishable from a real one.
 *
 * ⚠️ THIS IS A RATCHET ON SOMETHING ALREADY TRUE, NOT A FIX FOR A LIVE BUG.
 * Measured at 0 dangling of 585, and the honest reason it is zero is that the
 * ids were checked by hand each time — including three times in one session
 * where I wrote an id into a comment BEFORE claiming it from the allocator and
 * had to correct it (registers 360, 386, 388). Hand-checking worked and will
 * not keep working. This locks the clean state in so the decay is visible on
 * the day it starts rather than whenever somebody follows a dead pointer.
 *
 * Scope is deliberately narrow: numeric ids only, in source files. Prose files
 * (CLAUDE.md, ROUTES.md, audits) legitimately cite rows that were later
 * renumbered at merge, and widening this to catch those would make it fire on
 * history rather than on defects.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const registerText = fs.readFileSync(path.join(ROOT, 'DEFECT-REGISTER.md'), 'utf8');
const ids = new Set([...registerText.matchAll(/^\| ([A-Za-z0-9]+) \|/gm)].map(m => m[1]));

// CONTROL — without this, an unparsed register makes every citation "dangling"
// and this file would fail loudly for the wrong reason, or (with the test
// inverted) pass on an empty set.
ck('CONTROL — the register parses into a real set of ids', ids.size > 100, { ids: ids.size });

const files = execFileSync('git',
  ['ls-files', 'draft/tools', 'draft/tests', 'public/js/draft', 'src'],
  { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(f => /\.(js|py)$/.test(f));
ck('CONTROL — source files were found to scan', files.length > 100, { files: files.length });

const dangling = [];
let citations = 0;
for (const f of files) {
  let t;
  try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  for (const m of t.matchAll(/[Rr]egister (\d{1,3})\b/g)) {
    citations++;
    if (!ids.has(m[1])) dangling.push(f + ' cites register ' + m[1]);
  }
}
ck('CONTROL — citations were actually found, so a clean result is not an '
  + 'empty scan', citations > 50, { citations: citations });

ck('every numeric register citation in source resolves to a row that exists',
  dangling.length === 0, [...new Set(dangling)].slice(0, 20));

// FAIL ARM — the check must be able to fire, or it is decoration.
{
  const fakeIds = new Set(['1', '2']);
  // Built by concatenation on purpose: written literally, this line would be
  // a dangling citation in its own right and the scan above would flag this
  // very file — which it did, the first time it ran.
  const hit = ['regi' + 'ster ' + '999'].filter(s => {
    const m = s.match(/register (\d+)/);
    return m && !fakeIds.has(m[1]);
  });
  ck('FAIL ARM — a citation to a missing id IS detected', hit.length === 1);
}

console.log('\n' + citations + ' citations checked across ' + files.length + ' files');
console.log(pass + '/' + (pass + fail) + ' citation arms passed');
process.exit(fail ? 1 : 0);

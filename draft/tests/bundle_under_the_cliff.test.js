'use strict';
/* THE FUNCTION BUNDLE MUST STAY UNDER LAMBDA'S 250MB CLIFF.
 *
 * Cory, 2026-10-20: "the site is also so slow and clunky" — and, three times
 * before that, "did you deploy??"
 *
 * Netlify functions are AWS Lambda, and Lambda refuses a deployment package
 * over 250MB unzipped. Six functions declared `included_files =
 * ["draft/data/**", ...]`, and draft/data is the Lab capture rail: it grows
 * every day. Measured from git, the same paths at two commits:
 *
 *     1c3ec642, the last deploy that ever succeeded (2026-09-17):  225.9 MB
 *     HEAD, 2026-10-20:                                            727.7 MB
 *
 * 24MB under the cliff on the day of the last successful deploy, and over it
 * within days. draft/data/kalshi alone is 565MB and gains ~14MB EVERY DAY. So
 * every build since has been packaging something Lambda will not accept, and
 * production served the 2026-09-17 build for 33 days while site-check reported
 * success every morning.
 *
 * ⚠️ THE EXCLUSIONS IN netlify.toml STOP THE BLEEDING; THEY DO NOT STOP
 * draft/data GROWING. The capture rail adds files daily by design — that is
 * the point of it — so the set will creep back toward the cliff. This test is
 * the thing that notices BEFORE a month of silent stranding, which is the
 * whole lesson of this incident: the limit was never the surprise, the
 * absence of an alarm was.
 *
 * Run: node draft/tests/bundle_under_the_cliff.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

//: Lambda's hard limit on an UNZIPPED deployment package.
const CLIFF_MB = 250;
//: Fail well before the cliff. At ~14MB/day of Kalshi growth alone, 180MB is
//: roughly five days of warning — enough to act, far short of a month.
const BUDGET_MB = 180;

const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

/* Parse `included_files = [...]` out of each [functions."name"] block. A real
 * TOML parser would be better, but this file is also read by two other guards
 * that split it textually, and adding a parser dependency to a build-blocking
 * test is its own risk. The CONTROL below refuses a parse that found nothing. */
function blocks() {
  const out = {};
  const re = /\[functions\."([^"]+)"\]([\s\S]*?)(?=\n\[|$)/g;
  let m;
  while ((m = re.exec(toml)) !== null) {
    const inc = /included_files\s*=\s*\[([\s\S]*?)\]/.exec(m[2]);
    out[m[1]] = inc
      ? [...inc[1].matchAll(/"([^"]+)"/g)].map(x => x[1])
      : [];
  }
  return out;
}

/* Size of a glob's matches on disk, honouring `!` negation the way Netlify
 * does: later negations remove earlier matches. */
function sizeOf(patterns) {
  const inc = patterns.filter(p => !p.startsWith('!'));
  const exc = patterns.filter(p => p.startsWith('!')).map(p => p.slice(1));
  const toRe = g => new RegExp('^' + g
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*') + '$');
  const incRe = inc.map(toRe), excRe = exc.map(toRe);

  let total = 0, files = 0;
  const walk = dir => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(ROOT, abs);
      if (e.isDirectory()) {
        if (rel === 'node_modules' || rel === '.git') continue;
        walk(abs);
      } else {
        if (!incRe.some(r => r.test(rel))) continue;
        if (excRe.some(r => r.test(rel))) continue;
        try { total += fs.statSync(abs).size; files++; } catch { /* vanished */ }
      }
    }
  };
  walk(ROOT);
  return { mb: total / 1e6, files };
}

const fns = blocks();

// ── controls first: a parse that found nothing would pass everything ───────
ck('CONTROL: netlify.toml parsed into function blocks',
  Object.keys(fns).length >= 5, Object.keys(fns));
ck('CONTROL: the app function was found and declares included_files',
  (fns.app || []).length > 0, (fns.app || []).slice(0, 3));
ck('CONTROL: the glob sizer finds real bytes for a known-present path',
  sizeOf(['views/**']).mb > 0.1, sizeOf(['views/**']));
ck('CONTROL: negation actually removes matches (or every exclusion is a no-op)',
  sizeOf(['draft/data/**']).mb > sizeOf(['draft/data/**', '!draft/data/kalshi/**']).mb,
  { withKalshi: sizeOf(['draft/data/**']).mb,
    without: sizeOf(['draft/data/**', '!draft/data/kalshi/**']).mb });

// ── the budget, per function ──────────────────────────────────────────────
const sizes = {};
for (const [name, pats] of Object.entries(fns)) {
  if (!pats.length) continue;
  sizes[name] = sizeOf(pats);
}
for (const [name, s] of Object.entries(sizes)) {
  /* ⚠️ The file COUNT is in the line, not just the megabytes. claims-cron
   * declares one 982-byte file and prints 0.0MB, which is indistinguishable
   * from a glob that matched NOTHING unless the count is shown — rule 3e, the
   * null that reads like an answer. A function whose declared reads all
   * vanished would otherwise sail through this test as the smallest bundle. */
  ck(`${name}: ${s.files} bundled file(s), ${s.mb.toFixed(2)}MB — under the `
    + `${BUDGET_MB}MB budget (Lambda refuses over ${CLIFF_MB}MB)`,
  s.mb < BUDGET_MB && s.files > 0,
  { mb: Number(s.mb.toFixed(3)), files: s.files, budget: BUDGET_MB, cliff: CLIFF_MB,
    patterns: fns[name] });
}

// ── the specific regression that caused the outage ────────────────────────
ck('no function bundles draft/data/kalshi — 565MB and growing ~14MB a day, '
  + 'read by no runtime path',
Object.values(fns).every(p => {
  const s = sizeOf(p);
  return s.mb === 0 || !p.includes('draft/data/**') || p.some(x => x === '!draft/data/kalshi/**');
}),
Object.entries(fns).filter(([, p]) =>
  p.includes('draft/data/**') && !p.includes('!draft/data/kalshi/**')).map(([n]) => n));

// ── and the files the runtime REALLY reads must still be included ─────────
const MUST_SHIP = [
  'draft/data/league_history.json',
  'draft/data/nfl_schedule_2026.json',
  'draft/data/player_positions.json',
  'draft/data/component_grades.json',
  'draft/data/evidence_weights_latest.json',
  'draft/data/master_sheet_archive.json',
];
const toRe = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*')
  .replace(/\u0000/g, '.*') + '$');
const appInc = (fns.app || []).filter(p => !p.startsWith('!'));
const appExc = (fns.app || []).filter(p => p.startsWith('!')).map(p => p.slice(1));
let checkedMustShip = 0;
for (const f of MUST_SHIP) {
  if (!fs.existsSync(path.join(ROOT, f))) continue;   // not all exist in every checkout
  checkedMustShip++;
  const covered = appInc.some(p => toRe(p).test(f)) && !appExc.some(p => toRe(p).test(f));
  ck(`  app still ships ${f} — excluding a file the runtime READS is a `
    + 'production-only ENOENT, the exact class netlify.toml keeps warning about',
  covered, { file: f, excludedBy: appExc.filter(p => toRe(p).test(f)) });
}
//: and the loop above must have actually run — a renamed store would otherwise
//: silently skip every must-ship check and leave this section vacuously green.
ck(`CONTROL: ${checkedMustShip} of ${MUST_SHIP.length} must-ship stores exist to be checked`,
  checkedMustShip >= MUST_SHIP.length - 1,
  { checked: checkedMustShip, listed: MUST_SHIP.length,
    missing: MUST_SHIP.filter(f => !fs.existsSync(path.join(ROOT, f))) });

console.log(`\n${pass}/${pass + fail} bundle-size checks passed`);
if (sizes.app) {
  console.log(`app bundle: ${sizes.app.mb.toFixed(1)}MB across ${sizes.app.files} files `
    + `(was 727.7MB before the exclusions; the last successful deploy was 225.9MB)`);
}
process.exit(fail ? 1 : 0);

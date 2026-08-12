/* EVERY MODULE app.js CALLS MUST BE ON THE PAGE, AND IN FRONT OF IT.
 *
 * THE DEFECT THIS EXISTS FOR (2026-08-11, shipped and caught 40 minutes later).
 * The manual-override VORP fix moved its arithmetic out of app.js into
 * valuation.js — correctly, so it could be tested with real numbers instead of
 * grepped. `_warroom_scripts.ejs` was not updated. `SharedValuation` was
 * therefore undefined in the browser, and the ▼ downgrade button would have
 * thrown a ReferenceError on the surface Cory reads at the table with the clock
 * running.
 *
 * EVERY UNIT TEST PASSED, AND HAD TO. They `require()` the module directly and
 * never see the page's script list. `node --check` passes — the reference is
 * syntactically fine. This is the same class as the doctrine tilt that was
 * "wired in the engine, green across 20 tests, and NEVER RAN in production":
 * a capability correctly implemented, correctly tested, and not connected.
 *
 * WHAT THIS CHECKS. For each global that app.js calls as `Name.method(...)`
 * WITHOUT a typeof guard, the providing file must be in the include AND appear
 * before app.js. A guarded reference (`typeof DraftNeeds !== 'undefined'`) is
 * deliberately optional and is not required to be loaded.
 *
 * SOURCE INSPECTION, AND ITS LIMIT (rule 11e). Comments and string literals are
 * stripped — every source scan written today was fooled by one or the other
 * before it was right. It still cannot see a global assembled at runtime, or
 * prove the file defines the name it claims to. The browser rehearsal is the
 * only thing that can; this catches the case the rehearsal is too expensive to
 * run for on every change.
 *
 * Run: node draft/tests/script_load_order.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const INCLUDE = path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs');
const APP = path.join(ROOT, 'public', 'js', 'draft', 'app.js');

const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => '\n'.repeat((m.match(/\n/g) || []).length))
  .replace(/^(.*?)\/\/.*$/gm, '$1')
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""');

const includeSrc = fs.readFileSync(INCLUDE, 'utf8');
// EJS comments carry file names too — strip them or a module named only in a
// <%# ... %> note counts as loaded.
const includeCode = includeSrc.replace(/<%#[\s\S]*?%>/g, '');
const loaded = [];
includeCode.replace(/src="\/js\/draft\/([\w.-]+\.js)"/g, (_, f) => { loaded.push(f); return _; });

ck('the war-room include lists scripts at all', loaded.length > 5, loaded.length);
ck('app.js is last', loaded[loaded.length - 1] === 'app.js', loaded.slice(-3));

const appCode = strip(fs.readFileSync(APP, 'utf8'));

// Which file defines which global. Derived by reading each module's own
// `global.X =` assignment rather than hardcoding a map, so a renamed export is
// caught instead of silently satisfying a stale table.
const provides = {};
fs.readdirSync(path.join(ROOT, 'public', 'js', 'draft'))
  .filter(f => f.endsWith('.js'))
  .forEach(f => {
    const src = strip(fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', f), 'utf8'));
    const re = /global\.(\w+)\s*=/g;
    let m;
    while ((m = re.exec(src))) provides[m[1]] = f;
  });
ck('module exports were discovered by reading the modules', Object.keys(provides).length > 5,
  Object.keys(provides).length);

// Globals app.js calls as Name.method(...) with no typeof guard.
const called = new Set();
const callRe = /\b([A-Z][A-Za-z0-9_]{2,})\.\w+\s*\(/g;
let m;
while ((m = callRe.exec(appCode))) called.add(m[1]);
const guarded = new Set();
const guardRe = /typeof\s+([A-Za-z0-9_]+)\s*!==\s*''/g;   // strings were blanked above
let g;
while ((g = guardRe.exec(appCode))) guarded.add(g[1]);

const required = [...called].filter(n => provides[n] && !guarded.has(n));
ck('app.js calls at least one shared module unguarded', required.length > 0, required);

const appIdx = loaded.indexOf('app.js');
const missing = required.filter(n => loaded.indexOf(provides[n]) === -1);
const late = required.filter(n => {
  const i = loaded.indexOf(provides[n]);
  return i !== -1 && i > appIdx;
});

ck('every unguarded module app.js calls IS on the page', missing.length === 0,
  missing.map(n => n + ' (needs ' + provides[n] + ')'));
ck('  and every one of them loads BEFORE app.js', late.length === 0,
  late.map(n => n + ' (' + provides[n] + ')'));

// THE SPECIFIC REGRESSION, named so it cannot come back quietly.
ck('SharedValuation is provided by valuation.js', provides.SharedValuation === 'valuation.js',
  provides.SharedValuation);
ck('  valuation.js is loaded in the war room', loaded.indexOf('valuation.js') !== -1, loaded);
ck('  and app.js calls it unguarded, so loading it is not optional',
  /SharedValuation\.\w+\s*\(/.test(appCode));


// ── THE OVERRIDE RECORD, AND WHY ITS GUARD IS NOT ENOUGH ───────────────────
{
  /* app.js calls OverrideRecord behind `typeof OverrideRecord === 'undefined'`,
   * which is correct defensively and DANGEROUS on its own: if the script tag is
   * missing, override capture silently stops and draft night — the one entry
   * that cannot be recaptured — produces nothing, with no error anywhere. The
   * silent-never-fired pattern. So the tag itself is asserted. */
  const ejs = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  ck('override_record.js is loaded in the war room',
    /src="\/js\/draft\/override_record\.js"/.test(ejs));
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('  and app.js actually calls it, so the tag is not decoration',
    /OverrideRecord\.pickOverride/.test(app) && /OverrideRecord\.valueOverride/.test(app));
  ck('  it loads BEFORE app.js',
    ejs.indexOf('override_record.js') < ejs.indexOf('/js/draft/app.js')
    || ejs.indexOf('/js/draft/app.js') === -1);
}

// ── MODULES BUILT FOR ANOTHER LANE, WHICH DERIVATION STRUCTURALLY MISSES ───
{
  /* THE DEFECT, 2026-08-13. decision_contract.js was written, tested, corrected,
   * and reported as "landed and unblocking B" — and was NEVER ON THE PAGE.
   * `DecisionContract` was undefined in the browser for its entire life.
   *
   * THIS SUITE COULD NOT HAVE CAUGHT IT, and that is the interesting part. Its
   * requirement is DERIVED from globals app.js calls; the contract's consumer is
   * B's renderer, in another lane, so app.js calls nothing and there is nothing
   * to derive from. A module whose caller lives outside the file we scan falls
   * straight through — silently, and looking exactly like a module with no
   * unguarded references.
   *
   * So cross-lane modules get an EXPLICIT tag assertion. The list is short and
   * deliberately manual: each entry is a promise to another session that a
   * global will exist, and a promise nothing in this repo can derive. */
  const ejs = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  const CROSS_LANE = [
    ['decision_contract.js', 'B\'s explanation renderer reads DecisionContract'],
    ['opponent_predict.js', 'the shadow prediction arm, emitted from app.js'],
    // GUARDED, THEREFORE OPTIONAL TO THE DERIVATION, THEREFORE ASSERTED HERE.
    // app.js calls DraftSession behind `typeof DraftSession === 'undefined'`,
    // which is correct defensively and dangerous alone: if the tag goes missing
    // the draft silently stops being persisted and the ONE event that cannot be
    // replayed is unrecoverable again, with no error anywhere. Same reasoning as
    // override_record.js below.
    ['draft_session.js', 'draft state persistence — a missing tag silently '
      + 'restores nothing after a reset'],
  ];
  CROSS_LANE.forEach(([file, why]) => {
    ck(file + ' is loaded in the war room (' + why + ')',
      new RegExp('src="/js/draft/' + file.replace('.', '\\.') + '"').test(ejs),
      'built for a consumer outside app.js, so no derivation requires it — if the '
      + 'tag is missing the global is simply undefined in production');
  });
  ck('  the contract loads BEFORE app.js',
    ejs.indexOf('decision_contract.js') < ejs.indexOf('/js/draft/app.js')
    || ejs.indexOf('/js/draft/app.js') === -1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

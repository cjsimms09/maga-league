#!/usr/bin/env node
/* TERRITORY: A. THE VERDICT HALF OF REGISTER 23's SWEEP, GIVEN A DURABLE FORM.
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 *
 * Register 23 swept for `check(..., true)` — a control whose VERDICT is a
 * literal — and found 21 across 13 suites. Register 396 built the sweep for the
 * other half, a control whose EXPECTATION is a frozen literal. Neither left
 * anything behind that could tell you whether the class had regrown.
 *
 * It had. MEASURED 2026-08-28: twenty named controls in `draft/tools` and
 * `draft/backtest` read `C<n>_name: { ok: true, ... }`.
 *
 * ── THE DISCRIMINATOR, AND IT IS NOT "ANY LITERAL true" ────────────────────
 *
 * Not every one of those is a defect, and calling them all defects is how a
 * sweep gets ignored. Two different things wear the same shape:
 *
 *   DISCLOSURE — the entry exists to PUT A NUMBER OR A CHOICE ON THE RECORD,
 *     not to test anything. `C3_declared_choices: { ok: true, TIE_BAND, FLIP,
 *     why: 'these are CHOICES, not measurements' }` is doing its job. So is a
 *     coverage report. Its `ok` is furniture.
 *
 *   VACUOUS CLAIM — the entry NAMES A PROPERTY and asserts it by writing
 *     `true`. `C4_sources_passed_their_controls: { ok: true }` claims something
 *     the file can actually check, and does not check it.
 *
 * They are told apart by what the entry SAYS ABOUT ITSELF: a disclosure's own
 * `why` (or name) says it declares, reports, or discloses. That rule is
 * imperfect and the tool says so rather than pretending otherwise — every hit
 * is printed with its `why` so a human decides, and `--strict` is deliberately
 * NOT offered, because a 20-row list arriving as a red gate becomes an argument
 * instead of a queue. This is the report; the fixes are register rows.
 *
 * Run: node draft/tools/vacuous_verdict_sweep.js [--json PATH] [--all]
 *      node draft/tools/vacuous_verdict_sweep.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BUF = 64 * 1024 * 1024;               // register 391
const DIRS = [path.join('draft', 'tools'), path.join('draft', 'backtest'),
              path.join('draft', 'tests')];

/* A NAMED control entry whose verdict is the literal `true`:
 *     C4_name: { ok: true ...        ctl.C2_name = { ok: true ...
 * The name is required — `return { ok: true }` from a function that has just
 * succeeded is a RESULT, not a control, and flagging those buries the finding
 * under sixty hits. */
const NAMED_TRUE =
  /(?:^|\s)((?:ctl\.)?C\d+[a-z]?_[A-Za-z0-9_]*)\s*[:=]\s*\{\s*ok:\s*true\b/gm;

/* A call-style verdict: ck('...', true) / check('...', true) / ok('...', true) */
const CALL_TRUE = /\b(ck|check|ok)\(\s*(['"])((?:[^'"\\]|\\.)*)\2\s*,\s*true\s*[,)]/gm;

const decomment = s => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* Does the entry say of itself that it is a disclosure rather than a test?
 * Read from the name AND from the ~600 characters after the match, which is
 * where its own `why` lives. */
const DISCLOSURE = /\b(declared?|declares|reported|reports|reporting|disclos\w*|choices?, not measurements|not a measurement)\b/i;

function classify(name, tail) {
  return DISCLOSURE.test(name) || DISCLOSURE.test(tail) ? 'disclosure' : 'claim';
}

function scan(src) {
  const code = decomment(src);
  const hits = [];
  let m;
  NAMED_TRUE.lastIndex = 0;
  while ((m = NAMED_TRUE.exec(code)) !== null) {
    /* ⚠️ THE TAIL MUST STOP AT THE NEXT CONTROL. The first cut took a fixed 600
     * characters, so a control with NO `why` of its own borrowed the next
     * control's — average_draft's C4 was printed with C6's reasoning about
     * stranded slots, which is a wrong quote in a finding. Caught by reading
     * the output against the file. */
    const rest = code.slice(m.index + m[0].length);
    const nextCtl = rest.search(/(?:^|\s)(?:ctl\.)?C\d+[a-z]?_[A-Za-z0-9_]*\s*[:=]/m);
    const tail = code.slice(m.index,
      m.index + m[0].length + (nextCtl < 0 ? 600 : Math.min(nextCtl, 600)));
    hits.push({ kind: 'named_control', name: m[1], verdict: 'literal true',
      klass: classify(m[1], tail),
      why: (tail.match(/why:\s*(['"])((?:[^'"\\]|\\.)*)\1/) || [])[2] || null });
  }
  CALL_TRUE.lastIndex = 0;
  while ((m = CALL_TRUE.exec(code)) !== null) {
    const tail = code.slice(m.index, m.index + 400);
    hits.push({ kind: 'call', name: m[3].slice(0, 90), verdict: 'literal true',
      klass: classify(m[3], tail), why: null });
  }
  return hits;
}

function files() {
  const out = [];
  DIRS.forEach(d => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).forEach(f => {
      if (/\.js$/.test(f) && f !== 'vacuous_verdict_sweep.js') out.push(path.join(d, f));
    });
  });
  return out.sort();
}

function selfTest() {
  let pass = 0, fail = 0;
  const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + JSON.stringify(d).slice(0, 300) : ''))); };

  /* KNOWN POSITIVE — the real line out of average_draft.js, read from git
   * rather than retyped so the fixture cannot drift from it (register 121).
   *
   * ⚠️ PINNED TO A REVISION, NOT TO `HEAD`, AND THAT CHANGE IS ITSELF THE
   * LESSON. This read `HEAD:draft/tools/average_draft.js` and looked for
   * `C4_sources_passed_their_controls: { ok: true }`. Register 410 then FIXED
   * that control — which is the sweep succeeding — and the known positive went
   * empty, so the detector's only proof that it can detect anything failed
   * BECAUSE THE DEFECT IT POINTED AT WAS REPAIRED. That is the "a control
   * anchored to HEAD that passed once then failed forever" trap named in
   * CLAUDE.md's rule 3f list, arriving in the tool written to enforce 3f.
   *
   * `8a648806` is a revision where the vacuous form provably exists (verified:
   * the string is present there and absent at `17343daa`, the commit that
   * removed it). A historical blob cannot be repaired out from under a
   * fixture, so this control now holds no matter how many live claims get
   * fixed — which is the whole point of a detector whose job is to drive its
   * own findings to zero. Register 422. */
  const FIXTURE_SHA = '8a648806';
  let real = null;
  try {
    real = execFileSync('git', ['show', FIXTURE_SHA + ':draft/tools/average_draft.js'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
  } catch (e) { real = null; }
  if (real === null) {
    ck('KNOWN POSITIVE — the pinned fixture blob ' + FIXTURE_SHA + ' is reachable. '
      + 'A shallow clone fails HERE, loudly, rather than skipping the only proof '
      + 'this detector can detect anything', false);
  } else {
    const hits = scan(real);
    const c4 = hits.find(h => /C4_sources_passed_their_controls/.test(h.name));
    ck('KNOWN POSITIVE — the detector finds a real named control asserted true',
      !!c4, hits.map(h => h.name).slice(0, 6));
    ck('  and calls it a CLAIM, not a disclosure', !!c4 && c4.klass === 'claim', c4);
    /* and the pin is doing work: the SAME control at HEAD must now be computed,
     * so the fixture is genuinely historical rather than a second copy of today. */
    let head = null;
    try {
      head = execFileSync('git', ['show', 'HEAD:draft/tools/average_draft.js'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
    } catch (e) { head = null; }
    ck('  and the live file has SINCE been fixed, so the pin is load-bearing '
      + 'rather than decorative',
      head !== null && !scan(head).some(h => /C4_sources_passed_their_controls/.test(h.name)));
  }

  ck('KNOWN NEGATIVE — a computed verdict is NOT flagged',
    scan('ctl.C1_x = { ok: worst < 1e-12, worst_abs_diff: worst };').length === 0);
  ck('  nor is an unnamed result object, which is a RETURN not a control',
    scan('function f() { return { ok: true }; }').length === 0);
  ck('a DISCLOSURE is classified as such rather than as a defect',
    (scan("C3_declared_choices: { ok: true, why: 'these are CHOICES, not measurements' },")[0] || {}).klass
      === 'disclosure');
  ck('a bare named control with no why is a CLAIM',
    (scan('C4_sources_passed_their_controls: { ok: true },')[0] || {}).klass === 'claim');
  ck('the call form is caught too',
    scan("ck('every rendered gap carries its units', true);").length === 1);

  console.log('\n' + pass + '/' + (pass + fail) + ' self-tests passed');
  return fail ? 1 : 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const showAll = process.argv.includes('--all');
  const all = files();
  const rows = [];
  all.forEach(f => {
    let src;
    try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return; }
    scan(src).forEach(h => rows.push(Object.assign({ file: f }, h)));
  });
  const claims = rows.filter(r => r.klass === 'claim');
  const disclosures = rows.filter(r => r.klass === 'disclosure');

  console.log('VACUOUS VERDICTS — the other half of register 23\'s sweep\n');
  console.log('  scanned ' + all.length + ' file(s) in ' + DIRS.join(', '));
  console.log('  a hit is a NAMED control (or a ck/check/ok call) whose verdict is the');
  console.log('  literal `true`. An unnamed `return { ok: true }` is a RESULT, not a');
  console.log('  control, and is not a hit.\n');

  console.log('  ── ' + claims.length + ' CLAIM(S): the entry names a property and asserts '
    + 'it by writing true');
  claims.forEach(r => console.log('     ' + r.file + '  ' + r.name
    + (r.why ? '\n         why: ' + r.why.slice(0, 110) : '')));

  console.log('\n  ── ' + disclosures.length + ' DISCLOSURE(S): the entry says of itself '
    + 'that it reports rather than tests');
  if (showAll) {
    disclosures.forEach(r => console.log('     ' + r.file + '  ' + r.name));
  } else {
    console.log('     (run with --all to list them)');
  }

  console.log('\n  ⚠️  THE SPLIT IS A HEURISTIC AND THE TOOL DOES NOT PRETEND OTHERWISE:');
  console.log('      it reads what the entry says ABOUT ITSELF. A claim wearing the word');
  console.log('      "reported" lands in the wrong column. Read the `why` before filing.');
  console.log('  ⚠️  NO --strict, DELIBERATELY. A twenty-row list arriving as a red gate');
  console.log('      becomes an argument instead of a queue. Fixes are register rows.');

  const rep = {
    _territory: 'TERRITORY: A — draft/tools/vacuous_verdict_sweep.js',
    _answers: 'register 23 (the verdict half), given a durable form per register 406',
    _generated_at: new Date().toISOString(),
    _caveat: 'the claim/disclosure split is a heuristic on the entry\'s own text',
    scanned: all.length, claims: claims, disclosures: disclosures,
  };
  const i = process.argv.indexOf('--json');
  if (i >= 0) {
    fs.writeFileSync(process.argv[i + 1], JSON.stringify(rep, null, 1) + '\n');
    console.log('\n  wrote ' + process.argv[i + 1]);
  }
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { scan, classify };

#!/usr/bin/env node
/* TERRITORY: A. THE OTHER HALF OF REGISTER 23'S SWEEP.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Register 23 swept this repo for vacuous VERDICTS — `check(..., true)` — and
 * found twenty-one across thirteen suites. That sweep looked for a control
 * whose ANSWER was hardcoded. Nobody ever swept for a control whose
 * EXPECTATION is hardcoded, and that is the other way the same defect lands:
 *
 *     C5_deterministic_run_inside_the_distribution: (() => {
 *       const det = { QB: 2, RB: 3, WR: 4, TE: 1, K: 1, DEF: 1 };   // <- HERE
 *       const inside = POS.every(q => det[q] >= stat[q].min && ...);
 *
 * `det` was the P144 arm's result of 2026-08-19 frozen in as a literal, so the
 * control did not check what its name said. It checked whether the current arm
 * still resembles an arm from earlier that day, and it stayed green while two
 * of its six cells drifted (register 395; register 118 named the defect and
 * did not generalise it).
 *
 * ── THE DISCRIMINATOR, AND WHY IT IS NOT "ANY NUMBER IN A CONTROL" ─────────
 *
 * A control is ALLOWED to carry numbers. `worst < 1e-12` is a TOLERANCE and
 * `gap > 1.0` is a BOUND — both say how much slack the check permits, and
 * neither decays when the code changes. A test fixture is allowed to be a
 * literal too; building `{ a: 100, b: 110 }` as INPUT is the right thing.
 * What decays is a literal standing in for a COMPUTED RESULT, and the three
 * conditions that identify one are at `frozenExpectations` below.
 *
 * ── RULE 3e: THE KNOWN POSITIVE IS REAL CODE, NOT A FIXTURE I WROTE ────────
 *
 * Register 121 is the reason this matters: a control built from an INVENTED
 * sample tests the invention. So the positive control here is the actual
 * pre-fix `average_draft.js` as it stood at the commit before register 395,
 * read out of git. If that file stops being flagged, this tool is broken.
 * The negative control is the same file AFTER the fix.
 *
 * ⚠️ THE STANDING LIST IS ZERO, WHICH IS THE ONLY REASON `--strict` IS HONEST
 * HERE. A sweep that opens with a backlog becomes an argument instead of a
 * ratchet; this one opens clean, so it can fail a build the first time someone
 * writes a new frozen expectation rather than accumulating a list. And an empty
 * list is NOT the evidence that it works — rule 3e — the git known-positive in
 * `--self-test` is.
 *
 * Run: node draft/tools/frozen_expectation_sweep.js [--strict] [--wide] [--json <path>]
 *      node draft/tools/frozen_expectation_sweep.js --self-test
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BUF = 64 * 1024 * 1024;          // register 391 — never the 1MB default

/* Where controls live. Deliberately not the whole repo: a literal in ordinary
 * code is a constant, not a frozen expectation, and flagging those would bury
 * the finding. */
const DIRS = [
  path.join('draft', 'tools'),
  path.join('draft', 'tests'),
  path.join('tools'),
];

/* A control body starts at one of these and runs to the end of its statement.
 *   - `C5_name: (() => {`     an object-literal control (draft/tools style)
 *   - `ck('...',`             an assertion call (draft/tests style)
 *   - `ctl.C6_name = {`       an assigned control
 */
const CONTROL_START = /(^|\s)(C\d+[a-z]?_[A-Za-z0-9_]*\s*[:=]|ctl\.[A-Za-z0-9_]+\s*=|ck\s*\()/;

/* ── THE SHARP RULE, AND THE BROAD ONE IT REPLACED ─────────────────────────
 *
 * The first cut flagged any object/array literal with >= 2 numeric members
 * inside a control body. It returned 211 candidates across 64 files, almost
 * all of them TEST FIXTURES — a test that builds `{ a: 100, b: 110 }` as INPUT
 * is doing exactly the right thing. A 211-row list nobody triages is worse
 * than no sweep, and shipping one would have been this repo's "matched on
 * vocabulary" failure a second time in the same tool.
 *
 * The defect is narrower than "a literal near a control". It is a literal
 * standing in for a COMPUTED RESULT, which has a signature:
 *
 *   1. it is a numeric structure (>= 2 numeric members — a bare scalar is a
 *      tolerance, and `worst < 1e-12` must never be flagged);
 *   2. it is bound to a LOCAL inside the control body;
 *   3. that local is then COMPARED (===, !==, >=, <=, >, <) against something
 *      the run produced.
 *
 * A fixture fails (3): it is passed as an argument, not compared. An input
 * constant fails (2) or (3). C5's `det` meets all three.
 *
 * MEASURED: on the pre-fix `average_draft.js` this flags exactly one thing and
 * it is `det`. Across all of `draft/tools` today it flags ZERO — which is why
 * it can be a ratchet rather than a backlog. Rule 3e is satisfied by the git
 * positive in `--self-test`, not by the empty list.
 *
 * `--wide` prints the broad scan instead, for a human triaging by hand. It is
 * never a gate. */
/* The local must sit on EITHER side of a comparison, with any number of
 * accessors between. `det[q] >= stat[q].min` puts it on the left with a
 * bracket; `got.QB === want.QB` puts it on the right with a dot. The first
 * version only matched the left-with-bracket form and its own self-test caught
 * that on the first run. */
const ACC = '(?:\\.[A-Za-z_$][\\w$]*|\\[[^\\]]*\\])*';
const OPS = '(?:===|!==|>=|<=|>|<)';
const LOCAL_LITERAL = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(\{[^{}]*\}|\[[^[\]]*\])/g;

function frozenExpectations(bodyCode) {
  const out = [];
  let m;
  LOCAL_LITERAL.lastIndex = 0;
  while ((m = LOCAL_LITERAL.exec(bodyCode)) !== null) {
    const name = m[1], lit = m[2];
    const nums = (lit.match(/(?::\s*|[[,]\s*)-?\d+(?:\.\d+)?(?:e-?\d+)?\s*(?=[,}\]])/g) || []).length;
    if (nums < 2) continue;
    const after = bodyCode.slice(m.index + m[0].length);
    const left = new RegExp('\\b' + name + '\\b' + ACC + '\\s*' + OPS);
    const right = new RegExp(OPS + '\\s*' + name + '\\b');
    if (!left.test(after) && !right.test(after)) continue;
    out.push({ name: name, numbers: nums, literal: lit.replace(/\s+/g, ' ').slice(0, 120) });
  }
  return out;
}

/* An object or array literal carrying two or more NUMERIC literals. Written to
 * be conservative: string members are fine (a label map is not an expectation),
 * and a single number is a bound, not a structure. Used only by `--wide`. */
function numericLiteralStructures(text) {
  const out = [];
  const re = /(\{[^{}]*\}|\[[^[\]]*\])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[1];
    /* count NUMBERS that appear as values, i.e. after `:` or as bare array
     * members. `slice(0, 3000)` style indices are not values of a literal. */
    const nums = body.match(/(?::\s*|[[,]\s*)-?\d+(?:\.\d+)?(?:e-?\d+)?\s*(?=[,}\]])/g) || [];
    if (nums.length >= 2) out.push({ literal: body.trim().replace(/\s+/g, ' '), numbers: nums.length });
  }
  return out;
}

/* Slice out each control body: from a control start to the matching close of
 * the brace/paren depth it opened at. Cheap bracket counting, and it is allowed
 * to be approximate — a slightly long body over-reports, which is the safe
 * direction for a report-only sweep. */
function controlBodies(src) {
  const bodies = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!CONTROL_START.test(lines[i])) continue;
    if (/^\s*(\*|\/\/)/.test(lines[i])) continue;            // a comment, not code
    let depth = 0, started = false, text = '';
    for (let j = i; j < lines.length && j < i + 60; j++) {
      const ln = lines[j];
      /* strip line comments and strings so their brackets do not count */
      /* ⚠️ REGEX LITERALS BROKE THE DEPTH COUNT AND BLED TWO BODIES INTO THE
       * NEXT ONE. `/\.sort\(|\.score/` carries an unbalanced `(`, so depth
       * never returned to zero and the body ran the full 60-line window,
       * picking up an unrelated literal further down the file. Both of the
       * sweep's first two false positives were this. Regex literals and
       * template strings are blanked alongside quoted strings. */
      const bare = ln.replace(/\/\/.*$/, '')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, '``')
        .replace(/(^|[=(,:!&|?+\[{;])\s*\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '$1 RE');
      text += ln + '\n';
      for (const ch of bare) {
        if (ch === '{' || ch === '(' || ch === '[') { depth++; started = true; }
        else if (ch === '}' || ch === ')' || ch === ']') depth--;
      }
      if (started && depth <= 0) break;
    }
    bodies.push({ line: i + 1, text: text });
  }
  return bodies;
}

/* strip comments — a literal quoted in a comment EXPLAINING this very defect is
 * not an instance of it, and that mistake has cost a commit here twice already
 * (register 391, and this tool's own known-positive anchor). */
const decomment = s => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* THE SHARP SCAN — what `--strict` gates on. */
function scanSource(src) {
  const hits = [];
  controlBodies(src).forEach(b => {
    frozenExpectations(decomment(b.text)).forEach(h => {
      hits.push({ line: b.line, name: h.name, numbers: h.numbers, literal: h.literal });
    });
  });
  return hits;
}

/* THE BROAD SCAN — `--wide` only, never a gate. Kept because a human triaging
 * by hand wants the wider net; a build does not. */
function scanSourceWide(src) {
  const hits = [];
  controlBodies(src).forEach(b => {
    numericLiteralStructures(decomment(b.text)).forEach(s => {
      hits.push({ line: b.line, numbers: s.numbers,
        literal: s.literal.length > 120 ? s.literal.slice(0, 117) + '...' : s.literal });
    });
  });
  return hits;
}

function listFiles() {
  const out = [];
  DIRS.forEach(d => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).forEach(f => {
      if (/\.(test\.)?js$/.test(f)) out.push(path.join(d, f));
    });
  });
  return out.sort();
}

/* ── controls ───────────────────────────────────────────────────────────────
 * The positive is the REAL pre-fix file out of git, found by walking back from
 * HEAD to the last commit whose average_draft.js still carries the literal.
 * If git is unavailable the control REFUSES rather than passing vacuously —
 * "could not check" and "checked and clean" must never look the same. */
function gitShow(rev, file) {
  return execFileSync('git', ['show', rev + ':' + file],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
}

function selfTest() {
  const FILE = 'draft/tools/average_draft.js';
  let pass = 0, fail = 0;
  const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + JSON.stringify(d).slice(0, 300) : ''))); };

  let revs;
  try {
    /* THE FULL HISTORY, not a window. A `-40` cap would work today and quietly
     * stop finding the known-positive the moment this file gains 40 more
     * revisions — a control with an expiry date nobody would notice, which is
     * the same family of defect this tool detects. */
    revs = execFileSync('git', ['log', '--format=%H', '--', FILE],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF }).trim().split('\n').filter(Boolean);
  } catch (e) { revs = null; }
  if (!revs || !revs.length) {
    console.log('FAIL  REFUSING: cannot read git history for ' + FILE + ', so the '
      + 'known-positive cannot be taken. A sweep that cannot prove it detects '
      + 'anything is not a sweep.');
    return 1;
  }

  /* Find the newest revision whose CODE still contains the frozen literal.
   *
   * ⚠️ THE FIRST VERSION OF THIS TESTED THE RAW FILE AND MATCHED THE FIXED ONE,
   * because the comment I wrote to EXPLAIN the defect quotes the literal
   * verbatim. The control went red on its first run and the fault was the
   * anchor, not the detector — which is CLAUDE.md's own listed failure, "a
   * sweep that matched on vocabulary". Comments are stripped before the test,
   * so the anchor is about code. */
  const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  let before = null;
  for (const r of revs) {
    let s; try { s = gitShow(r, FILE); } catch (e) { continue; }
    if (/const det = \{\s*QB:/.test(decomment(s))) { before = { rev: r, src: s }; break; }
  }
  ck('KNOWN POSITIVE — a real pre-fix revision of ' + FILE + ' was found in git '
    + '(not a fixture I wrote: register 121)', !!before, { searched: revs.length });
  if (before) {
    const hits = scanSource(before.src);
    const det = hits.find(h => /QB:\s*2/.test(h.literal) && /RB:\s*3/.test(h.literal));
    ck('  and the sweep FLAGS its frozen `det` literal', !!det,
      { hits: hits.length, sample: (hits[0] || {}).literal });
  }

  const now = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
  const nowHits = scanSource(now);
  ck('KNOWN NEGATIVE — the FIXED file no longer carries that literal',
    !nowHits.some(h => /QB:\s*2/.test(h.literal) && /RB:\s*3/.test(h.literal)),
    nowHits.slice(0, 3));

  /* the tolerance/bound must NOT be flagged, or the sweep is unusable */
  ck('a bare tolerance is NOT flagged (`worst < 1e-12` is slack, not an expectation)',
    scanSource("ctl.C1_x = { ok: worst < 1e-12, worst_abs_diff: worst };").length === 0,
    scanSource("ctl.C1_x = { ok: worst < 1e-12, worst_abs_diff: worst };"));
  ck('a single bound is NOT flagged either',
    scanSource("ck('gap is material', VS.RB.starter - rbOld > 1.0);").length === 0);
  ck('a REPORTED pair of computed values is not flagged (they are variables, '
    + 'not literals)',
    scanSource("ctl.C2_x = { ok: a > b, got: a, want: b };").length === 0);
  ck('but a two-number literal expectation IS flagged',
    scanSource("ctl.C3_x = (() => { const want = { QB: 2, RB: 3 }; return { ok: got.QB === want.QB }; })();").length > 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' self-tests passed');
  return fail ? 1 : 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const wide = process.argv.includes('--wide');
  const scan = wide ? scanSourceWide : scanSource;
  /* This file quotes the defect it detects, in a self-test string. Excluding it
   * is stated rather than silent — the alternative is a tool that reports itself
   * forever and teaches everyone to ignore its output. */
  const files = listFiles().filter(f => path.basename(f) !== 'frozen_expectation_sweep.js');
  const report = [];
  files.forEach(f => {
    let src;
    try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return; }
    const hits = scan(src);
    if (hits.length) report.push({ file: f, hits: hits });
  });
  const total = report.reduce((n, r) => n + r.hits.length, 0);

  console.log('FROZEN EXPECTATIONS IN CONTROLS — the other half of register 23\n');
  console.log('  scanned ' + files.length + ' file(s) in ' + DIRS.join(', '));
  if (wide) {
    console.log('  --wide: ANY object/array literal with >= 2 numeric values inside a');
    console.log('  control body. Mostly test FIXTURES, which are legitimate. For a human');
    console.log('  triaging by hand; never a gate.\n');
  } else {
    console.log('  a hit is a numeric-structure literal bound to a LOCAL inside a control');
    console.log('  body and then COMPARED against something the run produced. A tolerance,');
    console.log('  a bound and a test fixture are all NOT hits.\n');
  }
  report.forEach(r => {
    console.log('  ' + r.file);
    r.hits.forEach(h => console.log('      :' + h.line + '  ' + (h.name ? h.name + ' = ' : '')
      + h.literal + '   (' + h.numbers + ' numbers)'));
  });
  console.log('\n  ' + total + ' ' + (wide ? 'candidate' : 'hit') + '(s) in '
    + report.length + ' file(s)');
  if (!total && !wide) {
    console.log('  ✅ clean. NOT evidence the sweep works — that is --self-test, which');
    console.log('     proves it against the real pre-fix average_draft.js out of git.');
  }
  if (wide) {
    console.log('\n  ⚠️  CANDIDATES, NOT DEFECTS. Read each control\'s name and `why`');
    console.log('      string before filing anything (rule 3i).');
  }

  const i = process.argv.indexOf('--json');
  if (i >= 0) {
    fs.writeFileSync(process.argv[i + 1], JSON.stringify({
      _territory: 'TERRITORY: A — draft/tools/frozen_expectation_sweep.js',
      _generated_at: new Date().toISOString(),
      _note: 'candidates, not defects — see the module header',
      scanned: files.length, total: total, report: report }, null, 1) + '\n');
    console.log('\n  wrote ' + process.argv[i + 1]);
  }
  return (process.argv.includes('--strict') && total > 0) ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { scanSource, scanSourceWide, frozenExpectations, numericLiteralStructures, controlBodies };

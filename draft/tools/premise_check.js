#!/usr/bin/env node
/* TERRITORY: A.  WHICH OF OUR PINNED PREMISES ARE STILL TRUE?
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * On 2026-08-27/28 nine defects in one session shared one shape, and it was
 * not "a bug". Each was an assertion that outlived the condition it was
 * written under and went on asserting: a control that forbade its own goal
 * state, a tiebreak pinned inert against a board whose source had changed, a
 * per-row guard running a whole-register health check because the backlog was
 * zero the day it shipped, a test pinning a superseded document, and — an hour
 * after that diagnosis was written down — a SessionStart hook matched to when
 * its author NOTICED the problem rather than to when it happens.
 *
 * `DEFECT-REGISTER.md` already chases findings by DATE. A date cannot express
 * "void the moment the ceiling source changes", so a premise that dies between
 * rechecks stays quietly true-looking until somebody trips on it. This chases
 * them by CONDITION instead, and every condition is a number measured off live
 * state rather than a sentence in a comment.
 *
 * ── WHAT IT WILL NOT DO ────────────────────────────────────────────────────
 *
 * IT DOES NOT DECIDE. A VOID verdict says a premise is no longer true; it says
 * nothing about what should replace it. Every entry carries its own `note`
 * naming the register row that owns the consequence.
 *
 * IT DOES NOT BLOCK by default. Exit 0 with a report, so it can be run
 * reflexively; `--strict` exits 1 on any VOID for a caller that wants a gate.
 * A checker that turns main red on its first useful finding gets switched off.
 *
 * ── HOW IT AVOIDS BECOMING THE THING IT CATCHES ────────────────────────────
 *
 * Three ways, because a premise checker that itself decays is worse than none:
 *
 *   ANCHOR MOVED — each entry names a file and a literal string that must
 *     still appear in it. When the anchor goes, the code moved out from under
 *     the premise and the entry is REPORTED, never silently evaluated against
 *     something that is no longer there.
 *   CANNOT CHECK — a probe that throws is never treated as "fine". The run is
 *     reported unhealthy and --strict fails on it.
 *   SELF-TEST — `--self-test` proves it can return every verdict, against
 *     cases whose answers are known, including the two failure verdicts. A
 *     checker whose negative case has never fired has been run, not tested.
 *
 * Run: node draft/tools/premise_check.js [--strict]
 *      node draft/tools/premise_check.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const REGISTRY = path.join(ROOT, 'draft', 'config', 'premises.json');

const OPS = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
};

function describe(h) { return h.op + ' ' + h.value; }

/** One premise -> { verdict, measured, why }. Pure given its inputs. */
function evaluate(p, probes, readFile) {
  if (!p || !p.id) return { verdict: 'CANNOT_CHECK', why: 'entry has no id' };
  if (!p.holds_when || !OPS[p.holds_when.op]) {
    return { verdict: 'CANNOT_CHECK', why: 'unknown operator ' + JSON.stringify(p.holds_when) };
  }
  // ANCHOR FIRST. If the code moved, the measurement below may be answering a
  // question about a file that no longer contains the thing being pinned.
  if (p.where && p.anchor) {
    let txt = null;
    try { txt = readFile(path.join(ROOT, p.where)); } catch (e) { txt = null; }
    if (txt === null) {
      return { verdict: 'ANCHOR_MOVED', why: p.where + ' is gone' };
    }
    if (txt.indexOf(p.anchor) < 0) {
      return { verdict: 'ANCHOR_MOVED', why: p.where + ' no longer contains "' + p.anchor + '"' };
    }
  }
  const fn = probes[p.probe];
  if (typeof fn !== 'function') {
    return { verdict: 'CANNOT_CHECK', why: 'no probe named ' + p.probe };
  }
  let measured;
  try { measured = fn(); } catch (e) {
    return { verdict: 'CANNOT_CHECK', why: p.probe + ' threw: ' + e.message };
  }
  if (typeof measured !== 'number' || !isFinite(measured)) {
    return { verdict: 'CANNOT_CHECK', measured: measured,
      why: p.probe + ' returned ' + JSON.stringify(measured) + ', not a finite number' };
  }
  const holds = OPS[p.holds_when.op](measured, p.holds_when.value);
  return { verdict: holds ? 'HOLDS' : 'VOID', measured: measured };
}

function selfTest() {
  const readOK = () => 'contains THE_ANCHOR somewhere';
  const readGone = () => { throw new Error('ENOENT'); };
  const probes = {
    zero: () => 0,
    ten: () => 10,
    boom: () => { throw new Error('probe exploded'); },
    words: () => 'not a number',
  };
  const base = { id: 'x', where: 'f.js', anchor: 'THE_ANCHOR' };
  const cases = [
    ['KNOWN-NEGATIVE — a premise that still holds reports HOLDS',
      Object.assign({}, base, { probe: 'ten', holds_when: { op: 'gt', value: 0 } }), readOK, 'HOLDS'],
    ['KNOWN-POSITIVE — a premise whose measurement no longer satisfies it is VOID',
      Object.assign({}, base, { probe: 'zero', holds_when: { op: 'gt', value: 0 } }), readOK, 'VOID'],
    ['a vanished anchor reports ANCHOR_MOVED, never a verdict on the premise',
      Object.assign({}, base, { anchor: 'NOT_PRESENT', probe: 'ten', holds_when: { op: 'gt', value: 0 } }), readOK, 'ANCHOR_MOVED'],
    ['a missing FILE is ANCHOR_MOVED too, not a silent pass',
      Object.assign({}, base, { probe: 'ten', holds_when: { op: 'gt', value: 0 } }), readGone, 'ANCHOR_MOVED'],
    ['a probe that THROWS is CANNOT_CHECK, never "fine"',
      Object.assign({}, base, { probe: 'boom', holds_when: { op: 'gt', value: 0 } }), readOK, 'CANNOT_CHECK'],
    ['a probe returning a NON-NUMBER is CANNOT_CHECK — a truthy string must not read as a pass',
      Object.assign({}, base, { probe: 'words', holds_when: { op: 'gt', value: 0 } }), readOK, 'CANNOT_CHECK'],
    ['an unknown probe name is CANNOT_CHECK, so a typo cannot retire a premise',
      Object.assign({}, base, { probe: 'nope', holds_when: { op: 'gt', value: 0 } }), readOK, 'CANNOT_CHECK'],
    ['an unknown OPERATOR is CANNOT_CHECK rather than defaulting to true',
      Object.assign({}, base, { probe: 'ten', holds_when: { op: 'approximately', value: 0 } }), readOK, 'CANNOT_CHECK'],
    ['eq is exact: 10 eq 10 HOLDS',
      Object.assign({}, base, { probe: 'ten', holds_when: { op: 'eq', value: 10 } }), readOK, 'HOLDS'],
    ['eq is exact: 10 eq 45 is VOID (the shipped-weight shape)',
      Object.assign({}, base, { probe: 'ten', holds_when: { op: 'eq', value: 45 } }), readOK, 'VOID'],
  ];
  let bad = 0;
  for (const [name, entry, reader, want] of cases) {
    const got = evaluate(entry, probes, reader).verdict;
    const ok = got === want;
    if (!ok) bad++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  — got ' + got + ', want ' + want));
  }

  // The registry itself must be usable, or this tool reports a clean sheet on
  // a file it never managed to read.
  let reg = null;
  try { reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch (e) { /* below */ }
  const okReg = reg && Array.isArray(reg.premises) && reg.premises.length >= 3;
  if (!okReg) bad++;
  console.log((okReg ? 'PASS  ' : 'FAIL  ')
    + 'CONTROL — the live registry parses and carries entries, so a clean report '
    + 'cannot come from an unread file');

  const probeMod = require(path.join(ROOT, 'draft', 'tools', 'premise_probes.js')).PROBES;
  const orphans = okReg ? reg.premises.filter(p => typeof probeMod[p.probe] !== 'function') : [];
  const okProbes = orphans.length === 0;
  if (!okProbes) bad++;
  console.log((okProbes ? 'PASS  ' : 'FAIL  ')
    + 'CONTROL — every registered premise names a probe that exists'
    + (okProbes ? '' : ': ' + orphans.map(o => o.id + '->' + o.probe).join(', ')));

  const total = cases.length + 2;
  console.log('\n' + (total - bad) + '/' + total + ' self-tests passed');
  return bad ? 1 : 0;
}

function main(argv) {
  if (argv.indexOf('--self-test') >= 0) return selfTest();

  let reg;
  try { reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch (e) {
    console.error('PREMISE CHECK: cannot read ' + path.relative(ROOT, REGISTRY)
      + ' (' + e.message + '). REFUSING to report "nothing is void" from a file '
      + 'it could not open.');
    return 2;
  }
  const probes = require(path.join(ROOT, 'draft', 'tools', 'premise_probes.js')).PROBES;
  const readFile = f => fs.readFileSync(f, 'utf8');

  const rows = (reg.premises || []).map(p => Object.assign({ p }, evaluate(p, probes, readFile)));
  const by = k => rows.filter(r => r.verdict === k);

  console.log('\nPREMISE CHECK — is what we pinned still true?  (register 385)\n');
  console.log('  ' + rows.length + ' pinned premise(s) checked against live state\n');

  const ICON = { HOLDS: '✅ HOLDS       ', VOID: '⛔ VOID        ',
    ANCHOR_MOVED: '⚠️  ANCHOR MOVED', CANNOT_CHECK: '⚠️  CANNOT CHECK' };
  for (const r of rows) {
    console.log('  ' + ICON[r.verdict] + '  ' + r.p.id);
    console.log('      claim:    ' + r.p.claim);
    console.log('      measured: ' + (r.measured === undefined ? '(not measured)' : r.p.probe + ' = ' + r.measured)
      + '   holds when ' + describe(r.p.holds_when));
    if (r.why) console.log('      why:      ' + r.why);
    if (r.verdict !== 'HOLDS' && r.p.note) console.log('      note:     ' + r.p.note);
    console.log('');
  }

  const void_ = by('VOID').length, moved = by('ANCHOR_MOVED').length, cant = by('CANNOT_CHECK').length;
  console.log('  ✅ holds ' + by('HOLDS').length + '   ⛔ void ' + void_
    + '   ⚠️ anchor moved ' + moved + '   ⚠️ cannot check ' + cant + '\n');
  if (void_) {
    console.log('  A VOID PREMISE IS NOT A BUG REPORT — it is a licence to stop trusting');
    console.log('  everything that rests on it. Re-derive before acting on any claim above.');
  }
  console.log('\n  REPORT ONLY (--strict to gate). This tool never decides what replaces');
  console.log('  a dead premise; each note names the register row that owns that.');

  const strict = argv.indexOf('--strict') >= 0;
  return strict && (void_ || moved || cant) ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { evaluate, OPS };

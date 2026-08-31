'use strict';
/* TERRITORY: A.  THE PREMISE CHECKER AND ITS REGISTRY STAY HONEST.
 *
 * ⚠️ READ THIS BEFORE ADDING AN ARM. This file must NOT assert how many
 * premises currently hold. Pinning "6 void, 1 holds" would be precisely the
 * defect the checker exists to find — an assertion true on the day it was
 * written and quietly false afterwards — and it would go red every time
 * somebody FIXED something, which is the worst possible incentive.
 *
 * So every arm here is about the MECHANISM and the REGISTRY's integrity:
 * can the checker still return each verdict, does every entry name a probe
 * that exists, does every anchor still resolve. The verdicts themselves are a
 * report, not a pass/fail.
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PC = require(path.join(ROOT, 'draft', 'tools', 'premise_check.js'));
const { PROBES } = require(path.join(ROOT, 'draft', 'tools', 'premise_probes.js'));
const REGISTRY = path.join(ROOT, 'draft', 'config', 'premises.json');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// ── 1. The checker proves itself, and CI trusts that before the verdicts ────
{
  let out = '', code = 0;
  try {
    out = execFileSync('node', ['draft/tools/premise_check.js', '--self-test'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { code = 1; out = String((e.stdout || '') + (e.stderr || '')); }
  ck('the checker\'s own self-test passes — it can return every verdict',
    code === 0 && /self-tests passed/.test(out) && !/^FAIL/m.test(out), out.slice(-400));
}

// ── 2. REGISTRY INTEGRITY — the ways it rots ───────────────────────────────
const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const prem = reg.premises || [];
{
  ck('the registry carries entries at all — an empty one reports a clean sheet '
    + 'for the wrong reason', prem.length >= 3, { n: prem.length });

  const ids = prem.map(p => p.id);
  ck('every premise has a unique id, so a register row can cite one',
    new Set(ids).size === ids.length && ids.every(Boolean), ids);

  const missingFields = prem.filter(p => !p.claim || !p.probe || !p.holds_when || !p.note);
  ck('every premise states its CLAIM, its probe, its condition and what to do '
    + 'when it dies — a verdict with no note is a finding nobody can action',
  missingFields.length === 0, missingFields.map(p => p.id));

  const badOps = prem.filter(p => !PC.OPS[(p.holds_when || {}).op]);
  ck('every condition uses a known operator, so none can silently never fire',
    badOps.length === 0, badOps.map(p => p.id + ':' + (p.holds_when || {}).op));

  const orphan = prem.filter(p => typeof PROBES[p.probe] !== 'function');
  ck('every premise names a probe that EXISTS — a typo would retire a premise '
    + 'by making it permanently uncheckable', orphan.length === 0,
  orphan.map(p => p.id + ' -> ' + p.probe));
}

// ── 3. ANCHORS STILL RESOLVE ───────────────────────────────────────────────
/* This one IS a live assertion, deliberately: when the code a premise pins
 * moves, the registry entry has to move with it. Red here means "go re-point
 * the entry", which is maintenance the mechanism cannot do for itself. */
{
  const broken = [];
  for (const p of prem) {
    if (!p.where || !p.anchor) continue;
    const f = path.join(ROOT, p.where);
    if (!fs.existsSync(f)) { broken.push(p.id + ': ' + p.where + ' missing'); continue; }
    if (fs.readFileSync(f, 'utf8').indexOf(p.anchor) < 0) {
      broken.push(p.id + ': "' + p.anchor + '" no longer in ' + p.where);
    }
  }
  ck('every anchor still resolves — the code each premise pins has not moved '
    + 'out from under it', broken.length === 0, broken);
}

// ── 4. EVERY PROBE RUNS AND RETURNS A FINITE NUMBER ────────────────────────
/* Not what it returns — that is the report. That it CAN return, off live
 * state, without throwing. A probe that has quietly started throwing renders
 * as CANNOT_CHECK, which is easy to skim past in a long report. */
{
  const bad = [];
  for (const name of Object.keys(PROBES)) {
    let v;
    try { v = PROBES[name](); } catch (e) { bad.push(name + ' threw: ' + e.message); continue; }
    if (typeof v !== 'number' || !isFinite(v)) bad.push(name + ' returned ' + JSON.stringify(v));
  }
  ck('every probe runs against live state and returns a finite number',
    bad.length === 0, bad);
}

// ── 5. REPORT MODE NEVER BLOCKS; STRICT MODE CAN ───────────────────────────
/* The report must stay runnable reflexively even when everything is void —
 * a checker that turns main red on its first useful finding gets switched off,
 * which is register 300's lesson about a permanently red signal. */
{
  let code = 0;
  try { execFileSync('node', ['draft/tools/premise_check.js'], { cwd: ROOT, stdio: 'pipe' }); }
  catch (e) { code = e.status || 1; }
  ck('report mode exits 0 whatever the verdicts, so it is safe to run always',
    code === 0, { exit: code });

  // And --strict must be able to fail, proven on a synthetic void rather than
  // on today's live state, which will change.
  const voidCase = PC.evaluate(
    { id: 'synthetic', probe: 'p', holds_when: { op: 'eq', value: 1 } },
    { p: () => 2 }, () => '');
  ck('  a failing condition still evaluates to VOID, which is what --strict '
    + 'gates on', voidCase.verdict === 'VOID' && voidCase.measured === 2, voidCase);
}

console.log('\n' + pass + '/' + (pass + fail) + ' premise-check arms passed');
process.exit(fail ? 1 : 0);

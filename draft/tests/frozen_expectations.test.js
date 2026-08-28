// TERRITORY: A
// THE RATCHET FOR CONTROLS WHOSE EXPECTATION IS A FROZEN LITERAL.
//
// Register 23 swept for vacuous VERDICTS — `check(..., true)` — and found 21.
// Nobody swept for hardcoded EXPECTATIONS, which is the other way the same
// defect lands, and both instances found so far were found BY HAND while
// working an unrelated register row:
//
//   average_draft.js  C5  `const det = { QB: 2, RB: 3, WR: 4, ... }`  (reg 118/395)
//   lineup_sim.js     C3  `const NEED1 = { QB: 1, RB: 2, WR: 2, ... }` (reg 396)
//
// The second was found by the sweep itself, on its first real run, and it was
// checking EIGHT of the league's NINE slots while its own `why` string said
// nine — the missing one was the flex.
//
// The standing list is ZERO, so this is a ratchet and not a backlog: it goes
// red the first time someone writes a new frozen expectation, rather than
// opening with a list to argue about.
//
// ⚠️ AN EMPTY LIST IS NOT EVIDENCE THE SWEEP WORKS (rule 3e). The tool's own
// --self-test proves it against real pre-fix code out of git, and this suite
// asserts that self-test passes before it believes the zero.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'draft', 'tools', 'frozen_expectation_sweep.js');
const BUF = 64 * 1024 * 1024;                 // register 391 — never the 1MB default

let pass = 0, fail = 0;
const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + String(d).slice(0, 700) : ''))); };

function run(args) {
  try {
    return { code: 0, out: execFileSync('node', [TOOL].concat(args),
      { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF }) };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status,
      out: String((e.stdout || '') + (e.stderr || '')) };
  }
}

// ── 1. THE SWEEP CAN PROVE IT DETECTS ANYTHING AT ALL ──────────────────────
// This has to come first. A green --strict below means nothing if the detector
// is a stub, and a stub is exactly the defect this whole suite is about.
{
  const r = run(['--self-test']);
  ck('the sweep passes its own self-test, which is anchored on REAL pre-fix code '
    + 'out of git rather than a fixture (register 121)', r.code === 0, r.out);
  ck('  and that self-test really contains a known POSITIVE arm',
    /KNOWN POSITIVE/.test(r.out) && /FLAGS its frozen/.test(r.out), r.out.slice(0, 400));
  ck('  and a known NEGATIVE arm, so it is not simply flagging everything',
    /KNOWN NEGATIVE/.test(r.out), r.out.slice(0, 400));
}

// ── 2. THE RATCHET ─────────────────────────────────────────────────────────
{
  const r = run(['--strict']);
  ck('no control in draft/tools, draft/tests or tools compares against a frozen '
    + 'numeric-structure literal', r.code === 0, r.out);
}

// ── 3. THE TWO KNOWN INSTANCES STAY FIXED ──────────────────────────────────
// Named rather than left to the sweep alone: if either regresses, the failure
// should say WHICH row it reopens, not just "one hit somewhere".
{
  const S = require(path.join(ROOT, 'draft', 'tools', 'frozen_expectation_sweep.js'));
  const fs = require('fs');
  const read = f => fs.readFileSync(path.join(ROOT, 'draft', 'tools', f), 'utf8');

  ck('register 395 stays fixed — average_draft.js C5 computes its deterministic '
    + 'run instead of quoting one',
    S.scanSource(read('average_draft.js')).length === 0,
    JSON.stringify(S.scanSource(read('average_draft.js'))));

  ck('register 396 stays fixed — lineup_sim.js C3 derives its slot requirement '
    + 'from SLOTS instead of retyping it',
    S.scanSource(read('lineup_sim.js')).length === 0,
    JSON.stringify(S.scanSource(read('lineup_sim.js'))));

  // And the derivation must still cover the FLEX, which is the half the frozen
  // literal omitted. Asserted on the ARTIFACT, so it is the shipped run's own
  // requirement being checked and not a re-reading of the source.
  const art = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'lineup_sim.json'), 'utf8'));
  const req = (art.controls.C3_every_arm_can_field_a_lineup || {}).required_from_SLOTS;
  ck('  and the requirement it derived includes the FLEX seat the literal missed',
    !!req && req.FLEX >= 1, JSON.stringify(req));
  ck('  and it sums to the nine slots the simulator actually fills',
    !!req && Object.values(req).reduce((a, b) => a + b, 0) === 9, JSON.stringify(req));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);

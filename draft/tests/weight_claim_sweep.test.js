// TERRITORY: relay
// THE SWEEP MUST CATCH REAL DRIFT AND IGNORE A CORRECTLY-QUOTED PAST VALUE.
//
// Register 5h is one mechanism with eight instances: a weight ruling ships and
// the prose quoting the old number never moves. The hard part is NOT finding
// quoted numbers — it is telling a stale claim from a legitimate one, because
// roughly half the mismatches in the first prototype were correct sentences:
//
//   · a description of a FROZEN artifact (baseline/v1.json really does carry
//     ceiling 0 — that sentence is register 5g and it is true)
//   · a historical experiment result ("stack ~0.5 (exp6 winner)")
//   · a RECORD of a past state (every register and ledger row)
//
// A checker that reddens on those teaches people to ignore it, which is this
// project's epitaph for the intervention-rate check. So the discrimination is
// what gets tested here, not the matching.
//
// Run: node draft/tests/weight_claim_sweep.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const W = require(path.join(ROOT, 'draft', 'tools', 'weight_claim_sweep.js'));

let pass = 0;
function ok(name, fn) { fn(); console.log('PASS  ' + name); pass++; }

const LIVE = { MEASURED_WEIGHTS: { ceiling: 0.45, stack: 1, value: 1, tier: 0 },
  DEFAULT_WEIGHTS: { ceiling: 0.6 } };

// ── 0. THE CONSTANTS ARE READ, AND A FAILURE TO READ THEM IS LOUD ─────────
ok('CONTROL — the REAL engine parses into real weights, so a clean sweep is a '
  + 'measurement rather than a failed read', () => {
  const w = W.liveWeights(fs.readFileSync(
    path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8'));
  assert.ok(w.MEASURED_WEIGHTS, 'no MEASURED_WEIGHTS');
  assert.strictEqual(typeof w.MEASURED_WEIGHTS.ceiling, 'number');
});

ok('FAIL ARM — an engine with no readable constants THROWS rather than passing '
  + 'every claim, which would look exactly like "no drift"', () => {
  assert.throws(() => W.liveWeights('var x = 1;'), /CANNOT READ MEASURED_WEIGHTS/);
  assert.throws(() => W.liveWeights('const MEASURED_WEIGHTS = {};'),
    /CANNOT READ MEASURED_WEIGHTS/);
});

// ── 1. WHAT COUNTS AS A CLAIM ─────────────────────────────────────────────
ok('a tight separator IS a claim — colon, tilde, equals, "at", "to"', () => {
  ['ceiling: 0', 'ceiling ~0', 'ceiling = 0', 'ceiling at 0', 'ceiling to 0']
    .forEach((s) => {
      const c = W.claimsIn('the weight ' + s + ' today');
      assert.strictEqual(c.length, 1, s + ' -> ' + JSON.stringify(c));
      assert.strictEqual(c[0].key, 'ceiling');
      assert.strictEqual(c[0].value, 0);
    });
});

ok('CONTROL — a LOOSE mention is NOT a claim. "the ceiling term, and the 0.5 '
  + 'weight elsewhere" must not match, or every paragraph mentioning a weight '
  + 'becomes a hit and the list stops being read.', () => {
  assert.deepStrictEqual(
    W.claimsIn('raising the ceiling term, and separately the 0.5 weight'), []);
});

ok('CONTROL — a number outside weight range is ignored: a year, a pick number, '
  + 'a player count', () => {
  assert.deepStrictEqual(W.claimsIn('ceiling: 2026'), []);
  assert.deepStrictEqual(W.claimsIn('value at 148'), []);
});

ok('STRUCK-THROUGH TEXT IS IGNORED — striking the old value and writing the new '
  + 'one beside it is how this repo records a correction, and the struck half '
  + 'must not fire forever', () => {
  assert.deepStrictEqual(W.claimsIn('~~ceiling = 0~~ it is now 0.45'), []);
  //: and the unstruck half still registers
  assert.strictEqual(W.claimsIn('~~ceiling = 0~~ now ceiling: 0.45').length, 1);
});

// ── 2. THE DISCRIMINATION, WHICH IS THE WHOLE POINT ───────────────────────
ok('FAIL ARM — a stale claim in a state-asserting file is flagged', () => {
  const tmp = path.join(ROOT, 'draft', 'tests', '.tmp_weight_claim.md');
  fs.writeFileSync(tmp, 'The tool ships `ceiling = 0` today.\n');
  try {
    const r = W.sweep(['draft/tests/.tmp_weight_claim.md'], LIVE);
    assert.strictEqual(r.flagged.length, 1, JSON.stringify(r.flagged));
    assert.strictEqual(r.flagged[0].key, 'ceiling');
    assert.strictEqual(r.flagged[0].live, 0.45);
  } finally { fs.unlinkSync(tmp); }
});

ok('CONTROL — a claim MATCHING the live value is not flagged', () => {
  const tmp = path.join(ROOT, 'draft', 'tests', '.tmp_weight_claim.md');
  fs.writeFileSync(tmp, 'The tool ships `ceiling = 0.45` today.\n');
  try {
    assert.deepStrictEqual(
      W.sweep(['draft/tests/.tmp_weight_claim.md'], LIVE).flagged, []);
  } finally { fs.unlinkSync(tmp); }
});

ok('CONTROL — a claim matching DEFAULT_WEIGHTS is not flagged either; two live '
  + 'systems exist and quoting either is legitimate', () => {
  const tmp = path.join(ROOT, 'draft', 'tests', '.tmp_weight_claim.md');
  fs.writeFileSync(tmp, 'autoWeights ships `ceiling = 0.6`.\n');
  try {
    assert.deepStrictEqual(
      W.sweep(['draft/tests/.tmp_weight_claim.md'], LIVE).flagged, []);
  } finally { fs.unlinkSync(tmp); }
});

ok('THE SCOPE IS REAL — the register and the ledger are NOT swept, because a '
  + 'past value recorded correctly is not drift and reddening on it is how a '
  + 'check gets switched off', () => {
  assert.ok(!W.SCOPE.includes('DEFECT-REGISTER.md'));
  assert.ok(!W.SCOPE.includes('PREDICTION-LEDGER.md'));
  assert.ok(W.SCOPE.includes('CLAUDE.md'));
  assert.ok(W.SCOPE.includes('DRAFT-WEEK-BRIEF.md'));
});

ok('EVERY ALLOWLIST ENTRY CARRIES A REASON, and a real one — an allowlist '
  + 'without reasons is a mute button', () => {
  const e = Object.entries(W.ALLOW);
  assert.ok(e.length > 0, 'the allowlist is empty; the controls below prove nothing');
  e.forEach(([k, why]) => {
    assert.ok(/^[^:]+::[a-z]+=-?\d/.test(k), 'malformed allow key: ' + k);
    assert.ok(typeof why === 'string' && why.length > 60,
      'allowlist entry with no real reason: ' + k);
  });
});

ok('CONTROL — the allowlist is SPECIFIC: it exempts one quote in one file, not '
  + 'the value everywhere', () => {
  const tmp = path.join(ROOT, 'draft', 'tests', '.tmp_weight_claim.md');
  fs.writeFileSync(tmp, 'The engine ships `ceiling: 0`.\n');
  try {
    //: the same key=value IS allowlisted in CLAUDE.md and must still fire here
    assert.ok(W.ALLOW['CLAUDE.md::ceiling=0'], 'precondition: that entry exists');
    assert.strictEqual(
      W.sweep(['draft/tests/.tmp_weight_claim.md'], LIVE).flagged.length, 1);
  } finally { fs.unlinkSync(tmp); }
});

// ── 3. THE LIVE REPO ──────────────────────────────────────────────────────
ok('THE LIVE REPO has no state-asserting file quoting a weight the engine does '
  + 'not carry — it had TWO in DRAFT-WEEK-BRIEF.md until 2026-08-18, in the file '
  + 'CLAUDE.md tells every session to read first', () => {
  const w = W.liveWeights(fs.readFileSync(
    path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8'));
  const r = W.sweep(W.SCOPE, w);
  assert.deepStrictEqual(r.flagged.map((f) => f.id), []);
  assert.ok(r.scanned > 0, 'zero claims scanned — the sweep read nothing');
});

console.log('\n' + pass + '/' + pass + ' checks passed');

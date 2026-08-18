// TERRITORY: relay
// THE BREADTH CHECK MUST DISCRIMINATE, OR IT IS A PRETTY TABLE.
//
// This file reports "1 of 8 axes LIVE". That number is only worth reading if the
// tool can also say 2, and can say so for the right reason. Rule 3e: a survey
// that reports scarcity because its parser is broken looks exactly like a survey
// that reports scarcity because the arm set is narrow — and this repo has
// already paid for five false negatives in one evening that all read clean.
//
// So every classification below is asserted twice: once against the real
// projector, and once against a MUTATED arm set that should flip it. A control
// that does not flip fails the build.
//
// Run: node draft/tests/projection_breadth.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const B = require(path.join(ROOT, 'draft', 'tools', 'projection_breadth.js'));

const SRC = fs.readFileSync(
  path.join(ROOT, 'draft', 'weekly_own_projection.py'), 'utf8');

let pass = 0;
function ok(name, fn) { fn(); console.log('PASS  ' + name); pass++; }

/* A synthetic projector source, so mutants do not depend on the real file's
 * exact formatting surviving unrelated edits. */
const fake = (arms) =>
  'DEFAULT_ARMS = [\n'
  + arms.map((a) => `    {"name": "${a}", "divisor": 17, "tilt_scale": 1.0},\n`).join('')
  + ']\n';

// ── 0. THE PARSE IS REAL, AND REFUSES TO GUESS ────────────────────────────
ok('CONTROL — the REAL projector parses into a real arm set, so every count '
  + 'below is a measurement rather than a failed read', () => {
  const arms = B.liveArms(SRC);
  assert.ok(arms.length >= 5, 'expected >=5 arms, got ' + arms.length);
  assert.ok(arms.some((a) => a.name === 'v1'), JSON.stringify(arms));
  assert.ok(arms.every((a) => typeof a.name === 'string' && a.name.length));
});

ok('FAIL ARM — a projector with NO parseable DEFAULT_ARMS THROWS rather than '
  + 'reporting zero live axes, which would read as a catastrophic regression', () => {
  assert.throws(() => B.liveArms('x = 1\n'), /CANNOT FIND DEFAULT_ARMS/);
  assert.throws(() => B.liveArms('DEFAULT_ARMS = [\n]\n'), /CANNOT FIND|ZERO arms/);
});

ok('FAIL ARM — an arm set of empty dicts parses to zero and is rejected, not '
  + 'silently reported as "no axes covered"', () => {
  assert.throws(() => B.liveArms('DEFAULT_ARMS = [\n    {},\n    {},\n]\n'), /ZERO arms/);
});

// ── 1. THE KNOWN POSITIVE ─────────────────────────────────────────────────
ok('KNOWN POSITIVE — `vegas` reads LIVE on the real projector. A survey that '
  + 'has never returned a LIVE has not been tested, only run.', () => {
  const s = B.survey(SRC, '2026-08-18');
  const v = s.rows.find((r) => r.id === 'vegas');
  assert.strictEqual(v.state, 'LIVE', JSON.stringify(s.rows));
  assert.ok(s.live >= 1, JSON.stringify(s));
});

ok('THE HEADLINE, MEASURED — the live arm set varies exactly two knobs on ONE '
  + 'axis, which is what "five variants of one axis" means in code', () => {
  const arms = B.liveArms(SRC);
  const keys = new Set();
  arms.forEach((a) => {
    if (a.tilt_scale !== null) keys.add('tilt_scale');
    if (a.divisor !== null) keys.add('divisor');
  });
  assert.deepStrictEqual([...keys].sort(), ['divisor', 'tilt_scale']);
  const s = B.survey(SRC, '2026-08-18');
  assert.strictEqual(s.live, 1,
    'If this fails because someone SHIPPED a new axis, that is the good '
    + 'direction — update the number here and say so in the commit. '
    + 'Survey: ' + JSON.stringify(s.rows));
});

// ── 2. EVERY AXIS PREDICATE ACTUALLY DISCRIMINATES ────────────────────────
//
// The registry is only as good as its `live` predicates. A predicate that can
// never match makes its axis permanently uncovered — the check would nag
// forever and could never be satisfied, which is how a guard gets switched off.
const FLIPPERS = {
  vegas: 'v1',
  usage: 'v1_tgt_share',
  efficiency: 'v1_epa',
  pace: 'v1_pace',
  props: 'v1_props',
  opponent: 'v1_oppdef',
  kalshi: 'v1_kalshi',
  residual: 'v1_residual',
};

B.AXES.forEach((axis) => {
  ok('CONTROL — axis `' + axis.id + '` can be SATISFIED: an arm named `'
    + FLIPPERS[axis.id] + '` flips it to LIVE, so the deadline is reachable '
    + 'rather than a permanent nag', () => {
    assert.ok(FLIPPERS[axis.id], 'no flipper registered for ' + axis.id
      + ' — a new axis needs one here, or nothing proves it can be met');
    const s = B.survey(fake([FLIPPERS[axis.id]]), '2026-08-18');
    const r = s.rows.find((x) => x.id === axis.id);
    assert.strictEqual(r.state, 'LIVE', JSON.stringify(s.rows));
    assert.strictEqual(r.overdue, false);
  });
});

ok('CONTROL — the flippers are SPECIFIC: `v1_pace` does not accidentally '
  + 'satisfy the usage or kalshi axes', () => {
  const s = B.survey(fake(['v1_pace']), '2026-08-18');
  assert.strictEqual(s.rows.find((r) => r.id === 'pace').state, 'LIVE');
  assert.notStrictEqual(s.rows.find((r) => r.id === 'usage').state, 'LIVE');
  assert.notStrictEqual(s.rows.find((r) => r.id === 'kalshi').state, 'LIVE');
});

// ── 3. THE DEADLINE IS THE MECHANISM ──────────────────────────────────────
ok('FAIL ARM — an axis past its committed date with no live arm FAILS, and the '
  + 'message names the axis', () => {
  const s = B.survey(fake(['v1']), '2026-09-04');   // past the 09-03 commitments
  assert.ok(s.problems.length >= 4, JSON.stringify(s.problems));
  assert.ok(s.problems.some((p) => /"usage"/.test(p)), JSON.stringify(s.problems));
  assert.ok(s.problems.every((p) => /WITH A REASON/.test(p)));
});

ok('CONTROL — the same survey BEFORE the date is clean, so the check is a '
  + 'deadline and not a permanent red', () => {
  const s = B.survey(fake(['v1']), '2026-09-02');
  assert.deepStrictEqual(s.problems.filter((p) => /"usage"/.test(p)), []);
});

ok('CONTROL — shipping the arm clears the deadline even after it passes, which '
  + 'is the only way a guard like this stays respected', () => {
  const s = B.survey(fake(['v1', 'v1_tgt_share']), '2026-09-04');
  assert.deepStrictEqual(s.problems.filter((p) => /"usage"/.test(p)), []);
  assert.ok(s.problems.some((p) => /"pace"/.test(p)), 'the others should still fire');
});

ok('CONTROL — an axis with no committed date is never overdue', () => {
  const s = B.survey(fake(['v1_notilt']), '2027-06-01');
  const v = s.rows.find((r) => r.id === 'vegas');
  assert.strictEqual(v.by, null);
  assert.strictEqual(v.overdue, false);
});

ok('THE LIVE REPO is not past any axis deadline today — if this fails, the '
  + 'commitments in BLEND-SEARCH-DESIGN.md have slipped and that is the point', () => {
  assert.deepStrictEqual(B.survey(SRC, '2026-08-18').problems, []);
});

// ── 4. --emit PRODUCES LEDGER ROWS, AND ONLY FOR GAPS ─────────────────────
ok('emit writes one ledger-ready row per UNCOVERED axis, and none for a live '
  + 'one — the generator that means Cory never has to ask for predictions', () => {
  const s = B.survey(SRC, '2026-08-18');
  const rows = B.emit(s, '2026-08-18');
  assert.strictEqual(rows.length, s.rows.length - s.live);
  assert.ok(rows.every((r) => r.startsWith('| Pnn |') && r.endsWith('|')));
  assert.ok(!rows.some((r) => /Vegas team total/.test(r)), 'live axis must not be emitted');
  assert.ok(rows.some((r) => /Opponent defence/.test(r)));
});

ok('CONTROL — the emitted rows have the LEDGER\'S OWN COLUMN COUNT, or they '
  + 'would be silently skipped by prediction_ledger_check\'s width filter', () => {
  const L = require(path.join(ROOT, 'draft', 'tools', 'prediction_ledger_check.js'));
  const rows = B.emit(B.survey(SRC, '2026-08-18'), '2026-08-18');
  const HEAD = '| # | prediction | made | owner | grade by | status | result | what changed |\n'
    + '|---|---|---|---|---|---|---|---|\n';
  const parsed = L.rows(HEAD + rows.map((r) => r.replace('Pnn', 'P900')).join('\n') + '\n');
  assert.strictEqual(parsed.length, rows.length,
    'emitted rows did not parse as ledger rows — ' + JSON.stringify(rows[0]));
  parsed.forEach((c) => {
    assert.ok(c[3], 'emitted row has no owner: ' + JSON.stringify(c));
    assert.ok(/\d\d-\d\d/.test(c[4]), 'emitted row has no grade-by date: ' + JSON.stringify(c));
  });
});

ok('CONTROL — an all-covered survey emits NOTHING, so the generator goes quiet '
  + 'when there is genuinely nothing left to ask', () => {
  const s = B.survey(fake(Object.values(FLIPPERS)), '2026-08-18');
  assert.strictEqual(s.live, B.AXES.length, JSON.stringify(s.rows));
  assert.deepStrictEqual(B.emit(s, '2026-08-18'), []);
});

console.log('\n' + pass + '/' + pass + ' checks passed');

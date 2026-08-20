// TERRITORY: A
// D10a: a cross-position dollar gap involving K/DEF must REFUSE with the
// reason, not print a number that compares two ceiling constructions.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const engine = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

const mk = (name, pos, mean, ceil) => ({ name, player_id: name, position: pos,
  proj_mean: mean, proj_ceiling: ceil });

test('cross-position K/DEF dollar gap refuses with the reason', () => {
  const g = engine.dollarGap(mk('SomeDEF', 'DEF', 130, 181), mk('SomeTE', 'TE', 150, 172));
  assert.strictEqual(g.confidence, 'refused');
  assert.strictEqual(g.leader, null);
  assert.match(g.verdict, /K\/DEF/);
});

test('within-position and skill-position gaps still price normally', () => {
  const g1 = engine.dollarGap(mk('K1', 'K', 140, 160), mk('K2', 'K', 120, 130));
  assert.notStrictEqual(g1.confidence, 'refused');
  const g2 = engine.dollarGap(mk('RB1', 'RB', 250, 380), mk('WR1', 'WR', 240, 350));
  assert.notStrictEqual(g2.confidence, 'refused');
  assert.ok(typeof g2.total === 'number');
});

// ── 5e (A, 08-18): the refusal extends to QB-vs-other, same shape as D10a ───

test('QB vs non-QB refuses — raw-point dollars give QB a ~342-pt replacement head start (5e)', () => {
  const g = engine.dollarGap(mk('QB1', 'QB', 380, 460), mk('RB1', 'RB', 250, 380));
  assert.strictEqual(g.confidence, 'refused');
  assert.match(g.verdict, /within position/);
  const g2 = engine.dollarGap(mk('WR1', 'WR', 240, 350), mk('QB1', 'QB', 380, 460));
  assert.strictEqual(g2.confidence, 'refused', 'order must not matter');
});

test('FAIL ARM — QB vs QB is NOT refused: within-position dollars are the sanctioned use', () => {
  const g = engine.dollarGap(mk('QB1', 'QB', 380, 460), mk('QB2', 'QB', 340, 410));
  assert.notStrictEqual(g.confidence, 'refused');
  assert.ok(typeof g.total === 'number');
});

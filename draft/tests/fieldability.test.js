// TERRITORY: A
/* THE FIELDABILITY MATCHER, CONTROLLED FROM BOTH SIDES.
 *
 * "Every week is fieldable" is precisely what a broken checker reports, and a
 * probe whose only output is a clean sheet has not been tested, only run
 * (rule 3e). So the cases below plant a hole and require the matcher to FIND
 * it, and plant a legal-but-awkward roster and require it NOT to cry wolf.
 *
 * The awkward case is the one that matters: a greedy filler that assigns FLEX
 * first strands a dedicated slot and reports a false alarm. That is why the
 * probe uses bipartite matching rather than a loop, and this is the test that
 * would fail if anyone simplified it back.
 */
'use strict';
const path = require('path');
const assert = require('assert');

process.env.NODE_ENV = 'test';
const { fieldable } = require(path.join(__dirname, '..', 'tools', 'fieldability_probe.js'));

const P = (position, bye) => ({ position, bye, player_id: Math.random().toString(36).slice(2) });

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('KNOWN NEGATIVE — a genuine hole is FOUND, not glossed over', () => {
  // two WR slots, both receivers on bye week 11, nobody flex-eligible spare
  const roster = [P('QB', 5), P('RB', 6), P('RB', 7), P('WR', 11), P('WR', 11),
                  P('TE', 8), P('K', 9), P('DEF', 10)];
  const r = fieldable(roster, 11);
  assert.strictEqual(r.ok, false, 'both WRs on bye and the matcher said fieldable');
  assert.ok(r.unfilled.length >= 1, 'no slot reported unfilled');
});

test('KNOWN POSITIVE — a full healthy roster is fieldable', () => {
  const roster = [P('QB', 5), P('RB', 6), P('RB', 7), P('WR', 8), P('WR', 9),
                  P('TE', 10), P('K', 13), P('DEF', 14), P('RB', 5)];
  assert.strictEqual(fieldable(roster, 11).ok, true);
});

test('THE GREEDY TRAP — a legal roster must not be called un-fieldable', () => {
  /* Exactly one tight end and exactly one spare receiver. A greedy filler that
   * puts the TE in FLEX first leaves the TE slot empty and cries wolf; the
   * correct answer is TE -> TE, spare WR -> FLEX. */
  const roster = [P('QB', 5), P('RB', 6), P('RB', 7), P('WR', 8), P('WR', 9),
                  P('TE', 10), P('WR', 13), P('K', 5), P('DEF', 6)];
  const r = fieldable(roster, 11);
  assert.strictEqual(r.ok, true,
    'a legal roster was called un-fieldable — the matcher regressed to greedy: '
    + JSON.stringify(r.unfilled));
});

test('THE HARDER GREEDY TRAP — FLEX must yield a body back to a dedicated slot', () => {
  /* One TE and one spare RB, but the RB is the ONLY flex-eligible spare and the
   * TE is the only body that can take TE. Filling FLEX with the TE strands TE.
   * Requires an augmenting path, not just ordering. */
  const roster = [P('QB', 5), P('RB', 6), P('RB', 7), P('WR', 8), P('WR', 9),
                  P('TE', 10), P('RB', 13), P('K', 5), P('DEF', 6)];
  assert.strictEqual(fieldable(roster, 11).ok, true);
});

test('a bye that empties a dedicated slot with no cover is reported', () => {
  const roster = [P('QB', 11), P('RB', 6), P('RB', 7), P('WR', 8), P('WR', 9),
                  P('TE', 10), P('K', 5), P('DEF', 6)];
  const r = fieldable(roster, 11);
  assert.strictEqual(r.ok, false);
  assert.ok(r.unfilled.indexOf('QB') >= 0, 'the QB hole was not named: ' + r.unfilled);
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
});
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);

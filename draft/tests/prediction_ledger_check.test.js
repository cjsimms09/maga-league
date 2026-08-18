/* The check must FIRE, or it is theatre.
 *
 * Every guard here exists because this repo has already been bitten by its
 * absence: a check that matched nothing and reported success, a refusal guard
 * that tripped on a word inside prose, a "closed" row that closed itself.
 */
'use strict';

const assert = require('assert');
const { check, isEmptyCell, parseDate } = require('../tools/prediction_ledger_check.js');

const HEAD =
  '| # | prediction | made | owner | grade by | status | result | what changed |\n' +
  '|---|---|---|---|---|---|---|---|\n';

let pass = 0;
function ok(name, fn) {
  fn();
  console.log('PASS  ' + name);
  pass++;
}

ok('a GRADED row with a real consequence passes', () => {
  const t = HEAD + '| P1 | x | 08-18 | relay | 08-18 | GRADED | FALSE | Stopped the search. |\n';
  assert.strictEqual(check(t, '2026-08-20').problems.length, 0);
});

ok('FAIL ARM — a GRADED row whose consequence is EMPTY is caught', () => {
  const t = HEAD + '| P1 | x | 08-18 | relay | 08-18 | GRADED | FALSE |  |\n';
  const p = check(t, '2026-08-20').problems;
  assert.strictEqual(p.length, 1, JSON.stringify(p));
  assert.ok(/NOTHING CHANGED/.test(p[0]), p[0]);
});

ok('FAIL ARM — an em-dash does not count as a consequence', () => {
  // Otherwise every row closes itself by being punctuated.
  const t = HEAD + '| P1 | x | 08-18 | relay | 08-18 | GRADED | FALSE | — |\n';
  assert.ok(/NOTHING CHANGED/.test(check(t, '2026-08-20').problems[0]));
});

ok('"NOTHING — <reason>" IS a legitimate consequence and passes', () => {
  // A grade that correctly changes nothing must be expressible, or the check
  // pressures people into inventing changes to satisfy it.
  const t = HEAD +
    '| P1 | x | 08-18 | relay | 08-18 | GRADED | FALSE | NOTHING — the board already does this. |\n';
  assert.strictEqual(check(t, '2026-08-20').problems.length, 0);
});

ok('FAIL ARM — an OPEN row past its grade-by date is caught', () => {
  const t = HEAD + '| P9 | x | 08-01 | A | 08-10 | OPEN | — | — |\n';
  const p = check(t, '2026-08-20').problems;
  assert.ok(/OVERDUE/.test(p[0]), p[0]);
});

ok('an OPEN row BEFORE its date is left alone', () => {
  const t = HEAD + '| P9 | x | 08-01 | A | 08-30 | OPEN | — | — |\n';
  assert.strictEqual(check(t, '2026-08-20').problems.length, 0);
});

ok('CONTROL — prose cannot talk an OPEN row out of being overdue', () => {
  // The refusal guard once tripped on the word "refused" inside a summary and
  // reddened main. Status is read from a FIXED CELL, never the text.
  const t = HEAD +
    '| P9 | we already GRADED this and it is CLOSED and GRADED | 08-01 | A | 08-10 | OPEN | — | — |\n';
  assert.ok(/OVERDUE/.test(check(t, '2026-08-20').problems[0]));
});

ok('FAIL ARM — a row with no owner is caught', () => {
  const t = HEAD + '| P9 | x | 08-01 |  | 08-30 | OPEN | — | — |\n';
  assert.ok(/NO OWNER/.test(check(t, '2026-08-20').problems[0]));
});

ok('FAIL ARM — a row with no grade-by date is caught', () => {
  const t = HEAD + '| P9 | x | 08-01 | A |  | OPEN | — | — |\n';
  assert.ok(/NO GRADE-BY DATE/.test(check(t, '2026-08-20').problems[0]));
});

ok('FAIL ARM — ABANDONED with no reason is caught', () => {
  const t = HEAD + '| P9 | x | 08-01 | A | 08-30 | ABANDONED | — | — |\n';
  assert.ok(/no reason recorded/.test(check(t, '2026-08-20').problems[0]));
});

ok('CONTROL — a table that parses to ZERO rows FAILS rather than reporting success', () => {
  // The defect that made this whole week: a check that cannot fail, reported as
  // a check that passed. If the ledger's shape changes, this must go red.
  const p = check('| a | b |\n|---|---|\n| 1 | 2 |\n', '2026-08-20').problems;
  assert.ok(/NO PREDICTION ROWS PARSED/.test(p[0]), JSON.stringify(p));
});

ok('CONTROL — the real committed ledger is green today and red once P5 comes due', () => {
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(
    path.join(__dirname, '..', '..', 'PREDICTION-LEDGER.md'), 'utf8');
  const now = check(text, '2026-08-18');
  assert.strictEqual(now.problems.length, 0, JSON.stringify(now.problems));
  assert.ok(now.count >= 8, 'expected the real ledger rows to parse, got ' + now.count);
  const later = check(text, '2026-08-25');
  assert.ok(later.problems.length >= 4,
    'the ledger must actually go red when its own dates pass: ' + JSON.stringify(later.problems));
});

ok('bold markdown around a date or owner does not defeat parsing', () => {
  const t = HEAD + '| P9 | x | 08-01 | **A** | **08-10** | OPEN | — | — |\n';
  assert.ok(/OVERDUE/.test(check(t, '2026-08-20').problems[0]));
});

ok('helpers behave', () => {
  assert.strictEqual(isEmptyCell('—'), true);
  assert.strictEqual(isEmptyCell('-'), true);
  assert.strictEqual(isEmptyCell(''), true);
  assert.strictEqual(isEmptyCell('done'), false);
  assert.ok(parseDate('**08-23**', 2026) instanceof Date);
  assert.strictEqual(parseDate('soon', 2026), null);
});

console.log(`\n${pass}/${pass} checks passed`);

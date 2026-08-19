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

ok('CONTROL — the real committed ledger is green today and goes red once its dates pass', () => {
  // Asserts the MECHANISM, not a census. The first version of this test pinned
  // "at least 4 overdue on 08-25", which broke the moment P5 was graded and P7's
  // date moved with a reason — i.e. it failed when the ledger was being used
  // CORRECTLY. A test that punishes the behaviour it exists to encourage is worse
  // than no test.
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(
    path.join(__dirname, '..', '..', 'PREDICTION-LEDGER.md'), 'utf8');

  const now = check(text, '2026-08-18');
  assert.strictEqual(now.problems.length, 0, JSON.stringify(now.problems));
  assert.ok(now.count >= 8, 'expected the real ledger rows to parse, got ' + now.count);

  // Past every date in the file, every still-OPEN row must be named.
  const later = check(text, '2026-12-31');
  assert.ok(later.problems.length >= 1,
    'the ledger must go red when its own dates pass: ' + JSON.stringify(later.problems));
  assert.ok(later.problems.every((p) => /OVERDUE|NOTHING CHANGED|NO OWNER|NO GRADE-BY/.test(p)),
    'unexpected problem shape: ' + JSON.stringify(later.problems));
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

ok('FAIL ARM — an EMPTY BACKLOG fails, so the file cannot be satisfied by stopping', () => {
  // Cory, 08-18: "we need to be adding things and trying things and adapting ...
  // no stone unturned." A ledger where everything is graded and nothing is open
  // looks like discipline and IS the program quietly ending.
  let t = HEAD;
  for (let i = 0; i < 3; i++) {
    t += `| Q${i} | x | 08-18 | relay | 08-18 | GRADED | done | a real consequence |\n`;
  }
  const p = check(t, '2026-08-20', { minOpen: 6 }).problems;
  assert.ok(p.some((x) => /OPEN PREDICTIONS \(minimum/.test(x)), JSON.stringify(p));
});

ok('a healthy backlog does not trip the floor', () => {
  let t = HEAD;
  for (let i = 0; i < 8; i++) {
    t += `| Q${i} | x | 08-18 | relay | 12-31 | OPEN | — | — |\n`;
  }
  assert.strictEqual(check(t, '2026-08-20', { minOpen: 6 }).problems.length, 0);
});

ok('CONTROL — the REAL ledger is held to the backlog floor, not just fixtures', () => {
  // The floor is opt-in so tiny fixtures are not judged by it; this asserts the
  // real run actually opts in, or the tripwire is decorative.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'prediction_ledger_check.js'), 'utf8');
  assert.ok(/minOpen:\s*MIN_OPEN/.test(src),
    'main() must pass MIN_OPEN, or the empty-backlog tripwire never fires in CI');
});

// ── TWO ROWS, ONE ID ────────────────────────────────────────────────────────
// Added 2026-08-18 after the real thing: A filed P62/P63/P64 at 04:43:53 and the
// relay filed three DIFFERENT predictions under the same ids nine minutes later.
// This checker printed "67 predictions, none overdue" the whole time, because
// `seen` was an array nobody looked at twice.

ok('FAIL ARM — two rows sharing an id is a hard failure, not a note', () => {
  const t = HEAD
    + '| P62 | first claim | 08-18 | A | 09-05 | OPEN | — | — |\n'
    + '| P62 | a totally different claim | 08-18 | relay | 08-18 | GRADED | FALSE | shipped nothing |\n';
  const p = check(t, '2026-08-19').problems;
  assert.ok(p.some((x) => /P62: TWO ROWS SHARE THIS ID/.test(x)), JSON.stringify(p));
});

ok('THE REASON IT MATTERS — the same id can be GRADED and OPEN at once', () => {
  // Not cosmetic: every other rule here is keyed by id, so the ledger says the
  // loop is closed and not closed simultaneously, and "grade P62" is ambiguous.
  const t = HEAD
    + '| P62 | claim one | 08-18 | A | 09-05 | OPEN | — | — |\n'
    + '| P62 | claim two | 08-18 | relay | 08-18 | GRADED | TRUE | weight moved |\n';
  const rows = check(t, '2026-08-19');
  assert.strictEqual(rows.count, 2, 'both rows are still counted — the count hides it');
  assert.ok(rows.problems.some((x) => /TWO ROWS SHARE/.test(x)));
});

ok('a duplicate is reported ONCE however many copies exist', () => {
  const t = HEAD
    + '| P9 | a | 08-18 | A | 12-31 | OPEN | — | — |\n'
    + '| P9 | b | 08-18 | A | 12-31 | OPEN | — | — |\n'
    + '| P9 | c | 08-18 | A | 12-31 | OPEN | — | — |\n';
  const hits = check(t, '2026-08-19').problems.filter((x) => /TWO ROWS SHARE/.test(x));
  assert.strictEqual(hits.length, 1, JSON.stringify(hits));
});

ok('CONTROL — distinct ids do not trip it, so the check is not just "more than one row"', () => {
  const t = HEAD
    + '| P1 | a | 08-18 | A | 12-31 | OPEN | — | — |\n'
    + '| P2 | b | 08-18 | A | 12-31 | OPEN | — | — |\n';
  assert.strictEqual(check(t, '2026-08-19').problems.length, 0);
});

// ── THREE HOLES FOUND BY A'S VERIFICATION PASS, 2026-08-18 ──────────────────
// Each demonstrated live against a working control BEFORE the fix (rule 3e),
// then fixed. The fail arms below are the demonstrations, kept.

ok('FAIL ARM — a pipe in the prose no longer deletes the row', () => {
  // Pre-fix: this row parsed to ≠8 cells, was skipped, and its overdue date
  // was never chased — invisible in a real ledger where the zero-rows guard
  // cannot fire. The register checker had this exact defect (5 of 9 rows).
  const t = HEAD + '| P90 | the guard reads (a | b) correctly | 07-01 | relay | 08-01 | OPEN | — | — |\n';
  const p = check(t, '2026-08-20').problems;
  assert.ok(p.some((x) => /P90: LOOKS LIKE A PREDICTION ROW BUT DID NOT PARSE/.test(x)),
    JSON.stringify(p));
});

ok('CONTROL — an ESCAPED pipe in the prose parses fine and the row is chased', () => {
  const t = HEAD + '| P90 | the guard reads (a \\| b) correctly | 07-01 | relay | 08-01 | OPEN | — | — |\n';
  const p = check(t, '2026-08-20').problems;
  assert.ok(p.some((x) => /P90: OVERDUE/.test(x)), JSON.stringify(p));
  assert.ok(!p.some((x) => /DID NOT PARSE/.test(x)), JSON.stringify(p));
});

ok('FAIL ARM — a missing trailing pipe is reported, not swallowed', () => {
  const t = HEAD + '| P91 | truncated row | 08-18 | relay | 12-31 | OPEN | — | —\n';
  const p = check(t, '2026-08-20').problems;
  assert.ok(p.some((x) => /P91: LOOKS LIKE A PREDICTION ROW BUT DID NOT PARSE/.test(x)),
    JSON.stringify(p));
});

ok('a January grade-by on an August prediction is NEXT January, not eight months overdue', () => {
  // YEAR is pinned 2026; P19 grades fortnightly into January. Pre-fix this row
  // read as overdue the day it was filed.
  const t = HEAD + '| P92 | january grade | 08-18 | relay | 01-15 | OPEN | — | — |\n';
  assert.strictEqual(check(t, '2026-08-20').problems.length, 0);
});

ok('CONTROL — the rolled date still comes due: the same row IS overdue in 2027', () => {
  const t = HEAD + '| P92 | january grade | 08-18 | relay | 01-15 | OPEN | — | — |\n';
  const p = check(t, '2027-01-20').problems;
  assert.ok(p.some((x) => /P92: OVERDUE/.test(x)), JSON.stringify(p));
});

ok('CONTROL — a same-year future date is untouched by the rollover', () => {
  const t = HEAD + '| P92 | x | 08-18 | relay | 09-15 | OPEN | — | — |\n';
  assert.strictEqual(check(t, '2026-08-20').problems.length, 0);
});

ok('FAIL ARM — an invented status no longer exits the loop', () => {
  // Pre-fix: a past-due row marked DEFERRED produced ZERO problems — no rule
  // chased it. The register's "✅ that did not mean closed", new costume.
  const t = HEAD + '| P93 | quietly parked | 07-01 | relay | 08-01 | DEFERRED | — | — |\n';
  const p = check(t, '2026-08-20').problems;
  assert.ok(p.some((x) => /P93: UNKNOWN STATUS "DEFERRED"/.test(x)), JSON.stringify(p));
});

// ── REVIEWER REQUIREMENT (gpt-5, run 32179350309): exact-word status, not substring
ok('FAIL ARM — REOPENED is not OPEN: substring costumes are refused', () => {
  const t = HEAD + '| P97 | x | 07-01 | relay | 08-01 | REOPENED | — | — |\n';
  const p = check(t, '2026-08-20').problems;
  assert.ok(p.some((x) => /P97: UNKNOWN STATUS/.test(x)), JSON.stringify(p));
});

ok('FAIL ARM — GRADED-LATER is not GRADED', () => {
  const t = HEAD + '| P97 | x | 07-01 | relay | 08-01 | GRADED-LATER | — | — |\n';
  const p = check(t, '2026-08-20').problems;
  assert.ok(p.some((x) => /P97: UNKNOWN STATUS/.test(x)), JSON.stringify(p));
});

ok('FAIL ARM — ABANDONMENT is not ABANDONED', () => {
  const t = HEAD + '| P97 | x | 07-01 | relay | 08-01 | ABANDONMENT | — | — |\n';
  const p = check(t, '2026-08-20').problems;
  assert.ok(p.some((x) => /P97: UNKNOWN STATUS/.test(x)), JSON.stringify(p));
});

ok('CONTROL — the DECORATED statuses the live ledger actually uses still pass', () => {
  // "✅ GRADED 08-18" and "**GRADED — TRUE**" are real committed status cells;
  // bare equality would flag 8 legitimate rows. First-letter-token equality is
  // the rule that refuses the costumes without punishing the decorations.
  const t = HEAD
    + '| P97 | a | 08-18 | relay | 08-18 | ✅ GRADED 08-18 | TRUE | weight moved |\n'
    + '| P98 | b | 08-18 | relay | 08-18 | **GRADED — TRUE** | TRUE | weight moved |\n';
  assert.strictEqual(check(t, '2026-08-20').problems.length, 0);
});

ok('CONTROL — the three vocabulary words all pass the status rule', () => {
  const t = HEAD
    + '| P94 | a | 08-18 | relay | 12-31 | OPEN | — | — |\n'
    + '| P95 | b | 08-18 | relay | 08-18 | GRADED | TRUE | weight moved |\n'
    + '| P96 | c | 08-18 | relay | 08-18 | ABANDONED | — | superseded by P95 |\n';
  assert.strictEqual(check(t, '2026-08-20').problems.length, 0);
});

ok('CONTROL — the LIVE ledger has no duplicate ids (it did, until 2026-08-18)', () => {
  const fs = require('fs');
  const path = require('path');
  const live = fs.readFileSync(
    path.join(__dirname, '..', '..', 'PREDICTION-LEDGER.md'), 'utf8');
  const p = check(live, '2026-08-18').problems.filter((x) => /TWO ROWS SHARE/.test(x));
  assert.deepStrictEqual(p, [], 'an id collision is back in the real ledger');
});

/* ══════════════════════════════════════════════════════════════════════════
 * THE SUCCESSOR RULE AND THE CADENCE CHECK — what makes the loop self-feeding.
 *
 * Cory, 2026-08-18: "structured, organized, self-feeding ... I don't have to ask
 * for more predictions."
 *
 * Every rule above concerns predictions that ALREADY EXIST. Measured the same
 * day: 76 predictions, 71 filed on ONE day, every rule green. Grade thirty, file
 * zero, stay above the floor — green. That is a programme ending politely.
 * ══════════════════════════════════════════════════════════════════════════ */

ok('FAIL ARM — a grade made AFTER the rule with no successor is caught', () => {
  const t = HEAD + '| P1 | x | 08-20 | relay | 08-20 | GRADED | FALSE | Stopped the search. |\n';
  const p = check(t, '2026-08-21').problems;
  assert.strictEqual(p.length, 1, JSON.stringify(p));
  assert.ok(/NO SUCCESSOR/.test(p[0]), p[0]);
});

ok('naming the prediction it spawned satisfies the rule', () => {
  const t = HEAD + '| P1 | x | 08-20 | relay | 08-20 | GRADED | FALSE | Stopped it. -> P77 |\n';
  assert.strictEqual(check(t, '2026-08-21').problems.length, 0);
});

ok('the arrow form → P77 works too, since the ledger uses both', () => {
  const t = HEAD + '| P1 | x | 08-20 | relay | 08-20 | GRADED | FALSE | Stopped it. → P77 |\n';
  assert.strictEqual(check(t, '2026-08-21').problems.length, 0);
});

ok('RETIRING a line is a legitimate successor — a dead end DECLARED is fine', () => {
  const t = HEAD + '| P1 | x | 08-20 | relay | 08-20 | GRADED | FALSE | RETIRES this line: the signal is not there. |\n';
  assert.strictEqual(check(t, '2026-08-21').problems.length, 0);
});

ok('CONTROL — the rule is NOT retroactive, so past work is not punished by a '
  + 'rule invented today', () => {
  /* This is the bug the rule shipped with and the reason the control exists.
   * `parseDate` returns a DATE and an unparseable cell returns an INVALID DATE,
   * which is truthy — so a `!made || made < 'yyyy-mm-dd'` guard compared a Date
   * to a string, never fired, and flagged all 40 pre-existing grades. Exactly
   * the retroactive punishment the rule promises not to inflict. */
  const t = HEAD + '| P1 | x | 08-18 | relay | 08-18 | GRADED | FALSE | Stopped the search. |\n';
  assert.strictEqual(check(t, '2026-08-21').problems.length, 0,
    'a grade made before 2026-08-19 must be exempt from the successor rule');
});

ok('CONTROL — an OPEN row is never asked for a successor', () => {
  const t = HEAD + '| P1 | x | 08-20 | relay | 09-30 | OPEN |  |  |\n';
  assert.strictEqual(check(t, '2026-08-21').problems.length, 0);
});

ok('FAIL ARM — CADENCE: a ledger that stopped growing is caught even when the '
  + 'backlog is full', () => {
  const t = HEAD
    + '| P1 | x | 08-01 | relay | 12-01 | OPEN |  |  |\n'
    + '| P2 | x | 08-01 | relay | 12-01 | OPEN |  |  |\n';
  const p = check(t, '2026-09-30', { maxQuietDays: 14, today: '2026-09-30' }).problems;
  assert.ok(p.some((x) => /NO NEW PREDICTION IN/.test(x)), JSON.stringify(p));
});

ok('CONTROL — a recently-filed ledger passes the cadence check', () => {
  const t = HEAD + '| P1 | x | 09-28 | relay | 12-01 | OPEN |  |  |\n';
  const p = check(t, '2026-09-30', { maxQuietDays: 14, today: '2026-09-30' }).problems;
  assert.deepStrictEqual(p.filter((x) => /NO NEW PREDICTION/.test(x)), []);
});

ok('CONTROL — cadence is OPT-IN, so fixtures without it are not judged', () => {
  const t = HEAD + '| P1 | x | 08-01 | relay | 12-01 | OPEN |  |  |\n';
  const p = check(t, '2026-09-30').problems;
  assert.deepStrictEqual(p.filter((x) => /NO NEW PREDICTION/.test(x)), []);
});

ok('THE LIVE LEDGER passes both new rules today', () => {
  const fs = require('fs'); const path = require('path');
  const live = fs.readFileSync(
    path.join(__dirname, '..', '..', 'PREDICTION-LEDGER.md'), 'utf8');
  const p = check(live, '2026-08-18',
    { maxQuietDays: 14, today: '2026-08-18' }).problems;
  assert.deepStrictEqual(p, [], JSON.stringify(p.slice(0, 3)));
});

/* ── THE ESCAPE HATCH THAT THE FIRST VERSION LEFT OPEN ──────────────────────
 *
 * The successor rule exempts grades made before the rule existed. That
 * exemption is keyed on a DATE, so "what happens when the date is missing?"
 * decides whether the rule has a hole in it. The first version answered
 * "exempt" — and because `parseDate` was called without its `year` argument,
 * EVERY row returned an unparseable date, so every row was exempt and the
 * checker reported a clean ledger. One bug, but two lessons: an unparseable
 * date must not buy an exemption, and a missing date must not either, or
 * deleting a cell becomes the cheapest way past the rule. */
ok('FAIL ARM — a grade with NO made-date is NOT exempt; blanking the date must '
  + 'not be a way out of the successor rule', () => {
  const t = HEAD + '| P1 | x |  | relay | 08-20 | GRADED | FALSE | Stopped there. |\n';
  const p = check(t, '2026-08-21').problems;
  assert.ok(p.some((x) => /NO SUCCESSOR/.test(x)), JSON.stringify(p));
});

ok('FAIL ARM — a grade with an UNPARSEABLE made-date is not exempt either', () => {
  const t = HEAD + '| P1 | x | soon | relay | 08-20 | GRADED | FALSE | Stopped there. |\n';
  const p = check(t, '2026-08-21').problems;
  assert.ok(p.some((x) => /NO SUCCESSOR/.test(x)), JSON.stringify(p));
});

ok('CONTROL — parseDate REFUSES a missing year rather than returning an Invalid '
  + 'Date, which is the exact failure that silently disabled the successor rule', () => {
  assert.throws(() => parseDate('08-18'), /year is required/);
  assert.ok(parseDate('08-18', 2026) instanceof Date);
  assert.strictEqual(parseDate('soon', 2026), null);   // and a bad cell is null, not Invalid Date
});

/* TERRITORY: relay — a prediction nobody grades, and a grade that changes nothing.
 *
 * Cory, 2026-08-18: "Still don't think we are making predictions, grading and
 * closing the loop. No one is in charge of it.."
 *
 * He is right about the ownership. Preregistrations were being written and some
 * were being graded, but NOTHING connected the two or noticed when a grade never
 * arrived. `register_recheck_check.js` already proved the mechanism that works
 * here — a date, and a build that FAILS when the date passes — so this is that
 * same mechanism pointed at PREDICTION-LEDGER.md.
 *
 * IT FAILS ON TWO THINGS, AND THE SECOND IS THE ONE THAT MATTERS.
 *
 *   1. A row past its `grade by` date still marked OPEN. The prediction nobody
 *      came back for.
 *   2. A row marked GRADED whose `what changed` cell is EMPTY. Cory, 2026-08-17:
 *      "a grade that moved nothing." A measurement with no consequence is a note,
 *      not a closed loop. `NOTHING — <reason>` is a real consequence and passes;
 *      silence does not.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: judge whether the prediction was good, or
 * whether the consequence was the right one. Both are human calls. It enforces
 * only that the loop CLOSED — measured, and something recorded as a result.
 *
 * Reading discipline, copied from register_recheck_check.js for the same reason:
 * status and consequence are read from FIXED CELLS, never from the prose. A row
 * cannot talk its way out by containing the word "graded" somewhere in its text.
 * That guard exists because a refusal check once tripped on the word "refused"
 * inside a summary and reddened main.
 *
 * Run: node draft/tools/prediction_ledger_check.js [--today YYYY-MM-DD]
 * Exit 1 = at least one prediction is overdue, or graded without a consequence.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LEDGER = path.join(__dirname, '..', '..', 'PREDICTION-LEDGER.md');
const YEAR = 2026;

/* The floor on the OPEN backlog. Not a target to game — a tripwire for the
 * program going quiet. Raise it if the lanes are keeping up. */
const MIN_OPEN = 6;

/* Columns: | # | prediction | made | owner | grade by | status | result | what changed | */
const COL = { id: 0, prediction: 1, made: 2, owner: 3, gradeBy: 4, status: 5, result: 6, changed: 7 };
const WIDTH = 8;

function rows(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || !t.endsWith('|')) continue;
    const cells = t.slice(1, -1).split('|').map((c) => c.trim());
    if (cells.length !== WIDTH) continue;              // not the ledger table
    if (/^-+:?$/.test(cells[0]) || cells[0] === '') continue;   // separator
    if (/^#$/.test(cells[0])) continue;                          // header
    out.push(cells);
  }
  return out;
}

/* An em-dash or a bare hyphen is how this file writes "nothing here yet". It must
 * NOT count as a consequence, or every row closes itself by being punctuated. */
function isEmptyCell(c) {
  return !c || /^[-—–\s]*$/.test(c);
}

function parseDate(cell, year) {
  const m = String(cell || '').match(/(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
}

function check(text, todayStr, opts) {
  /* `minOpen` is OPT-IN so unit fixtures (which are deliberately tiny) are not
   * judged by a floor meant for the real backlog. main() passes MIN_OPEN. */
  const minOpen = (opts && typeof opts.minOpen === 'number') ? opts.minOpen : 0;
  const today = new Date(todayStr + 'T00:00:00Z');
  const problems = [];
  const seen = [];
  for (const cells of rows(text)) {
    const id = cells[COL.id];
    const status = cells[COL.status].toUpperCase();
    const changed = cells[COL.changed];
    const owner = cells[COL.owner];
    const due = parseDate(cells[COL.gradeBy], YEAR);
    seen.push(id);

    if (isEmptyCell(owner)) {
      problems.push(`${id}: NO OWNER. A prediction nobody owns is a wish.`);
    }
    if (!due) {
      problems.push(`${id}: NO GRADE-BY DATE. An ungraded date is an ungraded prediction.`);
    }
    if (status.includes('OPEN') && due && due < today) {
      problems.push(
        `${id}: OVERDUE — grade by ${cells[COL.gradeBy]}, still OPEN. Owner ${owner}. ` +
        `Grade it, or move the date WITH A REASON.`);
    }
    if (status.includes('GRADED') && isEmptyCell(changed)) {
      problems.push(
        `${id}: GRADED BUT NOTHING CHANGED. Cory: "a grade that moved nothing." ` +
        `Write the consequence — "NOTHING — <reason>" is a real answer, blank is not.`);
    }
    if (status.includes('ABANDONED') && isEmptyCell(changed)) {
      problems.push(`${id}: ABANDONED with no reason recorded.`);
    }
  }
  /* CORY, 2026-08-18: "we need to be adding things and trying things and adapting
   * until we find the right blend ... no stone unturned."
   *
   * A ledger can be satisfied by grading everything and then filing nothing new,
   * which looks like discipline and IS the program quietly ending. So an EMPTY
   * BACKLOG is itself a failure: below this many OPEN predictions, we have stopped
   * looking, and the build says so. */
  if (minOpen > 0) {
    const open = rows(text).filter((c) => c[COL.status].toUpperCase().includes('OPEN'));
    if (open.length < minOpen) {
      problems.push(
        `ONLY ${open.length} OPEN PREDICTIONS (minimum ${minOpen}). An empty backlog is ` +
        `not success — it is the program stopping. File new hypotheses.`);
    }
  }

  /* ── TWO ROWS, ONE ID (added 2026-08-18, on a live collision) ──────────────
   *
   * `seen` was an ARRAY and nothing ever looked at it twice, so the ledger could
   * carry the same id on two different predictions and this checker would print
   * "67 predictions, none overdue" — a check that cannot fail, reported as a check
   * that passed, which is this session's recurring defect in its purest form.
   *
   * IT HAD ALREADY HAPPENED. A filed the three V7-candidate preregs as P62/P63/P64
   * at 04:43:53 (a195f440e); the relay filed three unrelated predictions under the
   * SAME three ids at 04:52, 05:34 and 05:38. Nine minutes apart, two authors, no
   * shared allocator — which is the whole mechanism, and no amount of care fixes
   * it because neither author could see the other's uncommitted work.
   *
   * WHY THIS IS WORSE THAN A COSMETIC CLASH: every other rule in this file is
   * keyed by id. "Grade P63" addresses two rows with different owners, different
   * grade-by dates (08-18 vs 09-05) and opposite statuses. One of them was already
   * GRADED FALSE while the other sits OPEN, so the ledger simultaneously said the
   * loop was closed and that it was not. Resolved by FIRST ALLOCATION WINS — A
   * kept P62-64, the relay's three graded rows became P65-67 (nothing referenced
   * them outside this file; checked before renumbering).
   *
   * A hard failure, not a ratchet: unlike the ROUTES backlog there is no legacy
   * pile to work off, and the fix is always a rename that costs nothing. */
  const dupes = [...new Set(seen.filter((id, i) => seen.indexOf(id) !== i))];
  for (const id of dupes) {
    problems.push(
      `${id}: TWO ROWS SHARE THIS ID. Every rule here is keyed by id, so "grade ${id}" ` +
      `is ambiguous and one row can be GRADED while the other is OPEN. ` +
      `First allocation wins — renumber the LATER row to the next free id.`);
  }

  if (!seen.length) {
    problems.push('NO PREDICTION ROWS PARSED — the ledger table shape changed, and a ' +
                  'check that silently matches nothing is worse than no check.');
  }
  return { problems, count: seen.length };
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--today');
  const today = i >= 0 && argv[i + 1]
    ? argv[i + 1]
    : new Date().toISOString().slice(0, 10);

  const { problems, count } = check(fs.readFileSync(LEDGER, 'utf8'), today,
                                    { minOpen: MIN_OPEN });
  if (problems.length) {
    console.error(`PREDICTION LEDGER — ${problems.length} problem(s) as of ${today}:\n`);
    for (const p of problems) console.error('  ✗ ' + p);
    console.error('\nA prediction that is never graded, or a grade that changes nothing,');
    console.error('is the loop Cory says nobody is in charge of. This check is in charge.');
    return 1;
  }
  console.log(`PREDICTION LEDGER OK — ${count} predictions, none overdue, ` +
              `every grade carries a consequence (as of ${today}).`);
  return 0;
}

module.exports = { check, rows, isEmptyCell, parseDate, MIN_OPEN };
if (require.main === module) process.exitCode = main();

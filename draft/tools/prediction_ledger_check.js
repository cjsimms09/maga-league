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

/* Days without a NEW prediction before the programme counts as stalled. */
const MAX_QUIET_DAYS = 14;

/* Columns: | # | prediction | made | owner | grade by | status | result | what changed | */
const COL = { id: 0, prediction: 1, made: 2, owner: 3, gradeBy: 4, status: 5, result: 6, changed: 7 };
const WIDTH = 8;

/* Split on UNESCAPED pipes only. The register checker learned this the hard
 * way: five of its nine `\|`-carrying rows had their status read from a
 * fragment of prose. Same parser, same discipline. */
function splitCells(t) {
  return t.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim());
}

function rows(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || !t.endsWith('|')) continue;
    const cells = splitCells(t);
    if (cells.length !== WIDTH) continue;              // not the ledger table
    if (/^-+:?$/.test(cells[0]) || cells[0] === '') continue;   // separator
    if (/^#$/.test(cells[0])) continue;                          // header
    out.push(cells);
  }
  return out;
}

/* ── A ROW THAT DOES NOT PARSE MUST NOT SILENTLY VANISH (added 2026-08-18) ──
 *
 * `rows()` skips any line that does not split into exactly WIDTH cells. Right
 * for headers and separators — WRONG as the only handling for a line that
 * carries a prediction id: one stray pipe in the prose and the row leaves the
 * ledger without a trace, and the zero-rows guard only fires when EVERYTHING
 * vanishes. Demonstrated live before fixing (rule 3e): a P-row containing
 * `(a \| b)` parsed to 0 rows and its overdue date was never chased. */
function lostRows(text) {
  const lost = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const first = splitCells(t.endsWith('|') ? t : t + '|')[0] || '';
    if (!/^\**P\d+\**$/.test(first)) continue;         // not a prediction id
    if (!t.endsWith('|') || splitCells(t).length !== WIDTH) lost.push(first.replace(/\*/g, ''));
  }
  return lost;
}

/* An em-dash or a bare hyphen is how this file writes "nothing here yet". It must
 * NOT count as a consequence, or every row closes itself by being punctuated. */
function isEmptyCell(c) {
  return !c || /^[-—–\s]*$/.test(c);
}

/* ── THE STATUS IS THE FIRST WORD, EXACTLY (reviewer requirement, 08-18) ────
 *
 * The first cut of the vocabulary check was a SUBSTRING regex, so "ABANDONMENT"
 * and "GRADED-LATER" read as valid — the independent reviewer (gpt-5, run
 * 32179350309) caught it and named those exact costumes. Bare equality is
 * wrong in the other direction: live statuses legitimately read "✅ GRADED
 * 08-18" and "**GRADED — TRUE**". So: strip emphasis, take the FIRST token
 * containing letters, and require THAT token to equal one of the three words.
 * "GRADED — TRUE" passes (token "GRADED"); "GRADED-LATER" is one token and
 * fails; "REOPENED" fails; "ABANDONMENT" fails. */
const VOCAB = ['OPEN', 'GRADED', 'ABANDONED'];
function statusWord(cell) {
  const cleaned = String(cell || '').replace(/[*_~`]/g, ' ');
  for (const tok of cleaned.split(/\s+/)) {
    if (/[A-Za-z]/.test(tok)) return tok.toUpperCase();
  }
  return '';
}

/* ⚠️ `year` IS REQUIRED AND HAS NO DEFAULT — ON PURPOSE, AND IT STILL BIT ME.
 * `Date.UTC(undefined, ...)` is an Invalid Date, which is TRUTHY, so a caller
 * that forgets the argument gets a date-shaped object that fails every
 * comparison silently. Both blocks added on 08-18 (successor, cadence) called
 * `parseDate(cell)` with no year; the successor rule then exempted EVERY row and
 * reported a clean ledger. Rule 3e exactly — a null that meant "asked wrong".
 * Callers now go through `made()`/an explicit YEAR; this throws rather than
 * hand back a lie. */
function parseDate(cell, year) {
  if (!Number.isFinite(year)) {
    throw new TypeError('parseDate: year is required — see the note above this line');
  }
  const m = String(cell || '').match(/(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
  return Number.isFinite(d.getTime()) ? d : null;
}

/* ── MM-DD WRAPS AT NEW YEAR (added 2026-08-18) ─────────────────────────────
 *
 * YEAR is pinned 2026, so a January grade-by (P19 grades fortnightly into
 * January) parsed as ALREADY EIGHT MONTHS OVERDUE the day it was filed. Loud
 * rather than silent, but wrong — and a checker that cries wolf on the first
 * 2027 row gets its date "fixed" by deletion. A grade-by can never precede its
 * own `made` date, so a due date earlier than made rolls into the next year. */
function dueDate(gradeByCell, madeCell) {
  const due = parseDate(gradeByCell, YEAR);
  if (!due) return null;
  const made = parseDate(madeCell, YEAR);
  if (made && due < made) return new Date(Date.UTC(YEAR + 1, due.getUTCMonth(), due.getUTCDate()));
  return due;
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
    const status = statusWord(cells[COL.status]);
    const changed = cells[COL.changed];
    const owner = cells[COL.owner];
    const due = dueDate(cells[COL.gradeBy], cells[COL.made]);
    seen.push(id);

    if (isEmptyCell(owner)) {
      problems.push(`${id}: NO OWNER. A prediction nobody owns is a wish.`);
    }
    /* A status outside the vocabulary dodges EVERY rule here: a past-due row
     * marked "DEFERRED" produced zero problems (demonstrated before fixing).
     * That is the register's "✅ that did not mean closed" in a new costume —
     * a word nobody agreed on, treated as an exit from the loop. */
    if (!VOCAB.includes(status)) {
      problems.push(
        `${id}: UNKNOWN STATUS "${cells[COL.status]}". The vocabulary is OPEN, GRADED, ` +
        `ABANDONED — anything else is a row that no rule can chase.`);
    }
    if (!due) {
      problems.push(`${id}: NO GRADE-BY DATE. An ungraded date is an ungraded prediction.`);
    }
    if (status === 'OPEN' && due && due < today) {
      problems.push(
        `${id}: OVERDUE — grade by ${cells[COL.gradeBy]}, still OPEN. Owner ${owner}. ` +
        `Grade it, or move the date WITH A REASON.`);
    }
    if (status === 'GRADED' && isEmptyCell(changed)) {
      problems.push(
        `${id}: GRADED BUT NOTHING CHANGED. Cory: "a grade that moved nothing." ` +
        `Write the consequence — "NOTHING — <reason>" is a real answer, blank is not.`);
    }
    if (status === 'ABANDONED' && isEmptyCell(changed)) {
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
    const open = rows(text).filter((c) => statusWord(c[COL.status]) === 'OPEN');
    if (open.length < minOpen) {
      problems.push(
        `ONLY ${open.length} OPEN PREDICTIONS (minimum ${minOpen}). An empty backlog is ` +
        `not success — it is the program stopping. File new hypotheses.`);
    }
  }

  /* ── THE SUCCESSOR RULE — THIS IS WHAT MAKES THE LOOP SELF-FEEDING ────────
   *
   * Cory, 2026-08-18: "structured, organized, self-feeding ... I don't have to
   * ask for more predictions, projections, improvements."
   *
   * THE GAP THIS CLOSES, MEASURED THE SAME DAY. The ledger held 76 predictions
   * of which 71 were filed on ONE day. Every rule above was green throughout,
   * because every rule above is about predictions that ALREADY EXIST — overdue
   * ones, ungraded ones, a floor on the backlog. **Nothing required a grade to
   * produce anything.** Grade thirty, file zero, stay above the floor: green.
   * That is a program ending politely, and the build would have applauded.
   *
   * SO: A GRADE MUST NAME WHAT COMES NEXT. Grading is the moment we know the
   * most we will ever know about a line of enquiry — it is the cheapest possible
   * moment to ask the next question, and the only one at which the answer is
   * fresh. Two forms count, in the `what changed` cell:
   *
   *   "-> P77"    this grade spawned that prediction (the line continues)
   *   "RETIRES"   this line is closed on purpose, and the cell says why
   *
   * A grade that does neither is a dead end nobody declared. It is not that the
   * work was wrong — it is that nothing was asked next, and no mechanism noticed.
   *
   * ⚠️ DELIBERATELY NOT RETROACTIVE. Rows graded before this rule existed are
   * exempt by date: punishing past work for a rule invented today teaches people
   * to argue with the checker instead of using it. From SUCCESSOR_FROM onward,
   * every grade carries one. */
  const SUCCESSOR_FROM = Date.parse('2026-08-19');
  for (const c of rows(text)) {
    const id = c[COL.id];
    if (statusWord(c[COL.status]) !== 'GRADED') continue;
    /* ⚠️ `parseDate` returns a DATE, and an unparseable cell returns an INVALID
     * DATE — which is truthy. The first version of this guard read
     * `if (!made || made < SUCCESSOR_FROM) continue` with a STRING bound, so a
     * Date-vs-string comparison was always false and an Invalid Date sailed past
     * the null check. Result: it flagged all 40 pre-existing grades — exactly the
     * retroactive punishment the comment above promises not to inflict. Caught by
     * running it, one minute after writing it. */
    const made = parseDate(c[COL.made], YEAR);
    const ms = made ? made.getTime() : NaN;
    /* An UNDATED grade is NOT exempt. Exempting it would make "delete the date"
     * the cheapest way out of the rule, which is the one escape hatch a
     * self-feeding loop must not have. */
    if (Number.isFinite(ms) && ms < SUCCESSOR_FROM) continue;    // pre-rule, exempt
    const changed = c[COL.changed];
    const hasSuccessor = /->\s*P\d+|→\s*P\d+/.test(changed);
    const retires = /\bRETIRES?\b|\bRETIRED\b/i.test(changed);
    if (!hasSuccessor && !retires) {
      problems.push(
        `${id}: GRADED WITH NO SUCCESSOR. A grade is the cheapest moment to ask ` +
        `the next question. Name the prediction it spawned ("-> P77") or RETIRE ` +
        `the line and say why. A dead end nobody declared is how the programme ends.`);
    }
  }

  /* ── CADENCE — A LEDGER THAT STOPPED GROWING HAS STOPPED WORKING ───────────
   *
   * 71 of 76 predictions were filed on a single day and every check passed. A
   * burst is not a programme. If nothing new has been filed in this many days,
   * the loop is not feeding itself whatever the backlog count says.
   *
   * Opt-in like `minOpen`, so unit fixtures are not judged by it. */
  if (opts && typeof opts.maxQuietDays === 'number' && opts.today) {
    /* `.sort()` with no comparator sorts by STRING — on Dates that is
     * "Fri Aug 21..." vs "Mon Aug 17...", i.e. alphabetical by weekday name.
     * The newest row would have been whatever day-name sorts last. */
    const made = rows(text)
      .map((c) => parseDate(c[COL.made], YEAR))
      .filter((d) => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    const newest = made[made.length - 1];
    if (newest) {
      const days = Math.round(
        (Date.parse(opts.today) - newest.getTime()) / 86400000);
      if (days > opts.maxQuietDays) {
        problems.push(
          `NO NEW PREDICTION IN ${days} DAYS (limit ${opts.maxQuietDays}). The ` +
          `backlog may be full and the programme still stalled — nothing has been ` +
          `ASKED since ${newest}. File a hypothesis or say why the search is over.`);
      }
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

  for (const id of lostRows(text)) {
    problems.push(
      `${id}: LOOKS LIKE A PREDICTION ROW BUT DID NOT PARSE into ${WIDTH} cells — ` +
      `a stray unescaped pipe in the prose, or a missing trailing pipe. Escape prose ` +
      `pipes as \\| or the row silently leaves the ledger and is never chased.`);
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

  /* MAX_QUIET_DAYS: a ledger that stopped growing has stopped working, however
   * full its backlog. 14 days spans the fortnightly grade cadence the program
   * commits to (P19, first grade 09-15) with a week of slack — tight enough to
   * catch a stall, loose enough that a normal quiet week is not an alarm. */
  const { problems, count } = check(fs.readFileSync(LEDGER, 'utf8'), today,
                                    { minOpen: MIN_OPEN, maxQuietDays: MAX_QUIET_DAYS,
                                      today: today });
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

module.exports = { check, rows, lostRows, isEmptyCell, parseDate, dueDate, MIN_OPEN, MAX_QUIET_DAYS };
if (require.main === module) process.exitCode = main();

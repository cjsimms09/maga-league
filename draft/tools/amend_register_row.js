#!/usr/bin/env node
/* TERRITORY: A. AMEND AN EXISTING REGISTER ROW WITHOUT BREAKING IT.
 *
 * ── WHY THIS EXISTS, AND IT IS THE SAME REASON file_register_row.js EXISTS ──
 *
 * `file_register_row.js` reads a NEW row's prose from FILES, never argv, because
 * a shell will happily execute a backtick. Amending an EXISTING row had no such
 * tool, so every amendment was a hand-rolled `node -e` one-liner — eight of them
 * on 2026-08-28 alone — and the ninth cost a row.
 *
 * ⛔ THE INCIDENT, 2026-08-28. Row 253's closing note was written into an
 * UNQUOTED heredoc so that `$SHA` would expand. Backticks expand there too, and
 * bash tried to run four of them:
 *
 *     covered_by_source.espn: command not found
 *     public/position_boards.json: Permission denied
 *     built_at: command not found
 *
 * The row was written with those four fragments simply GONE — *"and  gives espn
 * 29 / 65 / 60 / 25"*, *"the artifact is stamped , four days after"*. Every
 * register guard passed: the column count was right, the status word was right,
 * the pipes were escaped. The prose was just missing its nouns. This is register
 * 390's corruption in a new costume, and the earlier one was caught the same
 * way — by reading the row back, not by a gate.
 *
 * So: the prose comes from a FILE and the shell never sees it. `@SHA@` in that
 * file is substituted with the current short HEAD, which is the ONE thing the
 * unquoted heredoc was actually for.
 *
 * ── WHAT IT CHECKS BEFORE IT WRITES ────────────────────────────────────────
 *
 *   * the row exists, and is a real row with the register's 7-field shape;
 *   * the new text contains no UNESCAPED pipe (the four-column-break defect
 *     `file_register_row.js` documents);
 *   * the overdue count does not RISE because of this row (register 374 —
 *     scoped to the row being edited, never to the register's backlog);
 *   * `test_defect_register.py` passes afterwards, or the file is REVERTED.
 *
 * ── AND ONE CHECK NEITHER OTHER TOOL HAS ───────────────────────────────────
 *
 * ⭐ IT PRINTS THE CELL BACK. The 253 incident produced a row that passed every
 * structural guard and read as nonsense, and the only thing that could have
 * caught it is a human reading the result. So the result is put in front of one,
 * with a count of the backticked and bolded fragments that survived — the exact
 * shapes a shell eats.
 *
 * Usage:
 *   node draft/tools/amend_register_row.js --id 253 --action-file <path> \
 *        [--status "✅ CLOSED"] [--body-file <path>] [--today YYYY-MM-DD]
 *   node draft/tools/amend_register_row.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const REGISTER = path.join(ROOT, 'DEFECT-REGISTER.md');
const CELLS = 7;                     // '' | id | body | owner | status | action | ''
const BUF = 64 * 1024 * 1024;        // register 391 — never the 1MB default
const canon = require(path.join(ROOT, 'draft', 'tools', 'register_recheck_check.js'));

const splitCells = line => line.split(/(?<!\\)\|/);
const hasBarePipe = s => /(^|[^\\])\|/.test(s);

/* Same transform as file_register_row.js, and deliberately the same rule: an
 * already-escaped pipe is left alone so running twice is safe. */
function escapeCellPipes(s) {
  return String(s).replace(/(?<!\\)\|/g, '\\|');
}

function shortHead() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF }).trim();
  } catch (e) { return null; }
}

function overdueCount(today) {
  try {
    const R = require(path.join(ROOT, 'draft', 'tools', 'register_recheck_check.js'));
    return (R.audit(fs.readFileSync(REGISTER, 'utf8'), today).overdue || []).length;
  } catch (e) { return null; }
}

/* ── THE GUARD THIS TOOL DID NOT HAVE, AND ITS FIRST REAL USE PROVED IT ─────
 *
 * 2026-08-28, within the hour of shipping: amending row 283 PREPENDED a header
 * carrying "recheck 09-04" while the original action still said "recheck 08-28".
 * Two live dates in one open row means the build's behaviour depends on WORD
 * ORDER — the tool's own precedence is last-wins — and `register_recheck_check`'s
 * live-register arm went red. Every guard this tool ran passed: the column count
 * was right, the overdue count did not rise, test_defect_register.py was green.
 *
 * That is the SAME shape as the corruption this tool was built for: a row that
 * satisfies every structural check and is wrong. And prepending is exactly what
 * an amendment does, so this tool is the thing most likely to cause it.
 *
 * The rule is not reimplemented here — a second copy is how two guards come to
 * disagree (register 313). It is the same regex the live test uses, and if that
 * test's rule changes this must be updated with it. Register 400. */
function liveDates(rowText) {
  const seen = new Set();
  const re = /recheck\s+(?:(\d{4})-)?(\d{2})-(\d{2})/gi;
  let m;
  while ((m = re.exec(rowText)) !== null) seen.add(m[2] + '-' + m[3]);
  return [...seen];
}

function structuralGuard() {
  try {
    execFileSync('python3', ['-m', 'pytest', 'draft/tests/test_defect_register.py', '-q'],
      { cwd: ROOT, stdio: 'pipe', maxBuffer: BUF });
    return { ok: true };
  } catch (e) {
    return { ok: false, out: String((e.stdout || '') + (e.stderr || '')).slice(-1200) };
  }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

/* ── the self-test, and its known positive is the real 253 damage ──────────── */
function selfTest() {
  let pass = 0, fail = 0;
  const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + JSON.stringify(d).slice(0, 300) : ''))); };

  ck('a bare pipe in the new text is REFUSED', hasBarePipe('a | b'));
  ck('  an escaped one is not', !hasBarePipe('a \\| b'));
  ck('  and text with no pipe at all is not', !hasBarePipe('kept_players is the slate'));
  ck('escaping is idempotent, so re-running is safe',
    escapeCellPipes(escapeCellPipes('a || b')) === 'a \\|\\| b',
    escapeCellPipes(escapeCellPipes('a || b')));

  /* KNOWN POSITIVE — the actual damaged text from the 253 incident. The four
   * eaten fragments leave a row that is structurally perfect and reads as
   * nonsense, so the only detectable signature is the double space and the
   * missing backticks. This asserts the REPORT would show it, which is the
   * mechanism, rather than pretending a gate can catch it. */
  const damaged = 'This row named the test precisely — *" must be non-zero at '
    + 'QB/RB/WR/TE for pick 33"* — and  gives **espn 29**, stamped , four days after.';
  const healthy = 'This row named the test precisely — *"`covered_by_source.espn` must be '
    + 'non-zero at QB/RB/WR/TE for pick 33"* — and `public/position_boards.json` '
    + 'gives **espn 29**, stamped `built_at 2026-08-26`, four days after.';
  const ticks = s => (s.match(/`[^`]+`/g) || []).length;
  const gaps = s => (s.match(/\w {2,}\w|— {2,}|and {2,}/g) || []).length;
  ck('KNOWN POSITIVE — the real 253 damage shows ZERO backticked fragments where '
    + 'the healthy text has three', ticks(damaged) === 0 && ticks(healthy) === 3,
    { damaged: ticks(damaged), healthy: ticks(healthy) });
  ck('  and the damage leaves the collapsed-whitespace signature behind',
    gaps(damaged) > 0 && gaps(healthy) === 0, { damaged: gaps(damaged), healthy: gaps(healthy) });

  /* KNOWN NEGATIVE — the substitution must not fire on text that has no marker. */
  ck('@SHA@ substitution leaves unmarked text alone',
    'no marker here'.replace(/@SHA@/g, 'abc1234') === 'no marker here');
  ck('  and does replace the marker when it is there',
    'fixed in @SHA@'.replace(/@SHA@/g, 'abc1234') === 'fixed in abc1234');

  /* KNOWN POSITIVE — the real 283 shape: a prepended header with a new date
   * over an original action that still carries the old one. */
  ck('KNOWN POSITIVE — two live recheck dates in one row are seen',
    liveDates('owner A, recheck 09-04. ── ORIGINAL ── ... recheck 08-28 more text').length === 2,
    liveDates('owner A, recheck 09-04. ── ORIGINAL ── ... recheck 08-28 more text'));
  ck('  and the retired form leaves exactly ONE live date, which is the fix the '
    + 'rule prescribes',
    liveDates('recheck 09-04 ... recheck WAS 08-28 — superseded').length === 1,
    liveDates('recheck 09-04 ... recheck WAS 08-28 — superseded'));
  ck('KNOWN NEGATIVE — one date stays one date',
    liveDates('unblocked by nothing, owner A, recheck 09-02.').length === 1);

  /* ── THE ZERO-DATE REGRESSION (register 485's third error, 09-05) ─────────
   * The rule under test is `datesBefore > 0 && after === 0` on an OPEN row.
   * The known positive is the ACTUAL text that stripped 485's date: an
   * amendment full of prose and shas and not one `recheck MM-DD`. */
  const strip = (before, after, closed) =>
    !closed && liveDates(before).length > 0 && liveDates(after).length === 0;

  const realAmendment = '⛔ **CORRECTION BY A: "Python suite green" WAS FALSE.** '
    + 'The claim went into commit `dbf5b2bf`\'s message and to Cory.';
  ck('⭐ KNOWN POSITIVE — the real 485 amendment: a dated open row amended to '
    + 'text carrying no date is CAUGHT. This is the case the tool caused and '
    + 'shipped, and no other guard could see it: an invisible row cannot be '
    + 'overdue, so the overdue count moves the WRONG WAY',
  strip('the breadth debt, owner A, recheck 09-15', realAmendment, false));

  ck('  FAIL ARM — the same amendment WITH the date restated is allowed, so the '
    + 'guard is reading the date rather than refusing every replacement',
  !strip('the breadth debt, owner A, recheck 09-15',
    realAmendment + ' Next: usage is first due, recheck 09-15.', false));

  ck('  a row that was ALREADY undated stays amendable — the guard is a '
    + 'regression, not a floor; a tool that blocks improving a bad row is a '
    + 'tool people route around',
  !strip('no date here at all, owner A', realAmendment, false));

  ck('  and a row being CLOSED by the same edit is exempt — nothing chases a '
    + 'closed row, so its retired date is not owed',
  !strip('owner A, recheck 09-15', realAmendment, true));

  console.log('\n' + pass + '/' + (pass + fail) + ' self-tests passed');
  return fail ? 1 : 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const id = arg('--id');
  const actionFile = arg('--action-file');
  const bodyFile = arg('--body-file');
  const status = arg('--status');
  if (!id || (!actionFile && !bodyFile && !status)) {
    console.error('usage: --id 253 --action-file F [--status "✅ CLOSED"] '
      + '[--body-file F] [--today YYYY-MM-DD]');
    return 2;
  }

  const before = fs.readFileSync(REGISTER, 'utf8');
  const lines = before.split('\n');
  const ix = lines.findIndex(l => l.startsWith('| ' + id + ' |'));
  if (ix < 0) { console.error('row ' + id + ' not found'); return 2; }
  const cells = splitCells(lines[ix]);
  if (cells.length !== CELLS) {
    console.error('row ' + id + ' has ' + cells.length + ' cells, expected ' + CELLS
      + ' — REFUSING to edit a row that is already malformed.');
    return 2;
  }

  const sha = shortHead();
  const load = f => {
    const raw = fs.readFileSync(f, 'utf8').trim().replace(/\s*\n\s*/g, ' ');
    if (hasBarePipe(raw)) {
      throw new Error('REFUSING: ' + f + ' contains an UNESCAPED pipe, which is a '
        + 'markdown column separator and would silently split the row. Escape it '
        + 'as \\| or rephrase.');
    }
    if (/@SHA@/.test(raw) && !sha) {
      throw new Error('REFUSING: the text asks for @SHA@ and git could not be read.');
    }
    return raw.replace(/@SHA@/g, sha || '');
  };

  const today = arg('--today') || new Date().toISOString().slice(0, 10);
  const overdueBefore = overdueCount(today);
  const datesBefore = liveDates(lines[ix]).length;

  if (bodyFile) cells[2] = ' ' + load(bodyFile) + ' ';
  if (status) cells[CELLS - 3] = ' ' + status.trim() + ' ';
  if (actionFile) cells[CELLS - 2] = ' ' + load(actionFile) + ' ';
  lines[ix] = cells.join('|');
  fs.writeFileSync(REGISTER, lines.join('\n'));

  const g = structuralGuard();
  const overdueAfter = overdueCount(today);
  const worse = (overdueBefore != null && overdueAfter != null && overdueAfter > overdueBefore);
  /* Two live dates only matter while the row is OPEN — a closed row is not
   * chased by anything, so its retired date is harmless. */
  /* The canonical vocabulary, not a fourth private copy of it. Register 469 /
   * A-DECISIONS D10 — this list was the third one found and it is missing
   * nothing today, but a hand-rolled list is exactly what drifted in the other
   * three. `isClosed` takes the status cell, which is what this passes it. */
  const closedNow = canon.isClosed({ status: cells[CELLS - 3] });
  const dates = closedNow ? [] : liveDates(lines[ix]);
  const ambiguous = dates.length > 1;

  /* ⚠️⚠️ ZERO DATES IS THE OTHER HALF, AND THIS TOOL CAUSED THE FAILURE IT DID
   * NOT GUARD. Register 400 taught it to refuse TWO live dates. Amending row
   * 485 on 2026-09-04 hit the mirror image: `--action-file` REPLACES the action
   * cell, the replacement text did not restate `recheck 09-15`, and the row
   * came out OPEN AND UNDATED — invisible to `register_recheck_check.js`, which
   * is `CLAUDE.md`'s own headline failure, and it reached `main` in `73b90ef7`
   * before the live-register arm caught it.
   *
   * Every guard passed, exactly as in the 253 incident: the column count was
   * right, the overdue count did not RISE (an invisible row cannot be overdue
   * — the metric moves the wrong way, which is why `worse` could never see
   * this), and test_defect_register.py was green.
   *
   * The rule is a REGRESSION, not a floor: refuse only when this edit removed
   * the row's last live date. A row that was already undated stays amendable —
   * a tool that refuses to let you improve a bad row is a tool people route
   * around, and undated rows are reported by the checker on their own. */
  const strippedDate = !closedNow && datesBefore > 0 && dates.length === 0;

  if (!g.ok || worse || ambiguous || strippedDate) {
    fs.writeFileSync(REGISTER, before);
    console.error('\n⛔ GUARD FAILED amending row ' + id
      + (ambiguous ? ' — the row now carries TWO LIVE RECHECK DATES (' + dates.join(', ')
        + '), so which one the build honours depends on WORD ORDER. Write the '
        + 'retired one as "recheck WAS MM-DD" and say why (register 400).'
      : worse ? ' — the overdue count went ' + overdueBefore + ' -> ' + overdueAfter
        + ', so this edit put the row past its own recheck date (register 374).'
      : strippedDate ? ' — the row had ' + datesBefore + ' live recheck date(s) '
        + 'and now has NONE, so it would be an OPEN UNDATED row: invisible to '
        + 'register_recheck_check.js forever. --action-file REPLACES the cell; '
        + 'restate the "recheck MM-DD" in your new text (or close the row).'
        : ' — test_defect_register.py'));
    console.error('   DEFECT-REGISTER.md has been REVERTED; nothing was left half-written.');
    if (g.out) console.error(g.out);
    return 1;
  }

  /* ⭐ READ IT BACK. The 253 incident passed every structural guard and read as
   * nonsense; only a human eye catches that, so put it in front of one. */
  const written = splitCells(fs.readFileSync(REGISTER, 'utf8').split('\n')[ix]);
  const cell = written[CELLS - 2];
  const ticks = (cell.match(/`[^`]+`/g) || []).length;
  const bolds = (cell.match(/\*\*[^*]+\*\*/g) || []).length;
  const gaps = (cell.match(/\w {2,}\w/g) || []).length;
  console.log('amended register row ' + id + ' — guards green'
    + (status ? ', status now ' + status.trim() : ''));
  console.log('  ' + ticks + ' backticked fragment(s), ' + bolds + ' bold run(s)'
    + (gaps ? ', ⚠️  ' + gaps + ' COLLAPSED-WHITESPACE gap(s) — a shell eats backticks '
      + 'and leaves exactly this (register 399)' : ''));
  console.log('\n  ── the cell as written ──');
  console.log('  ' + cell.trim().slice(0, 900) + (cell.trim().length > 900 ? ' …' : ''));
  console.log('\n  READ IT. Every register guard passed on the corrupted row that '
    + 'made this tool necessary.');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { escapeCellPipes, hasBarePipe, splitCells };

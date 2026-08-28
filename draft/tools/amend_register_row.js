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

  if (bodyFile) cells[2] = ' ' + load(bodyFile) + ' ';
  if (status) cells[CELLS - 3] = ' ' + status.trim() + ' ';
  if (actionFile) cells[CELLS - 2] = ' ' + load(actionFile) + ' ';
  lines[ix] = cells.join('|');
  fs.writeFileSync(REGISTER, lines.join('\n'));

  const g = structuralGuard();
  const overdueAfter = overdueCount(today);
  const worse = (overdueBefore != null && overdueAfter != null && overdueAfter > overdueBefore);
  if (!g.ok || worse) {
    fs.writeFileSync(REGISTER, before);
    console.error('\n⛔ GUARD FAILED amending row ' + id
      + (worse ? ' — the overdue count went ' + overdueBefore + ' -> ' + overdueAfter
        + ', so this edit put the row past its own recheck date (register 374).'
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

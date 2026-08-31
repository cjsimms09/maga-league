#!/usr/bin/env node
/* TERRITORY: A. FILE A REGISTER ROW WITHOUT BREAKING THE REGISTER.
 *
 * ── WHY THIS EXISTS, AND IT IS ABOUT MY OWN CONDUCT ────────────────────────
 *
 * On 2026-08-24 I broke `DEFECT-REGISTER.md`'s column count FOUR times in one
 * session, every time the same way: quoting real code in a row body, where an
 * ordinary `||` or `|` is a markdown column separator. `a || b` in prose splits
 * one cell into three and the row silently stops being a row.
 *
 * TWICE I ALSO COMMITTED PAST THE GUARD THAT CAUGHT IT, by chaining the commit
 * on a newline instead of `&&` — after writing "a check whose exit code nothing
 * reads is not a check" into a commit message that same morning.
 *
 * Both are discipline failures, and this project's standard is that a
 * mechanism survives where a resolution does not (register 300, in as many
 * words: the mechanism is what survives; the human noticing is what does not).
 * So: a tool that cannot make either mistake.
 *
 *   * it ESCAPES pipes in the cell text, so quoting code is safe;
 *   * it CLAIMS the id from next_register_id.js, so no collision (register 186);
 *   * it RUNS the register guards afterwards and REVERTS the file if they fail,
 *     so a broken row never survives long enough to be committed.
 *
 * ── THE REVERT PATH IS PROVEN, NOT ASSUMED (Rule 3e) ───────────────────────
 *
 * A guard that has only ever printed success has not been tested, only run, and
 * my FIRST attempt to prove this one proved nothing: I filed a row with the
 * status `BANANA` expecting rejection and all sixteen register tests PASSED —
 * because the row was not rejected, it was never SEEN (that became register
 * 313). A probe whose failure case cannot fire is the exact defect this session
 * spent its day removing, so it does not get to live in the tool built to stop
 * such defects.
 *
 * PROVEN 2026-08-24, by filing a row that genuinely fails a guard: an OPEN row
 * whose action carries `recheck 01-01`, a date in the past, which
 * register_recheck_check.js is built to fail on. Result: the guard failed, the
 * tool exited 1, and DEFECT-REGISTER.md came back BYTE-IDENTICAL to before the
 * run. No half-filed row survived.
 *
 * ⚠️ IDS ARE BURNED BY A FAILED FILE, AND THAT IS CORRECT. 311, 312 and 314
 * were claimed during these experiments and no row carries them. Register 186's
 * watermark rule is that an id is spent once handed out — reusing one is how
 * two findings came to share a number. A gap in the numbering is the cheap
 * outcome; a collision is the expensive one.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 *
 * It does not commit, and it does not decide anything. The row's CONTENT — the
 * measurement, the owner, the recheck date, the three Rule 3g questions — is
 * still entirely the author's problem. This removes a class of typo, not the
 * thinking.
 *
 * Usage:
 *   node draft/tools/file_register_row.js --body-file <path> --owner A \
 *        --status "🟠 OPEN" --action-file <path> [--after <id>]
 *   node draft/tools/file_register_row.js --self-test
 *
 * The body and action are read from FILES, not argv, so a shell never gets the
 * chance to interpret a backtick — the other way I corrupted a commit message
 * this session.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const REGISTER = path.join(ROOT, 'DEFECT-REGISTER.md');

/* THE ONE TRANSFORM THIS TOOL EXISTS FOR. A pipe inside a markdown table cell
 * is a column separator; an escaped pipe is a pipe. Already-escaped pipes are
 * left alone so running this twice is safe. */
function escapeCellPipes(s) {
  /* ⚠️ LOOKBEHIND, NOT A CONSUMED PREFIX — and the self-test caught this before
   * the tool filed anything. The first version was `/(^|[^\\])\|/g`, which
   * CONSUMES the character before each pipe. On a `||` pair the first match eats
   * `a |`, so the second pipe has no unconsumed predecessor left to match and
   * survives unescaped: `a || b` came out `a \|| b`, still broken, and still
   * broken in EXACTLY the string that corrupted the register four times today.
   * A zero-width lookbehind matches each pipe independently. */
  return String(s).replace(/(?<!\\)\|/g, '\\|');
}

/* THE OVERDUE COUNT, so the recheck guard can be scoped to THIS row instead of
 * vetoing on the whole register's backlog. Returns null if the audit cannot be
 * taken at all, which the caller treats as "cannot judge" rather than "fine". */
function overdueCount(today) {
  try {
    const R = require(path.join(ROOT, 'draft', 'tools', 'register_recheck_check.js'));
    const a = R.audit(fs.readFileSync(REGISTER, 'utf8'), today);
    return (a.overdue || []).length;
  } catch (e) { return null; }
}

/* ── WHY THIS GUARD IS SCOPED AND NOT SIMPLY DROPPED (register 374) ─────────
 *
 * This ran `register_recheck_check.js` whole and reverted on its exit code.
 * That check is a WHOLE-REGISTER health check: it exits 1 if any open row
 * anywhere is past its own recheck date. On 2026-08-24, when this tool was
 * written and its revert path proven, the register carried ZERO overdue rows —
 * measured, not assumed — so the guard spoke only about the row being filed.
 * By 2026-08-27 the backlog was 60, and the tool reverted EVERY row on a
 * signal none of them caused. Worse, the id is claimed before the guards run
 * and is never returned (register 186's rule, correctly), so each refusal
 * spent a number: 372 and 373 name nothing and never will.
 *
 * DROPPING THE CHECK WOULD BREAK THE THING IT WAS PROVEN ON — a row that files
 * itself ALREADY OVERDUE, which is the case the 08-24 proof used. So the
 * question it asks is narrowed rather than removed: not "is the register
 * healthy" but "did THIS row make it less healthy". A pre-existing backlog is
 * register 4g's problem and is not a reason to refuse new work.
 *
 * The structural check stays whole — `test_defect_register.py` is about the
 * ROW's shape, so its verdict is already scoped. */
function guardsPass(overdueBefore, today) {
  try {
    execFileSync('python3', ['-m', 'pytest', 'draft/tests/test_defect_register.py', '-q'],
      { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    return { ok: false, which: 'pytest draft/tests/test_defect_register.py',
      out: String((e.stdout || '') + (e.stderr || '')).slice(-1200) };
  }
  const after = overdueCount(today);
  if (after === null || overdueBefore === null) {
    return { ok: false, which: 'register_recheck_check.audit',
      out: 'the recheck audit could not be taken before/after, so this tool '
        + 'cannot tell whether the new row is overdue. Refusing rather than '
        + 'filing blind.' };
  }
  if (after > overdueBefore) {
    return { ok: false, which: 'register_recheck_check (scoped to this row)',
      out: 'the overdue count went ' + overdueBefore + ' -> ' + after
        + ', so THIS row is already past its own recheck date. Give it a date '
        + 'in the future.\n(The ' + overdueBefore + ' rows that were already '
        + 'overdue are not this row\'s fault and did not block it — register '
        + '374.)' };
  }
  return { ok: true };
}

function selfTest() {
  const cases = [
    ['a bare pipe is escaped', 'a || b', 'a \\|\\| b'],
    ['a single pipe too', 'x | y', 'x \\| y'],
    ['an ALREADY escaped pipe is left alone (idempotent)', 'a \\|\\| b', 'a \\|\\| b'],
    ['a leading pipe is escaped', '|lead', '\\|lead'],
    ['KNOWN NEGATIVE — text with no pipe is untouched',
      'kept_players is the league slate', 'kept_players is the league slate'],
    ['the real string that broke the register four times',
      '`const keepers = (BOARD.kept_players || [])`',
      '`const keepers = (BOARD.kept_players \\|\\| [])`'],
  ];
  let bad = 0;
  cases.forEach(([name, input, want]) => {
    const got = escapeCellPipes(input);
    const ok = got === want;
    if (!ok) bad++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name
      + (ok ? '' : '\n        got  ' + JSON.stringify(got)
                 + '\n        want ' + JSON.stringify(want)));
  });
  /* A transform that escapes EVERYTHING would pass every case above, so prove
   * it leaves a pipe-free string identical — that is the known-negative. */
  console.log('\n' + (cases.length - bad) + '/' + cases.length + ' self-tests passed');
  return bad ? 1 : 0;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const bodyFile = arg('--body-file');
  const actionFile = arg('--action-file');
  const owner = arg('--owner');
  const status = arg('--status');
  if (!bodyFile || !actionFile || !owner || !status) {
    console.error('usage: --body-file F --action-file F --owner A --status "🟠 OPEN" [--after ID]');
    return 2;
  }

  const before = fs.readFileSync(REGISTER, 'utf8');
  const id = String(execFileSync('node',
    [path.join(ROOT, 'draft', 'tools', 'next_register_id.js')],
    { cwd: ROOT, encoding: 'utf8' })).trim();
  if (!/^\d+$/.test(id)) {
    console.error('could not claim an id from next_register_id.js — got ' + JSON.stringify(id));
    return 2;
  }

  const body = escapeCellPipes(fs.readFileSync(bodyFile, 'utf8').trim().replace(/\s*\n\s*/g, ' '));
  const action = escapeCellPipes(fs.readFileSync(actionFile, 'utf8').trim().replace(/\s*\n\s*/g, ' '));
  const row = ['| ' + id, body, '**' + owner + '**', status, action + ' |'].join(' | ');

  const lines = before.split('\n');
  const after = arg('--after');
  let ix = -1;
  if (after) {
    ix = lines.findIndex(l => l.startsWith('| ' + after + ' |'));
    if (ix < 0) { console.error('--after ' + after + ' not found'); return 2; }
  } else {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^\| \d+ \|/.test(lines[i])) { ix = i; break; }
    }
  }
  if (ix < 0) { console.error('no existing numbered row to append after'); return 2; }

  /* Overdue count taken BEFORE the write, so the recheck guard can ask whether
   * THIS row made things worse rather than whether the register is spotless
   * (register 374). `--today` mirrors register_recheck_check.js's own flag so
   * the two cannot drift on what day it is. */
  const ti = process.argv.indexOf('--today');
  const today = ti > -1 ? process.argv[ti + 1] : new Date().toISOString().slice(0, 10);
  const overdueBefore = overdueCount(today);

  lines.splice(ix + 1, 0, row);
  fs.writeFileSync(REGISTER, lines.join('\n'));

  const g = guardsPass(overdueBefore, today);
  if (!g.ok) {
    /* REVERT rather than leave a broken register behind. A half-filed row that
     * survives until someone runs `git add -A` is exactly how the four
     * column-count breaks reached a commit. */
    fs.writeFileSync(REGISTER, before);
    console.error('\n⛔ GUARD FAILED after filing row ' + id + ' — ' + g.which);
    console.error('   DEFECT-REGISTER.md has been REVERTED; nothing was left half-filed.');
    console.error('   NOTE: the id ' + id + ' is still claimed in the watermark, which is '
      + 'correct — an id is burned once handed out (register 186).');
    console.error(g.out);
    return 1;
  }
  console.log('filed register row ' + id + ' — guards green, register unmodified otherwise');
  console.log('  remember: commit DEFECT-REGISTER.md AND draft/data/register_id_watermark.json together');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { escapeCellPipes };

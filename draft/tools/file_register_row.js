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

function guardsPass() {
  const checks = [
    ['python3', ['-m', 'pytest', 'draft/tests/test_defect_register.py', '-q']],
    ['node', ['draft/tools/register_recheck_check.js']],
  ];
  for (const [cmd, args] of checks) {
    try {
      execFileSync(cmd, args, { cwd: ROOT, stdio: 'pipe' });
    } catch (e) {
      return { ok: false, which: cmd + ' ' + args.join(' '),
        out: String((e.stdout || '') + (e.stderr || '')).slice(-1200) };
    }
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
  lines.splice(ix + 1, 0, row);
  fs.writeFileSync(REGISTER, lines.join('\n'));

  const g = guardsPass();
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

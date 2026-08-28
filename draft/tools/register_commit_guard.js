#!/usr/bin/env node
/* TERRITORY: A.  A BROKEN REGISTER ROW CANNOT BE COMMITTED, HOWEVER IT WAS
 * WRITTEN (register 390).
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `draft/tools/file_register_row.js` already escapes pipes, claims ids and
 * runs the guards. It is a good tool and it protects nobody, because NOTHING
 * OBLIGES ANYONE TO USE IT — and on 2026-08-27/28 I filed five rows without
 * it and corrupted two of them:
 *
 *   · row 374 broke into NINE COLUMNS, because the sentence describing the
 *     pipe escaper contained a literal double-pipe;
 *   · row 193 lost TWELVE backticked identifiers, because I ran `node -e`
 *     with the row text in double quotes and bash executed every one of them
 *     as a command substitution, leaving "consumers ARE found, four of them,
 *     all Python:  reads  as a tiebreak signal".
 *
 * The second is the dangerous one: BOTH register gates PASSED on it. They are
 * structural checks and the structure was intact — only the content had been
 * destroyed. I caught it by printing the row back and reading it.
 *
 * So this validates THE STAGED BLOB — `git show :DEFECT-REGISTER.md` — not the
 * working tree, and it runs from a pre-commit hook. It does not care which
 * tool wrote the row. That is the entire point: a guard that depends on
 * choosing to run it is advice.
 *
 * ── THE CORRUPTION CHECK IS SCOPED, AND THE SCOPE IS MEASURED ──────────────
 *
 * A run of two-or-more spaces between word characters is the signature bash
 * leaves when it eats a `command substitution`. Measured across the live
 * register: 2 of 479 rows contain one legitimately (0.4%). So it is applied
 * ONLY to rows this commit ADDS OR CHANGES, never to history — which is the
 * right scope anyway, and keeps a 0.4% false-positive rate off everyone's
 * unrelated commits.
 *
 * Run:  node draft/tools/register_commit_guard.js          (validate staged)
 *       node draft/tools/register_commit_guard.js --self-test
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FILE = 'DEFECT-REGISTER.md';

/* A register row's id always contains a DIGIT — 122, E7, 5j, DS7, 20b, 4y.
 * Table HEADERS ("| what | finding |", "| # | what | owner |") never do, and
 * this document carries three narrower tables besides the register whose rows
 * must not be judged by the register's column count. Measured: 466 rows match,
 * 0 of them malformed, 0 duplicated. */
function isRegisterRow(line) {
  const m = line.match(/^\| ([A-Za-z0-9]{1,4}) \|/);
  return !!(m && /\d/.test(m[1]));
}
function idOf(line) { return line.match(/^\| ([A-Za-z0-9]{1,4}) \|/)[1]; }
/* Escape-aware: `\|` inside a cell is a pipe, not a separator. */
function cellCount(line) { return line.split(/(?<!\\)\|/).length; }

/** Pure, testable. `changed` is the set of row lines this commit adds/edits. */
function problems(stagedText, changedLines) {
  const rows = stagedText.split('\n').filter(isRegisterRow);
  const out = [];

  for (const r of rows) {
    if (cellCount(r) !== 7) {
      out.push({ kind: 'COLUMNS', id: idOf(r), detail:
        'has ' + (cellCount(r) - 2) + ' columns, not 5 — an unescaped `|` or `||` '
        + 'inside a cell. This is exactly how row 374 broke.' });
    }
  }

  const ids = rows.map(idOf);
  const dupes = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  for (const d of dupes) out.push({ kind: 'DUPLICATE_ID', id: d, detail: 'two rows share this id' });

  /* Only rows this commit touches — see the scope note in the header. */
  for (const r of changedLines.filter(isRegisterRow)) {
    const runs = r.match(/\w {2,}\w/g);
    if (runs) {
      out.push({ kind: 'SHELL_EATEN?', id: idOf(r), detail:
        'a run of 2+ spaces between words (' + JSON.stringify(runs.slice(0, 3))
        + '). That is the signature bash leaves when it executes a `backticked` '
        + 'identifier as a command substitution — how row 193 lost twelve of them. '
        + 'If the spacing is deliberate, collapse it; if not, your row is corrupt.' });
    }
  }
  return out;
}

/* ⚠️ maxBuffer AND A CATCH THAT DISTINGUISHES — BOTH LEARNED THE HARD WAY.
 *
 * The first version of this used execSync's DEFAULT 1MB buffer and a catch that
 * returned null. `DEFECT-REGISTER.md` is ~1.04MB, so `git show` threw ENOBUFS,
 * null was read as "the register is not staged, nothing to judge", and the
 * guard EXITED 0 ON A DELIBERATELY BROKEN ROW. It failed OPEN, silently, and
 * the 7/7 self-test passed throughout because fixtures are small.
 *
 * That is the exact shape register 389 classifies: a failure quietly converted
 * into a benign "nothing to do". So: a buffer that fits the file with room to
 * grow, and a catch that REFUSES unless it can prove the reason was benign. */
const BUF = 64 * 1024 * 1024;

function isStaged() {
  const names = execFileSync('git', ['diff', '--cached', '--name-only'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
  return names.split('\n').map(s => s.trim()).includes(FILE);
}

/** Returns the staged text, or null ONLY when the file is genuinely not staged.
 *  Any other failure THROWS — a guard that cannot read what it is guarding
 *  must not report success. */
function stagedBlob() {
  if (!isStaged()) return null;
  return execFileSync('git', ['show', ':' + FILE],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
}
function stagedAddedLines() {
  const diff = execFileSync('git', ['diff', '--cached', '-U0', '--', FILE],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
  return diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.slice(1));
}

/* ── A CITATION TO A ROW THAT DOES NOT EXIST YET (register 409) ────────────
 *
 * On 2026-08-28 a commit shipped four source files citing "register 408" before
 * 408 was filed. The register was NOT staged in that commit, so this guard
 * returned 0 at its first branch and the dangling citations were caught by the
 * JS suite afterwards instead of refused at the gate. It was the fourth
 * cite-before-claim of the session and the first to reach a commit.
 *
 * So the scan runs whether or not the register is staged, and compares against
 * the register AS IT WILL BE AFTER THIS COMMIT: the staged blob if staged, else
 * HEAD. The extraction rule is the one `register_citations_resolve.test.js`
 * already uses — /[Rr]egister (\d{1,3})\b/ over staged .js/.py — because a
 * second spelling of the same rule is how two guards come to disagree
 * (register 313). If that test's rule changes, change this with it. */
function stagedSourceFiles() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF }).split('\n')
    .map(x => x.trim()).filter(Boolean);
  return out.filter(f => /\.(js|py)$/.test(f) && f !== FILE);
}

function registerAfterThisCommit(staged) {
  if (staged !== null) return staged;
  try {
    return execFileSync('git', ['show', 'HEAD:' + FILE],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
  } catch (e) { return null; }
}

function danglingCitations(registerText, files) {
  if (registerText === null) return null;      // cannot judge — never "clean"
  const ids = new Set([...registerText.matchAll(/^\| ([A-Za-z0-9]+) \|/gm)].map(m => m[1]));
  if (ids.size < 50) return null;              // the register did not parse; refuse to judge
  const bad = [];
  files.forEach(f => {
    let t;
    try {
      t = execFileSync('git', ['show', ':' + f],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
    } catch (e) { return; }
    for (const m of t.matchAll(/[Rr]egister (\d{1,3})\b/g)) {
      if (!ids.has(m[1])) bad.push(f + ' cites register ' + m[1]);
    }
  });
  return bad;
}

function selfTest() {
  const ok = '| 12 | what | **A** | OPEN | do a thing |';
  const broken = '| 13 | a || b | **A** | OPEN | x |';
  const eaten = '| 14 | consumers ARE found:  reads  as a signal | **A** | OPEN | x |';
  const header = '| what | finding |';
  const cases = [
    ['KNOWN-NEGATIVE — a well-formed row passes', ok, [ok], 0],
    ['KNOWN-POSITIVE — an unescaped `||` is caught (row 374\'s break)', ok + '\n' + broken, [broken], 1],
    ['KNOWN-POSITIVE — shell-eaten spacing is caught in a CHANGED row (row 193)', ok + '\n' + eaten, [eaten], 1],
    ['the same spacing in an UNCHANGED row is IGNORED — history is not re-judged',
      ok + '\n' + eaten, [ok], 0],
    ['a narrower table\'s header is not judged by the register\'s column count',
      ok + '\n' + header, [header], 0],
    ['a duplicate id is caught', ok + '\n' + ok, [ok], 1],
  ];
  let bad = 0;
  for (const [name, text, changed, want] of cases) {
    const got = problems(text, changed).length;
    const good = got === want;
    if (!good) bad++;
    console.log((good ? 'PASS  ' : 'FAIL  ') + name + (good ? '' : `  — got ${got}, want ${want}`));
  }
  // CONTROL: the LIVE register must pass, or this blocks every future commit.
  let live = null;
  try { live = require('fs').readFileSync(path.join(ROOT, FILE), 'utf8'); } catch (e) {}
  const liveProblems = live ? problems(live, []) : [{ kind: 'UNREADABLE' }];
  const okLive = liveProblems.length === 0;
  if (!okLive) bad++;
  console.log((okLive ? 'PASS  ' : 'FAIL  ')
    + 'CONTROL — the LIVE register passes, so this guard does not block all work'
    + (okLive ? '' : ': ' + JSON.stringify(liveProblems.slice(0, 3))));

  /* ── THE CITATION ARM, PROVEN BOTH WAYS (register 409) ──────────────────
   * A guard that has only ever printed success has not been tested, only run.
   * The register read here is the real one, so the id set is the live set. */
  let citeExtra = 0, citeBad = 0;
  const cck = (n, ok, d) => {
    citeExtra++;
    if (!ok) citeBad++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + n
      + (ok || d === undefined ? '' : ': ' + JSON.stringify(d).slice(0, 160)));
  };
  {
    let reg = null;
    try {
      reg = execFileSync('git', ['show', 'HEAD:' + FILE],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
    } catch (e) { reg = null; }
    if (reg === null) {
      cck('the citation arm could read the register to test against', false);
    } else {
      const ids = new Set([...reg.matchAll(/^\| ([A-Za-z0-9]+) \|/gm)].map(x => x[1]));
      cck('CONTROL — the register parses into a real id set', ids.size > 100, ids.size);
      /* de-literalised, so this file does not itself cite a row that is missing */
      const missing = '9' + '9' + '9';
      cck('KNOWN POSITIVE — an id that does not exist is absent from the set',
        !ids.has(missing), missing);
      cck('KNOWN NEGATIVE — an id that does exist is present', ids.has('313'));
    }
    cck('a register that does not parse returns null, never an empty "clean" list',
      danglingCitations('| 1 |\n| 2 |', []) === null);
    cck('a null register text returns null too', danglingCitations(null, []) === null);
  }
  bad += citeBad;

  console.log('\n' + (cases.length + 1 + citeExtra - bad) + '/'
    + (cases.length + 1 + citeExtra) + ' self-tests passed');
  return bad ? 1 : 0;
}

function main(argv) {
  if (argv[0] === '--self-test') return selfTest();

  let staged;
  try {
    staged = stagedBlob();
  } catch (e) {
    console.error('\n⛔ REGISTER COMMIT GUARD could not read the staged ' + FILE
      + ': ' + e.message + '\n  REFUSING the commit. A guard that cannot read what it '
      + 'guards must not report success — that is how this very tool exited 0 on a '
      + 'broken row (register 390).');
    return 2;
  }
  /* The citation arm runs even when the register is NOT staged, because that is
   * exactly the commit shape that got four dangling citations past this guard
   * (register 409). */
  const cites = danglingCitations(registerAfterThisCommit(staged), stagedSourceFiles());
  if (cites === null) {
    console.error('\n⛔ REGISTER COMMIT GUARD could not read the register to check '
      + 'citations against. REFUSING rather than reporting clean.');
    return 2;
  }
  if (cites.length) {
    console.error('\n⛔ REGISTER COMMIT GUARD — ' + cites.length
      + ' citation(s) to a register row that does not exist:\n');
    cites.forEach(c => console.error('   ' + c));
    console.error('\n  File the row FIRST — `file_register_row.js` hands you the id it '
      + 'actually claimed — then cite it. Four ids were burned this way on 2026-08-28 '
      + 'and one reached a commit (register 409).\n');
    return 1;
  }

  if (staged === null) return 0;              // genuinely not staged — nothing else to judge

  const bad = problems(staged, stagedAddedLines());
  if (!bad.length) return 0;

  console.error('\n⛔ REGISTER COMMIT GUARD — ' + bad.length + ' problem(s) in the STAGED '
    + FILE + ':\n');
  for (const b of bad) console.error('   [' + b.kind + '] row ' + b.id + ': ' + b.detail + '\n');
  console.error('  This validates the STAGED blob, so it does not matter which tool wrote');
  console.error('  the row. `draft/tools/file_register_row.js` avoids both of these by');
  console.error('  construction — it escapes pipes and reads the text from a FILE, so a');
  console.error('  shell never sees a backtick.\n');
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { problems, isRegisterRow, cellCount, danglingCitations };

#!/usr/bin/env node
/* TERRITORY: A. DOES A ROW MARKED CLOSED POINT AT ANYTHING THAT EXISTS ON `main`?
 *
 * ── THE INCIDENT ───────────────────────────────────────────────────────────
 *
 * Register 424 (E, 2026-08-27). Register 324 — a 🔴🔴 win-probability defect —
 * was marked ✅ CLOSED while its fix sat on an unmerged branch, LIVE ON `main`
 * one week before week 1. The closing commit changed `DEFECT-REGISTER.md` and
 * nothing else, and honestly said "pending merge"; a later status reported it
 * "confirmed merged" and nothing in between checked `main`. Register 229 was
 * in the same state on the same branch — 2 of the 3 register-bearing commits
 * on it were closed-but-unmerged.
 *
 * E proposed this guard and named its shape exactly. This is that guard.
 *
 * ── WHAT IT CHECKS, AND WHY EACH RESTRICTION IS THERE ──────────────────────
 *
 * For every row whose STATUS is terminal, every BACKTICKED reference in the
 * row must resolve against the CURRENT CHECKOUT:
 *
 *   · a file path      → the file exists
 *   · a commit hash    → the object resolves AND is an ancestor of HEAD
 *
 * Backticks are required, not optional. The register is prose written by five
 * lanes; a bare `member.js` or a bare hex-looking word would make this a
 * heuristic over 400 rows of English, and a guard that fires on ordinary work
 * is a guard people delete (registers 388, 417, 422 — three instances of that
 * failure this month). The register's own convention already backticks both.
 *
 * ⚠️ ANCESTRY, NOT EXISTENCE, IS THE POINT FOR A HASH. Register 424's own two
 * cited hashes do not resolve AT ALL; register 324's real fix resolved fine on
 * a branch while being absent from `main`. Both are the same failure — a
 * closed row pointing somewhere the deployed tree cannot see — and only an
 * ancestry test catches the second.
 *
 * Run: node draft/tools/closed_rows_resolve.js [--json PATH] [--strict]
 *      node draft/tools/closed_rows_resolve.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BUF = 64 * 1024 * 1024;                       // register 391
const REGISTER = path.join(ROOT, 'DEFECT-REGISTER.md');

/* The same terminal-status vocabulary register_recheck_check.js enforces:
 * FIXED / BUILT / GRADED are deliberately NOT terminal here either. */
const TERMINAL = /✅|\bCLOSED\b/;

/* A backticked path with a real extension. Requires a directory separator or a
 * known top-level file, so `true` and `ok:` never match. */
const PATH_RE = /`([A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]+)+\.(?:js|py|json|md|ejs|yml|yaml|sh|css|html))`/g;

/* A backticked hex run that could be a git sha: 7-12 (this repo's short form
 * is 8) or a full 40. ⚠️ THE BOUNDS ARE NOT COSMETIC — the first cut used
 * {7,40} and flagged SIX things that were never commits: GitHub Actions run
 * IDs (`32064471617`, 11 digits), a snowflake id (`434915673219526656`, 18)
 * and two 16-char fingerprints. All valid hex, none a commit. */
const HASH_RE = /`([0-9a-f]{7,12}|[0-9a-f]{40})`/g;

/* ⚠️ HEX-LOOKING ENGLISH IS REAL: "added", "decade", "faced", "beefed" are all
 * valid hex. A word that happens to be hex is not a commit, so anything that
 * reads as a word is skipped and REPORTED as skipped rather than silently
 * dropped — "did not check" must not look like "checked and clean" (rule 3e). */
const LOOKS_LIKE_A_WORD = /^[a-f]+$/;

/* ⚠️⚠️ ALL-DIGIT RUNS: THE FIRST RULE HERE WAS "SKIP THEM", AND IT SILENTLY
 * HID THE ONE CASE THIS TOOL EXISTS FOR. `64712959` — register 424's own dead
 * citation, the hash that started all of this — IS ALL DIGITS. Skipping every
 * all-digit run turned the motivating example into a false NEGATIVE, which is
 * worse than the false positive it was meant to prevent: a wrong finding gets
 * argued with, a missing one gets believed.
 *
 * The split is LENGTH, and it is measured rather than assumed: every Actions
 * run id in this register is ELEVEN digits, and this repo's short shas are
 * EIGHT. So an all-digit run of 10 or more is a run id and is skipped (named,
 * never silently); anything shorter is checked like any other sha. */
const RUN_ID = /^[0-9]{10,}$/;

function rows(text) {
  const out = [];
  text.split('\n').forEach(line => {
    if (!line.startsWith('| ')) return;
    const cells = line.slice(1).split(' | ');
    if (cells.length < 5) return;
    const id = cells[0].replace(/[*`]/g, '').trim();
    if (!/^\d+[a-z]?$/.test(id)) return;
    out.push({ id: id, status: cells[3] || '', text: line });
  });
  return out;
}

function refsIn(rowText) {
  const paths = new Set(), hashes = new Set(), skipped = new Set();
  let m;
  PATH_RE.lastIndex = 0;
  while ((m = PATH_RE.exec(rowText)) !== null) paths.add(m[1]);
  HASH_RE.lastIndex = 0;
  while ((m = HASH_RE.exec(rowText)) !== null) {
    const looksLikeSha = !LOOKS_LIKE_A_WORD.test(m[1]) && !RUN_ID.test(m[1]);
    (looksLikeSha ? hashes : skipped).add(m[1]);
  }
  return { paths: [...paths], hashes: [...hashes], skipped: [...skipped] };
}

function hashState(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', sha + '^{commit}'],
      { cwd: ROOT, stdio: 'ignore', maxBuffer: BUF });
  } catch (e) { return 'unresolvable'; }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'],
      { cwd: ROOT, stdio: 'ignore', maxBuffer: BUF });
    return 'on_head';
  } catch (e) { return 'not_on_head'; }
}

/* ⚠️ A PATH A TOOL *WRITES* NEED NOT EXIST. Row 65 cites
 * `draft/data/board_offline_fixture.json`, which `build.py:2601` CREATES on an
 * offline build; it is absent only because nobody has run one. Flagging an
 * output as a missing artifact is a wrong finding, and a guard that produces
 * wrong findings gets ignored. */
function isWrittenBySomeTool(rel) {
  const base = path.basename(rel);
  try {
    execFileSync('git', ['grep', '-q', '--', base, '--',
                         'draft/tools', 'draft/backtest', 'draft/build.py', 'src'],
      { cwd: ROOT, stdio: 'ignore', maxBuffer: BUF });
    return true;
  } catch (e) { return false; }
}

function audit() {
  const text = fs.readFileSync(REGISTER, 'utf8');
  const findings = [];
  let closed = 0, refsChecked = 0, skippedWords = 0;
  rows(text).forEach(r => {
    if (!TERMINAL.test(r.status)) return;
    closed++;
    const { paths, hashes, skipped } = refsIn(r.text);
    skippedWords += skipped.length;
    paths.forEach(p => {
      refsChecked++;
      /* ⚠️ A PATH MAY BE CITED RELATIVE TO `draft/`, which is how this register
       * writes it about half the time — row 5h's `baseline/v1.json` IS
       * `draft/baseline/v1.json` and was a false positive on the first run. */
      if (!fs.existsSync(path.join(ROOT, p))
          && !fs.existsSync(path.join(ROOT, 'draft', p))) {
        findings.push({ id: r.id,
          kind: isWrittenBySomeTool(p) ? 'absent_but_generated' : 'missing_file',
          ref: p });
      }
    });
    /* ⚠️ A DEAD SHA IS NOT THE SAME AS AN UNLANDED FIX, AND THE TRIAGE PROVED
     * IT: rows 147, 204 and 229 each cite a commit that is not on `main` while
     * the WORK is plainly here — rebased, squashed or merged under another
     * sha. Register 324 was the opposite and that is the case worth catching.
     * So a hash finding is qualified by whether the SAME ROW names a file that
     * exists: if it does, the citation is stale; if it does not, there is no
     * artifact evidence at all and it needs a human. */
    /* Corroboration is a FILE that exists OR ANOTHER HASH in the same row that
     * IS on main. Row 249 is the case that demanded the second: its own body
     * says *"B's fix reached `main` as `efe4a6de` — not the `7c57ac4a` merge I
     * asked for — so my sha check still reads NOT-an-ancestor while the
     * CONTENT is there"*. Someone had already done this triage in prose; the
     * tool should not re-raise what the row itself explains. */
    const corroborated =
      paths.some(p => fs.existsSync(path.join(ROOT, p))
                   || fs.existsSync(path.join(ROOT, 'draft', p)))
      || hashes.some(h => hashState(h) === 'on_head');
    hashes.forEach(h => {
      refsChecked++;
      const st = hashState(h);
      if (st === 'on_head') return;
      findings.push({ id: r.id, ref: h,
        kind: corroborated ? 'stale_citation_artifact_present' : st });
    });
  });
  return { closed_rows: closed, refs_checked: refsChecked,
           hexish_words_skipped: skippedWords, findings: findings };
}

function selfTest() {
  let pass = 0, fail = 0;
  const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + JSON.stringify(d).slice(0, 240) : ''))); };

  const row = (id, status, body) => `| ${id} | ${body} | **A** | ${status} | act |`;

  ck('a CLOSED row is examined and an OPEN one is not',
    rows(row('1', '✅ CLOSED', 'x')).length === 1
    && TERMINAL.test(rows(row('1', '✅ CLOSED', 'x'))[0].status)
    && !TERMINAL.test(rows(row('2', '🟠 OPEN', 'x'))[0].status));

  ck('  and FIXED is NOT terminal, the same rule register_recheck_check uses',
    !TERMINAL.test('🟡 FIXED — verify'));

  const r = refsIn('see `draft/tools/thing.js` at `8d738033` and `1511426f`');
  ck('backticked paths and hashes are both extracted',
    r.paths.length === 1 && r.hashes.length === 2, r);
  ck('  a BARE path is ignored, so this is not a heuristic over English',
    refsIn('see draft/tools/thing.js').paths.length === 0);
  ck('  and `true` / `ok:` never read as a path',
    refsIn('`true` and `ok:` and `C1_x`').paths.length === 0);

  /* ⚠️ THE FIRST CUT OF THIS TEST USED `decade` `faced` `added` — all UNDER the
   * 7-char minimum, so none of them ever reached the word filter and the test
   * failed against correct code. These are genuinely 7+ and genuinely hex. */
  ck('⭐ hex-looking ENGLISH is skipped, not treated as a commit',
    refsIn('`defaced` `acceded` `deadbeef`').hashes.length === 0
    && refsIn('`defaced` `acceded` `deadbeef`').skipped.length === 3);
  ck('  and a hex word SHORTER than a short sha never reaches the filter at all',
    refsIn('`decade` `faced`').hashes.length === 0
    && refsIn('`decade` `faced`').skipped.length === 0);
  ck('  but a real mixed hash is kept', refsIn('`8d738033`').hashes.length === 1);
  ck('⭐ an Actions RUN ID (11 digits) is not a commit — skipped, and named',
    refsIn('`32064471617`').hashes.length === 0
    && refsIn('`32064471617`').skipped.length === 1);
  ck('⭐⭐ BUT AN 8-DIGIT ALL-NUMERIC SHA IS STILL CHECKED — `64712959` is '
    + 'register 424\'s own dead citation and is all digits; skipping every '
    + 'all-digit run made THIS tool blind to the case that motivated it',
    refsIn('`64712959`').hashes.length === 1
    && hashState('64712959') === 'unresolvable');
  ck('  and a 16- or 18-char hex fingerprint is out of sha range entirely',
    refsIn('`220bf4c671786351` `434915673219526656`').hashes.length === 0);
  ck('  while a FULL 40-char sha is still in range',
    refsIn('`' + 'a'.repeat(39) + '9`').hashes.length === 1);

  /* KNOWN POSITIVE / KNOWN NEGATIVE against real git objects. */
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF }).trim();
  ck('KNOWN NEGATIVE — HEAD itself is on HEAD', hashState(head) === 'on_head');
  ck('⭐ KNOWN POSITIVE — a hash that does not exist is `unresolvable`, which is '
    + 'register 424\'s own two dead citations',
    hashState('64712959') === 'unresolvable');

  console.log('\n' + pass + '/' + (pass + fail) + ' self-tests passed');
  return fail ? 1 : 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const rep = audit();
  console.log('CLOSED ROWS — does what they point at exist on this checkout?\n');
  console.log('  ' + rep.closed_rows + ' terminal row(s) · ' + rep.refs_checked
    + ' backticked reference(s) checked · ' + rep.hexish_words_skipped
    + ' hex-looking word(s) skipped\n');
  if (!rep.findings.length) {
    console.log('  ✅ every backticked file and commit in a CLOSED row resolves here.');
  } else {
    const by = { missing_file: [], unresolvable: [], not_on_head: [],
                 absent_but_generated: [], stale_citation_artifact_present: [] };
    rep.findings.forEach(f => by[f.kind].push(f));
    const label = {
      missing_file: 'file named in a CLOSED row does not exist',
      unresolvable: 'commit named in a CLOSED row DOES NOT RESOLVE AT ALL',
      not_on_head: 'commit named in a CLOSED row is NOT an ancestor of HEAD '
                 + 'AND the row names no file that exists — the register-324 '
                 + 'shape, and the one worth acting on',
      absent_but_generated: 'file is absent but some tool WRITES it — an output, '
                 + 'not a missing artifact (row 65 / build.py)',
      stale_citation_artifact_present: 'commit does not resolve here, but the row '
                 + 'names a file that DOES exist — a stale citation (rebased or '
                 + 'squashed), not an unlanded fix. Fix the hash, not the code.',
    };
    Object.keys(by).forEach(k => {
      if (!by[k].length) return;
      console.log('  🔴 ' + by[k].length + ' ' + label[k]);
      by[k].forEach(f => console.log('     row ' + f.id + '  ' + f.ref));
    });
  }
  console.log('\n  ⚠️  BACKTICKED REFERENCES ONLY. A closed row that names its fix in plain');
  console.log('      prose is invisible here — this reports what it can check, and');
  console.log('      "not checked" is not "clean" (rule 3e).');
  console.log('  ⚠️  ON THIS CHECKOUT, not on origin/main. Run it where main is current.');

  const i = process.argv.indexOf('--json');
  if (i >= 0) {
    fs.writeFileSync(process.argv[i + 1], JSON.stringify(Object.assign({
      _territory: 'TERRITORY: A — draft/tools/closed_rows_resolve.js',
      _answers: 'register 424 (E\'s proposed guard)',
    }, rep), null, 1) + '\n');
    console.log('\n  wrote ' + process.argv[i + 1]);
  }
  /* ⚠️ `--strict` GATES ON THE ACTIONABLE CLASSES ONLY, and that is a ruling,
   * not a convenience. After triage (register 425) the twelve raw findings are
   * ONE real case: a closed row whose commits are not on `main` and which
   * names no artifact to check. The other classes are stale citations where
   * the work is plainly here, and an output a tool writes — gating on those
   * would make the guard red for prose defects and get it deleted, which is
   * the failure registers 388, 417 and 422 each recorded. Fix the citation by
   * all means; do not fail a build over it. */
  const ACTIONABLE = new Set(['not_on_head', 'unresolvable', 'missing_file']);
  const actionable = rep.findings.filter(f => ACTIONABLE.has(f.kind));
  console.log('\n  ' + actionable.length + ' finding(s) in the ACTIONABLE classes '
    + '(--strict gates on these only); ' + (rep.findings.length - actionable.length)
    + ' are stale citations or generated outputs, reported but not gating.');
  return (process.argv.includes('--strict') && actionable.length) ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { rows, refsIn, hashState, audit };
